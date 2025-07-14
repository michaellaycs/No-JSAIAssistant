require('dotenv').config(); // Load environment variables from .env

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const fs = require('fs').promises;
const { encode } = require('html-entities');
const rateLimit = require('express-rate-limit');
const { marked } = require('marked');

const app = express();
const PORT = process.env.PORT || 3001;

// LLM API Configuration
const MODELS_CONFIG = {
    'lm-studio-local-llm': {
        url: process.env.LM_STUDIO_LOCAL_API_URL || 'http://host.docker.internal:1234/v1/chat/completions',
        model_id: process.env.LM_STUDIO_MODEL_ID || 'stabilityai_-_stablelm-zephyr-3b',
        api_key: null,
        provider: 'lm-studio'
    },
    'gemini-2.5-flash': {
        url: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        model_id: 'gemini-2.5-flash',
        api_key: process.env.GEMINI_API_KEY,
        provider: 'gemini'
    }
};

// Database Initialization
let db;
const DB_PATH = path.join(__dirname, 'data', 'chat.db');

async function initializeDatabase() {
    try {
        await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
        db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
            console.log('Connected to the SQLite database.');
        });

        await new Promise((resolve, reject) => {
            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, (err) => {
                if (err) {
                    console.error('Error creating messages table:', err.message);
                    return reject(err);
                }
                console.log('Messages table ready.');
                resolve();
            });
        });
    } catch (error) {
        console.error('Database initialization failed:', error.message);
        process.exit(1);
    }
}

// Middleware
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: '<h1>Too many requests.</h1><p>Please try again after 1 minute.</p>',
    standardHeaders: true,
    legacyHeaders: false,
});

const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
        return res.status(401).send('<h1>Authentication Required</h1>');
    }
    const [scheme, credentials] = authHeader.split(' ');
    if (scheme !== 'Basic' || !credentials) {
        return res.status(400).send('<h1>Bad Request - Invalid Authorization Header</h1>');
    }
    const decodedCredentials = Buffer.from(credentials, 'base64').toString();
    const [username, password] = decodedCredentials.split(':');
    if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
        return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Secure Area"');
    res.status(401).send('<h1>Unauthorized - Invalid Credentials</h1>');
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(basicAuth);
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Helper Functions
const insertMessage = (sender, content, timestamp = new Date().toISOString()) => {
    return new Promise((resolve, reject) => {
        let contentToSave;

        if (sender === 'ai') {
            // Convert Markdown output from AI to HTML for rendering
            contentToSave = marked.parse(content);
        } else {
            // Always encode user input to prevent XSS
            contentToSave = encode(content);
        }

        db.run(
            'INSERT INTO messages (sender, content, timestamp) VALUES (?, ?, ?)',
            [sender, contentToSave, timestamp],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID });
            }
        );
    });
};

async function getChatHistory() {
    return new Promise((resolve, reject) => {
        // Fetch last 50 messages to avoid overloading the context window
        db.all('SELECT sender, content FROM (SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50) ORDER BY timestamp ASC', [], (err, rows) => {
            if (err) return reject(err);
            if (rows.length === 0) {
                rows.push({ sender: 'system', content: 'Welcome! Ask me anything.' });
            }
            resolve(rows);
        });
    });
}

// Main Route
app.get('/', async (req, res) => {
    try {
        const messages = await getChatHistory();
        const htmlPath = path.join(__dirname, '..', 'frontend', 'html', 'index.html');
        let htmlContent = await fs.readFile(htmlPath, 'utf8');
        const { error, cleared, selectedModel = 'lm-studio-local-llm' } = req.query;

        const chatHistoryHtml = messages.map(msg => {
            const messageClass = msg.sender === 'user' ? 'user-message' : (msg.sender === 'ai' ? 'ai-message' : 'system-message');
            const prefix = msg.sender === 'user' ? 'You: ' : (msg.sender === 'ai' ? 'AI: ' : '');
            return `<div class="message ${messageClass}"><p>${prefix}${msg.content}</p></div>`;
        }).join('');
        htmlContent = htmlContent.replace(/<div class="chat-history" id="chatHistory">[\s\S]*?<\/div>/, `<div class="chat-history" id="chatHistory">${chatHistoryHtml}</div>`);

        let flashMessageHtml = '';
        if (error) {
            flashMessageHtml = `<div class="flash-message error"><p>${decodeURIComponent(error)}</p></div>`;
        } else if (cleared) {
            flashMessageHtml = `<div class="flash-message success"><p>Chat history cleared successfully!</p></div>`;
        }
        htmlContent = htmlContent.replace(/<div class="flash-messages-container">[\s\S]*?<\/div>/, `<div class="flash-messages-container">${flashMessageHtml}</div>`);

        const modelOptionsHtml = Object.entries(MODELS_CONFIG).map(([key, config]) => {
            const isSelected = key === selectedModel ? 'selected' : '';
            const displayLabel = key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `<option value="${key}" ${isSelected}>${displayLabel}</option>`;
        }).join('\n');
        htmlContent = htmlContent.replace(/<select id="llm_model" name="llm_model">[\s\S]*?<\/select>/, `<select id="llm_model" name="llm_model">${modelOptionsHtml}</select>`);

        htmlContent = htmlContent.replace(/action="\/(chat|clear-history)"/g, (match, p1) => `action="/${p1}"`);
        res.send(htmlContent);
    } catch (error) {
        console.error('Error serving chat page:', error.message);
        res.status(500).send('<h1>Error loading chat.</h1><p>Please try again later.</p>');
    }
});

// Chat Endpoint
app.post('/chat', chatLimiter, async (req, res) => {
    const { message, llm_model } = req.body;
    const userMessage = message.trim();

    if (!userMessage) {
        return res.redirect(`/?error=${encodeURIComponent('Message cannot be empty.')}&selectedModel=${llm_model}`);
    }

    const modelConfig = MODELS_CONFIG[llm_model];
    if (!modelConfig) {
        return res.redirect(`/?error=${encodeURIComponent('Invalid AI model selected.')}&selectedModel=${llm_model}`);
    }
    if (modelConfig.provider !== 'lm-studio' && !modelConfig.api_key) {
        return res.redirect(`/?error=${encodeURIComponent(`API Key for ${modelConfig.model_id} is missing.`)}&selectedModel=${llm_model}`);
    }

    try {
        await insertMessage('user', userMessage);
        
        const history = await getChatHistory();

        const aiResponseContent = await getLlmResponse(history, modelConfig);

        await insertMessage('ai', aiResponseContent);

        res.redirect(`/?selectedModel=${llm_model}`);
    } catch (error) {
        console.error('Error in chat endpoint:', error.message);
        if (error.response) {
            console.error('LLM API Error Status:', error.response.status);
            console.error('LLM API Error Data:', JSON.stringify(error.response.data, null, 2));
        }

        let errorMessage = 'An unexpected error occurred.';

        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EHOSTUNREACH') {
            errorMessage = `Failed to connect to the AI model at ${modelConfig.url}. Please ensure the AI server is running and accessible.`;
        } else if (error.response) {
            if (error.response.status === 404) {
                errorMessage = `AI Model Error: The API endpoint '${modelConfig.url}' was not found (404). Please verify the model URL in your configuration.`;
            } else if (error.response.status >= 400 && error.response.status < 500) {
                errorMessage = `AI Model Error: Client error (${error.response.status}). ${error.response.data.error?.message || 'Please check your request.'}`;
            } else if (error.response.status >= 500) {
                errorMessage = `AI Model Error: Server error (${error.response.status}). The AI service might be temporarily unavailable.`;
            } else {
                errorMessage = `AI Model communication failed with status ${error.response.status}: ${error.response.data.error?.message || error.message}`;
            }
        } else {
            errorMessage = `AI Model communication failed: ${error.message}`;
        }

        res.redirect(`/?error=${encodeURIComponent(errorMessage)}&selectedModel=${llm_model}`);
    }
});

// LLM Interaction Function
async function getLlmResponse(history, modelConfig) {
    const { url, model_id, api_key, provider } = modelConfig;
    let requestUrl = url;
    let llmPayload;
    const llmHeaders = { 'Content-Type': 'application/json' };

    // Filter out system messages, as they aren't part of the conversation
    const conversationHistory = history.filter(msg => msg.sender !== 'system');

    if (provider === 'lm-studio') {
        const messages = conversationHistory.map(msg => ({
            role: msg.sender === 'ai' ? 'assistant' : 'user',
            content: msg.content
        }));

        llmPayload = {
            messages: messages,
            model: model_id,
        };
    } else if (provider === 'gemini') {
        requestUrl = `${url}?key=${api_key}`;
        const contents = conversationHistory.map(msg => ({
            role: msg.sender === 'ai' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        llmPayload = {
            contents: contents
        };
    }

    const llmResponse = await axios.post(requestUrl, llmPayload, { headers: llmHeaders });

    if (provider === 'lm-studio') {
        return llmResponse.data.choices[0].message.content;
    } else if (provider === 'gemini') {
        return llmResponse.data.candidates[0]?.content?.parts[0]?.text || "Sorry, I couldn't get a response from the AI.";
    }
}

// Route to clear chat history
app.post('/clear-history', async (req, res) => {
    const { llm_model_on_clear = 'lm-studio-local-llm' } = req.body;
    try {
        await new Promise((resolve, reject) => {
            db.run('DELETE FROM messages', [], function(err) {
                if (err) return reject(err);
                console.log('All messages cleared from the database.');
                resolve();
            });
        });
        res.redirect(`/?cleared=true&selectedModel=${llm_model_on_clear}`);
    } catch (error) {
        console.error('Error clearing chat history:', error.message);
        res.redirect(`/?error=${encodeURIComponent('Failed to clear history.')}&selectedModel=${llm_model_on_clear}`);
    }
});

// Server Startup and Shutdown
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Backend server is running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize database and start server:', err);
});

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) console.error('Error closing database:', err.message);
        else console.log('Database connection closed.');
        process.exit(0);
    });
});