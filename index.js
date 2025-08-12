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
const MAX_HISTORY_TOKENS = 3000;
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123';

// --- Load System Prompt ---
let system_prompt_guide;
try {
    // Use fsp (fs.promises) which is already imported
    system_prompt_guide = await fsp.readFile(path.join(__dirname, 'prompt_guide.txt'), 'utf8');
    console.log("Successfully loaded prompt guide.");
} catch (error) {
    console.error("CRITICAL: Could not read prompt_guide.txt.", error);
    system_prompt_guide = "You are a helpful assistant.";
}

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Helper Functions (no changes needed) ---
async function relayMessageToOwner(relayContent) {
    const notificationTitle = `New Message via Constantinbot`;
    console.log(`${notificationTitle}: ${relayContent}`);
    try {
        // Global fetch is available in modern Node.js ES Modules
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            headers: { 'Title': notificationTitle },
            body: relayContent
        });
    } catch (error) {
        console.error("Failed to send notification via ntfy:", error);
    }
}

async function readMasterHistory() {
    try {
        await fsp.access(CHATLOG_FILE);
        const data = await fsp.readFile(CHATLOG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        console.error("Error reading chatlog.json:", error);
        return [];
    }
}

async function appendToMasterHistory(userMessage, botMessage) {
    try {
        const masterHistory = await readMasterHistory();
        masterHistory.push(userMessage);
        masterHistory.push(botMessage);
        await fsp.writeFile(CHATLOG_FILE, JSON.stringify(masterHistory, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing to chatlog.json:", error);
    }
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
        } else {
            break;
        }
    }
    console.log(`History pruned to ${totalTokens} tokens.`);
    return prunedHistory;
}

// --- Main Chatbot Logic (no changes needed) ---
async function getChatbotResponse(sessionHistory) {
    const masterHistory = await readMasterHistory();
    const combinedHistory = [...masterHistory, ...sessionHistory];
    const prunedHistory = pruneHistory(combinedHistory);

    const geminiHistory = prunedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    try {
        const chat = model.startChat({
            history: geminiHistory,
            generationConfig: { maxOutputTokens: 1024 },
        });

        const result = await chat.sendMessage(system_prompt_guide);
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

// --- API Endpoints (no changes needed) ---
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
        let aiResponseObject = await getChatbotResponse(sessionHistory);
        
        if (aiResponseObject.execution === 'relay_message') {
            if (aiResponseObject.relay_content) {
                await relayMessageToOwner(aiResponseObject.relay_content);
            }
        } else if (aiResponseObject.execution === 'get_time_date') {
            const now = new Date();
            const formattedDate = now.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
            aiResponseObject.message += ` The current date and time is ${formattedDate}.`;
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
            
