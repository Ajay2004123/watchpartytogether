const router  = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { createRoom, joinRoom, getMyRooms, getRoomById, saveMessage } = require('../controllers/room.controller');

router.post('/',         protect, createRoom);
router.post('/join',     protect, joinRoom);
router.get('/my',        protect, getMyRooms);
router.get('/:id',       protect, getRoomById);
router.post('/message',  protect, saveMessage);

module.exports = router;
