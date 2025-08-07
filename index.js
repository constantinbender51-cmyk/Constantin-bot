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
// Add this near your other middleware
app.use(express.json()); // Middleware to parse JSON bodies

// --- NEW: Configuration for Notifications ---
// IMPORTANT: Change this to your own secret topic!
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123'; 

let system_prompt_guide;
try {
    system_prompt_guide = fs.readFileSync(path.join(__dirname, 'prompt_guide.txt'), 'utf8');
    console.log("Successfully loaded prompt guide.");
} catch (error) {
    console.error("CRITICAL: Could not read prompt_guide.txt.", error);
    system_prompt_guide = "You are a helpful assistant."; 
}

// --- NEW: Function to send the notification ---
async function relayMessageToOwner(userMessage) {
    console.log(`Relaying message to owner: ${userMessage}`);
    try {
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            headers: {
                'Title': 'New Message from Constantinbot User',
                'Priority': 'default'
            },
            body: userMessage // Send the user's message as the body of the notification
        });
    } catch (error) {
        console.error("Failed to send notification via ntfy:", error);
    }
}


// ... (keep top of file and helper functions the same) ...
// --- NEW ENDPOINT for the confirmation button ---
app.post('/api/confirm-relay', async (req, res) => {
    try {
        const { messageToRelay } = req.body;
        if (!messageToRelay) {
            return res.status(400).json({ error: 'No message provided to relay.' });
        }
        
        // Call the existing function to send the notification
        await relayMessageToOwner(messageToRelay);
        
        res.status(200).json({ success: true, message: 'Message relayed successfully.' });
    } catch (error) {
        console.error("Error in /api/confirm-relay:", error);
        res.status(500).json({ error: 'Failed to relay message.' });
    }
});


// --- Modify the STREAMING ENDPOINT ---
app.get('/api/stream', async (req, res) => {
    // ... (res.setHeader and sendEvent function are the same) ...
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
        let aiResponseObject = await getChatbotResponse(sessionHistory);
        
        // We no longer check for 'relay_message' here. That logic is now on the frontend.
        if (aiResponseObject.execution === 'get_time_date') {
            const now = new Date();
            const formattedDate = now.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
            aiResponseObject.message += ` The current date and time is ${formattedDate}.`;
        }

        const botMessageForLog = { role: 'assistant', content: aiResponseObject.message };
        await appendToMasterHistory(latestUserMessage, botMessageForLog);

        // --- IMPORTANT: Send the full object to the frontend now ---
        // The frontend needs to know the 'execution' type to decide if it should show a button.
        sendEvent('message', { 
            reply: aiResponseObject.message,
            execution: aiResponseObject.execution,
            // We also need to send the original user message content for the relay button
            originalUserMessage: latestUserMessage.content 
        });

        sendEvent('done', { status: 'finished' });
        res.end();

    } catch (error) {
        console.error("Error in stream:", error);
        sendEvent('error', { message: 'Failed to get a response.' });
        res.end();
    }
});

// ... (rest of the file is the same) ...

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
    let aiResponseContent = data.choices[0].message.content;

    // --- THE FIX IS HERE: Clean the response string ---
    try {
        // Find the first '{' and the last '}'
        const startIndex = aiResponseContent.indexOf('{');
        const endIndex = aiResponseContent.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            // Extract the JSON part of the string
            const jsonString = aiResponseContent.substring(startIndex, endIndex + 1);
            
            // Now, parse the cleaned string
            const responseObject = JSON.parse(jsonString);
            console.log(`AI Action: ${responseObject.execution}`);
            return responseObject;
        } else {
            // If no valid JSON structure is found, throw an error to be caught below
            throw new Error("No valid JSON object found in the AI response.");
        }

    } catch (error) {
        console.error("Failed to parse JSON from AI response:", aiResponseContent, error);
        // Fallback gracefully if parsing fails for any reason
        return { message: "I seem to be having trouble formatting my thoughts. Please try rephrasing your question.", execution: 'none' };
    }
}


// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
