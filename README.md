# RatanIndia-Assessment || Rev - Voice Chat Interface using Gemini Live API
This project is a real-time, conversational voice interface that uses the Gemini Live API to replicate the functionality of the existing Revolt Motors chatbot. The solution is built with a server-to-server architecture using Node.js and Express for the backend.

# Objective
The goal of this project was to develop a server-to-server architecture using the Gemini Live API to create a voice-enabled chatbot that can handle user interruptions and respond with low latency.

# Features
- Real-time Voice Interaction: The application captures audio from the user's microphone and streams it to the backend for processing by the Gemini API.
- Interruptions: The user can interrupt the AI while it is speaking, causing it to stop its current response and listen for new input. The Gemini Live API handles this feature natively.
- Low Latency: The system is designed to provide a fast response time, with the goal of matching the 1-2 second latency of the benchmark application.
- Bilingual Support: The AI is instructed to respond in Hindi if the user speaks Hindi, in English if the user speaks English, and bilingually if the input is a mix of both languages.
- Revolt Motors Specificity: The AI is given a system instruction to only discuss topics related to Revolt Motors, such as products, pricing, and service.

# Technical Stack

- Backend: Node.js/Express 
- Frontend: HTML, CSS, and vanilla JavaScript
- API: Gemini Live API 
- Models: gemini-2.5-flash-preview-native-audio-dialog for the final submission, with gemini-2.0-flash-live-001 or gemini-live-2.5-flash-preview recommended for development and testing to avoid rate limits.

## Setup Instructions

### 1. Prerequisites
* Node.js (LTS version recommended)
* A Gemini API key from [aistudio.google.com](https://aistudio.google.com).

### 2. Getting Started
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/avinash1Tiwari/RatanIndia-Assessment.git
    cd ratanIndia/backend
    ```
2.  **Install dependencies:**
    ```bash
    npm install express ws dotenv
    ```
3.  **Configure API Key:**
    * Create a `.env` file in the `backend` directory.
    * Add your Gemini API key to the file[cite: 24].
    * Specify the Gemini model to use[cite: 24].
    ```
    # .env file in backend/
    GOOGLE_API_KEY="YOUR_API_KEY_HERE"
    GEMINI_MODEL="gemini-2.0-flash"
    PORT=3000(your local port)
    ```
    > **Note:** For development, you may want to temporarily switch the `GEMINI_MODEL` to `gemini-2.0-flash-live-001` or `gemini-live-2.5-flash-preview` to avoid hitting rate limits on the free tier.

4.  **Run the application:**
    ```bash
    node server.js
    ```
    The server will start, and you can access the frontend by navigating to `http://localhost:3000` in your web browser.

---

# Demonstration Video
- vedio link :  https://drive.google.com/file/d/11dRp6OGZk1WHbOd0Vv-IpzOV6jveGctR/view?usp=sharing

# Source Code
The complete source code for this implementation is available in this GitHub repository.

