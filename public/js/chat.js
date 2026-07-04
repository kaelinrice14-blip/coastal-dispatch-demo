(function () {
  const app = document.getElementById('chat-app');
  if (!app) return;

  const userId = parseInt(app.dataset.userId, 10);
  const userName = app.dataset.userName;
  const isManager = app.dataset.isManager === '1';
  let activeRoomId = app.dataset.activeRoom ? parseInt(app.dataset.activeRoom, 10) : null;
  let joinedRoomId = null;

  const roomList = document.getElementById('chat-room-list');
  const placeholder = document.getElementById('chat-placeholder');
  const panel = document.getElementById('chat-panel');
  const roomTitle = document.getElementById('chat-room-title');
  const roomMembers = document.getElementById('chat-room-members');
  const messagesEl = document.getElementById('chat-messages');
  const composeForm = document.getElementById('chat-compose');
  const chatInput = document.getElementById('chat-input');
  const imageBtn = document.getElementById('chat-image-btn');
  const imageInput = document.getElementById('chat-image-input');
  const photosGrid = document.getElementById('chat-photos-grid');
  const linksGrid = document.getElementById('chat-links-grid');

  const socket = io({ path: '/socket.io' });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function linkify(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
  }

  function renderReadReceipt(msg) {
    if (msg.user_id !== userId || !msg.read_by_names || !msg.read_by_names.length) {
      return '';
    }
    const names = msg.read_by_names.join(', ');
    return `<div class="chat-read-receipt">Read by ${escapeHtml(names)}</div>`;
  }

  function renderMessage(msg) {
    const isOwn = msg.user_id === userId;
    let content = '';

    if (msg.message_type === 'image' && msg.image_filename) {
      content = `<a href="/uploads/chat/${escapeHtml(msg.image_filename)}" target="_blank">
        <img src="/uploads/chat/${escapeHtml(msg.image_filename)}" class="chat-image" alt="Shared image">
      </a>`;
    } else if (msg.message_type === 'link' && msg.link_url) {
      content = `<a href="${escapeHtml(msg.link_url)}" target="_blank" rel="noopener">${escapeHtml(msg.link_url)}</a>`;
      if (msg.body && msg.body !== msg.link_url) {
        content = linkify(msg.body);
      }
    } else {
      content = linkify(msg.body);
    }

    return `<div class="chat-message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
      <div class="chat-message-meta">
        <strong>${escapeHtml(msg.sender_name)}</strong>
        <span class="chat-message-time">${formatTime(msg.created_at)}</span>
      </div>
      <div class="chat-message-body">${content}</div>
      ${renderReadReceipt(msg)}
    </div>`;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadRoom(roomId) {
    activeRoomId = roomId;
    const res = await fetch(`/chat/api/rooms/${roomId}`);
    if (!res.ok) return;
    const { room, members } = await res.json();

    roomTitle.textContent = room.name;
    roomMembers.textContent = members.map((m) => m.name).join(', ');

    if (isManager) {
      const editForm = document.getElementById('edit-room-form');
      const addForm = document.getElementById('add-member-form');
      if (editForm) {
        editForm.action = `/chat/rooms/${roomId}`;
        document.getElementById('edit_room_name').value = room.name;
      }
      if (addForm) addForm.action = `/chat/rooms/${roomId}/members`;
      renderMembersList(members, roomId);
    }

    await loadMessages(roomId);
    await loadMedia(roomId);

    if (joinedRoomId) socket.emit('leave_room', { roomId: joinedRoomId });
    socket.emit('join_room', { roomId });
    joinedRoomId = roomId;
  }

  function renderMembersList(members, roomId) {
    const list = document.getElementById('current-members-list');
    if (!list) return;
    list.innerHTML = members.map((m) => `
      <div class="chat-member-row">
        <span>${escapeHtml(m.name)} <span class="role-tag">${m.role}</span></span>
        ${m.id !== userId ? `
          <form method="POST" action="/chat/rooms/${roomId}/members/${m.id}/remove" style="display:inline">
            <button type="submit" class="btn btn-outline btn-sm">Remove</button>
          </form>` : '<span class="text-muted" style="font-size:0.75rem">You</span>'}
      </div>`).join('');
  }

  async function loadMessages(roomId) {
    const res = await fetch(`/chat/api/rooms/${roomId}/messages`);
    if (!res.ok) return;
    const messages = await res.json();
    messagesEl.innerHTML = messages.map(renderMessage).join('');
    scrollToBottom();

    if (messages.length) {
      const lastId = messages[messages.length - 1].id;
      socket.emit('mark_room_read', { roomId, messageId: lastId });
      fetch(`/chat/api/rooms/${roomId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `message_id=${lastId}`,
      });
    }
  }

  function renderPhotos(images) {
    if (!images.length) {
      photosGrid.innerHTML = '<p class="text-muted">No photos shared yet.</p>';
      return;
    }
    photosGrid.innerHTML = `<div class="chat-media-photos">${images.map((img) => `
      <a href="/uploads/chat/${escapeHtml(img.image_filename)}" target="_blank" class="chat-media-item">
        <img src="/uploads/chat/${escapeHtml(img.image_filename)}" alt="${escapeHtml(img.image_original_name)}">
        <span class="chat-media-meta">${escapeHtml(img.sender_name)} · ${formatTime(img.created_at)}</span>
      </a>`).join('')}</div>`;
  }

  function renderLinks(links) {
    if (!links.length) {
      linksGrid.innerHTML = '<p class="text-muted">No links shared yet.</p>';
      return;
    }
    linksGrid.innerHTML = `<ul class="chat-media-links">${links.map((link) => `
      <li>
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(link.url)}</a>
        <span class="chat-media-meta">${escapeHtml(link.sender_name)} · ${formatTime(link.created_at)}</span>
      </li>`).join('')}</ul>`;
  }

  async function loadMedia(roomId) {
    const res = await fetch(`/chat/api/rooms/${roomId}/media`);
    if (!res.ok) return;
    const { images, links } = await res.json();
    renderPhotos(images);
    renderLinks(links);
  }

  function selectRoom(roomId) {
    placeholder.style.display = 'none';
    panel.style.display = 'flex';
    roomList.querySelectorAll('.chat-room-item').forEach((btn) => {
      btn.classList.toggle('active', parseInt(btn.dataset.roomId, 10) === roomId);
    });
    history.replaceState(null, '', `/chat?room=${roomId}`);
    loadRoom(roomId);
  }

  roomList.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-room-item');
    if (!btn) return;
    selectRoom(parseInt(btn.dataset.roomId, 10));
  });

  composeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeRoomId) return;
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('send_message', { roomId: activeRoomId, body: text });
    chatInput.value = '';
  });

  imageBtn.addEventListener('click', () => imageInput.click());

  imageInput.addEventListener('change', async () => {
    if (!activeRoomId || !imageInput.files[0]) return;
    const formData = new FormData();
    formData.append('image', imageInput.files[0]);
    const res = await fetch(`/chat/api/rooms/${activeRoomId}/upload`, {
      method: 'POST',
      body: formData,
    });
    imageInput.value = '';
    if (res.ok) loadMedia(activeRoomId);
  });

  socket.on('new_message', (msg) => {
    if (msg.room_id !== activeRoomId) return;
    messagesEl.insertAdjacentHTML('beforeend', renderMessage(msg));
    scrollToBottom();
    loadMedia(activeRoomId);

    if (msg.user_id !== userId) {
      socket.emit('mark_room_read', { roomId: activeRoomId, messageId: msg.id });
      fetch(`/chat/api/rooms/${activeRoomId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `message_id=${msg.id}`,
      });
    }
  });

  socket.on('message_read', ({ message_id, reads }) => {
    const el = messagesEl.querySelector(`[data-message-id="${message_id}"]`);
    if (!el) return;
    const existing = el.querySelector('.chat-read-receipt');
    const names = (reads || []).map((r) => r.name).join(', ');
    if (!names) {
      if (existing) existing.remove();
      return;
    }
    const html = `<div class="chat-read-receipt">Read by ${escapeHtml(names)}</div>`;
    if (existing) existing.outerHTML = html;
    else el.insertAdjacentHTML('beforeend', html);
  });

  document.querySelectorAll('.chat-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chat-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.chat-tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      if ((tab.dataset.tab === 'photos' || tab.dataset.tab === 'links') && activeRoomId) {
        loadMedia(activeRoomId);
      }
    });
  });

  if (isManager) {
    const newRoomBtn = document.getElementById('new-room-btn');
    const editRoomBtn = document.getElementById('edit-room-btn');
    const manageMembersBtn = document.getElementById('manage-members-btn');

    function openModal(id) {
      document.getElementById(id).hidden = false;
    }
    function closeModals() {
      document.querySelectorAll('.chat-modal-overlay').forEach((m) => { m.hidden = true; });
    }

    if (newRoomBtn) newRoomBtn.addEventListener('click', () => openModal('new-room-modal'));
    if (editRoomBtn) editRoomBtn.addEventListener('click', () => openModal('edit-room-modal'));
    if (manageMembersBtn) manageMembersBtn.addEventListener('click', () => openModal('members-modal'));
    document.querySelectorAll('.chat-modal-close').forEach((btn) => {
      btn.addEventListener('click', closeModals);
    });
    document.querySelectorAll('.chat-modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModals();
      });
    });
  }

  if (activeRoomId) {
    selectRoom(activeRoomId);
  }
})();