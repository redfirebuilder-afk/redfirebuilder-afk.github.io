// ============================================
// CHATS — Управление чатами
// ============================================

const Chats = {

  allChats: [],
  filteredChats: [],

  // ---- Subscribe to chat list ----
  subscribeChatList() {
    const uid = window.AppState.currentUser.uid;

    const unsubscribe = db.collection('chats')
      .where('members', 'array-contains', uid)
      .orderBy('lastMessage.timestamp', 'desc')
      .onSnapshot(snap => {
        this.allChats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        this.renderChatList(this.allChats);
        this.updateTotalUnread();
      }, err => { console.warn('Chat list error:', err); });

    window.AppState.unsubscribers['chatList'] = unsubscribe;
  },

  renderChatList(chats) {
    const container = document.getElementById('chat-list');
    const myUid = window.AppState.currentUser.uid;

    if (!chats || !chats.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-text">Нет чатов</div>
          <div class="empty-state-hint">Нажми ✏️ чтобы начать переписку</div>
        </div>`;
      return;
    }

    container.innerHTML = '';
    for (const chat of chats) {
      const el = this.createChatItem(chat, myUid);
      if (el) container.appendChild(el);
    }
  },

  createChatItem(chat, myUid) {
    const isGroup = chat.type === 'group';
    const unread = (chat.unreadCount && chat.unreadCount[myUid]) || 0;

    // Determine name and avatar for DM
    let chatName = chat.name || '';
    let chatPhoto = chat.photoURL || null;
    let partnerUid = null;

    if (!isGroup) {
      partnerUid = chat.members.find(m => m !== myUid);
      // Partner data cached or will be fetched
      const partnerData = window.AppState.userCache && window.AppState.userCache[partnerUid];
      if (partnerData) {
        chatName = partnerData.displayName || 'Пользователь';
        chatPhoto = partnerData.photoURL;
      } else {
        chatName = chat.partnerName || 'Пользователь';
        chatPhoto = chat.partnerPhoto || null;
        // Async fetch partner info
        this.fetchAndCacheUser(partnerUid).then(() => this.renderChatList(this.allChats));
      }
    }

    const el = document.createElement('div');
    el.className = 'chat-item' + (chat.id === window.AppState.currentChatId ? ' active' : '');
    el.dataset.chatId = chat.id;

    // Avatar
    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'chat-item-avatar';
    const avatarEl = Utils.createAvatarEl(chatPhoto, chatName, chat.id, 48);
    avatarWrap.appendChild(avatarEl);

    // Online dot for DM
    if (!isGroup && partnerUid) {
      const partnerData = window.AppState.userCache && window.AppState.userCache[partnerUid];
      if (partnerData && partnerData.status === 'online') {
        const dot = document.createElement('div'); dot.className = 'online-dot';
        avatarWrap.style.position = 'relative'; avatarWrap.appendChild(dot);
      }
    }

    // Info
    const info = document.createElement('div'); info.className = 'chat-item-info';
    const top = document.createElement('div'); top.className = 'chat-item-top';
    const name = document.createElement('div'); name.className = 'chat-item-name'; name.textContent = chatName || 'Чат';
    const time = document.createElement('div'); time.className = 'chat-item-time';
    time.textContent = chat.lastMessage && chat.lastMessage.timestamp ? Utils.formatDateShort(chat.lastMessage.timestamp) : '';

    top.append(name, time);

    const bottom = document.createElement('div'); bottom.className = 'chat-item-bottom';
    const preview = document.createElement('div'); preview.className = 'chat-item-preview';

    if (chat.lastMessage) {
      const lm = chat.lastMessage;
      const isOwn = lm.senderId === myUid;
      const prefix = isOwn ? 'Вы: ' : (isGroup && lm.senderName ? `${lm.senderName.split(' ')[0]}: ` : '');
      const text = lm.type === 'image' ? '📷 Фото' : (lm.text || '');
      preview.textContent = prefix + Utils.truncate(text, 40);
    }

    const badgeWrap = document.createElement('div');
    if (unread > 0) {
      const badge = document.createElement('div'); badge.className = 'unread-badge';
      badge.textContent = unread > 99 ? '99+' : unread;
      badgeWrap.appendChild(badge);
    }

    bottom.append(preview, badgeWrap);
    info.append(top, bottom);
    el.append(avatarWrap, info);

    el.addEventListener('click', () => this.openChat(chat.id));
    return el;
  },

  async fetchAndCacheUser(uid) {
    if (!uid) return;
    if (!window.AppState.userCache) window.AppState.userCache = {};
    if (window.AppState.userCache[uid]) return window.AppState.userCache[uid];
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (doc.exists) window.AppState.userCache[uid] = doc.data();
      return doc.data();
    } catch { return null; }
  },

  updateTotalUnread() {
    const myUid = window.AppState.currentUser.uid;
    let total = 0;
    for (const chat of this.allChats) {
      if (chat.unreadCount && chat.unreadCount[myUid]) total += chat.unreadCount[myUid];
    }
    Notifications.updateTabTitle(total > 0 ? total : 0);
  },

  // ---- Open / Open or create DM ----
  async openChat(chatId) {
    if (window.AppState.currentChatId === chatId) return;

    window.AppState.currentChatId = chatId;

    // Mobile: hide sidebar
    const sidebar = document.getElementById('sidebar');
    const width = window.innerWidth;
    if (width < 768) { sidebar.classList.add('hidden-mobile'); }

    // Show active chat UI
    document.getElementById('welcome-screen').style.display = 'none';
    const activeChat = document.getElementById('active-chat');
    activeChat.classList.remove('hidden');

    // Mark chat item active
    document.querySelectorAll('.chat-item').forEach(el => {
      el.classList.toggle('active', el.dataset.chatId === chatId);
    });

    // Load chat data
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) { Utils.toast('Чат не найден', 'error'); return; }
    window.AppState.currentChatData = { id: chatId, ...chatDoc.data() };

    // Update header
    await this.updateChatHeader(window.AppState.currentChatData);

    // Load pinned message
    this.updatePinnedMessage(window.AppState.currentChatData);

    // Subscribe to messages
    Messages.subscribeToMessages(chatId);

    // Subscribe to typing
    Messages.subscribeTyping(chatId);

    // Mark as read
    await this.markChatAsRead(chatId);

    // Reset reply state
    Messages.clearReply();
    Upload.clearPending();
  },

  async updateChatHeader(chat) {
    const myUid = window.AppState.currentUser.uid;
    const isGroup = chat.type === 'group';

    let chatName = chat.name || '';
    let chatPhoto = chat.photoURL || null;
    let statusText = '';

    if (!isGroup) {
      const partnerUid = chat.members.find(m => m !== myUid);
      const partnerData = await this.fetchAndCacheUser(partnerUid);
      if (partnerData) {
        chatName = partnerData.displayName || 'Пользователь';
        chatPhoto = partnerData.photoURL;
        if (partnerData.customStatus) {
          statusText = partnerData.customStatus;
        } else if (partnerData.status === 'online') {
          statusText = '🟢 онлайн';
        } else {
          statusText = `Был(а) ${Utils.formatLastSeen(partnerData.lastSeen)}`;
        }
      }
    } else {
      statusText = `${chat.members.length} участник${chat.members.length === 1 ? '' : chat.members.length < 5 ? 'а' : 'ов'}`;
    }

    document.getElementById('chat-name').textContent = chatName || 'Чат';
    document.getElementById('chat-status').textContent = statusText;

    const avatarWrap = document.getElementById('chat-header-avatar-wrap');
    avatarWrap.innerHTML = '';
    const avatarEl = Utils.createAvatarEl(chatPhoto, chatName, chat.id, 38);
    avatarWrap.appendChild(avatarEl);
  },

  updatePinnedMessage(chat) {
    const bar = document.getElementById('pinned-bar');
    if (chat.pinnedMessage && chat.pinnedMessage.text) {
      document.getElementById('pinned-text').textContent = Utils.truncate(chat.pinnedMessage.text, 80);
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  },

  async markChatAsRead(chatId) {
    const myUid = window.AppState.currentUser.uid;
    try {
      await db.collection('chats').doc(chatId).update({
        [`unreadCount.${myUid}`]: 0,
      });
    } catch {}
  },

  // ---- Create DM ----
  async openOrCreateDM(targetUid, targetData) {
    const myUid = window.AppState.currentUser.uid;
    const chatId = Utils.getDmChatId(myUid, targetUid);

    const existing = await db.collection('chats').doc(chatId).get();
    if (!existing.exists) {
      const myData = window.AppState.currentUserData;
      await db.collection('chats').doc(chatId).set({
        type: 'dm',
        members: [myUid, targetUid],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: myUid,
        lastMessage: null,
        unreadCount: { [myUid]: 0, [targetUid]: 0 },
      });
    }

    App.closeModal('new-chat-modal');
    await this.openChat(chatId);
  },

  // ---- Create Group ----
  async createGroup(name, memberUids, avatarFile) {
    const myUid = window.AppState.currentUser.uid;
    if (!name.trim()) { Utils.toast('Введи название группы', 'error'); return; }
    if (memberUids.length < 1) { Utils.toast('Добавь хотя бы одного участника', 'error'); return; }

    const allMembers = [myUid, ...memberUids];
    const unreadCount = {};
    allMembers.forEach(uid => { unreadCount[uid] = 0; });
    const memberRoles = {};
    allMembers.forEach(uid => { memberRoles[uid] = uid === myUid ? 'owner' : 'member'; });

    const chatRef = db.collection('chats').doc();

    let photoURL = null;
    if (avatarFile) {
      try {
        photoURL = await Upload.uploadImage(avatarFile);
      } catch {}
    }

    await chatRef.set({
      type: 'group',
      name: name.trim(),
      photoURL,
      members: allMembers,
      memberRoles,
      inviteCode: Utils.generateId(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: myUid,
      lastMessage: null,
      unreadCount,
      pinnedMessage: null,
    });

    // System message
    await chatRef.collection('messages').add({
      type: 'system',
      text: `${window.AppState.currentUserData.displayName} создал(а) группу «${name.trim()}»`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      senderId: null,
    });

    App.closeModal('new-chat-modal');
    await this.openChat(chatRef.id);
    Utils.toast('Группа создана!', 'success');
  },

  // ---- Chat Info Modal ----
  async openChatInfo() {
    const chat = window.AppState.currentChatData;
    if (!chat) return;

    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;
    const isGroup = chat.type === 'group';
    const myRole = chat.memberRoles && chat.memberRoles[myUid];
    const canManage = myRole === 'owner' || myRole === 'admin' || myData.superAdmin;

    const body = document.getElementById('chat-info-body');
    const title = document.getElementById('chat-info-modal-title');
    body.innerHTML = '';

    if (isGroup) {
      title.textContent = 'Настройки группы';

      // Avatar & Name section
      const avatarSection = document.createElement('div');
      avatarSection.className = 'chat-info-avatar-section';
      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'chat-info-avatar-large';
      const avatarEl = Utils.createAvatarEl(chat.photoURL, chat.name, chat.id, 80);
      avatarWrap.appendChild(avatarEl);

      if (canManage) {
        avatarWrap.style.cursor = 'pointer';
        const groupAvatarInput = document.createElement('input');
        groupAvatarInput.type = 'file'; groupAvatarInput.accept = 'image/*'; groupAvatarInput.hidden = true;
        groupAvatarInput.onchange = async (e) => {
          if (e.target.files[0]) {
            try {
              const url = await Upload.uploadImage(e.target.files[0]);
              await db.collection('chats').doc(chat.id).update({ photoURL: url });
              Utils.toast('Фото группы обновлено!', 'success');
            } catch (err) { Utils.toast('Ошибка: ' + err.message, 'error'); }
          }
        };
        avatarWrap.appendChild(groupAvatarInput);
        avatarWrap.onclick = () => groupAvatarInput.click();
      }
      avatarSection.appendChild(avatarWrap);

      if (canManage) {
        const nameInput = document.createElement('input');
        nameInput.type = 'text'; nameInput.className = 'input-field'; nameInput.value = chat.name || '';
        nameInput.placeholder = 'Название группы';
        const saveNameBtn = document.createElement('button');
        saveNameBtn.className = 'btn btn-secondary'; saveNameBtn.style.cssText = 'width:auto;padding:6px 14px;font-size:13px;';
        saveNameBtn.textContent = 'Сохранить название';
        saveNameBtn.onclick = async () => {
          if (!nameInput.value.trim()) return;
          await db.collection('chats').doc(chat.id).update({ name: nameInput.value.trim() });
          Utils.toast('Название обновлено!', 'success');
        };
        avatarSection.append(nameInput, saveNameBtn);
      } else {
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'font-size:18px;font-weight:700;margin-top:8px;';
        nameEl.textContent = chat.name;
        avatarSection.appendChild(nameEl);
      }
      body.appendChild(avatarSection);

      // Invite link
      const inviteSection = document.createElement('div');
      const inviteLabel = document.createElement('div'); inviteLabel.className = 'section-label'; inviteLabel.textContent = 'Пригласительная ссылка';
      inviteSection.appendChild(inviteLabel);
      const inviteCode = chat.inviteCode || Utils.generateId();
      const inviteUrl = `${location.origin}${location.pathname}#invite=${inviteCode}`;
      const linkBox = document.createElement('div'); linkBox.className = 'invite-link-box';
      const linkText = document.createElement('div'); linkText.className = 'invite-link-url'; linkText.textContent = `Код: ${inviteCode}`;
      const copyBtn = document.createElement('button'); copyBtn.className = 'copy-btn'; copyBtn.textContent = 'Копировать';
      copyBtn.onclick = () => Utils.copyToClipboard(inviteCode);
      linkBox.append(linkText, copyBtn);
      inviteSection.appendChild(linkBox);
      body.appendChild(inviteSection);

      // Members
      const memberSection = document.createElement('div');
      const memberLabel = document.createElement('div'); memberLabel.className = 'section-label';
      memberLabel.textContent = `Участники (${chat.members.length})`;
      memberSection.appendChild(memberLabel);

      if (canManage) {
        const addInput = document.createElement('input');
        addInput.type = 'text'; addInput.className = 'input-field'; addInput.placeholder = 'Добавить участника (@username)';
        const addResults = document.createElement('div'); addResults.className = 'user-search-results';
        addInput.addEventListener('input', Utils.debounce(async () => {
          const q = addInput.value.trim();
          if (q.length < 2) { addResults.innerHTML = ''; return; }
          const users = await Profile.searchUsers(q);
          addResults.innerHTML = '';
          users.filter(u => !chat.members.includes(u.uid)).forEach(u => {
            addResults.appendChild(Profile.renderUserResult(u, async () => {
              await this.addMember(chat.id, u.uid);
              addInput.value = ''; addResults.innerHTML = '';
              Utils.toast(`${u.displayName} добавлен(а)`, 'success');
            }));
          });
        }, 400));
        memberSection.append(addInput, addResults);
      }

      // Member list
      const memberList = document.createElement('div'); memberList.className = 'member-list';
      for (const memberUid of chat.members) {
        const userData = await this.fetchAndCacheUser(memberUid);
        if (!userData) continue;
        const role = chat.memberRoles && chat.memberRoles[memberUid];
        const item = document.createElement('div'); item.className = 'member-item';

        const avatar = Utils.createAvatarEl(userData.photoURL, userData.displayName, memberUid, 38);
        avatar.className = 'member-item-avatar';
        avatar.style.cursor = 'pointer';
        avatar.onclick = () => { App.closeModal('chat-info-modal'); Profile.openUserProfile(memberUid); };

        const info = document.createElement('div'); info.className = 'member-item-info';
        const nameRow = document.createElement('div'); nameRow.className = 'member-item-name';
        nameRow.textContent = userData.displayName + (memberUid === myUid ? ' (Вы)' : '');
        if (userData.superAdmin) {
          const badge = document.createElement('span'); badge.className = 'superadmin-badge'; badge.textContent = '⚡';
          nameRow.appendChild(badge);
        }

        const roleEl = document.createElement('div'); roleEl.className = 'member-item-role';
        if (role === 'owner') {
          const rb = document.createElement('span'); rb.className = 'role-badge role-owner'; rb.textContent = 'Владелец';
          roleEl.appendChild(rb);
        } else if (role === 'admin') {
          const rb = document.createElement('span'); rb.className = 'role-badge role-admin'; rb.textContent = 'Админ';
          roleEl.appendChild(rb);
        }
        if (userData.status === 'online') {
          const dot = document.createElement('span'); dot.style.color = 'var(--success)'; dot.textContent = '●';
          roleEl.appendChild(dot);
        }

        info.append(nameRow, roleEl);
        item.append(avatar, info);

        // Actions for non-owners
        if (canManage && memberUid !== myUid && role !== 'owner') {
          const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '4px';

          if (myRole === 'owner' || myData.superAdmin) {
            const promoteBtn = document.createElement('button');
            promoteBtn.className = 'icon-btn'; promoteBtn.style.fontSize = '12px'; promoteBtn.style.width = 'auto';
            promoteBtn.style.padding = '2px 8px'; promoteBtn.style.borderRadius = '4px'; promoteBtn.style.background = 'var(--accent-light)'; promoteBtn.style.color = 'var(--accent)';
            promoteBtn.textContent = role === 'admin' ? 'Снять' : 'Админ';
            promoteBtn.title = role === 'admin' ? 'Снять права админа' : 'Сделать админом';
            promoteBtn.onclick = async () => {
              const newRole = role === 'admin' ? 'member' : 'admin';
              await db.collection('chats').doc(chat.id).update({ [`memberRoles.${memberUid}`]: newRole });
              Utils.toast(newRole === 'admin' ? `${userData.displayName} теперь админ` : 'Права сняты', 'success');
              this.openChatInfo();
            };
            actions.appendChild(promoteBtn);
          }

          const kickBtn = document.createElement('button');
          kickBtn.className = 'icon-btn'; kickBtn.style.fontSize = '12px'; kickBtn.style.color = 'var(--danger)';
          kickBtn.textContent = '🚪'; kickBtn.title = 'Исключить из группы';
          kickBtn.onclick = async () => {
            if (!confirm(`Исключить ${userData.displayName}?`)) return;
            await this.removeMember(chat.id, memberUid, userData.displayName);
            this.openChatInfo();
          };
          actions.appendChild(kickBtn);
          item.appendChild(actions);
        }
        memberList.appendChild(item);
      }
      memberSection.appendChild(memberList);
      body.appendChild(memberSection);

      // Leave / Delete group
      const leaveBtn = document.createElement('button');
      leaveBtn.className = myRole === 'owner' ? 'btn btn-danger' : 'btn btn-secondary';
      leaveBtn.style.marginTop = '8px';
      leaveBtn.textContent = myRole === 'owner' ? '🗑 Удалить группу' : '🚪 Покинуть группу';
      leaveBtn.onclick = async () => {
        if (myRole === 'owner') {
          if (!confirm('Удалить группу? Это действие необратимо.')) return;
          await this.deleteGroup(chat.id);
        } else {
          if (!confirm('Покинуть группу?')) return;
          await this.leaveChat(chat.id);
        }
        App.closeModal('chat-info-modal');
      };
      body.appendChild(leaveBtn);

    } else {
      // DM info
      title.textContent = 'Личный чат';
      const partnerUid = chat.members.find(m => m !== myUid);
      const partnerData = await this.fetchAndCacheUser(partnerUid);
      if (partnerData) {
        body.innerHTML = '';
        const avatarEl = Utils.createAvatarEl(partnerData.photoURL, partnerData.displayName, partnerUid, 80);
        avatarEl.style.margin = '0 auto 8px'; avatarEl.style.cursor = 'pointer';
        avatarEl.onclick = () => { App.closeModal('chat-info-modal'); Profile.openUserProfile(partnerUid); };
        body.appendChild(avatarEl);

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'text-align:center;font-size:20px;font-weight:700;';
        nameEl.textContent = partnerData.displayName;
        body.appendChild(nameEl);

        if (partnerData.username) {
          const usernameEl = document.createElement('div');
          usernameEl.style.cssText = 'text-align:center;font-size:15px;color:var(--accent);';
          usernameEl.textContent = `@${partnerData.username}`;
          body.appendChild(usernameEl);
        }
        if (partnerData.bio) {
          const bioEl = document.createElement('div');
          bioEl.style.cssText = 'text-align:center;font-size:14px;color:var(--text-secondary);padding:8px 0;';
          bioEl.textContent = partnerData.bio;
          body.appendChild(bioEl);
        }
      }
    }

    App.openModal('chat-info-modal');
  },

  // ---- Add/Remove members ----
  async addMember(chatId, uid) {
    await db.collection('chats').doc(chatId).update({
      members: firebase.firestore.FieldValue.arrayUnion(uid),
      [`memberRoles.${uid}`]: 'member',
      [`unreadCount.${uid}`]: 0,
    });
    const userData = await this.fetchAndCacheUser(uid);
    await db.collection('chats').doc(chatId).collection('messages').add({
      type: 'system',
      text: `${userData && userData.displayName || 'Пользователь'} добавлен(а) в группу`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      senderId: null,
    });
    window.AppState.currentChatData = { ...window.AppState.currentChatData, members: [...window.AppState.currentChatData.members, uid] };
  },

  async removeMember(chatId, uid, displayName) {
    await db.collection('chats').doc(chatId).update({
      members: firebase.firestore.FieldValue.arrayRemove(uid),
      [`memberRoles.${uid}`]: firebase.firestore.FieldValue.delete(),
      [`unreadCount.${uid}`]: firebase.firestore.FieldValue.delete(),
    });
    await db.collection('chats').doc(chatId).collection('messages').add({
      type: 'system',
      text: `${displayName || 'Пользователь'} исключён(а) из группы`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      senderId: null,
    });
    window.AppState.currentChatData = {
      ...window.AppState.currentChatData,
      members: window.AppState.currentChatData.members.filter(m => m !== uid),
    };
  },

  async leaveChat(chatId) {
    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;
    await this.removeMember(chatId, myUid, myData.displayName);
    this.closeCurrentChat();
    Utils.toast('Вы покинули группу', 'default');
  },

  async deleteGroup(chatId) {
    // In production, we'd use a Cloud Function; for now, just remove current user
    await db.collection('chats').doc(chatId).update({ members: [] });
    this.closeCurrentChat();
    Utils.toast('Группа удалена', 'default');
  },

  closeCurrentChat() {
    window.AppState.currentChatId = null;
    window.AppState.currentChatData = null;
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('welcome-screen').style.display = '';
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    if (window.AppState.unsubscribers['messages']) {
      window.AppState.unsubscribers['messages']();
      delete window.AppState.unsubscribers['messages'];
    }
    if (window.AppState.unsubscribers['typing']) {
      window.AppState.unsubscribers['typing']();
      delete window.AppState.unsubscribers['typing'];
    }
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('hidden-mobile');
  },

  // ---- Search chats ----
  filterChatList(query) {
    if (!query) {
      this.renderChatList(this.allChats);
      return;
    }
    query = query.toLowerCase();
    const filtered = this.allChats.filter(chat => {
      const name = (chat.name || '').toLowerCase();
      return name.includes(query);
    });
    this.renderChatList(filtered);
  },

  // ---- Invite Links ----
  async joinViaInviteCode(code) {
    const myUid = window.AppState.currentUser.uid;
    code = code.trim();
    try {
      const snap = await db.collection('chats').where('inviteCode', '==', code).limit(1).get();
      if (snap.empty) { Utils.toast('Неверный код приглашения', 'error'); return; }
      const chatDoc = snap.docs[0];
      const chat = chatDoc.data();
      if (chat.members.includes(myUid)) {
        Utils.toast('Ты уже в этом чате!', 'default');
        App.closeModal('new-chat-modal');
        await this.openChat(chatDoc.id);
        return;
      }
      await this.addMember(chatDoc.id, myUid);
      App.closeModal('new-chat-modal');
      await this.openChat(chatDoc.id);
      Utils.toast(`Добро пожаловать в «${chat.name}»!`, 'success');
    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
    }
  },

  // ---- Pinned Message ----
  async pinMessage(chatId, message) {
    await db.collection('chats').doc(chatId).update({
      pinnedMessage: {
        messageId: message.id,
        text: message.text || '[Фото]',
        senderId: message.senderId,
      },
    });
    window.AppState.currentChatData = { ...window.AppState.currentChatData, pinnedMessage: { messageId: message.id, text: message.text || '[Фото]' } };
    this.updatePinnedMessage(window.AppState.currentChatData);
    Utils.toast('Сообщение закреплено!', 'success');
  },

  async unpinMessage(chatId) {
    await db.collection('chats').doc(chatId).update({ pinnedMessage: null });
    window.AppState.currentChatData = { ...window.AppState.currentChatData, pinnedMessage: null };
    this.updatePinnedMessage(window.AppState.currentChatData);
    Utils.toast('Закрепление снято', 'default');
  },
};

window.Chats = Chats;
