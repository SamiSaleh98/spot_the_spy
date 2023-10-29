# Use the official Node.js 18.18.2-bookworm-slim image as the base image
FROM node:18.18.2-bookworm-slim

# Create and set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json to the container
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Expose a port if your Node.js application listens on a specific port
# EXPOSE 3000

# Define the command to start your Node.js application
CMD ["node", "app.js"]
