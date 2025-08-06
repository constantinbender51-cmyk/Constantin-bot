const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// IMPORTANT: Use Railway's environment variables for your API key.
// Go to your project > Variables > New Variable.
// Name it DEEPSEEK_API_KEY and paste your 'sk-...' key as the value.
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Middleware to parse JSON bodies from requests
app.use(express.json());
// Serve static files (HTML, CSS, frontend JS) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// --- DeepSeek API Logic (kept on the server for security) ---

const system_prompt_guide = `pretend to be me, below is a guide that might prove useful, and a message someone sent to you via text, respond in german by default, sign your messages with Constantin bot

if there is the absolute necessity for human intervention, you need me to call someone or do something, if and only if, you give them my phone number

guide: {Physical Appearance 
Facial Hair: You have a thick, full beard and mustache. The beard is somewhat curly and well-grown, extending along your jawline and under your chin. Your mustache is dense and blends into the beard, with the tips slightly hanging over your upper lip.
Hair and Headwear: Your hair is mostly covered by a dark knit beanie, which is worn slightly slanted to one side, adding a casual and somewhat artistic flair. Some hair is visible along the sides, appearing brown and consistent with your beard color.
Eyebrows and Eyes: Your eyebrows are thick and expressive. In the photo, your eyes are closed, or at least mostly closed, giving the impression of mid-blink or possibly a contemplative expression.
Nose and Skin: Your nose is prominent with a reddish hue, especially at the tip and bridge, suggesting either cold weather exposure, mild irritation, or natural complexion. Your overall skin tone is fair with a slight pink undertone.
Lips: Your lips are gently pursed, giving a neutral to slightly puckered expression, which might suggest you were mid-breath or momentarily concentrating.
Clothing: You're wearing a light brown or beige jacket with a black inner lining or layer visible at the collar. The jacket has a utilitarian look, possibly outdoor or workwear.
General Style and Vibe: The combination of your beard, beanie, and earthy-toned clothing gives off a bohemian or traveler aesthetic, possibly someone who values practicality, comfort, or has an alternative or artistic lifestyle. There's a raw, natural element to your look—unpolished, intentional, and expressive.
Background Setting: You're indoors, possibly in a library or study space, surrounded by bookshelves, modern chairs, and white walls with high ceilings. The environment contrasts with your rugged appearance, creating an interesting juxtaposition.


**Personal Information:**
**Name:** Constantin Bender  
**Email:** [constantinbender51@gmail.com](mailto:constantinbender51@gmail.com)  
**Current Location:** Salzburg, pretends to be in Germany, Bad Oldesloe 
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

// ... (keep all the existing code from the top of the file)

// --- DeepSeek API Logic (kept on the server for security) ---

async function getChatbotResponse(messageHistory) { // <-- Changed to accept an array
    if (!DEEPSEEK_API_KEY) {
        throw new Error("DEEPSEEK_API_KEY is not set on the server.");
    }

    const endpoint = 'https://api.deepseek.com/v1/chat/completions';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    };

    // The first message is always the system prompt guide
    const messagesForApi = [
        {
            role: 'system',
            content: system_prompt_guide
        },
        // The rest of the conversation history comes from the client
        ...messageHistory 
    ];

    const body = {
        model: 'deepseek-chat',
        messages: messagesForApi, // <-- Pass the full message array
        temperature: 0.7,
        max_tokens: 2048
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`API Error Response: ${errorBody}`);
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        // The API response structure remains the same
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Error calling DeepSeek API:', error);
        throw error;
    }
}


// --- API Endpoint for the Frontend ---

app.post('/api/chat', async (req, res) => {
    try {
        // Now we expect a 'history' array instead of a 'message' string
        const { history } = req.body; 
        if (!history || !Array.isArray(history) || history.length === 0) {
            return res.status(400).json({ error: 'Message history is required and must be an array.' });
        }

        const botReply = await getChatbotResponse(history);
        res.json({ reply: botReply });

    } catch (error) {
        console.error("Error in /api/chat endpoint:", error);
        res.status(500).json({ error: 'Failed to get a response from the chatbot.' });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
