// --- ES Module Imports ---
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fsp } from 'fs';
import pkg from 'pg';
const { Pool } = pkg;

import { GoogleGenerativeAI } from '@google/generative-ai';

// --- ES Module __dirname fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App Initialization ---
const app = express();
const port = process.env.PORT || 3000;

// --- PostgreSQL (silent persistence only) ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
})();

// --- Gemini Initialization ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- Constants ---
const SCHEDULE_FILE = path.join(__dirname, 'phoneSchedule.txt');
const PROMPT_TEMPLATE_FILE = path.join(__dirname, 'prompt_guide.txt');
const NTFY_TOPIC = 'constantin-bot-notifications-xyz123';
const OWNER_PASSCODE = 'X37952';

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- Tiny helper: silently save a message ---
async function saveMessage(role, content) {
  try {
    await pool.query('INSERT INTO messages(role, content) VALUES ($1, $2)', [role, content]);
  } catch (e) {
    console.error('DB save failed:', e);
  }
}

// --- Helper Functions (unchanged) ---
async function readPhoneSchedule() {
  try {
    return await fsp.readFile(SCHEDULE_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return 'No schedule has been set.';
    return 'Schedule currently unavailable.';
  }
}

async function writePhoneSchedule(newSchedule) {
  try {
    await fsp.writeFile(SCHEDULE_FILE, newSchedule, 'utf8');
    console.log('Phone schedule has been completely updated.');
  } catch (error) {
    console.error('Error writing schedule file:', error);
  }
}

async function contactIssuer(message) {
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: 'POST',
      headers: { Title: 'New Message via Secretary Bot' },
      body: message
    });
  } catch (error) {
    console.error('Failed to send notification via ntfy:', error);
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    const trimmed = raw.trim();
    if (trimmed) return JSON.parse(trimmed);
    throw new Error('Empty or partial JSON');
  }
}

// --- Chatbot Logic (unchanged) ---
async function getChatbotResponse(sessionHistory) {
  const promptTemplate = await fsp.readFile(PROMPT_TEMPLATE_FILE, 'utf8');
  const currentSchedule = await readPhoneSchedule();
  const now = new Date();
  const dateStr = now.toLocaleDateString('de-DE');
  const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const systemPrompt = promptTemplate
    .replace('[SCHEDULE_PLACEHOLDER]', currentSchedule)
    .replace('[CURRENT_DATETIME_PLACEHOLDER]', `${dateStr} ${timeStr}`);

  const fullPrompt =
    `${systemPrompt}\n\n--- Conversation so far ---\n` +
    sessionHistory.map(h => `${h.role}: ${h.content}`).join('\n') +
    `\n\nNow reply ONLY with the JSON object and absolutely nothing else.`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: 2048
    }
  });

  const raw = result.response.text();
  console.log('>>> RAW GEMINI JSON >>>', raw, '<<<');

  let payload;
  try {
    payload = safeParse(raw);
  } catch (e) {
    console.warn('JSON parse failed:', e.message);
    payload = { message: 'I received an unclear response—could you please repeat?', execution: 'none' };
  }
  return payload;
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
    if (!Array.isArray(sessionHistory)) throw new Error('Invalid history');

    const latestUserMessage = sessionHistory[sessionHistory.length - 1];
    sendEvent('ack', { status: 'received' });
    sendEvent('typing', { status: true });

    let aiResponseObject;
    if (latestUserMessage.content.includes(OWNER_PASSCODE)) {
      const report = `--- SECRETARY REPORT ---\n\nCurrent Schedule:\n${await readPhoneSchedule()}`;
      aiResponseObject = {
        message: 'Report sent to your device.',
        execution: 'contactIssuer',
        parameters: { message: report }
      };
    } else {
      aiResponseObject = await getChatbotResponse(sessionHistory);
    }

    if (aiResponseObject.execution === 'writePhoneSchedule') {
      const scheduleContent = aiResponseObject.parameters?.newSchedule;
      if (scheduleContent) await writePhoneSchedule(scheduleContent);
    } else if (aiResponseObject.execution === 'contactIssuer') {
      const message = aiResponseObject.parameters?.message;
      if (message) await contactIssuer(message);
    }

    // Silent persistence: save both user & assistant messages
    await saveMessage('user', latestUserMessage.content);
    await saveMessage('assistant', aiResponseObject.message);

    sendEvent('message', { reply: aiResponseObject.message });
    sendEvent('done', { status: 'finished' });
    res.end();
  } catch (error) {
    console.error('Error in stream:', error);
    sendEvent('error', { message: 'Failed to get a response.' });
    res.end();
  }
});

// --- Server Start ---
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
