// --- ES Module Imports ---
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsp } from 'fs';
import pkg from '@google/generative-ai';
const { GoogleGenerativeAI } = pkg;

// --- ES Module __dirname fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App Initialization ---
const app = express();
const port = process.env.PORT || 3000;

// --- Gemini Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Constants ---
const CHATLOG_FILE = path.join(__dirname, 'chatlog.json');
const SCHEDULE_FILE = path.join(__dirname, 'phoneSchedule.txt'); // New file for schedule
const MAX_HISTORY_TOKENS = 3000;
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123';
const OWNER_PASSCODE = 'X37952';

// --- Load System Prompt ---
let system_prompt_template;
try {
    system_prompt_template = await fsp.readFile(path.join(__dirname, 'prompt_guide.txt'), 'utf8');
    console.log("Successfully loaded prompt guide template.");
} catch (error) {
    console.error("CRITICAL: Could not read prompt_guide.txt.", error);
    system_prompt_template = "You are a helpful assistant.";
}

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Helper Functions ---

// NEW: Function to read the current schedule
async function readPhoneSchedule() {
    try {
        return await fsp.readFile(SCHEDULE_FILE, 'utf8');
    } catch (error) {
        // If file doesn't exist, return a default schedule
        if (error.code === 'ENOENT') {
            return "- Monday-Friday: 9:00 - 17:00 Available.";
        }
        console.error("Error reading schedule file:", error);
        return "Schedule currently unavailable.";
    }
}

// NEW: Function to write the new schedule
async function writePhoneSchedule(newSchedule) {
    try {
        await fsp.writeFile(SCHEDULE_FILE, newSchedule, 'utf8');
        console.log("Phone schedule updated.");
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

// --- (readMasterHistory, appendToMasterHistory, pruneHistory functions remain the same) ---
async function readMasterHistory() { /* ... */ }
async function appendToMasterHistory(userMessage, botMessage) { /* ... */ }
function pruneHistory(history) { /* ... */ }


// --- Main Chatbot Logic ---
async function getChatbotResponse(sessionHistory) {
    const masterHistory = await readMasterHistory();
    const combinedHistory = [...masterHistory, ...sessionHistory];
    const prunedHistory = pruneHistory(combinedHistory);

    // NEW: Inject the live schedule into the prompt template
    const currentSchedule = await readPhoneSchedule();
    const final_system_prompt = system_prompt_template.replace('[ SCHEDULE ]', currentSchedule);

    const geminiHistory = prunedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    try {
        const chat = model.startChat({
            history: geminiHistory,
            generationConfig: { maxOutputTokens: 1024 },
        });

        const result = await chat.sendMessage(final_system_prompt);
        const response = result.response;
        let aiResponseContent = response.text();

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
        const sessionHistory = JSON.parse(req.query.history);
        if (!sessionHistory || !Array.isArray(sessionHistory)) throw new Error("Invalid history format");

        sendEvent('ack', { status: 'received' });
        sendEvent('typing', { status: true });

        const latestUserMessage = sessionHistory[sessionHistory.length - 1];

        // --- NEW: Passcode Check ---
        if (latestUserMessage.content.includes(OWNER_PASSCODE)) {
            const masterHistory = await readMasterHistory();
            const report = `--- REPORT ---\nSchedule:\n${await readPhoneSchedule()}\n\nRecent Chat Log:\n${JSON.stringify(masterHistory.slice(-10), null, 2)}`;
            sendEvent('message', { reply: report });
            sendEvent('done', { status: 'finished' });
            res.end();
            return; // End execution here
        }

        let aiResponseObject = await getChatbotResponse(sessionHistory);
        
        // --- NEW: Handle commands with parameters ---
        if (aiResponseObject.execution === 'writePhoneSchedule') {
            const newSchedule = aiResponseObject.parameters?.newSchedule;
            if (newSchedule) {
                await writePhoneSchedule(newSchedule);
            }
        } else if (aiResponseObject.execution === 'contactIssuer') {
            const message = aiResponseObject.parameters?.message;
            if (message) {
                await contactIssuer(message);
            }
        }

        const botMessageForLog = { role: 'assistant', content: aiResponseObject.message };
        await appendToMasterHistory(latestUserMessage, botMessageForLog);

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
