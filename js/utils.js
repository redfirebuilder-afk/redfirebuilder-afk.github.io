// ============================================
// UTILS — Вспомогательные функции
// ============================================

const Utils = {

  // --- Time Formatting ---
  formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  },

  formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const day = 86400000;
    if (diff < day && now.getDate() === date.getDate()) return 'Сегодня';
    if (diff < 2 * day) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  },

  formatDateShort(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    if (now.getDate() === date.getDate() && now.getMonth() === date.getMonth()) {
      return this.formatTime(timestamp);
    }
    if (now.getFullYear() === date.getFullYear()) {
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' });
  },

  formatLastSeen(timestamp) {
    if (!timestamp) return 'никогда';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const min = 60000, hour = 3600000, day = 86400000;
    if (diff < 2 * min) return 'только что';
    if (diff < hour) return `${Math.floor(diff / min)} мин. назад`;
    if (diff < day) return `сегодня в ${this.formatTime(timestamp)}`;
    if (diff < 2 * day) return `вчера в ${this.formatTime(timestamp)}`;
    return `${this.formatDate(timestamp)} в ${this.formatTime(timestamp)}`;
  },

  // --- ID Generation ---
  generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  },

  getDmChatId(uid1, uid2) {
    return 'dm_' + [uid1, uid2].sort().join('_');
  },

  // --- Text / HTML ---
  escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  linkify(text) {
    const escaped = this.escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    return escaped.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  },

  truncate(text, maxLen = 60) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  },

  // --- Link Detection ---
  extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    return text.match(urlRegex) || [];
  },

  getYoutubeId(url) {
    const regexps = [
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const re of regexps) {
      const m = url.match(re);
      if (m) return m[1];
    }
    return null;
  },

  getTiktokUrl(url) {
    return url.includes('tiktok.com') ? url : null;
  },

  async fetchLinkPreview(url) {
    try {
      const ytId = this.getYoutubeId(url);
      if (ytId) {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`);
        if (res.ok) {
          const data = await res.json();
          return {
            type: 'youtube',
            url,
            title: data.title,
            description: `YouTube · ${data.author_name}`,
            image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
            videoId: ytId,
          };
        }
      }

      const ttUrl = this.getTiktokUrl(url);
      if (ttUrl) {
        try {
          const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(ttUrl)}`);
          if (res.ok) {
            const data = await res.json();
            return {
              type: 'tiktok',
              url,
              title: data.title,
              description: `TikTok · ${data.author_name}`,
              image: data.thumbnail_url,
            };
          }
        } catch {}
        return { type: 'tiktok', url, title: 'TikTok видео', description: 'Нажми чтобы открыть', image: null };
      }

      // Generic link preview via CORS proxy
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.contents) return null;

      const parser = new DOMParser();
      const doc = parser.parseFromString(data.contents, 'text/html');
      const getMeta = (property) => {
        const el = doc.querySelector(`meta[property="${property}"],meta[name="${property}"]`);
        return el ? el.getAttribute('content') : null;
      };
      const title = getMeta('og:title') || doc.title || '';
      const description = getMeta('og:description') || getMeta('description') || '';
      const image = getMeta('og:image') || '';
      if (!title && !description) return null;
      const domain = new URL(url).hostname.replace('www.', '');
      return { type: 'generic', url, title, description, image, domain };

    } catch (e) {
      return null;
    }
  },

  // --- Debounce ---
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },

  // --- Avatar ---
  getInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  },

  getAvatarColor(uid) {
    const colors = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4','#ef4444','#84cc16'];
    let hash = 0;
    for (const ch of (uid || '')) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  },

  createAvatarEl(photoURL, name, uid, size = 38) {
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;`;
    if (photoURL) {
      const img = document.createElement('img');
      img.src = photoURL; img.alt = name || '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.onerror = () => { wrap.innerHTML = ''; wrap.appendChild(this._placeholderEl(name, uid, size)); };
      wrap.appendChild(img);
    } else {
      wrap.appendChild(this._placeholderEl(name, uid, size));
    }
    return wrap;
  },

  _placeholderEl(name, uid, size) {
    const el = document.createElement('div');
    el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${this.getAvatarColor(uid)};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${size * 0.35}px;font-weight:700;`;
    el.textContent = this.getInitials(name);
    return el;
  },

  // --- Toast Notifications ---
  toast(message, type = 'default', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // --- Username Validation ---
  validateUsername(username) {
    return /^[a-zA-Z0-9_]{3,24}$/.test(username);
  },

  // --- Copy to Clipboard ---
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast('Скопировано!', 'success');
    } catch {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el);
      el.select(); document.execCommand('copy'); el.remove();
      this.toast('Скопировано!', 'success');
    }
  },

  // --- Scroll ---
  scrollToBottom(el, smooth = false) {
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  },

  isAtBottom(el, threshold = 100) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  },
};

window.Utils = Utils;
