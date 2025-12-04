// Simple Express + Socket.IO server for room-based data store & sync
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// --- GitHub OAuth Setup ---
const axios = require('axios');
const CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

// Step 1: Redirect to GitHub login
app.get('/auth/github', (req, res) => {
    const redirect_uri = req.query.redirect_uri || 'http://localhost:3000/auth/github/callback';
    const url = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect_uri)}&scope=repo user`;
    res.redirect(url);
});

// Step 2: GitHub OAuth callback
app.get('/auth/github/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    try {
        // Exchange code for access token
        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code
        }, {
            headers: { Accept: 'application/json' }
        });
        const access_token = tokenRes.data.access_token;
        if (!access_token) return res.status(400).json({ error: 'No access token' });
        // Get user info
        const userRes = await axios.get('https://api.github.com/user', {
            headers: { Authorization: `token ${access_token}` }
        });
        res.json({ access_token, user: userRes.data });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Example: GitHub API proxy (requires access_token)
app.get('/github/repos', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing access token' });
    try {
        const reposRes = await axios.get('https://api.github.com/user/repos', {
            headers: { Authorization: `token ${token}` }
        });
        res.json(reposRes.data);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function roomFilePath(roomId) {
    // sanitize roomId for filename
    const safe = roomId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return path.join(DATA_DIR, `${safe}.json`);
}

function readRoom(roomId) {
    const fp = roomFilePath(roomId);
    if (!fs.existsSync(fp)) return {};
    try {
        const raw = fs.readFileSync(fp, 'utf8');
        return JSON.parse(raw || '{}');
    } catch (e) {
        console.warn('readRoom error', e);
        return {};
    }
}

function writeRoom(roomId, data) {
    const fp = roomFilePath(roomId);
    try {
        fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.warn('writeRoom error', e);
        return false;
    }
}

// Merge incoming payload entries into stored room data using ts (timestamp) to decide latest
function mergeRoomData(current, incoming) {
    const out = Object.assign({}, current);
    Object.keys(incoming || {}).forEach(key => {
        const inc = incoming[key];
        const cur = out[key];
        if (!cur || (inc.ts || 0) >= (cur.ts || 0)) {
            out[key] = inc;
        }
    });
    return out;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Basic health
app.get('/', (req, res) => res.json({ ok: true, server: 'blast-furnace-sync', ts: new Date().toISOString() }));

// GET room data
app.get('/data/:roomId', (req, res) => {
    const roomId = req.params.roomId || 'default';
    const data = readRoom(roomId);
    res.json({ roomId, data });
});

// POST /data/:roomId  (client REST fallback)
app.post('/data/:roomId', (req, res) => {
    const roomId = req.params.roomId || 'default';
    const payload = req.body || {};
    const current = readRoom(roomId);
    const merged = mergeRoomData(current, payload);
    const ok = writeRoom(roomId, merged);
    if (!ok) return res.status(500).json({ ok: false, message: 'Could not persist data' });
    // respond with merged data
    res.json({ ok: true, roomId, merged });
    // Note: Socket broadcast is handled by socket handlers; server REST can still trigger broadcasts by clients.
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// socket.io handlers
io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('join', (roomId) => {
        try {
            socket.join(roomId);
            const data = readRoom(roomId);
            // send initial payload to the client that joined
            socket.emit('init', data);
            console.log(`socket ${socket.id} joined room ${roomId}`);
        } catch (e) {
            console.warn('join error', e);
        }
    });

    socket.on('update', (payload) => {
        // payload expected: { roomId, payload: { key: {type, value, ts}, ... } }
        try {
            const roomId = payload.roomId || payload.room || 'default';
            const incoming = payload.payload || {};
            const current = readRoom(roomId);
            const merged = mergeRoomData(current, incoming);
            writeRoom(roomId, merged);
            // broadcast to other clients in same room
            socket.to(roomId).emit('remote-update', incoming);
            // also optionally emit ack to sender
            socket.emit('update-ack', { ok: true, roomId });
        } catch (e) {
            console.warn('socket update error', e);
            socket.emit('update-ack', { ok: false, error: String(e) });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('socket disconnected', socket.id, reason);
    });
});

// admin endpoint to list rooms (files)
app.get('/rooms', (req, res) => {
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        const rooms = files.map(f => f.replace(/\.json$/, ''));
        res.json({ ok: true, rooms });
    } catch (e) {
        res.status(500).json({ ok: false, error: String(e) });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Blast-furnace-sync server listening on http://localhost:${PORT}`);
});