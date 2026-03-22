// ============================================
// QR.JS — Styled QR codes + Profile sharing (Nyx)
// ============================================

const QR = {

  APP_URL: '', // filled from config

  // Generate profile URL
  profileUrl(username) {
    const base = window.location.origin + window.location.pathname.replace('index.html', '');
    return `${base}?nyx=@${username}`;
  },

  // Open QR modal for current user
  openMyQR() {
    const data = window.AppState.currentUserData;
    if (!data) return;
    this.showQRModal(data.username, data.displayName, data.photoURL, data.uid, data.greetingMessage || '');
  },

  showQRModal(username, displayName, photoURL, uid, greetingMessage) {
    const existing = document.getElementById('qr-modal');
    if (existing) existing.remove();

    const url = this.profileUrl(username);

    const modal = document.createElement('div');
    modal.id = 'qr-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content" style="max-width:380px;text-align:center;">
        <div class="modal-header">
          <h3>Мой QR-код</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body" style="align-items:center;gap:16px;">
          <p style="font-size:14px;color:var(--text-secondary);">
            Покажи QR-код другу — он отсканирует и сразу напишет тебе
          </p>
          <div id="qr-canvas-wrap" style="
            position:relative;
            background:#fff;
            border-radius:20px;
            padding:20px;
            box-shadow: 0 8px 32px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.15);
            display:inline-block;
          ">
            <div id="qr-canvas"></div>
            <div id="qr-logo" style="
              position:absolute;
              top:50%;left:50%;
              transform:translate(-50%,-50%);
              width:48px;height:48px;
              background:linear-gradient(135deg,#8b5cf6,#ec4899);
              border-radius:12px;
              display:flex;align-items:center;justify-content:center;
              font-size:22px;font-weight:900;color:#fff;
              border:3px solid #fff;
              box-shadow:0 2px 8px rgba(139,92,246,0.4);
              font-family:'Inter',sans-serif;
            ">N</div>
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;">@${Utils.escapeHtml(username || '')}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:2px;">${Utils.escapeHtml(displayName || '')}</div>
          </div>
          <div style="display:flex;gap:8px;width:100%;">
            <button id="copy-profile-link" class="btn btn-secondary" style="flex:1;padding:10px;">
              Скопировать ссылку
            </button>
            <button id="download-qr" class="btn btn-primary" style="flex:1;padding:10px;">
              Сохранить QR
            </button>
          </div>
          <div style="font-size:12px;color:var(--text-muted);word-break:break-all;background:var(--bg-search);padding:8px 12px;border-radius:8px;text-align:left;">
            ${Utils.escapeHtml(url)}
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector('.modal-overlay').onclick = () => modal.remove();
    modal.querySelector('.modal-close').onclick = () => modal.remove();

    // Generate QR
    this.generateQR('qr-canvas', url);

    modal.querySelector('#copy-profile-link').onclick = () => Utils.copyToClipboard(url);
    modal.querySelector('#download-qr').onclick = () => this.downloadQR(username);
  },

  generateQR(containerId, url) {
    if (typeof QRCode === 'undefined') {
      document.getElementById(containerId).innerHTML =
        '<div style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;color:#888;font-size:13px;">QR недоступен</div>';
      return;
    }
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    new QRCode(container, {
      text: url,
      width: 180,
      height: 180,
      colorDark: '#1a0a3a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H, // High error correction for logo overlay
    });
    // Style the QR image
    setTimeout(() => {
      const img = container.querySelector('img');
      if (img) { img.style.borderRadius = '8px'; img.style.display = 'block'; }
      const canvas = container.querySelector('canvas');
      if (canvas) { canvas.style.borderRadius = '8px'; }
    }, 100);
  },

  downloadQR(username) {
    const canvas = document.querySelector('#qr-canvas canvas');
    if (!canvas) { Utils.toast('QR не готов', 'error'); return; }
    const link = document.createElement('a');
    link.download = `nyx-@${username || 'profile'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  },

  // Handle incoming ?nyx=@username URL param
  async handleIncomingLink() {
    const params = new URLSearchParams(window.location.search);
    const nyxParam = params.get('nyx');
    if (!nyxParam) return;

    // Clean URL
    history.replaceState(null, '', location.pathname);

    if (nyxParam.startsWith('@')) {
      const username = nyxParam.slice(1).toLowerCase();
      window.AppState.pendingProfileOpen = username;
    }
  },

  async openPendingProfile() {
    const username = window.AppState.pendingProfileOpen;
    if (!username) return;
    window.AppState.pendingProfileOpen = null;

    try {
      const snap = await db.collection('usernames').doc(username).get();
      if (!snap.exists) { Utils.toast(`Пользователь @${username} не найден`, 'error'); return; }
      const uid = snap.data().uid;
      await Profile.openUserProfile(uid, true); // true = from QR link
    } catch (e) {
      Utils.toast('Ошибка открытия профиля', 'error');
    }
  },
};

window.QR = QR;
