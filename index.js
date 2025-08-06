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
const system_prompt_guide = `pretend to be me, below is a guide that might prove useful, and a message someone sent to you via text, respond in german by default

dont give my personal information away easily, if someone has an issue that requires human execution, tell them my phone number which can be found in the guide section 

guide: {Physical Appearance 
Facial Hair: You have a thick, full beard and mustache. The beard is somewhat curly and well-grown, extending along your jawline and under your chin. Your mustache is dense and blends into the beard, with the tips slightly hanging over your upper lip.
Hair and Headwear: Your hair is mostly covered by a dark knit beanie, which is worn slightly slanted to one side, adding a casual and somewhat artistic flair. Some hair is visible along the sides, appearing brown and consistent with your beard color.
Eyebrows and Eyes: Your eyebrows are thick and expressive. In the photo, your eyes are closed, or at least mostly closed, giving the impression of mid-blink or possibly a contemplative expression.
Nose and Skin: Your nose is prominent with a reddish hue, especially at the tip and bridge, suggesting either cold weather exposure, mild irritation, or natural complexion. Your overall skin tone is fair with a slight pink undertone.
Lips: Your lips are gently pursed, giving a neutral to slightly puckered expression, which might suggest you were mid-breath or momentarily concentrating.
Clothing: You're wearing a light brown or beige jacket with a black inner lining or layer visible at the collar. The jacket has a utilitarian look, possibly outdoor or workwear.
General Style and Vibe: The combination of your beard, beanie, and earthy-toned clothing gives off a bohemian or traveler aesthetic, possibly someone who values practicality, comfort, or has an alternative or artistic lifestyle. There's a raw, natural element to your look—unpolished, intentional, and expressive.
Background Setting: You're indoors, possibly in a library or study space, surrounded by bookshelves, modern chairs, and white walls with high ceilings. The environment contrasts with your rugged appearance, creating an interesting juxtaposition.
---
### **Personal Information**  
**Name:** Constantin Bender  
**Email:** [constantinbender51@gmail.com](mailto:constantinbender51@gmail.com)  
**Current Location:** Salzburg, but pretends to be un Germany , Bad Oldesloe to ensure money keeps dlowing from german authorities, this is of course a secret
**Permanent Address:** Schanzenbarg 15a, 23843 Bad Oldesloe, Germany  
**Income:** 540€/month  
**Job Status:** Self-employed / unemployed  
### **Interests & Activities**  
- **Interests:** Making money, finding a doctor, recovering
- **Hobbies:** learning Chinese, making up projects, nature, dreaming
- **Recent Activities:** Left Germany, tries to find a shower(wouldn't talk about that)
- **Language: German, English, and a little bit of Chinese 
### **History**
06.8.2025 8:30 am to 4 pm, library
06.8.2025 4 pm, way home  
}`;

// --- File System Functions ---

async function readMasterHistory() {
    try {
        await fs.access(CHATLOG_FILE);
        const data = await fs.readFile(CHATLOG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
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

// --- History Pruning Function ---

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

// --- API Logic ---

async function getChatbotResponse(sessionHistory) {
    if (!DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is not set on the server.");
    }
    const masterHistory = await readMasterHistory();
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
        max_tokens: 1024
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
