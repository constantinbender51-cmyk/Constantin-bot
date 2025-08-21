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
const PROMPT_TEMPLATE
