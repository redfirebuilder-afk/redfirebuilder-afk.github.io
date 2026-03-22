// ============================================
// CHANNELS — Каналы (Nyx)
// ============================================

const Channels = {

  allChannels: [], // subscribed channels
  currentChannelId: null,
  currentChannelData: null,

  // ---- Subscribe to channel list ----
  subscribeChannelList() {
    const uid = window.AppState.currentUser.uid;
    const unsubscribe = db.collection('channels')
      .where('subscribers', 'array-contains', uid)
      .onSnapshot(snap => {
        this.allChannels = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.lastPost?.timestamp?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
            const tb = b.lastPost?.timestamp?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
            return tb - ta;
          });
        this.renderChannelList();
      }, err => console.warn('Channel list error:', err));
    window.AppState.unsubscribers['channelList'] = unsubscribe;
  },

  renderChannelList() {
    const container = document.getElementById('channels-list-panel');
    if (!container) return;

    if (!this.allChannels.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📢</div>
          <div class="empty-state-text">Нет каналов</div>
          <div class="empty-state-hint">Подпишись или создай свой</div>
        </div>`;
      return;
    }

    container.innerHTML = '';

    // "Create channel" header button
    const header = document.createElement('div');
    header.className = 'list-section-header';
    header.innerHTML = `<span>Каналы</span><button id="new-channel-btn" title="Создать канал">+</button>`;
    container.appendChild(header);
    header.querySelector('#new-channel-btn').onclick = () => App.openModal('new-channel-modal');

    this.allChannels.forEach(ch => {
      const el = this.createChannelItem(ch);
      container.appendChild(el);
    });
  },

  createChannelItem(ch) {
    const el = document.createElement('div');
    el.className = 'channel-item' + (ch.id === this.currentChannelId ? ' active' : '');
    el.dataset.channelId = ch.id;

    const avatar = Utils.createAvatarEl(ch.photoURL, ch.name, ch.id, 50);
    avatar.className = 'channel-avatar';
    avatar.style.borderRadius = '14px';

    const info = document.createElement('div'); info.className = 'channel-info';
    const name = document.createElement('div'); name.className = 'channel-name'; name.textContent = ch.name;
    const preview = document.createElement('div'); preview.className = 'channel-preview';
    preview.textContent = ch.lastPost?.text ? Utils.truncate(ch.lastPost.text, 40) : ch.description || '';
    const subs = document.createElement('div'); subs.className = 'channel-subscribers';
    subs.textContent = `${ch.subscriberCount || 0} подписчиков`;

    info.append(name, preview, subs);

    const badge = document.createElement('span'); badge.className = 'channel-badge'; badge.textContent = 'КАНАЛ';
    el.append(avatar, info, badge);
    el.onclick = () => this.openChannel(ch.id);
    return el;
  },

  // ---- Open channel ----
  async openChannel(channelId) {
    this.currentChannelId = channelId;

    // Mobile
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth < 768) sidebar.classList.add('hidden-mobile');

    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('active-chat').classList.add('hidden');

    let channelView = document.getElementById('channel-view');
    if (!channelView) {
      channelView = document.createElement('div');
      channelView.id = 'channel-view';
      channelView.className = 'active-chat';
      document.getElementById('chat-area').appendChild(channelView);
    }
    channelView.classList.remove('hidden');
    channelView.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Загрузка...</div>';

    // Mark active
    document.querySelectorAll('.channel-item').forEach(el => {
      el.classList.toggle('active', el.dataset.channelId === channelId);
    });

    const doc = await db.collection('channels').doc(channelId).get();
    if (!doc.exists) { Utils.toast('Канал не найден', 'error'); return; }
    const ch = { id: channelId, ...doc.data() };
    this.currentChannelData = ch;

    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;
    const isOwner = ch.ownerId === myUid || (myData && myData.superAdmin);
    const isSubscribed = ch.subscribers && ch.subscribers.includes(myUid);

    channelView.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'channel-view-header';

    const backBtn = document.createElement('button');
    backBtn.className = 'icon-btn back-btn';
    backBtn.textContent = '←'; backBtn.style.display = '';
    backBtn.onclick = () => {
      channelView.classList.add('hidden');
      document.getElementById('welcome-screen').style.display = '';
      if (window.innerWidth < 768) sidebar.classList.remove('hidden-mobile');
      this.currentChannelId = null;
    };

    const headerTop = document.createElement('div'); headerTop.className = 'channel-header-top';
    const avatarEl = Utils.createAvatarEl(ch.photoURL, ch.name, ch.id, 48);
    avatarEl.className = 'channel-header-avatar';
    avatarEl.style.borderRadius = '14px';

    const headerText = document.createElement('div'); headerText.style.flex = '1; min-width: 0';
    const headerName = document.createElement('div'); headerName.className = 'channel-header-name'; headerName.textContent = ch.name;
    headerText.appendChild(headerName);

    const subBtn = document.createElement('button');
    subBtn.className = 'subscribe-btn' + (isSubscribed ? ' subscribed' : '');
    subBtn.textContent = isSubscribed ? '✓ Подписан' : 'Подписаться';
    subBtn.onclick = () => this.toggleSubscribe(ch.id, isSubscribed, subBtn);

    headerTop.append(backBtn, avatarEl, headerText, subBtn);

    const headerDesc = document.createElement('div'); headerDesc.className = 'channel-header-desc';
    headerDesc.textContent = ch.description || '';

    const headerStats = document.createElement('div'); headerStats.className = 'channel-header-stats';
    headerStats.innerHTML = `
      <span class="channel-header-stat">👥 ${ch.subscriberCount || 0} подписчиков</span>
      ${ch.isPublic ? '<span class="channel-header-stat">🌐 Публичный</span>' : '<span class="channel-header-stat">🔒 Приватный</span>'}
    `;

    header.append(headerTop, headerDesc, headerStats);
    channelView.appendChild(header);

    // Posts area
    const postsArea = document.createElement('div');
    postsArea.id = 'channel-posts-area';
    postsArea.className = 'messages-container';
    channelView.appendChild(postsArea);

    // New post form (only for owners/admins)
    if (isOwner) {
      const postForm = document.createElement('div');
      postForm.className = 'new-post-form';
      postForm.innerHTML = `
        <textarea class="new-post-textarea" id="new-post-text" placeholder="Написать публикацию..." rows="2"></textarea>
        <div class="new-post-actions">
          <label for="post-image-input" class="attach-label" title="Прикрепить фото" style="width:auto;padding:0 10px;font-size:13px;font-weight:600;color:var(--violet);border:1.5px solid var(--border);border-radius:var(--r-sm);height:36px;">📷 Фото</label>
          <input type="file" id="post-image-input" accept="image/*" hidden>
          <button id="publish-post-btn" class="btn btn-primary" style="width:auto;padding:8px 22px;font-size:14px;height:36px;">Опубликовать</button>
        </div>
      `;
      channelView.appendChild(postForm);

      postForm.querySelector('#publish-post-btn').onclick = () => this.publishPost(channelId);
      postForm.querySelector('#post-image-input').onchange = (e) => { this._pendingPostImage = e.target.files[0]; };
    }

    this._pendingPostImage = null;

    // Subscribe to posts
    this.subscribeToPosts(channelId, postsArea);
  },

  subscribeToPosts(channelId, container) {
    if (window.AppState.unsubscribers['channelPosts']) {
      window.AppState.unsubscribers['channelPosts']();
    }
    const unsubscribe = db.collection('channels').doc(channelId)
      .collection('posts').orderBy('timestamp', 'asc')
      .onSnapshot(snap => {
        container.innerHTML = '';
        if (snap.empty) {
          container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">Публикаций пока нет</div></div>`;
          return;
        }
        snap.docs.forEach(d => {
          const post = { id: d.id, ...d.data() };
          container.appendChild(this.renderPost(post));
        });
        Utils.scrollToBottom(container);
      });
    window.AppState.unsubscribers['channelPosts'] = unsubscribe;
  },

  renderPost(post) {
    const ch = this.currentChannelData;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding:8px 0;';

    const card = document.createElement('div');
    card.className = 'channel-post';

    const header = document.createElement('div'); header.className = 'channel-post-header';
    const avatarEl = Utils.createAvatarEl(ch && ch.photoURL, ch && ch.name, ch && ch.id, 36);
    avatarEl.className = 'channel-post-avatar';
    avatarEl.style.borderRadius = '10px';

    const meta = document.createElement('div');
    const nameEl = document.createElement('div'); nameEl.className = 'channel-post-name'; nameEl.textContent = ch ? ch.name : 'Канал';
    const timeEl = document.createElement('div'); timeEl.className = 'channel-post-time'; timeEl.textContent = post.timestamp ? Utils.formatTime(post.timestamp) + ' · ' + Utils.formatDate(post.timestamp) : '';
    meta.append(nameEl, timeEl);
    header.append(avatarEl, meta);

    const text = document.createElement('div'); text.className = 'channel-post-text';
    text.innerHTML = post.text ? Utils.linkify(post.text) : '';

    card.append(header, text);

    if (post.imageURL) {
      const img = document.createElement('img'); img.className = 'channel-post-image';
      img.src = post.imageURL; img.loading = 'lazy';
      img.onclick = () => App.openLightbox(post.imageURL);
      card.appendChild(img);
    }

    const stats = document.createElement('div'); stats.className = 'channel-post-stats';
    const views = document.createElement('div'); views.className = 'channel-stat';
    views.innerHTML = `👁 ${(post.views || []).length}`;
    stats.appendChild(views);

    // Delete button for owner/superadmin
    if (this.currentChannelData && (this.currentChannelData.ownerId === window.AppState.currentUser.uid || (window.AppState.currentUserData && window.AppState.currentUserData.superAdmin))) {
      const delBtn = document.createElement('button');
      delBtn.style.cssText = 'margin-left:auto;font-size:12px;color:var(--danger);';
      delBtn.textContent = 'Удалить';
      delBtn.onclick = () => this.deletePost(this.currentChannelId, post.id);
      stats.appendChild(delBtn);
    }

    card.appendChild(stats);

    // Mark as viewed
    this.markPostViewed(this.currentChannelId, post.id);

    wrapper.appendChild(card);
    return wrapper;
  },

  async markPostViewed(channelId, postId) {
    const uid = window.AppState.currentUser.uid;
    try {
      await db.collection('channels').doc(channelId).collection('posts').doc(postId).update({
        views: firebase.firestore.FieldValue.arrayUnion(uid)
      });
    } catch {}
  },

  async publishPost(channelId) {
    const text = document.getElementById('new-post-text').value.trim();
    const imageFile = this._pendingPostImage;
    if (!text && !imageFile) { Utils.toast('Напиши что-нибудь', 'error'); return; }

    const btn = document.getElementById('publish-post-btn');
    btn.textContent = 'Публикую...'; btn.disabled = true;

    try {
      let imageURL = null;
      if (imageFile) imageURL = await Upload.uploadImage(imageFile);

      const postRef = await db.collection('channels').doc(channelId).collection('posts').add({
        text: text || null,
        imageURL,
        authorId: window.AppState.currentUser.uid,
        authorName: window.AppState.currentUserData.displayName,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        views: [],
      });

      await db.collection('channels').doc(channelId).update({
        lastPost: { text: text || '[Фото]', timestamp: firebase.firestore.FieldValue.serverTimestamp() }
      });

      document.getElementById('new-post-text').value = '';
      this._pendingPostImage = null;
      document.getElementById('post-image-input').value = '';
      Utils.toast('Опубликовано!', 'success');
    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
    } finally {
      btn.textContent = 'Опубликовать'; btn.disabled = false;
    }
  },

  async deletePost(channelId, postId) {
    if (!confirm('Удалить публикацию?')) return;
    await db.collection('channels').doc(channelId).collection('posts').doc(postId).delete();
    Utils.toast('Удалено', 'default');
  },

  // ---- Toggle subscribe ----
  async toggleSubscribe(channelId, isSubscribed, btn) {
    const uid = window.AppState.currentUser.uid;
    try {
      if (isSubscribed) {
        await db.collection('channels').doc(channelId).update({
          subscribers: firebase.firestore.FieldValue.arrayRemove(uid),
          subscriberCount: firebase.firestore.FieldValue.increment(-1),
        });
        btn.textContent = 'Подписаться';
        btn.classList.remove('subscribed');
      } else {
        await db.collection('channels').doc(channelId).update({
          subscribers: firebase.firestore.FieldValue.arrayUnion(uid),
          subscriberCount: firebase.firestore.FieldValue.increment(1),
        });
        btn.textContent = '✓ Подписан';
        btn.classList.add('subscribed');
      }
    } catch (e) { Utils.toast('Ошибка: ' + e.message, 'error'); }
  },

  // ---- Create channel ----
  async createChannel(name, description, isPublic, avatarFile) {
    if (!name.trim()) { Utils.toast('Введи название канала', 'error'); return; }
    const uid = window.AppState.currentUser.uid;
    const btn = document.getElementById('create-channel-btn');
    btn.textContent = 'Создаём...'; btn.disabled = true;

    try {
      const ref = db.collection('channels').doc();
      let photoURL = null;
      if (avatarFile) photoURL = await Upload.uploadImage(avatarFile);

      await ref.set({
        name: name.trim(),
        description: description.trim(),
        photoURL,
        ownerId: uid,
        admins: [uid],
        subscribers: [uid],
        subscriberCount: 1,
        isPublic,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastPost: null,
        inviteCode: Utils.generateId(),
      });

      App.closeModal('new-channel-modal');
      this.openChannel(ref.id);
      Utils.toast('Канал создан!', 'success');
    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
      btn.textContent = 'Создать канал'; btn.disabled = false;
    }
  },

  // ---- Search public channels ----
  async searchChannels(query) {
    if (!query || query.length < 2) return [];
    try {
      const snap = await db.collection('channels')
        .where('isPublic', '==', true)
        .where('name', '>=', query)
        .where('name', '<=', query + '\uf8ff')
        .limit(10).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return []; }
  },
};

window.Channels = Channels;
