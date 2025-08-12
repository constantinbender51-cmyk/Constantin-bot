// --- ES Module Imports ---
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsp } from 'fs'; // Still needed for schedule and prompt

import { GoogleGenerativeAI } from "@google/generative-ai";

// --- ES Module __dirname fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App Initialization ---
const app = express();
const port = process.env.PORT || 3000;

// --- Gemini Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- Constants ---
const SCHEDULE_FILE = path.join(__dirname, 'phoneSchedule.txt');
const PROMPT_TEMPLATE_FILE = path.join(__dirname, 'prompt_guide.txt');
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123';
const OWNER_PASSCODE = 'X37952';

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Helper Functions (Schedule and Contact are unchanged) ---

async function readPhoneSchedule() {
    try {
        return await fsp.readFile(SCHEDULE_FILE, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return "No schedule has been set.";
        return "Schedule currently unavailable.";
    }
}

async function writePhoneSchedule(newSchedule) {
    try {
        await fsp.writeFile(SCHEDULE_FILE, newSchedule, 'utf8');
        console.log("Phone schedule has been completely updated.");
    } catch (error) {
        console.error("Error writing schedule file:", error);
    }
}

async function contactIssuer(message) {
    try {
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            headers: { 'Title': `New Message via Secretary Bot` },
            body: message
        });
    } catch (error) {
        console.error("Failed to send notification via ntfy:", error);
    }
}

// --- Main Chatbot Logic (SIMPLIFIED) ---
// This function now ONLY uses the history from the current session.
async function getChatbotResponse(sessionHistory) {
    // --- DYNAMIC PROMPT INJECTION ---
    const promptTemplate = await fsp.readFile(PROMPT_TEMPLATE_FILE, 'utf8');
    const currentSchedule = await readPhoneSchedule();
    const finalSystemPrompt = promptTemplate.replace('[SCHEDULE_PLACEHOLDER]', currentSchedule);

    // Convert the session history to the format Gemini expects.
    const geminiHistory = sessionHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    try {
        const chat = model.startChat({
            history: geminiHistory,
            generationConfig: { maxOutputTokens: 1024 },
        });

        // We send the system prompt as a new message in the chat.
        const result = await chat.sendMessage(finalSystemPrompt);
        const response = result.response;
        
        console.log(JSON.stringify(response, null, 2));
        let aiResponseContent = response.text();

        // Extract the JSON object from the response.
        const startIndex = aiResponseContent.indexOf('{');
        const endIndex = aiResponseContent.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const jsonString = aiResponseContent.substring(startIndex, endIndex + 1);
            return JSON.parse(jsonString);
        } else {
            // If no JSON is found, return a graceful error message.
            console.error("No valid JSON object found in the Gemini response:", aiResponseContent);
            return { message: aiResponseContent, execution: 'none' };
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        return { message: "I'm having trouble connecting to my core intelligence. Please try again shortly.", execution: 'none' };
    }
}

// --- API Endpoints ---
app.get('/api/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (eventName, data) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // It expects a 'history' parameter from the frontend.
        const sessionHistory = JSON.parse(req.query.history);
        if (!sessionHistory || !Array.isArray(sessionHistory)) {
            throw new Error("Invalid history format from frontend.");
        }
        const latestUserMessage = sessionHistory[sessionHistory.length - 1];

        sendEvent('ack', { status: 'received' });
        sendEvent('typing', { status: true });

        let aiResponseObject;

        // --- Passcode Check ---
        if (latestUserMessage.content.includes(OWNER_PASSCODE)) {
            const report = `--- SECRETARY REPORT ---\n\nCurrent Schedule:\n${await readPhoneSchedule()}`;
            aiResponseObject = {
                message: "Report sent to your device.",
                execution: "contactIssuer",
                parameters: { message: report }
            };
        } else {
            // Get response based ONLY on the current session's history.
            aiResponseObject = await getChatbotResponse(sessionHistory);
        }
        
        // --- Handle Execution Commands ---
        if (aiResponseObject.execution === 'writePhoneSchedule') {
            const scheduleContent = aiResponseObject.parameters?.newSchedule;
            if (scheduleContent) {
                await writePhoneSchedule(scheduleContent);
            }
        } else if (aiResponseObject.execution === 'contactIssuer') {
            const message = aiResponseObject.parameters?.message;
            if (message) await contactIssuer(message);
        }

        // NO MORE WRITING TO MASTER HISTORY.
        
        sendEvent('message', { reply: aiResponseObject.message });
        sendEvent('done', { status: 'finished' });
        res.end();
    } catch (error) {
        console.error("Error in stream:", error);
        sendEvent('error', { message: 'Failed to get a response.' });
        res.end();
    }
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
