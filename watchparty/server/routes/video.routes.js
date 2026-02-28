const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { uploadVideo, uploadVoice } = require('../middleware/upload.middleware');
const { uploadVideo: uploadVideoCtrl, addVideoLink, getRoomVideos, deleteVideo } = require('../controllers/video.controller');

router.post('/upload',        protect, uploadVideo.single('video'), uploadVideoCtrl);
router.post('/link',          protect, addVideoLink);
router.get('/room/:roomId',   protect, getRoomVideos);
router.delete('/:id',         protect, deleteVideo);

module.exports = router;
