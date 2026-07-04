const db = require('../db/database');

const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;

function getAllEmployees() {
  return db
    .prepare("SELECT id, name, email, role FROM users ORDER BY name")
    .all();
}

function isRoomMember(roomId, userId) {
  const row = db
    .prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?')
    .get(roomId, userId);
  return !!row;
}

function getRoomsForUser(userId) {
  return db
    .prepare(
      `SELECT cr.*, u.name as creator_name,
              (SELECT COUNT(*) FROM chat_room_members WHERE room_id = cr.id) as member_count,
              (SELECT body FROM chat_messages WHERE room_id = cr.id ORDER BY id DESC LIMIT 1) as last_message,
              (SELECT created_at FROM chat_messages WHERE room_id = cr.id ORDER BY id DESC LIMIT 1) as last_message_at,
              (SELECT COUNT(*) FROM chat_messages cm
               WHERE cm.room_id = cr.id AND cm.user_id != ?
               AND cm.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)) as unread_count
       FROM chat_rooms cr
       JOIN chat_room_members crm ON cr.id = crm.room_id
       JOIN users u ON cr.created_by = u.id
       WHERE crm.user_id = ?
       ORDER BY COALESCE(last_message_at, cr.updated_at) DESC`
    )
    .all(userId, userId, userId);
}

function getRoom(roomId) {
  return db
    .prepare(
      `SELECT cr.*, u.name as creator_name
       FROM chat_rooms cr
       JOIN users u ON cr.created_by = u.id
       WHERE cr.id = ?`
    )
    .get(roomId);
}

function getRoomMembers(roomId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, crm.joined_at
       FROM chat_room_members crm
       JOIN users u ON crm.user_id = u.id
       WHERE crm.room_id = ?
       ORDER BY u.name`
    )
    .all(roomId);
}

function createRoom(name, createdBy, memberIds) {
  const result = db.prepare(
    'INSERT INTO chat_rooms (name, created_by) VALUES (?, ?)'
  ).run(name.trim(), createdBy);

  const roomId = result.lastInsertRowid;
  const insertMember = db.prepare(
    'INSERT OR IGNORE INTO chat_room_members (room_id, user_id) VALUES (?, ?)'
  );
  const uniqueMembers = new Set([createdBy, ...memberIds]);
  uniqueMembers.forEach((id) => insertMember.run(roomId, id));
  return getRoom(roomId);
}

function updateRoomName(roomId, name) {
  db.prepare(
    `UPDATE chat_rooms SET name = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(name.trim(), roomId);
  return getRoom(roomId);
}

function addRoomMember(roomId, userId) {
  db.prepare(
    'INSERT OR IGNORE INTO chat_room_members (room_id, user_id) VALUES (?, ?)'
  ).run(roomId, userId);
  db.prepare(
    `UPDATE chat_rooms SET updated_at = datetime('now') WHERE id = ?`
  ).run(roomId);
}

function removeRoomMember(roomId, userId) {
  db.prepare(
    'DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?'
  ).run(roomId, userId);
}

function extractLinks(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function formatMessage(row) {
  const reads = db
    .prepare(
      `SELECT u.id, u.name, cmr.read_at
       FROM chat_message_reads cmr
       JOIN users u ON cmr.user_id = u.id
       WHERE cmr.message_id = ?
       ORDER BY cmr.read_at`
    )
    .all(row.id);

  return {
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    sender_name: row.sender_name,
    sender_role: row.sender_role,
    message_type: row.message_type,
    body: row.body,
    image_filename: row.image_filename,
    image_original_name: row.image_original_name,
    link_url: row.link_url,
    created_at: row.created_at,
    reads: reads.filter((r) => r.id !== row.user_id),
    read_by_names: reads.filter((r) => r.id !== row.user_id).map((r) => r.name),
  };
}

function getMessages(roomId, limit = 100, beforeId = null) {
  let query = `
    SELECT cm.*, u.name as sender_name, u.role as sender_role
    FROM chat_messages cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.room_id = ?
  `;
  const params = [roomId];
  if (beforeId) {
    query += ' AND cm.id < ?';
    params.push(beforeId);
  }
  query += ' ORDER BY cm.id DESC LIMIT ?';
  params.push(limit);

  return db.prepare(query).all(...params).reverse().map(formatMessage);
}

function getMessageById(messageId) {
  const row = db
    .prepare(
      `SELECT cm.*, u.name as sender_name, u.role as sender_role
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.id = ?`
    )
    .get(messageId);
  return row ? formatMessage(row) : null;
}

function createTextMessage(roomId, userId, body) {
  const links = extractLinks(body);
  const messageType = links.length > 0 && body.trim() === links[0] ? 'link' : 'text';
  const result = db.prepare(
    `INSERT INTO chat_messages (room_id, user_id, message_type, body, link_url)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    roomId,
    userId,
    messageType,
    body.trim(),
    links[0] || null
  );

  db.prepare(
    `UPDATE chat_rooms SET updated_at = datetime('now') WHERE id = ?`
  ).run(roomId);

  const msgId = result.lastInsertRowid;
  markMessageRead(msgId, userId);
  return getMessageById(msgId);
}

function createImageMessage(roomId, userId, file) {
  const result = db.prepare(
    `INSERT INTO chat_messages (room_id, user_id, message_type, image_filename, image_original_name)
     VALUES (?, ?, 'image', ?, ?)`
  ).run(roomId, userId, file.filename, file.originalname);

  db.prepare(
    `UPDATE chat_rooms SET updated_at = datetime('now') WHERE id = ?`
  ).run(roomId);

  const msgId = result.lastInsertRowid;
  markMessageRead(msgId, userId);
  return getMessageById(msgId);
}

function markMessageRead(messageId, userId) {
  db.prepare(
    `INSERT OR IGNORE INTO chat_message_reads (message_id, user_id) VALUES (?, ?)`
  ).run(messageId, userId);
}

function markRoomRead(roomId, userId, upToMessageId) {
  const messages = db
    .prepare(
      `SELECT id FROM chat_messages
       WHERE room_id = ? AND user_id != ? AND id <= ?
       ORDER BY id`
    )
    .all(roomId, userId, upToMessageId);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO chat_message_reads (message_id, user_id) VALUES (?, ?)`
  );
  messages.forEach((m) => insert.run(m.id, userId));

  return messages.map((m) => m.id);
}

function getReadReceipts(messageId) {
  return db
    .prepare(
      `SELECT u.id, u.name, cmr.read_at
       FROM chat_message_reads cmr
       JOIN users u ON cmr.user_id = u.id
       WHERE cmr.message_id = ?
       ORDER BY cmr.read_at`
    )
    .all(messageId);
}

function getRoomMedia(roomId) {
  const images = db
    .prepare(
      `SELECT cm.id, cm.image_filename, cm.image_original_name, cm.created_at,
              u.name as sender_name, cm.user_id
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.room_id = ? AND cm.message_type = 'image'
       ORDER BY cm.created_at DESC`
    )
    .all(roomId);

  const textMessages = db
    .prepare(
      `SELECT cm.id, cm.body, cm.link_url, cm.created_at, u.name as sender_name, cm.user_id
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.room_id = ? AND cm.message_type IN ('text', 'link') AND (cm.link_url IS NOT NULL OR cm.body LIKE '%http%')
       ORDER BY cm.created_at DESC`
    )
    .all(roomId);

  const links = [];
  textMessages.forEach((msg) => {
    const urls = msg.link_url ? [msg.link_url] : extractLinks(msg.body);
    urls.forEach((url) => {
      links.push({
        id: `${msg.id}-${url}`,
        message_id: msg.id,
        url,
        created_at: msg.created_at,
        sender_name: msg.sender_name,
        user_id: msg.user_id,
      });
    });
  });

  return { images, links };
}

function getDefaultRoom() {
  return db.prepare("SELECT id FROM chat_rooms WHERE name = 'General' LIMIT 1").get();
}

function addUserToDefaultRoom(userId) {
  const room = getDefaultRoom();
  if (room) addRoomMember(room.id, userId);
}

function seedDefaultRoom() {
  let room = getDefaultRoom();
  if (!room) {
    const manager = db.prepare("SELECT id FROM users WHERE role = 'manager' LIMIT 1").get();
    const employee = db.prepare("SELECT id FROM users WHERE role = 'employee' LIMIT 1").get();
    if (!manager || !employee) return;
    createRoom('General', manager.id, [employee.id]);
    room = getDefaultRoom();
  }

  if (room) {
    db.prepare('SELECT id FROM users')
      .all()
      .forEach((user) => addRoomMember(room.id, user.id));
  }
}

module.exports = {
  URL_REGEX,
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
  getMessageById,
  createTextMessage,
  createImageMessage,
  markMessageRead,
  markRoomRead,
  getReadReceipts,
  getRoomMedia,
  extractLinks,
  addUserToDefaultRoom,
  seedDefaultRoom,
};