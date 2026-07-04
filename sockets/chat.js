const { Server } = require('socket.io');
const {
  isRoomMember,
  createTextMessage,
  createImageMessage,
  markMessageRead,
  markRoomRead,
  getMessageById,
  getReadReceipts,
} = require('../services/chat');

function initChatSocket(httpServer, sessionMiddleware) {
  const io = new Server(httpServer, {
    cors: { origin: false },
    path: '/socket.io',
  });

  io.engine.use((req, _res, next) => {
    sessionMiddleware(req, {}, next);
  });

  io.use((socket, next) => {
    const session = socket.request.session;
    if (!session || !session.user) {
      return next(new Error('Unauthorized'));
    }
    socket.user = session.user;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join_room', ({ roomId }) => {
      const id = parseInt(roomId, 10);
      if (!id || !isRoomMember(id, socket.user.id)) return;
      socket.join(`room:${id}`);
      socket.currentRoom = id;
    });

    socket.on('leave_room', ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      if (socket.currentRoom === parseInt(roomId, 10)) socket.currentRoom = null;
    });

    socket.on('send_message', ({ roomId, body }) => {
      const id = parseInt(roomId, 10);
      if (!id || !isRoomMember(id, socket.user.id)) return;
      const text = (body || '').trim();
      if (!text) return;

      const message = createTextMessage(id, socket.user.id, text);
      io.to(`room:${id}`).emit('new_message', message);
    });

    socket.on('mark_read', ({ roomId, messageId }) => {
      const rid = parseInt(roomId, 10);
      const mid = parseInt(messageId, 10);
      if (!rid || !mid || !isRoomMember(rid, socket.user.id)) return;

      markMessageRead(mid, socket.user.id);
      const reads = getReadReceipts(mid).filter((r) => r.id !== socket.user.id);
      io.to(`room:${rid}`).emit('message_read', {
        message_id: mid,
        user_id: socket.user.id,
        user_name: socket.user.name,
        reads,
      });
    });

    socket.on('mark_room_read', ({ roomId, messageId }) => {
      const rid = parseInt(roomId, 10);
      const mid = parseInt(messageId, 10);
      if (!rid || !mid || !isRoomMember(rid, socket.user.id)) return;

      const ids = markRoomRead(rid, socket.user.id, mid);
      ids.forEach((msgId) => {
        const reads = getReadReceipts(msgId).filter((r) => r.id !== socket.user.id);
        io.to(`room:${rid}`).emit('message_read', {
          message_id: msgId,
          user_id: socket.user.id,
          user_name: socket.user.name,
          reads,
        });
      });
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

module.exports = { initChatSocket };