const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs'); // For synchronous file reading at startup
const fsp = require('fs').promises; // For asynchronous file operations

const { GoogleGenerativeAI } = require("@google/genai");

const app = express();
const port = process.env.PORT || 3000;



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
async function relayMessageToOwner(relayContent) {
    const notificationTitle = `New Message via Constantinbot`;
    console.log(`${notificationTitle}: ${relayContent}`);
    try {
        await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
            method: 'POST',
            headers: { 'Title': notificationTitle },
            body: relayContent
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
        if (aiResponseObject.execution === 'relay_message') {
            // If the AI says to relay, use the content it provides.
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



// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
