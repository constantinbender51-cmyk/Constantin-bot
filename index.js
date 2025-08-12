// --- ES Module Imports ---
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsp } from 'fs';

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
const CHATLOG_FILE = path.join(__dirname, 'chatlog.json');
const SCHEDULE_FILE = path.join(__dirname, 'phoneSchedule.txt');
const PROMPT_TEMPLATE_FILE = path.join(__dirname, 'prompt_guide.txt');
const MAX_HISTORY_TOKENS = 3000;
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123';
const OWNER_PASSCODE = 'X37952';

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Helper Functions ---

async function readPhoneSchedule() {
    try {
        return await fsp.readFile(SCHEDULE_FILE, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return "No schedule has been set.";
        console.error("Error reading schedule file:", error);
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
    const notificationTitle = `New Message via Secretary Bot`;
    console.log(`${notificationTitle}: ${message}`);
    try {
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            headers: { 'Title': notificationTitle },
            body: message
        });
    } catch (error) {
        console.error("Failed to send notification via ntfy:", error);
    }
}

async function readMasterHistory() {
    try {
        const data = await fsp.readFile(CHATLOG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        return [];
    }
}

async function appendToMasterHistory(userMessage, botMessage) {
    let masterHistory = await readMasterHistory();
    if (!Array.isArray(masterHistory)) masterHistory = [];
    masterHistory.push(userMessage);
    masterHistory.push(botMessage);
    await fsp.writeFile(CHATLOG_FILE, JSON.stringify(masterHistory, null, 2), 'utf8');
}

function pruneHistory(history) {
    let totalTokens = 0;
    const prunedHistory = [];
    for (let i = history.length - 1; i >= 0; i--) {
        const message = history[i];
        const messageTokens = Math.ceil((message.content || '').length / 4);
        if (totalTokens + messageTokens <= MAX_HISTORY_TOKENS) {
            prunedHistory.unshift(message);
            totalTokens += messageTokens;
        } else break;
    }
    console.log(`History pruned to ${totalTokens} tokens.`);
    return prunedHistory;
}

// --- Main Chatbot Logic ---
async function getChatbotResponse(userMessage, isNewSession) {
    let masterHistory = await readMasterHistory();
    if (!Array.isArray(masterHistory)) masterHistory = [];

    // --- NEW: Inject the session marker ---
    if (isNewSession) {
        masterHistory.push({
            role: 'user',
            // This is a system-level note for the AI, not a real user message.
            content: '--- NEW SESSION ---' 
        });
    }
    // Add the actual user message to the history
    masterHistory.push(userMessage);

    const prunedHistory = pruneHistory(masterHistory);

    const promptTemplate = await fsp.readFile(PROMPT_TEMPLATE_FILE, 'utf8');
    const currentSchedule = await readPhoneSchedule();
    const finalSystemPrompt = promptTemplate.replace('[SCHEDULE_PLACEHOLDER]', currentSchedule);

    const geminiHistory = prunedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    try {
        const chat = model.startChat({
            history: geminiHistory,
            generationConfig: { maxOutputTokens: 1024 },
        });

        const result = await chat.sendMessage(finalSystemPrompt);
        const response = result.response;
        let aiResponseContent = response.text();

        const startIndex = aiResponseContent.indexOf('{');
        const endIndex = aiResponseContent.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            return JSON.parse(aiResponseContent.substring(startIndex, endIndex + 1));
        } else {
            throw new Error("No valid JSON object found in the Gemini response.");
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
    try {
        // --- MODIFIED: We now get the message and the new session flag ---
        const userMessageContent = req.query.message;
        const isNewSession = req.query.isNewSession === 'true';

        if (!userMessageContent) throw new Error("No message provided");

        const userMessageForLog = { role: 'user', content: userMessageContent };

        sendEvent('ack', { status: 'received' });
        sendEvent('typing', { status: true });

        let aiResponseObject;

        // Passcode Check
        if (userMessageContent.includes(OWNER_PASSCODE)) {
            // ... (passcode logic is the same) ...
        } else {
            // --- MODIFIED: Call the new getChatbotResponse ---
            aiResponseObject = await getChatbotResponse(userMessageForLog, isNewSession);
        }
        
        // --- Handle Execution Commands ---
        if (aiResponseObject.execution === 'writePhoneSchedule') {
            // We now look for 'newSchedule' which contains the ENTIRE new schedule
            const scheduleContent = aiResponseObject.parameters?.newSchedule;
            if (scheduleContent) {
                // Call the modified function to overwrite the schedule file
                await writePhoneSchedule(scheduleContent);
            }
        } else if (aiResponseObject.execution === 'contactIssuer') {
            const message = aiResponseObject.parameters?.message;
            if (message) await contactIssuer(message);
        }

        await appendToMasterHistory(userMessageForLog, botMessageForLog);

        sendEvent('message', { reply: aiResponseObject.message });
        sendEvent('done', { status: 'finished' });
        res.end();
    } catch (error) {
        console.error("Error in stream:", error);
        sendEvent('error', { message: 'Failed to get a response.' });
        res.end();
    }
});

// --- NEW: Endpoint to get the full chat history ---
app.get('/api/history', async (req, res) => {
    const history = await readMasterHistory();
    res.json(history);
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
