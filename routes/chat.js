const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { chatUpload } = require('../services/chat-upload');
const {
  getAllEmployees,
  isRoomMember,
  getRoomsForUser,
  getRoom,
  getRoomMembers,
  createRoom,
  updateRoomName,
  addRoomMember,
  removeRoomMember,
  getMessages,
  createTextMessage,
  createImageMessage,
  markRoomRead,
  getRoomMedia,
  getMessageById,
} = require('../services/chat');

const router = express.Router();

function requireMember(req, res, next) {
  const roomId = parseInt(req.params.roomId || req.params.id, 10);
  if (!roomId || !isRoomMember(roomId, req.session.user.id)) {
    return res.status(403).json({ error: 'Not a member of this chat.' });
  }
  req.roomId = roomId;
  next();
}

router.get('/', requireAuth, (req, res) => {
  const rooms = getRoomsForUser(req.session.user.id);
  const employees = req.session.user.role === 'manager' ? getAllEmployees() : [];
  const activeRoomId = req.query.room ? parseInt(req.query.room, 10) : (rooms[0]?.id || null);

  res.render('chat/index', {
    title: 'Company Chat',
    user: req.session.user,
    rooms,
    employees,
    activeRoomId,
    flash: req.session.flash || null,
  });
  delete req.session.flash;
});

router.get('/api/rooms', requireAuth, (req, res) => {
  res.json(getRoomsForUser(req.session.user.id));
});

router.get('/api/rooms/:roomId', requireAuth, requireMember, (req, res) => {
  const room = getRoom(req.roomId);
  const members = getRoomMembers(req.roomId);
  res.json({ room, members });
});

router.get('/api/rooms/:roomId/messages', requireAuth, requireMember, (req, res) => {
  const before = req.query.before ? parseInt(req.query.before, 10) : null;
  res.json(getMessages(req.roomId, 100, before));
});

router.get('/api/rooms/:roomId/media', requireAuth, requireMember, (req, res) => {
  res.json(getRoomMedia(req.roomId));
});

router.post('/api/rooms/:roomId/read', requireAuth, requireMember, (req, res) => {
  const messageId = parseInt(req.body.message_id, 10);
  if (!messageId) return res.status(400).json({ error: 'message_id required' });
  const ids = markRoomRead(req.roomId, req.session.user.id, messageId);
  const io = req.app.get('chatIo');
  if (io) {
    ids.forEach((msgId) => {
      const msg = getMessageById(msgId);
      io.to(`room:${req.roomId}`).emit('message_read', {
        message_id: msgId,
        user_id: req.session.user.id,
        user_name: req.session.user.name,
        reads: msg ? msg.reads : [],
      });
    });
  }
  res.json({ ok: true, marked: ids.length });
});

router.post('/api/rooms/:roomId/messages', requireAuth, requireMember, (req, res) => {
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });

  const message = createTextMessage(req.roomId, req.session.user.id, body);
  const io = req.app.get('chatIo');
  if (io) io.to(`room:${req.roomId}`).emit('new_message', message);
  res.json(message);
});

router.post('/api/rooms/:roomId/upload', requireAuth, requireMember, (req, res) => {
  chatUpload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'No image provided.' });

    const message = createImageMessage(req.roomId, req.session.user.id, req.file);
    const io = req.app.get('chatIo');
    if (io) io.to(`room:${req.roomId}`).emit('new_message', message);
    res.json(message);
  });
});

router.post('/rooms', requireAuth, (req, res) => {
  if (req.session.user.role !== 'manager') {
    return res.status(403).json({ error: 'Managers only.' });
  }

  const { name, members } = req.body;
  if (!name || !name.trim()) {
    req.session.flash = { type: 'error', message: 'Chat name is required.' };
    return res.redirect('/chat');
  }

  let memberIds = [];
  if (members) {
    memberIds = Array.isArray(members) ? members.map(Number) : [Number(members)];
  }

  const room = createRoom(name, req.session.user.id, memberIds.filter(Boolean));
  req.session.flash = { type: 'success', message: `Chat "${room.name}" created.` };
  res.redirect(`/chat?room=${room.id}`);
});

router.post('/rooms/:id', requireAuth, (req, res) => {
  if (req.session.user.role !== 'manager') {
    return res.status(403).json({ error: 'Managers only.' });
  }

  const roomId = parseInt(req.params.id, 10);
  const { name } = req.body;
  if (!name || !name.trim()) {
    req.session.flash = { type: 'error', message: 'Chat name is required.' };
    return res.redirect(`/chat?room=${roomId}`);
  }

  updateRoomName(roomId, name);
  req.session.flash = { type: 'success', message: 'Chat renamed.' };
  res.redirect(`/chat?room=${roomId}`);
});

router.post('/rooms/:id/members', requireAuth, (req, res) => {
  if (req.session.user.role !== 'manager') {
    return res.status(403).json({ error: 'Managers only.' });
  }

  const roomId = parseInt(req.params.id, 10);
  const userId = parseInt(req.body.user_id, 10);
  if (!userId) {
    req.session.flash = { type: 'error', message: 'Select an employee to add.' };
    return res.redirect(`/chat?room=${roomId}`);
  }

  addRoomMember(roomId, userId);
  req.session.flash = { type: 'success', message: 'Employee added to chat.' };
  res.redirect(`/chat?room=${roomId}`);
});

router.post('/rooms/:id/members/:userId/remove', requireAuth, (req, res) => {
  if (req.session.user.role !== 'manager') {
    return res.status(403).json({ error: 'Managers only.' });
  }

  const roomId = parseInt(req.params.id, 10);
  const userId = parseInt(req.params.userId, 10);
  removeRoomMember(roomId, userId);
  req.session.flash = { type: 'success', message: 'Employee removed from chat.' };
  res.redirect(`/chat?room=${roomId}`);
});

module.exports = router;