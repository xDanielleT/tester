#!/usr/bin/env node
// AI Agency Dashboard — tiny local server with zero dependencies.
// Run:  node server.js          (or double-click "Start Dashboard")
// Opens on http://localhost:4310 and only listens on your own computer.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const HOST = '127.0.0.1'; // localhost only: nothing else on your network can reach it
const PORT = Number(process.env.PORT) || 4310;
const URL = `http://localhost:${PORT}`;
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data.backup.json');
const PAGE_FILE = path.join(__dirname, 'index.html');
const MAX_BODY = 5 * 1024 * 1024; // 5 MB is plenty for a JSON dashboard
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

// ---------- Sample data (only used the very first time, when data.json doesn't exist) ----------
// Dates are relative to the day you first launch, so the deadlines always look realistic.
function dayFromNow(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sampleData() {
  const brands = [
    { id: 'b1', status: 'active', name: 'Bramble & Hearth Bakery',
      description: 'Bristol sourdough bakery. New Shopify site with click-and-collect ordering and a weekly bake menu.',
      fee: 3200, retainer: 180, startDate: dayFromNow(-41), deadline: dayFromNow(12), progress: 70 },
    { id: 'b2', status: 'active', name: 'Thistledown Dog Spa',
      description: 'Edinburgh grooming salon. Online booking plus an AI chat assistant that answers breed and pricing questions.',
      fee: 1850, retainer: 95, startDate: dayFromNow(-22), deadline: dayFromNow(3), progress: 85 },
    { id: 'b3', status: 'active', name: 'Wren & Willow Tearoom',
      description: 'York tearoom. Monthly batch of faceless TikTok and Reels content with AI-generated product shots.',
      fee: 0, retainer: 650, startDate: dayFromNow(-70), deadline: dayFromNow(17), progress: 40 },
    { id: 'b4', status: 'active', name: 'Tidewell Physio',
      description: 'Plymouth physiotherapy clinic. Website redesign and an agent that drafts replies to Google reviews.',
      fee: 2400, retainer: 120, startDate: dayFromNow(-56), deadline: dayFromNow(-2), progress: 60 },
    { id: 'b5', status: 'active', name: 'Nettle & Fern Florist',
      description: 'Manchester florist. Brand refresh, new logo suite and seasonal product photography with AI.',
      fee: 1200, retainer: 0, startDate: dayFromNow(-9), deadline: dayFromNow(19), progress: 25 },
    { id: 'b6', status: 'active', name: 'Ashgrove Joinery',
      description: 'Family joinery in Leeds. Lead-finder agent and automatic quote follow-up emails, approved before sending.',
      fee: 4500, retainer: 300, startDate: dayFromNow(-5), deadline: dayFromNow(41), progress: 10 },
    { id: 'p1', status: 'proposal', name: 'The Gilded Thimble',
      description: 'Bath tailoring and alterations studio. Booking site with fitting reminders by text.',
      fee: 1600, retainer: 75, sentDate: dayFromNow(-6), decisionDate: dayFromNow(5) },
    { id: 'p2', status: 'proposal', name: 'Puddle Lane Nursery',
      description: 'Norwich nursery. Parent newsletter agent and a refreshed admissions page.',
      fee: 2800, retainer: 220, sentDate: dayFromNow(-12), decisionDate: dayFromNow(-1) },
    { id: 'p3', status: 'proposal', name: 'Saltmarsh Coffee Roasters',
      description: 'Whitstable roastery. Shopify subscription store for monthly bean deliveries.',
      fee: 3900, retainer: 0, sentDate: dayFromNow(-2), decisionDate: dayFromNow(12) },
    { id: 'p4', status: 'proposal', name: 'Kestrel Cycle Repairs',
      description: 'Cardiff bike workshop. Monthly social content retainer: repair time-lapses and AI-voiced tips.',
      fee: 0, retainer: 450, sentDate: dayFromNow(-9), decisionDate: dayFromNow(2) },
  ];
  const todos = [
    { id: 't1', text: 'Send Tidewell the revised homepage mock-up', brandId: 'b4', due: dayFromNow(-1), done: false },
    { id: 't2', text: 'Record a walkthrough video of the booking flow', brandId: 'b2', due: dayFromNow(2), done: false },
    { id: 't3', text: 'Chase Puddle Lane for a decision', brandId: 'p2', due: dayFromNow(0), done: false },
    { id: 't4', text: 'Draft the December content calendar', brandId: 'b3', due: dayFromNow(7), done: false },
    { id: 't5', text: 'Renew the agency domain', brandId: null, due: dayFromNow(10), done: false },
    { id: 't6', text: 'Write up Bramble & Hearth as a portfolio case study', brandId: 'b1', due: null, done: false },
    { id: 't7', text: 'Invoice Ashgrove for the 50% deposit', brandId: 'b6', due: dayFromNow(-4), done: true, doneAt: new Date().toISOString() },
  ];
  const now = new Date().toISOString();
  brands.forEach((b) => { b.createdAt = now; });
  todos.forEach((t) => { t.createdAt = now; });
  return { version: 1, settings: { agencyName: 'My AI Agency', name: '' }, brands, todos };
}

// ---------- Storage ----------
function isValidData(d) {
  return d && typeof d === 'object' && Array.isArray(d.brands) && Array.isArray(d.todos);
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const seed = sampleData();
    writeData(seed);
    console.log('Created data.json with sample brands.');
    return seed;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!isValidData(parsed)) throw new Error('data.json is missing brands or todos');
    return parsed;
  } catch (err) {
    // data.json is damaged: fall back to the backup, but never overwrite either file here.
    console.error(`Could not read data.json (${err.message}). Trying data.backup.json...`);
    const backup = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
    if (!isValidData(backup)) throw new Error('data.backup.json is also invalid');
    return backup;
  }
}

function writeData(data) {
  // Keep the previous save as a backup, then write to a temp file and swap it in,
  // so a crash halfway through a save can never leave you with a half-written file.
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE);
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- HTTP ----------
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Blocks "DNS rebinding" tricks where another website pretends to be localhost.
  if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, 'Forbidden', 'text/plain');

  const pathname = req.url.split('?')[0];

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return fs.readFile(PAGE_FILE, (err, html) =>
      err ? send(res, 500, 'index.html not found', 'text/plain') : send(res, 200, html, 'text/html; charset=utf-8'));
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ app: 'agency-dashboard', ok: true }));
  }

  if (req.method === 'GET' && pathname === '/api/data') {
    try { return send(res, 200, JSON.stringify(readData())); }
    catch (err) { return send(res, 500, JSON.stringify({ error: err.message })); }
  }

  // PUT from the page, POST from navigator.sendBeacon when the tab closes.
  if ((req.method === 'PUT' || req.method === 'POST') && pathname === '/api/data') {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      return send(res, 415, JSON.stringify({ error: 'Expected JSON' }));
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { send(res, 413, JSON.stringify({ error: 'Too large' })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!isValidData(data)) return send(res, 400, JSON.stringify({ error: 'Invalid data shape' }));
        writeData(data);
        send(res, 200, JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
      } catch (err) {
        send(res, 400, JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  send(res, 404, 'Not found', 'text/plain');
});

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.log(`Open this in your browser: ${url}`); });
}

const shouldOpen = process.argv.includes('--open');

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  // Port taken: if it's already this dashboard, just open it instead of failing.
  http.get(`${URL}/api/health`, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => {
      if (body.includes('agency-dashboard')) {
        console.log(`Dashboard is already running at ${URL}`);
        if (shouldOpen) openBrowser(URL);
        setTimeout(() => process.exit(0), 500);
      } else {
        console.error(`Port ${PORT} is used by another program. Try: set PORT=4311 && node server.js`);
        process.exit(1);
      }
    });
  }).on('error', () => {
    console.error(`Port ${PORT} is busy. Close the other program or set a different PORT.`);
    process.exit(1);
  });
});

server.listen(PORT, HOST, () => {
  readData(); // creates data.json with sample brands on first run
  console.log(`\n  AI Agency Dashboard is running at ${URL}`);
  console.log('  Saving to ' + DATA_FILE);
  console.log('  Keep this window open while you use it. Press Ctrl+C to stop.\n');
  if (shouldOpen) openBrowser(URL);
});
