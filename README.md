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