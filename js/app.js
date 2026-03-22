// ============================================
// APP.JS — Nyx Messenger (main)
// ============================================

window.AppState = {
  currentUser: null, currentUserData: null,
  currentChatId: null, currentChatData: null,
  userCache: {}, unsubscribers: {},
  sidebarTab: 'chats',
};

const App = {

  async init() {
    this.setupTheme();
    this.setupEventListeners();
    Upload.setupDragDrop();
    this.setupPWA();

    const hash = location.hash;
    if (hash.startsWith('#invite=')) {
      window.AppState.pendingInviteCode = hash.replace('#invite=', '');
      history.replaceState(null, '', location.pathname);
    }

    auth.onAuthStateChanged(async user => {
      if (user) await this.onLogin(user);
      else { this.showScreen('auth-screen'); this.hideLoading(); }
    });
  },

  async onLogin(user) {
    window.AppState.currentUser = user;
    if (await Admin.checkBanned(user.uid)) return;
    const userData = await Profile.loadMyProfile();
    if (!userData) { await Auth.logout(); return; }
    Auth.setupOnlineStatus(user.uid);
    Profile.updateSidebarAvatar();
    await Notifications.init();
    Chats.subscribeChatList();
    this.showScreen('app-screen');
    this.hideLoading();

    // Show admin button for superadmins
    if (userData.superAdmin) {
      document.getElementById('admin-panel-btn').style.display = '';
    }

    // Load user settings
    const userSettings = await Settings.load();

    // Apply saved .tnyx theme
    Themes.loadSavedTnyxTheme();
    window.AppState.userSettings = userSettings;

    // Handle incoming profile link (?nyx=@username)
    await QR.handleIncomingLink();

    // Handle theme from URL (?applytheme=...)
    this.handleApplyTheme();

    // Subscribe to broadcasts
    this.subscribeBroadcasts();

    if (window.AppState.pendingInviteCode) {
      const code = window.AppState.pendingInviteCode;
      window.AppState.pendingInviteCode = null;
      await Chats.joinViaInviteCode(code);
    }
  },

  handleApplyTheme() {
    const params = new URLSearchParams(window.location.search);
    const themeData = params.get('applytheme');
    if (!themeData) return;
    history.replaceState(null, '', location.pathname);
    try {
      const t = JSON.parse(decodeURIComponent(atob(themeData)));
      // Store theme for current session
      window.AppState.customTheme = t;
      // Show banner
      const banner = document.createElement('div');
      banner.className = 'theme-apply-banner';
      banner.innerHTML = `
        <div>
          <div style="font-size:14px;font-weight:700;">Тема «${Utils.escapeHtml(t.name || 'Без названия')}»</div>
          <div style="font-size:12px;color:var(--text-muted);">Открыта из Theme Editor</div>
        </div>
        <button class="btn btn-primary" style="width:auto;padding:8px 16px;font-size:13px;" id="apply-theme-confirm">Применить</button>
        <button class="icon-btn" id="apply-theme-dismiss">✕</button>`;
      document.body.appendChild(banner);
      document.getElementById('apply-theme-confirm').onclick = () => {
        Themes.applyFromObject(t);
        banner.remove();
        Utils.toast('Тема применена!', 'success');
      };
      document.getElementById('apply-theme-dismiss').onclick = () => banner.remove();
    } catch {}
  },

  subscribeBroadcasts() {
    db.collection('broadcasts').orderBy('sentAt', 'desc').limit(1)
      .onSnapshot(snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const age = data.sentAt ? Date.now() - data.sentAt.toMillis() : 9999999;
            if (age < 10000) Utils.toast('📡 ' + data.text, 'default', 6000);
          }
        });
      }, () => {});
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  },

  hideLoading() {
    const el = document.getElementById('loading-screen');
    el.classList.add('hidden');
    setTimeout(() => el.style.display = 'none', 350);
  },

  openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  },

  closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  },

  openLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    this.openModal('lightbox-modal');
  },

  // Sidebar tab switch
  switchSidebarTab(tab) {
    window.AppState.sidebarTab = tab;
  },

  // Theme
  setupTheme() {
    const saved = localStorage.getItem('nyx-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nyx-theme', theme);
    const moon = document.getElementById('theme-icon-moon');
    const sun = document.getElementById('theme-icon-sun');
    if (moon) moon.style.display = theme === 'dark' ? 'none' : 'block';
    if (sun) sun.style.display = theme === 'dark' ? 'block' : 'none';
  },

  toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    this.applyTheme(cur === 'dark' ? 'light' : 'dark');
  },

  // PWA
  setupPWA() {
    let deferred;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); deferred = e;
      document.getElementById('pwa-install-btn').classList.add('show');
    });
    document.getElementById('pwa-install-btn').onclick = async () => {
      if (!deferred) return;
      document.getElementById('pwa-install-btn').classList.remove('show');
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') Utils.toast('Nyx установлен! 🎉', 'success');
    };
  },

  // Poll submit

  // Context menu for messages
  showMessageContextMenu(e, msg, isOwn, isSuperAdmin) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';
    const chatId = window.AppState.currentChatId;
    const chat = window.AppState.currentChatData;
    const myUid = window.AppState.currentUser.uid;
    const myRole = chat?.memberRoles?.[myUid];
    const canManage = myRole === 'owner' || myRole === 'admin' || isSuperAdmin;
    const isDeleted = msg.deleted;

    const add = (icon, text, fn, danger = false) => {
      const item = document.createElement('div');
      item.className = 'context-item' + (danger ? ' danger' : '');
      item.innerHTML = `<span class="context-icon">${icon}</span>${text}`;
      item.onclick = () => { menu.classList.add('hidden'); fn(); };
      menu.appendChild(item);
    };

    if (!isDeleted) {
      add('↩', 'Ответить', () => Messages.setReply(msg));
      if (msg.text) add('⎘', 'Копировать', () => Utils.copyToClipboard(msg.text));
      add('→', 'Переслать', () => Messages.openForwardModal(msg));
      add('⚑', 'Пожаловаться', () => Reports.open('message', msg.id, msg.senderName || 'Пользователь', msg.id));
      if (isOwn && msg.type !== 'image' && msg.type !== 'gif' && msg.type !== 'poll') {
        add('✏️', 'Редактировать', () => Messages.startEditMessage(msg));
      }
      if (isOwn || canManage) {
        const div = document.createElement('div'); div.className = 'context-divider'; menu.appendChild(div);
        add('🗑', isOwn ? 'Удалить' : 'Удалить (Admin)', () => {
          if (isSuperAdmin && !isOwn) Admin.superDeleteMessage(msg.id, chatId);
          else Messages.deleteMessage(msg.id);
        }, true);
      }
      if (canManage || isSuperAdmin) {
        const isPinned = chat?.pinnedMessage?.messageId === msg.id;
        add('📌', isPinned ? 'Открепить' : 'Закрепить', () => {
          if (isPinned) Chats.unpinMessage(chatId); else Chats.pinMessage(chatId, msg);
        });
      }
    } else if (isSuperAdmin && msg.text) {
      add('📋', 'Копировать (Admin)', () => Utils.copyToClipboard(msg.text));
    }

    const x = Math.min(e.clientX, window.innerWidth - 210);
    const y = Math.min(e.clientY, window.innerHeight - menu.scrollHeight - 10);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.classList.remove('hidden');
  },

  // Handle send (also edit mode)
  async handleSend() {
    const input = document.getElementById('message-input');
    if (Messages._editingMessageId) {
      const text = input.value.trim();
      if (text) {
        await Messages.editMessage(Messages._editingMessageId, text);
        input.value = ''; input.style.height = 'auto';
        Messages.clearReply(); Messages.updateSendBtn();
      }
    } else {
      await Messages.sendMessage();
    }
  },

  // New Chat Modal setup
  setupNewChatModal() {
    const dmInput = document.getElementById('dm-search-input');
    const dmResults = document.getElementById('dm-search-results');
    dmInput.value = ''; dmResults.innerHTML = '';
    dmInput.oninput = Utils.debounce(async () => {
      const q = dmInput.value.trim();
      if (q.length < 2) { dmResults.innerHTML = ''; return; }
      const users = await Profile.searchUsers(q);
      dmResults.innerHTML = '';
      if (!users.length) { dmResults.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:14px;">Не найдено</div>'; return; }
      users.forEach(u => dmResults.appendChild(Profile.renderUserResult(u, async () => { await Chats.openOrCreateDM(u.uid, u); })));
    }, 400);

    window._selectedGroupMembers = [];
    const groupInput = document.getElementById('group-search-input');
    const groupResults = document.getElementById('group-search-results');
    const selectedEl = document.getElementById('selected-members');
    groupInput.value = ''; groupResults.innerHTML = ''; selectedEl.innerHTML = '';
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-avatar-preview').innerHTML = '📷';

    groupInput.oninput = Utils.debounce(async () => {
      const q = groupInput.value.trim();
      if (q.length < 2) { this.renderGroupContactSuggestions(groupResults, selectedEl); return; }
      const users = await Profile.searchUsers(q);
      groupResults.innerHTML = '';
      users.forEach(u => {
        if (window._selectedGroupMembers.some(s => s.uid === u.uid)) return;
        groupResults.appendChild(Profile.renderUserResult(u, () => {
          window._selectedGroupMembers.push(u);
          groupResults.innerHTML = ''; groupInput.value = '';
          this.renderGroupContactSuggestions(groupResults, selectedEl);
          this.renderSelectedMembers(selectedEl);
        }));
      });
    }, 400);

    this.renderGroupContactSuggestions(groupResults, selectedEl);
    document.getElementById('invite-code-input').value = '';
  },

  renderGroupContactSuggestions(container, selectedEl) {
    const myUid = window.AppState.currentUser.uid;
    const dmChats = Chats.allChats.filter(c => c.type === 'dm');
    container.innerHTML = '';
    if (!dmChats.length) return;
    const label = document.createElement('div'); label.className = 'section-label'; label.textContent = 'Контакты';
    container.appendChild(label);
    dmChats.forEach(chat => {
      const partnerUid = chat.members.find(m => m !== myUid);
      if (!partnerUid) return;
      if ((window._selectedGroupMembers || []).some(s => s.uid === partnerUid)) return;
      const userData = window.AppState.userCache[partnerUid];
      if (!userData) { Chats.fetchAndCacheUser(partnerUid).then(() => this.renderGroupContactSuggestions(container, selectedEl)); return; }
      container.appendChild(Profile.renderUserResult(userData, () => {
        window._selectedGroupMembers.push(userData);
        this.renderGroupContactSuggestions(container, selectedEl);
        this.renderSelectedMembers(selectedEl);
      }));
    });
  },

  renderSelectedMembers(container) {
    container.innerHTML = '';
    (window._selectedGroupMembers || []).forEach((u, i) => {
      const chip = document.createElement('div'); chip.className = 'member-chip';
      chip.innerHTML = `${Utils.escapeHtml(u.displayName)} <button>✕</button>`;
      chip.querySelector('button').onclick = () => { window._selectedGroupMembers.splice(i, 1); this.renderSelectedMembers(container); };
      container.appendChild(chip);
    });
  },

  // All event listeners
  setupEventListeners() {

    // Load .tnyx theme file
    document.getElementById('load-tnyx-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const theme = JSON.parse(ev.target.result);
          Themes.applyFromObject(theme);
        } catch (err) {
          Utils.toast('Ошибка: неверный формат .tnyx файла', 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = ''; // allow re-selecting same file
    });

    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-form').classList.add('active');
        Auth.clearError();
      };
    });

    document.getElementById('login-btn').onclick = async () => {
      const email = document.getElementById('login-email').value.trim();
      const pass = document.getElementById('login-password').value;
      if (!email || !pass) { Auth.showError('Заполни все поля'); return; }
      document.getElementById('login-btn').textContent = 'Входим...';
      try { await Auth.loginWithEmail(email, pass); }
      catch (e) { Auth.showError(Auth.getErrorMessage(e.code)); document.getElementById('login-btn').textContent = 'Войти'; }
    };

    document.getElementById('register-btn').onclick = async () => {
      const name = document.getElementById('reg-name').value.trim();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const pass = document.getElementById('reg-password').value;
      if (!name || !username || !email || !pass) { Auth.showError('Заполни все поля'); return; }
      document.getElementById('register-btn').textContent = 'Создаём...';
      try { await Auth.registerWithEmail(email, pass, name, username); }
      catch (e) { Auth.showError(e.message || Auth.getErrorMessage(e.code)); document.getElementById('register-btn').textContent = 'Создать аккаунт'; }
    };

    document.getElementById('google-login-btn').onclick = async () => { try { await Auth.loginWithGoogle(); } catch (e) { Auth.showError(Auth.getErrorMessage(e.code)); } };
    document.getElementById('google-register-btn').onclick = async () => { try { await Auth.loginWithGoogle(); } catch (e) { Auth.showError(Auth.getErrorMessage(e.code)); } };

    ['login-email','login-password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-btn').click(); });
    });

    document.getElementById('logout-btn').onclick = async () => { if (confirm('Выйти?')) { await Auth.logout(); this.showScreen('auth-screen'); } };

    document.getElementById('clear-cache-btn').onclick = async () => {
      try {
        if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
        window.AppState.userCache = {};
        Utils.toast('Кэш очищен! Перезагрузка...', 'success');
        setTimeout(() => location.reload(), 1500);
      } catch (e) { Utils.toast('Ошибка: ' + e.message, 'error'); }
    };

    document.getElementById('my-profile-btn').onclick = () => Profile.openMyProfileModal();
    document.getElementById('save-profile-btn').onclick = () => Profile.saveMyProfile();
    document.getElementById('change-avatar-btn').onclick = () => document.getElementById('avatar-input').click();
    document.addEventListener('change', e => { if (e.target.id === 'avatar-input') Profile.changeAvatar(e.target.files[0]); });

    document.getElementById('theme-toggle-btn').onclick = () => this.toggleTheme();
    document.getElementById('settings-btn').onclick = () => Settings.open();

    document.getElementById('search-input').addEventListener('input', Utils.debounce(e => {
      const q = e.target.value.trim();
      Chats.filterChatList(q);
    }, 300));

    document.getElementById('new-chat-btn').onclick = () => {
      this.openModal('new-chat-modal');
      this.setupNewChatModal();
    };

    document.querySelectorAll('#new-chat-modal .modal-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('#new-chat-modal .modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#new-chat-modal .modal-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
      };
    });


    // Chat search
    document.getElementById('search-messages-btn').onclick = () => {
      const bar = document.getElementById('chat-search-bar');
      bar.classList.toggle('hidden');
      if (!bar.classList.contains('hidden')) document.getElementById('chat-search-input').focus();
    };
    document.getElementById('close-search-btn').onclick = () => { document.getElementById('chat-search-bar').classList.add('hidden'); document.getElementById('chat-search-input').value = ''; };
    document.getElementById('chat-search-input').addEventListener('input', Utils.debounce(e => { if (e.target.value.trim().length >= 2) Messages.highlightSearch(e.target.value.trim()); }, 400));

    document.getElementById('chat-info-btn').onclick = () => Chats.openChatInfo();
    document.getElementById('chat-header-info').onclick = () => Chats.openChatInfo();

    // Message input
    const msgInput = document.getElementById('message-input');
    msgInput.addEventListener('input', () => {
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 150) + 'px';
      Messages.updateSendBtn(); Messages.handleTypingInput();
    });
    msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSend(); } });
    document.getElementById('send-btn').onclick = () => this.handleSend();
    document.getElementById('file-input').onchange = e => { Upload.handleFileSelect(e.target.files); e.target.value = ''; };
    document.getElementById('cancel-reply-btn').onclick = () => Messages.clearReply();


    // Back button
    document.getElementById('back-btn').onclick = () => {
      document.getElementById('sidebar').classList.remove('hidden-mobile');
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('welcome-screen').style.display = '';
      window.AppState.currentChatId = null;
      Themes.removeTheme();
      ['messages','typing'].forEach(k => { if (window.AppState.unsubscribers[k]) { window.AppState.unsubscribers[k](); delete window.AppState.unsubscribers[k]; } });
    };

    document.getElementById('pinned-bar').onclick = () => {
      const chat = window.AppState.currentChatData;
      if (chat?.pinnedMessage?.messageId) Messages.scrollToMessage(chat.pinnedMessage.messageId);
    };

    // Join invite
    document.getElementById('join-invite-btn').onclick = () => {
      const code = document.getElementById('invite-code-input').value.trim();
      if (!code) { Utils.toast('Введи код', 'error'); return; }
      Chats.joinViaInviteCode(code);
    };

    // Create group
    document.getElementById('create-group-btn').onclick = () => {
      const name = document.getElementById('group-name-input').value;
      const selected = window._selectedGroupMembers || [];
      const avatarFile = document.getElementById('group-avatar-input').files[0] || null;
      Chats.createGroup(name, selected.map(u => u.uid), avatarFile);
    };

    document.getElementById('group-avatar-input').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const prev = document.getElementById('group-avatar-preview');
      const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
      prev.innerHTML = ''; prev.appendChild(img);
    };
    document.getElementById('group-avatar-preview').onclick = () => document.getElementById('group-avatar-input').click();

    document.getElementById('forward-search-input').oninput = e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#forward-chat-list .user-result').forEach(el => { el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    };

    // Close modals
    document.querySelectorAll('.modal').forEach(modal => {
      modal.querySelector('.modal-overlay')?.addEventListener('click', () => this.closeModal(modal.id));
      modal.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal(modal.id));
    });

    // Close context menu on click outside
    document.addEventListener('click', e => {
      const menu = document.getElementById('context-menu');
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.getElementById('context-menu').classList.add('hidden');
document.getElementById('poll-creator').classList.add('hidden');
        const modals = [...document.querySelectorAll('.modal:not(.hidden)')];
        if (modals.length) this.closeModal(modals[modals.length - 1].id);
      }
    });

    // Group avatar section
    document.getElementById('group-avatar-section').addEventListener('click', e => {
      if (e.target === document.getElementById('group-avatar-preview') || e.target.closest('#group-avatar-preview')) {
        document.getElementById('group-avatar-input').click();
      }
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
