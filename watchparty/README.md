# 🎬 WatchParty — Watch Together, Chat Together

Real-time watch party: chat, voice messages, YouTube, direct MP4 URLs, local video upload, and **WebRTC screen sharing** (Netflix, Disney+, any website).

## ✨ All Features
- 💬 Real-time text chat with 30 emojis
- 🎙️ WhatsApp-style voice messages (hold mic button to record)
- 📁 Upload local videos up to 5GB (chunked, smooth streaming)
- ▶️ YouTube — paste link, embedded player
- 🔗 **Direct MP4 URL** — paste any public .mp4 link (Google Drive, Dropbox, CDN etc.) — fully synced play/pause/seek
- 📡 **WebRTC Screen Share** — share your Chrome tab (Netflix, Disney+, any website) live to all friends
- ⛶ Fullscreen mode with mini-chat bubble overlay + new message badge
- 🔄 Play/pause/seek syncs instantly for upload & direct URL videos
- 👥 6-letter invite code for friends to join

## 🚀 Setup (3 steps)

### 1. Supabase
1. Go to **supabase.com** → Create free project
2. SQL Editor → paste contents of `server/config/schema.sql` → Run
3. Settings → API → copy **Project URL** and **anon public key**

### 2. Backend
```bash
cd server
npm install
cp .env.example .env
# Edit .env: fill in SUPABASE_URL, SUPABASE_ANON_KEY, JWT_SECRET
npm run dev
```
✅ Runs on **http://localhost:5000**

### 3. Frontend
```bash
cd client
npm install
npm start
```
✅ Runs on **http://localhost:3000**

---

## 🎬 How to use each feature

### Watch a local video (synced)
1. In the room → Library tab → ⬆ Upload → select MP4 file
2. Video plays synced for all members (play/pause/seek all sync)

### Watch with a direct URL (synced)
1. Library → 🔗 Direct URL tab → paste any `.mp4` URL
2. Works with Google Drive (direct link), Dropbox (?dl=1), any public MP4
3. Fully synced — play/pause/seek works for everyone

### Watch YouTube
1. Library → ▶ YouTube tab → paste URL
2. Note: YouTube blocks auto-sync, both press play together

### 📡 Screen Share (Netflix, any website)
1. Click **🖥️ Screen** tab in the nav
2. Click **📡 Start Screen Share**
3. Chrome shows a picker — select **Chrome Tab** → pick Netflix/Disney+/any site
4. All friends in the room instantly see your tab live
5. Chat still works! 💬 button appears while watching
6. Click **■ Stop Sharing** when done

### Voice messages
1. Hold the 🎙️ mic button in chat
2. Release to send (just like WhatsApp!)

### Fullscreen
- Click **⛶ Fullscreen** button → browser fullscreen
- **💬 button** appears in bottom-right corner
- Click it to open mini chat overlay without leaving fullscreen
- Badge shows count of new messages

---

## 🔑 server/.env
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key
JWT_SECRET=any_long_random_string_here
PORT=5000
CLIENT_URL=http://localhost:3000
```

## 📁 File structure
```
watchparty/
├── server/
│   ├── server.js                ← Express + Socket.io + WebRTC signaling
│   ├── config/
│   │   ├── supabase.js
│   │   └── schema.sql           ← Run in Supabase SQL Editor
│   ├── controllers/             ← Auth, Room, Video
│   ├── routes/                  ← API + Voice upload
│   ├── middleware/              ← JWT auth + Multer upload
│   └── uploads/voices|videos/  ← Files stored here
└── client/src/
    ├── pages/     AuthPage · HomePage · RoomPage
    ├── components/
    │   ├── Chat.jsx             ← Text + voice messages + emoji
    │   ├── VideoPlayer.jsx      ← Upload / Direct URL player (synced)
    │   ├── VideoLibrary.jsx     ← Upload · YouTube · Direct URL tabs
    │   └── ScreenShare.jsx      ← WebRTC screen sharing (sharer + viewer)
    └── context/  AuthContext · SocketContext
```
