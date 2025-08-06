const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs').promises; // Using the promise-based version of the File System module

const app = express();
const port = process.env.PORT || 3000;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// --- Configuration ---
const CHATLOG_FILE = path.join(__dirname, 'chatlog.json'); // Defines the path for our log file
const MAX_HISTORY_TOKENS = 3000; // Reserve ~1000 tokens for the new prompt and response. Adjust as needed.

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// The system prompt guide remains the same
const system_prompt_guide = `pretend to be me, here is a guide...`; // (Keep the full text here)

// --- File System Functions ---

async function readMasterHistory() {
    try {
        // Check if the file exists before trying to read it
        await fs.access(CHATLOG_FILE);
        const data = await fs.readFile(CHATLOG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If the file doesn't exist or is empty, return an empty array
        if (error.code === 'ENOENT') {
            return [];
        }
        // For other errors, log them but still return an empty array to prevent crashing
        console.error("Error reading chatlog.json:", error);
        return [];
    }
}

async functionappendToMasterHistory(userMessage, botMessage) {
    try {
        const masterHistory = await readMasterHistory();
        masterHistory.push(userMessage);
        masterHistory.push(botMessage);
        await fs.writeFile(CHATLOG_FILE, JSON.stringify(masterHistory, null, 2), 'utf8');
    } catch (error) {
        console.error("Error writing to chatlog.json:", error);
    }
}

// --- History Pruning Function ---

function pruneHistory(history) {
    let totalTokens = 0;
    const prunedHistory = [];

    // Iterate backwards through history to keep the most recent messages
    for (let i = history.length - 1; i >= 0; i--) {
        const message = history[i];
        // Simple token estimation: 1 token ~= 4 characters. This is a rough but effective heuristic.
        const messageTokens = Math.ceil((message.content || '').length / 4);

        if (totalTokens + messageTokens <= MAX_HISTORY_TOKENS) {
            prunedHistory.unshift(message); // Add to the beginning to maintain order
            totalTokens += messageTokens;
        } else {
            // Stop adding messages once we exceed the token limit
            break;
        }
    }
    console.log(`History pruned to ${totalTokens} tokens.`);
    return prunedHistory;
}


// --- API Logic ---

async function getChatbotResponse(sessionHistory) {
    if (!DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is not set on the server.");
    }

    // 1. Read the master log file
    const masterHistory = await readMasterHistory();
    
    // 2. Combine and prune the history
    const combinedHistory = [...masterHistory, ...sessionHistory];
    const prunedHistory = pruneHistory(combinedHistory);

    const messagesForApi = [
        { role: 'system', content: system_prompt_guide },
        ...prunedHistory
    ];

    const body = {
        model: 'deepseek-chat',
        messages: messagesForApi,
        temperature: 0.7,
        max_tokens: 1024 // Keep response size reasonable
    };

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

// --- API Endpoint ---

app.post('/api/chat', async (req, res) => {
    try {
        const { history: sessionHistory } = req.body;
        if (!sessionHistory || !Array.isArray(sessionHistory) || sessionHistory.length === 0) {
            return res.status(400).json({ error: 'Session history is required.' });
        }

        const latestUserMessage = sessionHistory[sessionHistory.length - 1];
        const botReplyContent = await getChatbotResponse(sessionHistory);
        const botMessage = { role: 'assistant', content: botReplyContent };

        // Append the latest exchange to the master log file for future conversations
        await appendToMasterHistory(latestUserMessage, botMessage);

        res.json({ reply: botReplyContent });

    } catch (error) {
        console.error("Error in /api/chat endpoint:", error);
        res.status(500).json({ error: 'Failed to get a response from the chatbot.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
