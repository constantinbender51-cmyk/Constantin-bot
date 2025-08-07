const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs'); // For synchronous file reading at startup
const fsp = require('fs').promises; // For asynchronous file operations

const app = express();
const port = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const CHATLOG_FILE = path.join(__dirname, 'chatlog.json');
const MAX_HISTORY_TOKENS = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// --- Read the system prompt from the external file at startup ---
let system_prompt_guide;
try {
    system_prompt_guide = fs.readFileSync(path.join(__dirname, 'prompt_guide.txt'), 'utf8');
    console.log("Successfully loaded prompt guide.");
} catch (error) {
    console.error("CRITICAL: Could not read prompt_guide.txt.", error);
    system_prompt_guide = "You are a helpful assistant."; 
}

// --- STREAMING ENDPOINT ---
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
        if (!sessionHistory || !Array.isArray(sessionHistory)) {
            throw new Error("Invalid history format");
        }

        sendEvent('ack', { status: 'received' });
        sendEvent('typing', { status: true });

        const latestUserMessage = sessionHistory[sessionHistory.length - 1];
        
        // getChatbotResponse returns an object: { message, execution }
        const aiResponseObject = await getChatbotResponse(sessionHistory);
        
        // Use the .message property for the log
        const botMessageForLog = { role: 'assistant', content: aiResponseObject.message };

        await appendToMasterHistory(latestUserMessage, botMessageForLog);

        // Send ONLY the .message property to the user
        sendEvent('message', { reply: aiResponseObject.message });
        sendEvent('done', { status: 'finished' });
        res.end();

    } catch (error) {
        console.error("Error in stream:", error);
        sendEvent('error', { message: 'Failed to get a response.' });
        res.end();
    }
});

// --- Helper function implementations ---

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
    const aiResponseContent = data.choices[0].message.content;

    try {
        const responseObject = JSON.parse(aiResponseContent);
        console.log(`AI Action: ${responseObject.execution}`);
        return responseObject;
    } catch (error) {
        console.error("Failed to parse JSON from AI response:", aiResponseContent, error);
        return { message: aiResponseContent, execution: 'none' };
    }
}

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
