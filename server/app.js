// ===================================================================
// server/app.js — Express app configuration (middleware + routes)
// Kept separate from index.js so this can be imported in tests later.
// ===================================================================
const express = require('express');
const path    = require('path');
const cors    = require('cors');
const helmet  = require('helmet');

const app = express();

// --- Body parser with size limit (Session 10 audit, slide 7) -------
// Rejects any request body over 10KB to prevent memory-exhaustion attacks.
app.use(express.json({ limit: '10kb' }));

// Helmet adds X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, and other security headers.
app.use(helmet());

// --- CORS whitelist from .env --------------------------------------
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// --- Health check (used by deployment + uptime monitoring) ---------
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// --- Serve the frontend static files ---
// public/ lives at the repo root — one level above server/.
app.use(express.static(path.join(__dirname, '..', 'public')));

// === Routes ========================================================
app.use('/api/workshops', require('./routes/workshops'));
app.use('/api/register',  require('./routes/register'));
app.use('/api/login',     require('./routes/auth'));
app.use('/api/checkout',  require('./routes/checkout'));

// --- 404 handler (no route matched) --------------------------------
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// --- Global error handler ------------------------------------------
// Internal: full stack trace logged for the developer.
// External: generic message to the client (Session 10, slide 5).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

module.exports = app;