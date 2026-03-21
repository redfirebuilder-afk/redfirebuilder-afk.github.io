// ============================================
// PROFILE — Управление профилями
// ============================================

const Profile = {

  async loadMyProfile() {
    const uid = window.AppState.currentUser.uid;
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    window.AppState.currentUserData = doc.data();
    return doc.data();
  },

  openMyProfileModal() {
    const data = window.AppState.currentUserData;
    if (!data) return;

    // Fill form
    document.getElementById('profile-name').value = data.displayName || '';
    document.getElementById('profile-username').value = data.username || '';
    document.getElementById('profile-bio').value = data.bio || '';
    document.getElementById('profile-custom-status').value = data.customStatus || '';

    // Avatar
    const avatarWrap = document.getElementById('my-profile-avatar-wrap');
    avatarWrap.innerHTML = '';
    const avatarEl = Utils.createAvatarEl(data.photoURL, data.displayName, data.uid, 90);
    avatarWrap.appendChild(avatarEl);
    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.id = 'avatar-input'; fileInput.accept = 'image/*'; fileInput.hidden = true;
    avatarWrap.appendChild(fileInput);

    // Super admin badge — удаляем старый перед вставкой нового
    const oldBadge = document.getElementById('profile-superadmin-badge');
    if (oldBadge) oldBadge.remove();
    if (data.superAdmin) {
      const badge = document.createElement('div');
      badge.id = 'profile-superadmin-badge';
      badge.className = 'superadmin-badge';
      badge.textContent = '⚡ SUPER ADMIN';
      badge.style.marginTop = '6px';
      avatarWrap.after(badge);
    }

    App.openModal('profile-modal');
  },

  async saveMyProfile() {
    const uid = window.AppState.currentUser.uid;
    const data = window.AppState.currentUserData;

    const newName = document.getElementById('profile-name').value.trim();
    const newUsername = document.getElementById('profile-username').value.replace(/^@/, '').toLowerCase().trim();
    const newBio = document.getElementById('profile-bio').value.trim();
    const newStatus = document.getElementById('profile-custom-status').value.trim();

    if (!newName) { Utils.toast('Введи имя', 'error'); return; }
    if (!Utils.validateUsername(newUsername)) { Utils.toast('Неверный @username (латиница, цифры, _, 3-24 символа)', 'error'); return; }

    const btn = document.getElementById('save-profile-btn');
    btn.textContent = 'Сохраняю...'; btn.disabled = true;

    try {
      const batch = db.batch();

      // Check if username changed
      if (newUsername !== data.username) {
        const existingDoc = await db.collection('usernames').doc(newUsername).get();
        if (existingDoc.exists) { Utils.toast('@username уже занят', 'error'); btn.textContent = 'Сохранить'; btn.disabled = false; return; }
        // Delete old username reservation
        if (data.username) batch.delete(db.collection('usernames').doc(data.username));
        batch.set(db.collection('usernames').doc(newUsername), { uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      }

      const updates = {
        displayName: newName,
        username: newUsername,
        bio: newBio,
        customStatus: newStatus,
      };

      batch.update(db.collection('users').doc(uid), updates);
      await batch.commit();

      // Update Firebase Auth display name
      await auth.currentUser.updateProfile({ displayName: newName });

      window.AppState.currentUserData = { ...data, ...updates };
      Profile.updateSidebarAvatar();
      Utils.toast('Профиль сохранён!', 'success');
      App.closeModal('profile-modal');

    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
    } finally {
      btn.textContent = 'Сохранить'; btn.disabled = false;
    }
  },

  async changeAvatar(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { Utils.toast('Выбери изображение', 'error'); return; }
    if (file.size > 32 * 1024 * 1024) { Utils.toast('Файл слишком большой (макс. 32MB)', 'error'); return; }

    Utils.toast('Загрузка...', 'default');
    try {
      const uid = window.AppState.currentUser.uid;
      const url = await Upload.uploadImage(file);

      await db.collection('users').doc(uid).update({ photoURL: url });
      await auth.currentUser.updateProfile({ photoURL: url });

      window.AppState.currentUserData.photoURL = url;

      // Update avatar preview in modal
      const avatarWrap = document.getElementById('my-profile-avatar-wrap');
      avatarWrap.innerHTML = '';
      const avatarEl = Utils.createAvatarEl(url, window.AppState.currentUserData.displayName, uid, 90);
      avatarWrap.appendChild(avatarEl);

      Profile.updateSidebarAvatar();
      Utils.toast('Фото обновлено!', 'success');
    } catch (e) {
      Utils.toast('Ошибка загрузки: ' + e.message, 'error');
    }
  },

  updateSidebarAvatar() {
    const data = window.AppState.currentUserData;
    if (!data) return;
    const wrap = document.getElementById('my-avatar-wrap');
    if (!wrap) return;
    wrap.innerHTML = '';
    const el = Utils.createAvatarEl(data.photoURL, data.displayName, data.uid, 38);
    wrap.appendChild(el);
  },

  async openUserProfile(uid) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (!doc.exists) { Utils.toast('Пользователь не найден', 'error'); return; }
      const data = doc.data();
      const me = window.AppState.currentUser;
      const myData = window.AppState.currentUserData;

      const body = document.getElementById('user-profile-body');
      body.innerHTML = '';

      // Header
      const header = document.createElement('div');
      header.className = 'user-profile-header';

      const avatarEl = Utils.createAvatarEl(data.photoURL, data.displayName, uid, 80);
      avatarEl.className = 'user-profile-avatar';

      const name = document.createElement('div');
      name.className = 'user-profile-name';
      name.textContent = data.displayName || 'Пользователь';

      const username = document.createElement('div');
      username.className = 'user-profile-username';
      username.textContent = data.username ? `@${data.username}` : '';

      const statusEl = document.createElement('div');
      statusEl.className = 'user-profile-status';
      if (data.status === 'online') {
        statusEl.innerHTML = '<span style="color:var(--success)">● Онлайн</span>';
      } else {
        statusEl.textContent = `Был(а) ${Utils.formatLastSeen(data.lastSeen)}`;
      }
      if (data.customStatus) {
        const cs = document.createElement('div');
        cs.style.cssText = 'font-size:13px;color:var(--text-secondary);margin-top:2px;';
        cs.textContent = data.customStatus;
        statusEl.after(cs);
      }

      header.append(avatarEl, name, username, statusEl);
      if (data.superAdmin) {
        const badge = document.createElement('div');
        badge.className = 'superadmin-badge'; badge.textContent = '⚡ Super Admin';
        header.appendChild(badge);
      }
      body.appendChild(header);

      // Bio
      if (data.bio) {
        const bio = document.createElement('div');
        bio.style.cssText = 'font-size:14px;color:var(--text-secondary);text-align:center;padding:8px 0;';
        bio.textContent = data.bio;
        body.appendChild(bio);
      }

      // Actions (only if not viewing own profile)
      if (uid !== me.uid) {
        const actions = document.createElement('div');
        actions.className = 'user-profile-actions';

        const dmBtn = document.createElement('button');
        dmBtn.className = 'btn btn-primary';
        dmBtn.textContent = '💬 Написать';
        dmBtn.onclick = async () => {
          App.closeModal('user-profile-modal');
          await Chats.openOrCreateDM(uid, data);
        };
        actions.appendChild(dmBtn);

        // Super admin ban button
        if (myData && myData.superAdmin && !data.superAdmin) {
          const banBtn = document.createElement('button');
          banBtn.className = 'btn btn-danger';
          banBtn.style.flex = '1';
          banBtn.textContent = '🚫 Бан';
          banBtn.onclick = () => Admin.banUser(uid, data.displayName);
          actions.appendChild(banBtn);
        }

        body.appendChild(actions);
      }

      App.openModal('user-profile-modal');
    } catch (e) {
      Utils.toast('Ошибка загрузки профиля', 'error');
    }
  },

  async searchUsers(query) {
    query = query.toLowerCase().trim();
    if (!query) return [];

    const results = [];
    const myUid = window.AppState.currentUser.uid;

    // Search by username
    if (query.startsWith('@')) {
      const username = query.slice(1);
      const doc = await db.collection('usernames').doc(username).get();
      if (doc.exists && doc.data().uid !== myUid) {
        const userDoc = await db.collection('users').doc(doc.data().uid).get();
        if (userDoc.exists) results.push(userDoc.data());
      }
    } else {
      // Search by username prefix
      try {
        const snap = await db.collection('users')
          .where('username', '>=', query)
          .where('username', '<=', query + '\uf8ff')
          .limit(10).get();
        snap.forEach(d => { if (d.id !== myUid) results.push(d.data()); });
      } catch {}

      // Search by displayName prefix
      try {
        const snap2 = await db.collection('users')
          .orderBy('displayName')
          .startAt(query)
          .endAt(query + '\uf8ff')
          .limit(10).get();
        snap2.forEach(d => {
          if (d.id !== myUid && !results.find(u => u.uid === d.id)) results.push(d.data());
        });
      } catch {}
    }

    return results;
  },

  renderUserResult(userData, onClick) {
    const el = document.createElement('div');
    el.className = 'user-result';
    const avatarEl = Utils.createAvatarEl(userData.photoURL, userData.displayName, userData.uid, 40);
    avatarEl.className = 'user-result-avatar';
    const info = document.createElement('div');
    info.className = 'user-result-info';
    const name = document.createElement('div'); name.className = 'user-result-name'; name.textContent = userData.displayName || 'Пользователь';
    const username = document.createElement('div'); username.className = 'user-result-username'; username.textContent = userData.username ? `@${userData.username}` : userData.email || '';
    if (userData.status === 'online') {
      username.innerHTML += ' <span style="color:var(--success)">●</span>';
    }
    info.append(name, username);
    el.append(avatarEl, info);
    el.addEventListener('click', onClick);
    return el;
  },
};

window.Profile = Profile;
