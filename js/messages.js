// ============================================
// MESSAGES — Работа с сообщениями
// ============================================

const Messages = {

  lastSeen: {}, // uid -> last message timestamp for "read by" check
  typingTimeout: null,
  isTyping: false,
  replyTo: null, // { messageId, text, senderId, senderName }
  forwardMessageData: null,
  linkPreviewCache: {},

  // ---- Subscribe to messages ----
  subscribeToMessages(chatId) {
    // Unsubscribe previous
    if (window.AppState.unsubscribers['messages']) {
      window.AppState.unsubscribers['messages']();
    }

    const container = document.getElementById('messages-container');
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);font-size:14px;">Загрузка...</div>';

    const unsubscribe = db.collection('chats').doc(chatId)
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .onSnapshot(snap => {
        const wasAtBottom = Utils.isAtBottom(container);
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderMessages(msgs, chatId);
        if (wasAtBottom || snap.docChanges().some(c => c.type === 'added' && c.doc.data().senderId === window.AppState.currentUser.uid)) {
          Utils.scrollToBottom(container);
        }
        // Notification for new messages
        const changes = snap.docChanges();
        for (const change of changes) {
          if (change.type === 'added') {
            const msg = change.doc.data();
            if (msg.senderId !== window.AppState.currentUser.uid && !document.hasFocus()) {
              const senderName = msg.senderName || 'Сообщение';
              const chatName = window.AppState.currentChatData && window.AppState.currentChatData.name;
              Notifications.show(chatName ? `${senderName} в ${chatName}` : senderName, msg.text || '📷 Фото');
              Notifications.playSound();
            }
          }
        }
      }, err => console.warn('Messages error:', err));

    window.AppState.unsubscribers['messages'] = unsubscribe;
  },

  renderMessages(msgs, chatId) {
    const container = document.getElementById('messages-container');
    const myUid = window.AppState.currentUser.uid;
    const isGroup = window.AppState.currentChatData && window.AppState.currentChatData.type === 'group';
    const myData = window.AppState.currentUserData;
    const isSuperAdmin = myData && myData.superAdmin;

    container.innerHTML = '';

    let currentDate = null;
    let prevMsg = null;

    for (const msg of msgs) {
      // Date separator
      const msgDate = msg.timestamp ? Utils.formatDate(msg.timestamp) : null;
      if (msgDate && msgDate !== currentDate) {
        currentDate = msgDate;
        const sep = document.createElement('div'); sep.className = 'date-separator';
        const span = document.createElement('span'); span.textContent = msgDate;
        sep.appendChild(span); container.appendChild(sep);
        prevMsg = null;
      }

      const el = this.renderMessage(msg, prevMsg, myUid, isGroup, isSuperAdmin);
      if (el) container.appendChild(el);
      prevMsg = msg;
    }

    // Search highlight if active
    const searchQuery = document.getElementById('chat-search-input').value.trim();
    if (searchQuery) this.highlightSearch(searchQuery);
  },

  renderMessage(msg, prevMsg, myUid, isGroup, isSuperAdmin) {
    const isOwn = msg.senderId === myUid;
    const isSystem = msg.type === 'system';

    if (isSystem) {
      const wrapper = document.createElement('div');
      wrapper.className = 'message-wrapper system';
      wrapper.dataset.messageId = msg.id;
      const el = document.createElement('div'); el.className = 'system-message';
      el.textContent = msg.text || '';
      wrapper.appendChild(el);
      return wrapper;
    }

    const isDeleted = msg.deleted === true;
    const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId && prevMsg.type !== 'system' &&
      !prevMsg.deleted && (msg.timestamp && prevMsg.timestamp && (msg.timestamp.toMillis() - prevMsg.timestamp.toMillis()) < 5 * 60000);

    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isOwn ? 'own' : ''} ${isConsecutive ? 'consecutive' : ''}`;
    wrapper.dataset.messageId = msg.id;

    // Avatar (for non-own, non-consecutive in groups)
    if (!isOwn && isGroup) {
      const avatarEl = document.createElement('div'); avatarEl.className = 'msg-avatar';
      if (!isConsecutive) {
        const userData = window.AppState.userCache && window.AppState.userCache[msg.senderId];
        const avatarImg = Utils.createAvatarEl(userData && userData.photoURL, msg.senderName, msg.senderId, 32);
        avatarImg.style.cursor = 'pointer';
        avatarImg.onclick = () => Profile.openUserProfile(msg.senderId);
        avatarEl.appendChild(avatarImg);
      }
      wrapper.appendChild(avatarEl);
    }

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble' + (isDeleted ? ' deleted' : '');

    // Deleted check
    if (isDeleted) {
      if (isSuperAdmin) {
        // Super admin sees the content with a label
        const label = document.createElement('div'); label.className = 'deleted-msg-admin';
        label.textContent = '⚡ [удалено] Только ты видишь:';
        bubble.appendChild(label);
      } else {
        const delText = document.createElement('div'); delText.className = 'deleted-text';
        delText.textContent = '🗑 Сообщение удалено';
        bubble.appendChild(delText);
        const meta = this.createMeta(msg, isOwn, isSuperAdmin);
        bubble.appendChild(meta);
        wrapper.appendChild(bubble);
        return wrapper;
      }
    }

    // Sender name (group, non-own, non-consecutive)
    if (isGroup && !isOwn && !isConsecutive) {
      const senderEl = document.createElement('div'); senderEl.className = 'msg-sender-name';
      senderEl.textContent = msg.senderName || 'Пользователь';
      senderEl.style.color = Utils.getAvatarColor(msg.senderId);
      senderEl.style.cursor = 'pointer';
      senderEl.onclick = () => Profile.openUserProfile(msg.senderId);
      bubble.appendChild(senderEl);
    }

    // Forward label
    if (msg.forwardedFrom) {
      const fwd = document.createElement('div'); fwd.className = 'msg-forward-label';
      fwd.innerHTML = `↩ Переслано из ${Utils.escapeHtml(msg.forwardedFrom.chatName || 'чата')}`;
      bubble.appendChild(fwd);
    }

    // Reply
    if (msg.replyTo) {
      const reply = document.createElement('div'); reply.className = 'msg-reply';
      reply.innerHTML = `<div class="msg-reply-name">${Utils.escapeHtml(msg.replyTo.senderName || '')}</div><div class="msg-reply-text">${Utils.escapeHtml(Utils.truncate(msg.replyTo.text || '[Фото]', 80))}</div>`;
      reply.onclick = () => this.scrollToMessage(msg.replyTo.messageId);
      bubble.appendChild(reply);
    }

    // Content
    if (msg.type === 'image' || (msg.imageURLs && msg.imageURLs.length)) {
      const urls = msg.imageURLs || (msg.imageURL ? [msg.imageURL] : []);
      if (urls.length === 1) {
        const imgEl = document.createElement('div'); imgEl.className = 'msg-image';
        const img = document.createElement('img'); img.src = urls[0]; img.alt = 'Фото'; img.loading = 'lazy';
        img.onclick = () => App.openLightbox(urls[0]);
        imgEl.appendChild(img); bubble.appendChild(imgEl);
      } else if (urls.length > 1) {
        const grid = document.createElement('div'); grid.className = `msg-image-grid count-${Math.min(urls.length, 3)}`;
        urls.slice(0, 4).forEach((url, i) => {
          const cell = document.createElement('div'); cell.className = 'grid-img';
          const img = document.createElement('img'); img.src = url; img.alt = 'Фото'; img.loading = 'lazy';
          img.onclick = () => App.openLightbox(url);
          if (i === 3 && urls.length > 4) {
            cell.style.position = 'relative';
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;';
            overlay.textContent = `+${urls.length - 3}`;
            cell.append(img, overlay);
          } else {
            cell.appendChild(img);
          }
          grid.appendChild(cell);
        });
        bubble.appendChild(grid);
      }
      if (msg.text) {
        const textEl = document.createElement('div'); textEl.className = 'msg-text';
        textEl.innerHTML = Utils.linkify(msg.text);
        bubble.appendChild(textEl);
      }
    } else {
      // Text
      const textEl = document.createElement('div'); textEl.className = 'msg-text';
      textEl.innerHTML = Utils.linkify(msg.text || '');
      bubble.appendChild(textEl);
    }

    // Link Preview (if stored or auto-detect)
    if (msg.linkPreview) {
      bubble.appendChild(this.renderLinkPreview(msg.linkPreview));
    } else if (msg.text && !msg.linkPreviewAttempted) {
      // Async: try to get preview
      const urls = Utils.extractUrls(msg.text);
      if (urls.length > 0 && !this.linkPreviewCache[msg.id]) {
        this.linkPreviewCache[msg.id] = 'loading';
        Utils.fetchLinkPreview(urls[0]).then(preview => {
          if (preview && bubble.isConnected) {
            const previewEl = this.renderLinkPreview(preview);
            const meta = bubble.querySelector('.msg-meta');
            if (meta) bubble.insertBefore(previewEl, meta); else bubble.appendChild(previewEl);
          }
        });
      }
    }

    // Meta (time, read status, edited)
    const meta = this.createMeta(msg, isOwn, isSuperAdmin);
    bubble.appendChild(meta);

    // Reactions
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      bubble.appendChild(this.renderReactions(msg, myUid));
    }

    wrapper.appendChild(bubble);

    // Long press / right-click context menu
    this.setupMessageContextMenu(wrapper, msg, isOwn, isSuperAdmin);

    return wrapper;
  },

  createMeta(msg, isOwn, isSuperAdmin) {
    const meta = document.createElement('div'); meta.className = 'msg-meta';
    if (msg.edited) {
      const edited = document.createElement('span'); edited.className = 'msg-edited'; edited.textContent = 'ред.';
      meta.appendChild(edited);
    }
    const time = document.createElement('span'); time.className = 'msg-time';
    time.textContent = msg.timestamp ? Utils.formatTime(msg.timestamp) : '';
    meta.appendChild(time);

    if (isOwn) {
      const status = document.createElement('span'); status.className = 'msg-status';
      const readBy = msg.readBy || [];
      const membersCount = (window.AppState.currentChatData && window.AppState.currentChatData.members) ? window.AppState.currentChatData.members.length : 2;
      const othersRead = readBy.filter(uid => uid !== window.AppState.currentUser.uid);
      status.textContent = othersRead.length > 0 ? '✓✓' : '✓';
      status.style.opacity = othersRead.length > 0 ? '1' : '0.6';
      meta.appendChild(status);
    }
    return meta;
  },

  renderLinkPreview(preview) {
    const el = document.createElement('div'); el.className = 'link-preview';
    if (preview.type === 'youtube') el.classList.add('yt-preview');
    el.onclick = () => window.open(preview.url, '_blank', 'noopener');

    if (preview.image) {
      const img = document.createElement('img'); img.className = 'link-preview-image';
      img.src = preview.image; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => img.remove();
      el.appendChild(img);
    }

    const info = document.createElement('div'); info.className = 'link-preview-info';
    const domain = document.createElement('div'); domain.className = 'link-preview-domain';
    domain.textContent = preview.type === 'youtube' ? '▶ YouTube' : preview.type === 'tiktok' ? '♪ TikTok' : preview.domain || new URL(preview.url).hostname.replace('www.','');

    const title = document.createElement('div'); title.className = 'link-preview-title';
    title.textContent = Utils.truncate(preview.title || '', 80);

    info.appendChild(domain);
    info.appendChild(title);

    if (preview.description) {
      const desc = document.createElement('div'); desc.className = 'link-preview-desc';
      desc.textContent = Utils.truncate(preview.description, 120);
      info.appendChild(desc);
    }
    el.appendChild(info);
    return el;
  },

  renderReactions(msg, myUid) {
    const reactionsEl = document.createElement('div'); reactionsEl.className = 'msg-reactions';
    for (const [emoji, users] of Object.entries(msg.reactions || {})) {
      if (!users || users.length === 0) continue;
      const badge = document.createElement('button'); badge.className = 'reaction-badge';
      if (users.includes(myUid)) badge.classList.add('reacted');
      badge.innerHTML = `<span>${emoji}</span><span class="reaction-count">${users.length}</span>`;
      badge.title = users.length + ' реакция';
      badge.onclick = (e) => { e.stopPropagation(); this.toggleReaction(msg, emoji); };
      reactionsEl.appendChild(badge);
    }
    // Add reaction button
    const addReaction = document.createElement('button'); addReaction.className = 'reaction-badge';
    addReaction.textContent = '😊'; addReaction.title = 'Добавить реакцию';
    addReaction.onclick = (e) => { e.stopPropagation(); App.showReactionPicker(e, msg); };
    reactionsEl.appendChild(addReaction);
    return reactionsEl;
  },

  // ---- Send Message ----
  async sendMessage() {
    const chatId = window.AppState.currentChatId;
    if (!chatId) return;

    const input = document.getElementById('message-input');
    const text = input.value.trim();
    const pendingImages = Upload.pendingImages;

    if (!text && pendingImages.length === 0) return;

    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;

    // Stop typing indicator
    this.setTyping(chatId, false);

    // Clear input
    input.value = ''; input.style.height = 'auto';
    this.updateSendBtn();

    const replyTo = this.replyTo;
    this.clearReply();

    try {
      let imageURLs = [];
      if (pendingImages.length > 0) {
        imageURLs = await Upload.uploadPendingImages();
      }

      const msgData = {
        senderId: myUid,
        senderName: myData.displayName || 'Пользователь',
        senderPhotoURL: myData.photoURL || null,
        type: imageURLs.length > 0 ? 'image' : 'text',
        text: text || null,
        imageURLs: imageURLs.length > 0 ? imageURLs : null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        edited: false,
        deleted: false,
        replyTo: replyTo || null,
        reactions: {},
        readBy: [myUid],
        linkPreview: null,
        linkPreviewAttempted: false,
      };

      // Fetch link preview async
      const urls = text ? Utils.extractUrls(text) : [];
      let preview = null;
      if (urls.length > 0) {
        preview = await Utils.fetchLinkPreview(urls[0]);
        if (preview) msgData.linkPreview = preview;
        msgData.linkPreviewAttempted = true;
      }

      const msgRef = await db.collection('chats').doc(chatId).collection('messages').add(msgData);

      // Update chat's last message
      const lastMessagePreview = {
        text: text || (imageURLs.length > 0 ? '[Фото]' : ''),
        type: msgData.type,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        senderId: myUid,
        senderName: myData.displayName,
      };

      // Increment unread for all other members
      const chat = window.AppState.currentChatData;
      const unreadUpdates = {};
      (chat.members || []).forEach(uid => {
        if (uid !== myUid) unreadUpdates[`unreadCount.${uid}`] = firebase.firestore.FieldValue.increment(1);
      });

      await db.collection('chats').doc(chatId).update({
        lastMessage: lastMessagePreview,
        ...unreadUpdates,
      });

    } catch (e) {
      Utils.toast('Ошибка отправки: ' + e.message, 'error');
      input.value = text; // Restore text
    }
  },

  // ---- Edit Message ----
  async editMessage(messageId, newText) {
    const chatId = window.AppState.currentChatId;
    if (!chatId || !newText.trim()) return;
    try {
      await db.collection('chats').doc(chatId).collection('messages').doc(messageId).update({
        text: newText.trim(),
        edited: true,
        editedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { Utils.toast('Ошибка редактирования', 'error'); }
  },

  startEditMessage(msg) {
    const input = document.getElementById('message-input');
    input.value = msg.text || '';
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    this.updateSendBtn();

    // Show edit indicator in reply preview area
    document.getElementById('reply-preview-name').textContent = '✏️ Редактирование';
    document.getElementById('reply-preview-text').textContent = Utils.truncate(msg.text || '', 60);
    document.getElementById('reply-preview').classList.remove('hidden');

    // Override send to edit
    this._editingMessageId = msg.id;
    this._originalSendHandler = null;
  },

  // ---- Delete Message ----
  async deleteMessage(messageId, forAll = true) {
    const chatId = window.AppState.currentChatId;
    if (!chatId) return;
    try {
      if (forAll) {
        await db.collection('chats').doc(chatId).collection('messages').doc(messageId).update({
          deleted: true,
          text: null,
          imageURLs: null,
          deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Soft delete for only current user — we just hide it client-side
        // (Not persisted for simplicity; would need per-user hidden list)
        Utils.toast('Сообщение скрыто локально', 'default');
      }
    } catch (e) { Utils.toast('Ошибка удаления', 'error'); }
  },

  // ---- React ----
  async toggleReaction(msg, emoji) {
    const chatId = window.AppState.currentChatId;
    const myUid = window.AppState.currentUser.uid;
    if (!chatId) return;

    const reactions = msg.reactions || {};
    const users = reactions[emoji] || [];
    const hasReacted = users.includes(myUid);

    try {
      if (hasReacted) {
        await db.collection('chats').doc(chatId).collection('messages').doc(msg.id).update({
          [`reactions.${emoji}`]: firebase.firestore.FieldValue.arrayRemove(myUid),
        });
      } else {
        await db.collection('chats').doc(chatId).collection('messages').doc(msg.id).update({
          [`reactions.${emoji}`]: firebase.firestore.FieldValue.arrayUnion(myUid),
        });
      }
    } catch (e) { Utils.toast('Ошибка реакции', 'error'); }
  },

  // ---- Reply ----
  setReply(msg) {
    this.replyTo = {
      messageId: msg.id,
      text: msg.text || '[Фото]',
      senderId: msg.senderId,
      senderName: msg.senderName || 'Пользователь',
    };
    document.getElementById('reply-preview-name').textContent = this.replyTo.senderName;
    document.getElementById('reply-preview-text').textContent = Utils.truncate(this.replyTo.text, 80);
    document.getElementById('reply-preview').classList.remove('hidden');
    document.getElementById('message-input').focus();
  },

  clearReply() {
    this.replyTo = null;
    this._editingMessageId = null;
    document.getElementById('reply-preview').classList.add('hidden');
  },

  // ---- Forward ----
  openForwardModal(msg) {
    this.forwardMessageData = msg;
    const list = document.getElementById('forward-chat-list');
    list.innerHTML = '';
    Chats.allChats.forEach(chat => {
      const myUid = window.AppState.currentUser.uid;
      const isGroup = chat.type === 'group';
      let name = chat.name || 'Чат';
      if (!isGroup) {
        const partnerUid = chat.members.find(m => m !== myUid);
        const partnerData = window.AppState.userCache && window.AppState.userCache[partnerUid];
        if (partnerData) name = partnerData.displayName || 'Пользователь';
      }
      const item = document.createElement('div'); item.className = 'user-result';
      const avatarEl = Utils.createAvatarEl(chat.photoURL, name, chat.id, 40);
      avatarEl.className = 'user-result-avatar';
      const nameEl = document.createElement('div'); nameEl.className = 'user-result-info';
      nameEl.innerHTML = `<div class="user-result-name">${Utils.escapeHtml(name)}</div>`;
      item.append(avatarEl, nameEl);
      item.onclick = async () => {
        await this.forwardMessage(msg, chat.id, name);
        App.closeModal('forward-modal');
      };
      list.appendChild(item);
    });
    App.openModal('forward-modal');
  },

  async forwardMessage(msg, toChatId, toChatName) {
    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;
    const fromChatName = window.AppState.currentChatData && window.AppState.currentChatData.name || 'чата';

    const fwdData = {
      senderId: myUid,
      senderName: myData.displayName,
      senderPhotoURL: myData.photoURL || null,
      type: msg.type,
      text: msg.text || null,
      imageURLs: msg.imageURLs || null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      edited: false, deleted: false,
      reactions: {}, readBy: [myUid],
      forwardedFrom: {
        chatId: window.AppState.currentChatId,
        chatName: fromChatName,
        messageId: msg.id,
        originalSenderName: msg.senderName,
      },
    };

    const chatData = Chats.allChats.find(c => c.id === toChatId);
    const unreadUpdates = {};
    (chatData && chatData.members || []).forEach(uid => {
      if (uid !== myUid) unreadUpdates[`unreadCount.${uid}`] = firebase.firestore.FieldValue.increment(1);
    });

    await db.collection('chats').doc(toChatId).collection('messages').add(fwdData);
    await db.collection('chats').doc(toChatId).update({
      lastMessage: {
        text: msg.text || '[Фото]',
        type: msg.type,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        senderId: myUid,
        senderName: myData.displayName,
      },
      ...unreadUpdates,
    });
    Utils.toast(`Переслано в «${toChatName}»!`, 'success');
  },

  // ---- Read receipts ----
  async markMessageAsRead(messageId) {
    const chatId = window.AppState.currentChatId;
    const myUid = window.AppState.currentUser.uid;
    if (!chatId || !messageId) return;
    try {
      await db.collection('chats').doc(chatId).collection('messages').doc(messageId).update({
        readBy: firebase.firestore.FieldValue.arrayUnion(myUid),
      });
    } catch {}
  },

  // ---- Typing ----
  subscribeTyping(chatId) {
    if (window.AppState.unsubscribers['typing']) window.AppState.unsubscribers['typing']();

    const myUid = window.AppState.currentUser.uid;
    const unsubscribe = db.collection('typing').doc(chatId)
      .onSnapshot(snap => {
        if (!snap.exists) return;
        const data = snap.data();
        const now = Date.now();
        const typingUsers = [];

        for (const [uid, info] of Object.entries(data)) {
          if (uid === myUid) continue;
          if (info && info.typing && info.timestamp) {
            const ts = info.timestamp.toMillis ? info.timestamp.toMillis() : info.timestamp;
            if (now - ts < 5000) {
              const userData = window.AppState.userCache && window.AppState.userCache[uid];
              typingUsers.push(userData ? userData.displayName.split(' ')[0] : 'Кто-то');
            }
          }
        }

        const indicator = document.getElementById('typing-indicator');
        const typingText = document.getElementById('typing-text');
        if (typingUsers.length > 0) {
          typingText.textContent = typingUsers.join(', ') + ' печатает...';
          indicator.classList.remove('hidden');
        } else {
          indicator.classList.add('hidden');
        }
      });

    window.AppState.unsubscribers['typing'] = unsubscribe;
  },

  setTyping(chatId, typing) {
    const myUid = window.AppState.currentUser.uid;
    this.isTyping = typing;
    db.collection('typing').doc(chatId).set({
      [myUid]: { typing, timestamp: firebase.firestore.FieldValue.serverTimestamp() },
    }, { merge: true }).catch(() => {});
  },

  handleTypingInput() {
    const chatId = window.AppState.currentChatId;
    if (!chatId) return;

    if (!this.isTyping) this.setTyping(chatId, true);
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.setTyping(chatId, false);
    }, 3000);
  },

  // ---- Scroll to message ----
  scrollToMessage(messageId) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector('.message-bubble').style.outline = '2px solid var(--accent)';
      setTimeout(() => { el.querySelector('.message-bubble').style.outline = ''; }, 1500);
    }
  },

  // ---- Search in chat ----
  highlightSearch(query) {
    if (!query) return;
    const container = document.getElementById('messages-container');
    const textEls = container.querySelectorAll('.msg-text');
    textEls.forEach(el => {
      if (el.textContent.toLowerCase().includes(query.toLowerCase())) {
        el.closest('.message-wrapper').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  },

  // ---- Update send button ----
  updateSendBtn() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const hasContent = input.value.trim() || Upload.pendingImages.length > 0;
    sendBtn.classList.toggle('visible', !!hasContent);
  },

  // ---- Context Menu ----
  setupMessageContextMenu(wrapper, msg, isOwn, isSuperAdmin) {
    const showMenu = (e) => {
      e.preventDefault();
      App.showMessageContextMenu(e, msg, isOwn, isSuperAdmin);
    };

    wrapper.addEventListener('contextmenu', showMenu);

    // Long press for mobile
    let longPressTimer;
    wrapper.addEventListener('touchstart', () => {
      longPressTimer = setTimeout(() => showMenu({ clientX: 100, clientY: 200, preventDefault: () => {} }), 600);
    }, { passive: true });
    wrapper.addEventListener('touchend', () => clearTimeout(longPressTimer));
    wrapper.addEventListener('touchmove', () => clearTimeout(longPressTimer));
  },
};

window.Messages = Messages;
