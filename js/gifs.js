// ============================================
// GIFS — GIF-пикер через Tenor API (Nyx)
// ============================================

const GIFs = {

  currentQuery: '',
  debounceTimer: null,

  open() {
    const picker = document.getElementById('gif-picker');
    picker.classList.remove('hidden');
    document.getElementById('gif-search-input').focus();
    this.load('trending');
  },

  close() {
    const picker = document.getElementById('gif-picker');
    picker.classList.add('hidden');
  },

  toggle() {
    const picker = document.getElementById('gif-picker');
    if (picker.classList.contains('hidden')) this.open();
    else this.close();
  },

  async load(query = '') {
    if (!TENOR_API_KEY) {
      document.getElementById('gif-grid').innerHTML =
        '<div class="gif-loading">Добавь TENOR_API_KEY в js/config.js</div>';
      return;
    }

    const grid = document.getElementById('gif-grid');
    grid.innerHTML = '<div class="gif-loading">⏳ Загрузка...</div>';

    try {
      const endpoint = query
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=20&media_filter=gif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20&media_filter=gif`;

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Tenor API error: ' + res.status);
      const data = await res.json();

      grid.innerHTML = '';
      if (!data.results || !data.results.length) {
        grid.innerHTML = '<div class="gif-loading">Ничего не найдено</div>';
        return;
      }

      data.results.forEach(gif => {
        const url = gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url;
        const preview = gif.media_formats?.tinygif?.url || url;
        if (!url) return;

        const item = document.createElement('div'); item.className = 'gif-item';
        const img = document.createElement('img'); img.src = preview; img.loading = 'lazy'; img.alt = gif.title || 'GIF';
        item.appendChild(img);
        item.onclick = () => this.send(url, gif.title || 'GIF');
        grid.appendChild(item);
      });
    } catch (e) {
      grid.innerHTML = `<div class="gif-loading">Ошибка: ${e.message}</div>`;
    }
  },

  async send(gifUrl, title) {
    this.close();
    const chatId = window.AppState.currentChatId;
    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;
    if (!chatId) return;

    const msgData = {
      senderId: myUid,
      senderName: myData.displayName,
      senderPhotoURL: myData.photoURL || null,
      type: 'gif',
      text: null,
      gifUrl,
      gifTitle: title,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      edited: false, deleted: false,
      readBy: [myUid],
    };

    try {
      await db.collection('chats').doc(chatId).collection('messages').add(msgData);
      await db.collection('chats').doc(chatId).update({
        lastMessage: {
          text: '🎬 GIF',
          type: 'gif',
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          senderId: myUid, senderName: myData.displayName,
        },
        ...Chats._buildUnreadIncrements(chatId),
      });
    } catch (e) { Utils.toast('Ошибка отправки GIF: ' + e.message, 'error'); }
  },

  setupSearch() {
    const input = document.getElementById('gif-search-input');
    if (!input) return;
    input.oninput = () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.load(input.value.trim());
      }, 500);
    };
  },
};

window.GIFs = GIFs;
