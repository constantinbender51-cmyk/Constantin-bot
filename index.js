const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
// --- NEW: Import the Gemini library ---
const { GoogleGenerativeAI } = require("@google/genai");

const app = express();
const port = process.env.PORT || 3000;

// --- NEW: Initialize Gemini ---
// It will automatically read the GEMINI_API_KEY from your environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});

const CHATLOG_FILE = path.join(__dirname, 'chatlog.json');
const MAX_HISTORY_TOKENS = 3000; // This can be adjusted for Gemini
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123';

let system_prompt_guide;
try {
    system_prompt_guide = fs.readFileSync(path.join(__dirname, 'prompt_guide.txt'), 'utf8');
    console.log("Successfully loaded prompt guide.");
} catch (error) {
    console.error("CRITICAL: Could not read prompt_guide.txt.", error);
    system_prompt_guide = "You are a helpful assistant."; 
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ... (The /api/stream, /api/confirm-relay, relayMessageToOwner, readMasterHistory, appendToMasterHistory, and pruneHistory functions can remain exactly the same) ...
// The only function we need to replace is getChatbotResponse.

// --- REWRITTEN: The getChatbotResponse function for Gemini ---
async function getChatbotResponse(sessionHistory) {
    const masterHistory = await readMasterHistory();
    const combinedHistory = [...masterHistory, ...sessionHistory];
    const prunedHistory = pruneHistory(combinedHistory);

    // Gemini requires a slightly different format for history.
    // It alternates between 'user' and 'model' (instead of 'assistant').
    const geminiHistory = prunedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    try {
        const chat = model.startChat({
            history: geminiHistory,
            // The system prompt is passed as the first message in the new chat session
            generationConfig: {
                maxOutputTokens: 1024,
            },
        });

        // The system prompt is now part of the first message to the model
        const result = await chat.sendMessage(system_prompt_guide + "\n\nHere is the user's latest message. Please respond:\n" + sessionHistory[sessionHistory.length - 1].content);
        const response = result.response;
        let aiResponseContent = response.text();

        // We still keep our robust JSON parsing logic
        const startIndex = aiResponseContent.indexOf('{');
        const endIndex = aiResponseContent.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const jsonString = aiResponseContent.substring(startIndex, endIndex + 1);
            const responseObject = JSON.parse(jsonString);
            console.log(`Gemini Action: ${responseObject.execution}`);
            return responseObject;
        } else {
            throw new Error("No valid JSON object found in the Gemini response.");
        }

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        // Fallback gracefully
        return { message: "I'm having trouble connecting to my core intelligence. Please try again shortly.", execution: 'none' };
    }
}


// --- Make sure all your other functions are still here ---
// app.get('/api/stream', ...);
// app.post('/api/confirm-relay', ...);
// async function relayMessageToOwner(...) { ... }
// async function readMasterHistory() { ... }
// async function appendToMasterHistory(...) { ... }
// function pruneHistory(...) { ... }


// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
