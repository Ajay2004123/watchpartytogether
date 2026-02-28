const supabase = require('../config/supabase');
const fs       = require('fs');
const path     = require('path');

// Upload a local video file
const uploadVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No video file' });
    const { roomId, title } = req.body;

    const { data: video, error } = await supabase.from('videos').insert({
      room_id:     roomId,
      uploaded_by: req.user.id,
      title:       title || req.file.originalname,
      filename:    req.file.filename,
      source_type: 'upload',
      file_size:   req.file.size,
    }).select().single();
    if (error) throw error;
    res.status(201).json(video);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Add a YouTube / NetMirror link
const addVideoLink = async (req, res) => {
  try {
    const { roomId, title, source_url, source_type } = req.body;
    if (!roomId || !source_url || !source_type)
      return res.status(400).json({ message: 'roomId, source_url, source_type required' });

    const { data: video, error } = await supabase.from('videos').insert({
      room_id:     roomId,
      uploaded_by: req.user.id,
      title:       title || source_url,
      source_type,
      source_url,
    }).select().single();
    if (error) throw error;
    res.status(201).json(video);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getRoomVideos = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { data: videos } = await supabase
      .from('videos').select('*').eq('room_id', roomId)
      .order('created_at', { ascending: false });
    res.json(videos || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: video } = await supabase.from('videos').select('*').eq('id', id).single();
    if (!video) return res.status(404).json({ message: 'Not found' });

    if (video.filename) {
      const fp = path.join(__dirname, '..', 'uploads', 'videos', video.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await supabase.from('videos').delete().eq('id', id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { uploadVideo, addVideoLink, getRoomVideos, deleteVideo };
