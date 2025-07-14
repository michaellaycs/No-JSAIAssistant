# No-JS AI Assistant

This project provides a simple, self-contained AI assistant web application built with Node.js (Express) on the backend and plain HTML/CSS on the frontend. It supports integration with both the Google Gemini API and a local Large Language Model (LLM) served via LM Studio, offering flexibility in how you power your AI conversations.

The application includes basic chat functionality, chat history persistence using SQLite, and simple basic authentication.

## Features

  * **Dual AI Model Support:** Seamlessly switch between Google Gemini (cloud-based) and a local LLM (via LM Studio).
  * **Chat History:** Persists chat conversations in a local SQLite database.
  * **Conversation Context Maintenance:** The application maintains context by sending previous messages to the AI model, enabling more coherent and continuous conversations.
  * **Basic Authentication:** Secure your application with a simple username/password.
  * **No JavaScript Frontend:** A pure HTML/CSS frontend for simplicity and broad compatibility.
  * **Dockerized Deployment:** Easily run the entire application using Docker.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

1.  **Git:** For cloning the repository.

      * [Download Git](https://git-scm.com/downloads)

2.  **Node.js and npm:** (Optional, if you only plan to use Docker for running the application. Required if you want to run the Node.js backend directly).

      * Version 20 or higher is recommended.
      * [Download Node.js](https://nodejs.org/en/download/) (npm is included with Node.js)

3.  **Docker Desktop:** Essential for running the application in a containerized environment.

      * [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)

4.  **LM Studio:** (Required if you plan to use a local LLM). This application allows you to download and run various open-source LLMs locally.

      * [Download LM Studio](https://lmstudio.ai/)

5.  **Google Account & API Key:** (Optional. Required if you plan to use Google Gemini).

      * You'll need a Google Cloud project and an API key with access to the Gemini API.
      * [Get a Google Cloud API Key](https://cloud.google.com/docs/authentication/api-keys)

## Getting Started

Follow these steps to get the AI Assistant running on your local machine.

### Step 1: Clone the Repository

First, clone this repository to your local machine:

```bash
git clone <repository-url>
cd No-JSAIAssistant # Navigate into the project directory
```

### Step 2: Create the `.env` File

This project uses environment variables for sensitive information and configuration. Create a file named `.env` in the root of your `No-JSAIAssistant` directory (the same level as `backend/` and `frontend/`).

Copy the following content into your `.env` file and replace the placeholder values:

```dotenv
# Google Gemini API Key
GEMINI_API_URL_FLASH=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE # Replace with your actual Gemini API Key

# LM Studio Configuration
# This URL points to the LM Studio local inference server from within the Docker container.
LM_STUDIO_LOCAL_API_URL=http://host.docker.internal:1234/v1/chat/completions
LM_STUDIO_MODEL_ID=stabilityai_-_stablelm-zephyr-3b # This is the default model ID. Change if you download a different one.

# Basic Authentication
AUTH_USERNAME=your_chosen_username
AUTH_PASSWORD=your_chosen_password
```

**Important:**

  * Replace `YOUR_GEMINI_API_KEY_HERE` with your actual Google Gemini API key if you plan to use Gemini.
  * Replace `your_chosen_username` and `your_chosen_password` with credentials you'll use to log in to the web application.

### Step 3: Set up LM Studio (for Local LLM)

If you plan to use a local LLM, you need to set up LM Studio.

1.  **Download and Install LM Studio (if you haven't already):**
      * Go to [lmstudio.ai](https://lmstudio.ai/) and download the appropriate version for your operating system.
      * Install LM Studio following the on-screen instructions.

2.  **Launch LM Studio GUI and Download a Model:**

      * Open LM Studio.
      * In the LM Studio interface, navigate to the search bar at the top.
      * Search for the model specified in your `.env` file, e.g., `stabilityai/stablelm-zephyr-3b`.
      * Select a compatible quantized version (e.g., `Q4_K_M` or `Q5_K_M`) and download it.

3.  **Start the Local Inference Server:**

      * Once the model is downloaded, go to the "Developer" tab (usually represented by a `>` icon on the left sidebar).
      * Start the server and load the downloaded model into the server.
      * Ensure the server is running on **Port 1234**. You can check and configure this in the server settings within LM Studio.
      * Keep the LM Studio GUI application open; the server must be running *before* you start your Docker container if you intend to use the local LLM.

### Step 4: Run the Application with Docker

This is the recommended way to run the application, as it encapsulates all dependencies.

1.  **Build the Docker Image:**
    Navigate to the root directory of your cloned repository (where the `Dockerfile` is located) in your terminal and run:

    ```bash
    docker build -t no-js-ai-assistant .
    ```

    This command builds a Docker image named `no-js-ai-assistant`. The process might take a few minutes as it downloads the base Node.js image and installs dependencies.

2.  **Run the Docker Container:**
    After the image is built, run the container. Ensure LM Studio is running (either GUI or command-line server) if you plan to use the local LLM.

    ```bash
    docker run -p 3001:3001 --name ai-assistant --env-file ./.env no-js-ai-assistant:latest
    ```

      * `-p 3001:3001`: Maps port 3001 on your host machine to port 3001 inside the Docker container.
      * `--name ai-assistant`: Assigns a name to your container for easier management.
      * `--env-file ./.env`: Tells Docker to load environment variables from your `.env` file into the container.
      * `no-js-ai-assistant:latest`: The name and tag of the Docker image you built.

    **Note for Linux Users:**
    If you are running Docker on Linux, `host.docker.internal` might not resolve correctly by default. You may need to add an extra flag to the `docker run` command:

    ```bash
    docker run -p 3001:3001 --name ai-assistant --env-file ./.env --add-host host.docker.internal:host-gateway no-js-ai-assistant:latest
    ```

    This maps `host.docker.internal` to your host machine's IP address, allowing the Docker container to communicate with LM Studio running directly on your host.

## Usage

### Accessing the Application

Once the Docker container is running, open your web browser and navigate to:

```
http://localhost:3001
```

### Basic Authentication

You will be prompted for a username and password. Use the `AUTH_USERNAME` and `AUTH_PASSWORD` you set in your `.env` file.

### Chatting with the AI

1.  Type your message into the text area.
2.  Select your desired AI model from the dropdown (`Lm Studio Local Llm` or `Gemini 2.5 Flash`).
3.  Click "Send".

The AI's response will appear in the chat history.

### Clearing Chat History

Click the "Clear Chat History" button to remove all past messages from the database.

### Switching AI Models

You can switch between `Lm Studio Local Llm` and `Gemini 2.5 Flash` at any time using the dropdown menu. Ensure LM Studio is running if you select the local LLM option.

## Configuration

The `.env` file is crucial for configuring the application.

  * `GEMINI_API_URL_FLASH`: The API endpoint for the Gemini Flash model. (Do not change unless Google updates it).
  * `GEMINI_API_KEY`: Your personal Google Gemini API key.
  * `LM_STUDIO_LOCAL_API_URL`: The URL for your local LM Studio inference server. `http://host.docker.internal:1234/v1/chat/completions` is the standard for Docker Desktop to connect to a service on the host.
  * `LM_STUDIO_MODEL_ID`: The identifier for the model you've downloaded and are serving in LM Studio.
  * `AUTH_USERNAME`: The username for basic authentication.
  * `AUTH_PASSWORD`: The password for basic authentication.

## Troubleshooting

  * **"Authentication Required" / "Unauthorized"**: Ensure you are entering the correct `AUTH_USERNAME` and `AUTH_PASSWORD` as set in your `.env` file.

  * **"Failed to connect to the AI model..."**:

      * If using LM Studio: Make sure LM Studio is running (GUI or command-line server) and the local inference server is active on port `1234`. Also, verify that you've downloaded the correct model and loaded it into the server.
      * If on Linux, ensure you've used the `--add-host host.docker.internal:host-gateway` flag when running the Docker container.
      * If using Gemini: Double-check your `GEMINI_API_KEY` in the `.env` file.

  * **"Request failed with status code 404"**: This usually means the AI model endpoint URL is incorrect or the service is not available at that specific path. Verify the `LM_STUDIO_LOCAL_API_URL` or `GEMINI_API_URL_FLASH` in your `.env` file.

  * **Docker Container Exits Immediately**: Check the Docker logs for the container using `docker logs ai-assistant` to see if there are any errors during startup.

  * **No Chat History / Database Issues**: Ensure the `backend/data` directory is writable by the Node.js process inside the container. Docker usually handles this, but permission issues can sometimes occur.

## Contributing

Contributions are welcome\! If you find a bug or have an improvement, please open an issue or submit a pull request.

## License

This project is licensed under the ISC License.