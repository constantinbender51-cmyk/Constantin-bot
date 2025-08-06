const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs'); // Use the base 'fs' module for sync read

const app = express();
const port = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const CHATLOG_FILE = path.join(__dirname, 'chatlog.json');
const MAX_HISTORY_TOKENS = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// --- NEW: Read the system prompt from the external file at startup ---
let system_prompt_guide;
try {
    // Read the file synchronously when the server starts.
    system_prompt_guide = fs.readFileSync(path.join(__dirname, 'prompt_guide.txt'), 'utf8');
    console.log("Successfully loaded prompt guide.");
} catch (error) {
    console.error("CRITICAL: Could not read prompt_guide.txt. The chatbot may not function correctly.", error);
    // Provide a fallback prompt to prevent a crash
    system_prompt_guide = "You are a helpful assistant."; 
}

// --- File System & Helper Functions (These remain the same) ---
async function readMasterHistory() { /* ... same as before ... */ }
async function appendToMasterHistory(userMessage, botMessage) { /* ... same as before ... */ }
function pruneHistory(history) { /* ... same as before ... */ }
async function getChatbotResponse(sessionHistory) { /* ... same as before ... */ }

// --- NEW STREAMING ENDPOINT ---
app.get('/api/stream', async (req, res) => {
    // 1. Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Send headers immediately

    // Helper to send events to the client
    const sendEvent = (eventName, data) => {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // 2. Get history from query parameter
        const sessionHistory = JSON.parse(req.query.history);
        if (!sessionHistory || !Array.isArray(sessionHistory)) {
            throw new Error("Invalid history format");
        }

        // 3. INSTANTLY send acknowledgment and typing events
        sendEvent('ack', { status: 'received' });
        sendEvent('typing', { status: true });

        // 4. Perform the slow AI call
        const latestUserMessage = sessionHistory[sessionHistory.length - 1];
        const botReplyContent = await getChatbotResponse(sessionHistory);
        const botMessage = { role: 'assistant', content: botReplyContent };

        // 5. Log the conversation after getting a response
        await appendToMasterHistory(latestUserMessage, botMessage);

        // 6. Send the final message and close the stream
        sendEvent('message', { reply: botReplyContent });
        sendEvent('done', { status: 'finished' });
        res.end();

    } catch (error) {
        console.error("Error in stream:", error);
        sendEvent('error', { message: 'Failed to get a response.' });
        res.end();
    }
});


// --- Helper function implementations (copy these from your previous file) ---
async function readMasterHistory() {
    try {
        await fs.access(CHATLOG_FILE);
        const data = await fs.readFile(CHATLOG_FILE, 'utf8');
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
        await fs.writeFile(CHATLOG_FILE, JSON.stringify(masterHistory, null, 2), 'utf8');
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

async function getChatbotResponse(sessionHistory) {
    if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is not set on the server.");
    const masterHistory = await readMasterHistory();
    const combinedHistory = [...masterHistory, ...sessionHistory];
    const prunedHistory = pruneHistory(combinedHistory);
    const messagesForApi = [{ role: 'system', content: system_prompt_guide }, ...prunedHistory];
    const body = { model: 'deepseek-chat', messages: messagesForApi, temperature: 0.7, max_tokens: 1024 };
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API Error Response: ${errorBody}`);
        throw new Error(`API request failed with status ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}


// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
