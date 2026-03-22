// ============================================
// THEMES — Кастомные темы чатов + .tnyx (Nyx)
// ============================================

const Themes = {

  presets: [
    { id: 'violet', label: 'Violet', gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#8b5cf6' },
    { id: 'ocean',  label: 'Ocean',  gradient: 'linear-gradient(135deg,#3b82f6,#06b6d4)', color: '#3b82f6' },
    { id: 'forest', label: 'Forest', gradient: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#22c55e' },
    { id: 'sunset', label: 'Sunset', gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)', color: '#f59e0b' },
    { id: 'rose',   label: 'Rose',   gradient: 'linear-gradient(135deg,#f43f5e,#fb7185)', color: '#f43f5e' },
    { id: 'midnight',label:'Midnight',gradient:'linear-gradient(135deg,#1e1b4b,#312e81)', color: '#4338ca' },
    { id: 'cosmic', label: 'Cosmic', gradient: 'linear-gradient(135deg,#7c3aed,#2563eb)', color: '#7c3aed' },
    { id: 'mint',   label: 'Mint',   gradient: 'linear-gradient(135deg,#10b981,#6ee7b7)', color: '#10b981' },
  ],

  // ---- Preset chat themes (saved to Firestore per chat) ----

  applyTheme(theme) {
    if (!theme || !theme.color) { this.removePresetTheme(); return; }
    this._injectStyle(
      `#chat-theme-style`,
      `.message-wrapper.own .message-bubble { background: ${theme.gradient} !important; }`
    );
  },

  removePresetTheme() {
    const s = document.getElementById('chat-theme-style');
    if (s) s.remove();
    // Don't touch global tnyx theme
  },

  async saveTheme(chatId, themeId) {
    const theme = this.presets.find(t => t.id === themeId) || null;
    await db.collection('chats').doc(chatId).update({ theme: theme || null });
    if (theme) this.applyTheme(theme);
    else this.removePresetTheme();
    Utils.toast(theme ? `Тема «${theme.label}» применена` : 'Тема сброшена', 'success');
  },

  loadForChat(chat) {
    if (chat && chat.theme) this.applyTheme(chat.theme);
    else this.removePresetTheme();
  },

  renderPicker(chatId, currentThemeId) {
    const grid = document.createElement('div');
    grid.className = 'theme-picker-grid';

    const none = document.createElement('div');
    none.className = 'theme-swatch' + (!currentThemeId ? ' active' : '');
    none.style.cssText = 'background:var(--bg-search);border:2px solid var(--border);position:relative;';
    none.title = 'По умолчанию';
    if (!currentThemeId) none.innerHTML = '<span style="font-size:16px;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">✕</span>';
    none.onclick = () => this.saveTheme(chatId, null);
    grid.appendChild(none);

    this.presets.forEach(t => {
      const swatch = document.createElement('div');
      swatch.className = 'theme-swatch' + (currentThemeId === t.id ? ' active' : '');
      swatch.style.background = t.gradient;
      swatch.title = t.label;
      swatch.onclick = () => this.saveTheme(chatId, t.id);
      grid.appendChild(swatch);
    });
    return grid;
  },

  // ---- .tnyx global theme (applies to whole app) ----

  applyFromObject(t) {
    if (!t) return;

    // Build own bubble background
    const ownBg = t.bubbles?.own?.type === 'gradient'
      ? `linear-gradient(${t.bubbles.own.gradDir || '135deg'}, ${t.bubbles.own.gradFrom || '#8b5cf6'}, ${t.bubbles.own.gradTo || '#ec4899'})`
      : (t.bubbles?.own?.color || 'var(--gradient)');
    const themBg  = t.bubbles?.them?.color     || null;
    const ownText = t.bubbles?.own?.textColor  || '#ffffff';
    const themText= t.bubbles?.them?.textColor || null;
    const radius  = (t.bubbleRadius || 18) + 'px';
    const font    = t.font     || null;
    const fontSize= t.fontSize ? t.fontSize + 'px' : null;

    // Bubble shadow
    const shadowMap = {
      none: 'none',
      sm:   '0 1px 4px rgba(0,0,0,0.12)',
      md:   '0 3px 12px rgba(0,0,0,0.22)',
      glow: `0 0 16px ${t.bubbles?.own?.gradFrom || '#8b5cf6'}55`,
    };
    const shadow = shadowMap[t.animations?.bubbleShadow || 'sm'] || shadowMap.sm;

    // Message appear animation
    const animKeyframes = {
      bounce: '@keyframes _nyxMsg{from{opacity:0;transform:scale(0.82) translateY(10px)}to{opacity:1;transform:none}}',
      slide:  '@keyframes _nyxMsg{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}',
      fade:   '@keyframes _nyxMsg{from{opacity:0}to{opacity:1}}',
      scale:  '@keyframes _nyxMsg{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:none}}',
      none:   '',
    };
    const animSpeed = { fast: '150ms', normal: '250ms', slow: '400ms' };
    const anim = t.animations?.msgAnimation || 'bounce';
    const speed = animSpeed[t.animations?.speed || 'normal'];
    const animRule = anim !== 'none'
      ? `${animKeyframes[anim] || animKeyframes.bounce} .message-bubble{animation:_nyxMsg ${speed} cubic-bezier(0.34,1.4,0.64,1)!important;}`
      : '';

    const css = [
      `.message-wrapper.own .message-bubble{background:${ownBg}!important;color:${ownText}!important;border-radius:${radius} ${radius} 4px ${radius}!important;box-shadow:${shadow}!important;}`,
      themBg  ? `.message-wrapper:not(.own) .message-bubble{background:${themBg}!important;}` : '',
      themText? `.message-wrapper:not(.own) .message-bubble{color:${themText}!important;}`      : '',
      font    ? `.messages-container,.message-bubble{font-family:${font}!important;}`           : '',
      fontSize? `.message-bubble .msg-text{font-size:${fontSize}!important;}`                   : '',
      `.send-btn{background:${ownBg}!important;}`,
      animRule,
    ].join('\n');

    this._injectStyle('tnyx-theme-style', css);

    // Chat background
    const chatArea = document.getElementById('chat-area');
    if (chatArea && t.chatBg) {
      const bg = t.chatBg;
      if (bg.type === 'gradient' && bg.gradFrom && bg.gradTo) {
        chatArea.style.background = `linear-gradient(${bg.gradDir || '135deg'}, ${bg.gradFrom}, ${bg.gradTo})`;
      } else if (bg.color) {
        chatArea.style.background = bg.color;
      }
    }

    // Background image overlay
    if (t.bgImage) {
      const opacity = ((t.bgImageOpacity || 60) / 100).toFixed(2);
      this._injectStyle('tnyx-bg-img-style', `
        #chat-area::after {
          content: '';
          position: absolute; inset: 0;
          background: url('${t.bgImage}') center/cover;
          opacity: ${opacity};
          pointer-events: none;
          z-index: 0;
        }
      `);
    } else {
      const s = document.getElementById('tnyx-bg-img-style');
      if (s) s.remove();
    }

    // Header blur toggle
    if (t.animations?.headerBlur === false) {
      this._injectStyle('tnyx-header-style', '.chat-header,.message-input-area,.sidebar-header{backdrop-filter:none!important;}');
    }

    localStorage.setItem('nyx-custom-theme', JSON.stringify(t));
    Utils.toast(`Тема «${t.name || 'Custom'}» применена ✓`, 'success');
  },

  removeTnyxTheme() {
    ['tnyx-theme-style','tnyx-bg-img-style','tnyx-header-style'].forEach(id => {
      const s = document.getElementById(id); if (s) s.remove();
    });
    const chatArea = document.getElementById('chat-area');
    if (chatArea) chatArea.style.removeProperty('background');
    localStorage.removeItem('nyx-custom-theme');
    Utils.toast('Тема сброшена', 'default');
  },

  // Load saved .tnyx theme from localStorage on startup
  loadSavedTnyxTheme() {
    try {
      const saved = localStorage.getItem('nyx-custom-theme');
      if (saved) this.applyFromObject(JSON.parse(saved));
    } catch {}
  },

  // ---- Helper ----
  _injectStyle(id, css) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = css;
  },
};

window.Themes = Themes;
