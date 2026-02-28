const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth.middleware');
const { uploadVoice } = require('../middleware/upload.middleware');

// Upload voice blob and save message
router.post('/upload', protect, uploadVoice.single('voice'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No voice file' });
    const { roomId, duration } = req.body;

    const voice_url = `/voices/${req.file.filename}`;

    const { data: msg, error } = await supabase.from('messages').insert({
      room_id:   roomId,
      user_id:   req.user.id,
      username:  req.user.username,
      type:      'voice',
      voice_url,
      duration:  parseFloat(duration) || 0,
    }).select().single();

    if (error) throw error;
    res.status(201).json(msg);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
