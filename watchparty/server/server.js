require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:      process.env.CLIENT_URL || 'http://localhost:3000',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
  pingTimeout:       60000,
  pingInterval:      25000,
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use('/voices',        express.static(path.join(__dirname, 'uploads', 'voices')));
app.use('/videos-static', express.static(path.join(__dirname, 'uploads', 'videos')));

// ── Lag-free video streaming: 4 MB chunks, 128 KB read buffer ────
app.get('/stream/:filename', (req, res) => {
  const fp = path.join(__dirname, 'uploads', 'videos', req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ message: 'Not found' });

  const { size } = fs.statSync(fp);
  const range    = req.headers.range;

  if (range) {
    const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(rawStart, 10);
    const end   = rawEnd ? parseInt(rawEnd, 10) : Math.min(start + 4 * 1024 * 1024 - 1, size - 1);
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${size}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
      'Content-Type':   'video/mp4',
      'Cache-Control':  'public, max-age=3600',
    });
    fs.createReadStream(fp, { start, end, highWaterMark: 128 * 1024 }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': size,
      'Content-Type':   'video/mp4',
      'Accept-Ranges':  'bytes',
    });
    fs.createReadStream(fp, { highWaterMark: 128 * 1024 }).pipe(res);
  }
});

app.use('/api/auth',   require('./routes/auth.routes'));
app.use('/api/rooms',  require('./routes/room.routes'));
app.use('/api/videos', require('./routes/video.routes'));
app.use('/api/voice',  require('./routes/voice.routes'));

// ── In-memory room state ─────────────────────────────────────────
// roomUsers[roomId] = [{socketId, userId, username, avatar_color}]
// roomState[roomId] = {videoId, currentTime, playing, updatedAt}
const roomUsers = {};
const roomState = {};

io.on('connection', socket => {

  // ── Join ──────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, userId, username, avatar_color }) => {
    socket.join(roomId);
    socket.data = { roomId, userId, username };

    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    roomUsers[roomId] = roomUsers[roomId].filter(u => u.userId !== userId);
    roomUsers[roomId].push({ socketId: socket.id, userId, username, avatar_color });

    io.to(roomId).emit('room_users', roomUsers[roomId]);
    socket.to(roomId).emit('user_joined', { username });

    // Send last known playback position to the new joiner immediately
    if (roomState[roomId]) {
      socket.emit('initial_sync', roomState[roomId]);
    }
  });

  // ── Chat ──────────────────────────────────────────────────────
  socket.on('send_message', msg => {
    io.to(msg.roomId).emit('receive_message', {
      ...msg, id: Date.now() + Math.random(), time: new Date().toISOString(),
    });
  });
  socket.on('typing',      d => socket.to(d.roomId).emit('typing',      { username: d.username }));
  socket.on('stop_typing', d => socket.to(d.roomId).emit('stop_typing'));

  // ── Video selection ───────────────────────────────────────────
  socket.on('video_change', ({ roomId, video }) => {
    roomState[roomId] = { videoId: video?.id, currentTime: 0, playing: false, updatedAt: Date.now() };
    socket.to(roomId).emit('video_change', { video });
  });

  // ── Universal playback sync ───────────────────────────────────
  // One event covers play / pause / seek / buffering for ALL video types
  socket.on('playback_event', ({ roomId, state, currentTime }) => {
    if (!roomState[roomId]) roomState[roomId] = {};
    roomState[roomId].currentTime = currentTime;
    roomState[roomId].playing     = state === 'playing';
    roomState[roomId].updatedAt   = Date.now();

    // Relay to everyone else in room
    socket.to(roomId).emit('playback_event', { state, currentTime, serverTs: Date.now() });
  });

  // ── Sync handshake ────────────────────────────────────────────
  // New joiner asks for host's current playback position
  socket.on('request_sync', ({ roomId }) => {
    socket.to(roomId).emit('sync_please', { toSocketId: socket.id });
  });

  // Host replies to the specific requester
  socket.on('sync_response', ({ toSocketId, currentTime, playing, videoId }) => {
    io.to(toSocketId).emit('sync_response', { currentTime, playing, videoId });
    // Also update server-side state
    const rid = socket.data?.roomId;
    if (rid) {
      if (!roomState[rid]) roomState[rid] = {};
      roomState[rid].currentTime = currentTime;
      roomState[rid].playing     = playing;
      roomState[rid].videoId     = videoId;
    }
  });

  // ── WebRTC screen share signalling ───────────────────────────
  socket.on('screen_share_start', ({ roomId, sharerName }) => {
    socket.data.isSharing = true;
    socket.to(roomId).emit('screen_share_available', { sharerId: socket.id, sharerName });
  });
  socket.on('screen_share_stop', ({ roomId }) => {
    socket.data.isSharing = false;
    socket.to(roomId).emit('screen_share_ended');
  });
  socket.on('webrtc_request', ({ targetSocketId })          => io.to(targetSocketId).emit('webrtc_request', { fromSocketId: socket.id }));
  socket.on('webrtc_offer',   ({ targetSocketId, offer })   => io.to(targetSocketId).emit('webrtc_offer',   { fromSocketId: socket.id, offer }));
  socket.on('webrtc_answer',  ({ targetSocketId, answer })  => io.to(targetSocketId).emit('webrtc_answer',  { fromSocketId: socket.id, answer }));
  socket.on('webrtc_ice',     ({ targetSocketId, candidate })=> io.to(targetSocketId).emit('webrtc_ice',    { fromSocketId: socket.id, candidate }));

  // ── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { roomId, username, isSharing } = socket.data || {};
    if (roomId) {
      roomUsers[roomId] = (roomUsers[roomId] || []).filter(u => u.socketId !== socket.id);
      io.to(roomId).emit('room_users', roomUsers[roomId]);
      socket.to(roomId).emit('user_left', { username });
      if (isSharing) socket.to(roomId).emit('screen_share_ended');
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🎬  WatchParty → http://localhost:${PORT}`));
