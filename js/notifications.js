// ============================================
// NOTIFICATIONS — Уведомления
// ============================================

const Notifications = {

  permissionGranted: false,
  audioCtx: null,

  async init() {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        this.permissionGranted = true;
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        this.permissionGranted = perm === 'granted';
      }
    }
  },

  show(title, body, icon, chatId) {
    if (!this.permissionGranted || document.hasFocus()) return;
    const n = new Notification(title, {
      body: Utils.truncate(body, 80),
      icon: icon || 'assets/icon-192.png',
      tag: chatId,
      renotify: true,
    });
    n.onclick = () => {
      window.focus();
      if (chatId) Chats.openChat(chatId);
      n.close();
    };
    setTimeout(() => n.close(), 8000);
  },

  playSound() {
    try {
      if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  },

  updateTabTitle(unreadTotal) {
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal}) Messenger`;
    } else {
      document.title = 'Messenger';
    }
  },

  updateFavicon(hasUnread) {
    // Simple approach: the browser title shows the count
    this.updateTabTitle(hasUnread);
  },
};

window.Notifications = Notifications;
