const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const mkDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

// ── Video storage ──────────────────────────────────────────
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'videos');
    mkDir(dir); cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  },
});

// ── Voice storage ──────────────────────────────────────────
const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'voices');
    mkDir(dir); cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.webm');
  },
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files allowed'));
  },
});

const uploadVoice = multer({
  storage: voiceStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

module.exports = { uploadVideo, uploadVoice };
