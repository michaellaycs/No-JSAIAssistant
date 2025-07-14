# Use an official Node.js runtime as the base image
FROM node:20-alpine

# Set the working directory inside the container where our application will reside
WORKDIR /app/backend

# Copy the entire backend directory from the host to the container's /app/backend/
COPY backend/ ./

# Install Node.js dependencies.
RUN npm install --production

# Go back to the root application directory inside the container
WORKDIR /app

# Copy the entire frontend directory from the host to the container's /app/frontend/
COPY frontend/ ./frontend/

# Expose the port the app runs on
EXPOSE 3001

# Command to run the application
CMD ["node", "backend/server.js"]