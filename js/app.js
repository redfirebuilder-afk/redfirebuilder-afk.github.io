// ============================================
// APP — Главный файл: инициализация, события
// ============================================

window.AppState = {
  currentUser: null,
  currentUserData: null,
  currentChatId: null,
  currentChatData: null,
  userCache: {},
  unsubscribers: {},
};

const App = {

  // ---- Bootstrap ----
  async init() {
    this.setupTheme();
    this.setupEventListeners();
    Upload.setupDragDrop();
    this.setupPWA();

    // Check for invite code in URL hash
    const hash = location.hash;
    if (hash.startsWith('#invite=')) {
      window.AppState.pendingInviteCode = hash.replace('#invite=', '');
      history.replaceState(null, '', location.pathname);
    }

    // Auth state listener
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        await this.onLogin(user);
      } else {
        this.showScreen('auth-screen');
        this.hideLoading();
      }
    });
  },

  async onLogin(user) {
    window.AppState.currentUser = user;

    // Check banned
    if (await Admin.checkBanned(user.uid)) return;

    // Load user profile
    const userData = await Profile.loadMyProfile();
    if (!userData) {
      // No profile doc found (shouldn't happen) — logout
      await Auth.logout();
      return;
    }

    // Update online status
    Auth.setupOnlineStatus(user.uid);

    // Update sidebar avatar
    Profile.updateSidebarAvatar();

    // Init notifications
    await Notifications.init();

    // Subscribe to chats
    Chats.subscribeChatList();

    // Show app
    this.showScreen('app-screen');
    this.hideLoading();

    // Handle pending invite code
    if (window.AppState.pendingInviteCode) {
      const code = window.AppState.pendingInviteCode;
      window.AppState.pendingInviteCode = null;
      await Chats.joinViaInviteCode(code);
    }
  },

  // ---- Screens ----
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
  },

  hideLoading() {
    const el = document.getElementById('loading-screen');
    el.classList.add('hidden');
    setTimeout(() => { el.style.display = 'none'; }, 300);
  },

  // ---- Modals ----
  openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.body.style.overflow = '';
  },

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.body.style.overflow = '';
  },

  openLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    this.openModal('lightbox-modal');
  },

  // ---- Theme ----
  setupTheme() {
    const saved = localStorage.getItem('messenger-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    this.applyTheme(theme);
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('messenger-theme', theme);
    document.getElementById('theme-toggle-btn').textContent = theme === 'dark' ? '☀️' : '🌙';
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    this.applyTheme(current === 'dark' ? 'light' : 'dark');
  },

  // ---- PWA ----
  setupPWA() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const btn = document.getElementById('pwa-install-btn');
      btn.classList.add('show');
      btn.addEventListener('click', async () => {
        btn.classList.remove('show');
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome === 'accepted') Utils.toast('Приложение установлено! 🎉', 'success');
      });
    });
  },

  // ---- Context Menu ----
  showMessageContextMenu(e, msg, isOwn, isSuperAdmin) {
    const menu = document.getElementById('context-menu');
    menu.innerHTML = '';

    const myUid = window.AppState.currentUser.uid;
    const chatId = window.AppState.currentChatId;
    const chat = window.AppState.currentChatData;
    const myRole = chat && chat.memberRoles && chat.memberRoles[myUid];
    const canManage = myRole === 'owner' || myRole === 'admin' || isSuperAdmin;
    const isDeleted = msg.deleted;

    const addItem = (icon, text, action, danger = false) => {
      const item = document.createElement('div');
      item.className = 'context-item' + (danger ? ' danger' : '');
      item.innerHTML = `<span class="context-icon">${icon}</span>${text}`;
      item.onclick = () => { menu.classList.add('hidden'); action(); };
      menu.appendChild(item);
    };

    if (!isDeleted) {
      addItem('😊', 'Реакция', (ev) => this.showReactionPicker(e, msg));
      addItem('↩️', 'Ответить', () => Messages.setReply(msg));
      if (msg.text) addItem('📋', 'Копировать', () => Utils.copyToClipboard(msg.text));
      addItem('➡️', 'Переслать', () => Messages.openForwardModal(msg));

      if (isOwn) {
        if (msg.type !== 'image') addItem('✏️', 'Редактировать', () => Messages.startEditMessage(msg));
        addItem('🗑', 'Удалить', () => this.confirmDeleteMessage(msg, chatId), true);
      }

      if (!isOwn && (canManage || isSuperAdmin)) {
        const divider = document.createElement('div'); divider.className = 'context-divider'; menu.appendChild(divider);
        addItem('🗑', 'Удалить (Admin)', () => {
          if (isSuperAdmin) Admin.superDeleteMessage(msg.id, chatId);
          else Messages.deleteMessage(msg.id);
        }, true);
      }

      if (canManage || isSuperAdmin) {
        const isPinned = chat && chat.pinnedMessage && chat.pinnedMessage.messageId === msg.id;
        addItem(isPinned ? '📌' : '📌', isPinned ? 'Открепить' : 'Закрепить', () => {
          if (isPinned) Chats.unpinMessage(chatId); else Chats.pinMessage(chatId, msg);
        });
      }
    } else if (isSuperAdmin) {
      addItem('📋', 'Копировать (SuperAdmin)', () => Utils.copyToClipboard(msg.text || ''));
    }

    // Position
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - menu.scrollHeight - 10);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.classList.remove('hidden');
  },

  confirmDeleteMessage(msg, chatId) {
    const isOwn = msg.senderId === window.AppState.currentUser.uid;
    if (isOwn) {
      if (confirm('Удалить сообщение для всех?')) {
        Messages.deleteMessage(msg.id, true);
      }
    } else {
      Messages.deleteMessage(msg.id, true);
    }
  },

  showReactionPicker(e, msg) {
    const picker = document.getElementById('reaction-picker');
    picker.classList.remove('hidden');
    const x = Math.min(e.clientX, window.innerWidth - 320);
    const y = Math.max(e.clientY - 70, 10);
    picker.style.left = x + 'px'; picker.style.top = y + 'px';
    picker.dataset.messageId = msg.id;
    picker.dataset.chatId = window.AppState.currentChatId;

    // Store msg ref
    picker._msg = msg;
    document.getElementById('context-menu').classList.add('hidden');
  },

  // ---- Event Listeners ----
  setupEventListeners() {
    // Auth tabs
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-form').classList.add('active');
        Auth.clearError();
      });
    });

    // Login
    document.getElementById('login-btn').addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!email || !password) { Auth.showError('Заполни все поля'); return; }
      try {
        document.getElementById('login-btn').textContent = 'Входим...';
        await Auth.loginWithEmail(email, password);
      } catch (e) {
        Auth.showError(Auth.getErrorMessage(e.code));
        document.getElementById('login-btn').textContent = 'Войти';
      }
    });

    // Register
    document.getElementById('register-btn').addEventListener('click', async () => {
      const name = document.getElementById('reg-name').value.trim();
      const username = document.getElementById('reg-username').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      if (!name || !username || !email || !password) { Auth.showError('Заполни все поля'); return; }
      try {
        document.getElementById('register-btn').textContent = 'Регистрируем...';
        await Auth.registerWithEmail(email, password, name, username);
      } catch (e) {
        Auth.showError(e.message || Auth.getErrorMessage(e.code));
        document.getElementById('register-btn').textContent = 'Зарегистрироваться';
      }
    });

    // Google Auth
    document.getElementById('google-login-btn').addEventListener('click', async () => {
      try { await Auth.loginWithGoogle(); } catch (e) { Auth.showError(Auth.getErrorMessage(e.code)); }
    });
    document.getElementById('google-register-btn').addEventListener('click', async () => {
      try { await Auth.loginWithGoogle(); } catch (e) { Auth.showError(Auth.getErrorMessage(e.code)); }
    });

    // Enter key on auth inputs
    ['login-email','login-password'].forEach(id => {
      document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-btn').click(); });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      if (confirm('Выйти из аккаунта?')) {
        await Auth.logout();
        this.showScreen('auth-screen');
      }
    });

    // My profile
    document.getElementById('my-profile-btn').addEventListener('click', () => Profile.openMyProfileModal());
    document.getElementById('save-profile-btn').addEventListener('click', () => Profile.saveMyProfile());
    document.getElementById('change-avatar-btn').addEventListener('click', () => {
      document.getElementById('avatar-input').click();
    });
    document.addEventListener('change', (e) => {
      if (e.target.id === 'avatar-input') Profile.changeAvatar(e.target.files[0]);
    });

    // Theme toggle
    document.getElementById('theme-toggle-btn').addEventListener('click', () => this.toggleTheme());

    // Sidebar search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', Utils.debounce(async (e) => {
      const q = e.target.value.trim();
      if (!q) { Chats.renderChatList(Chats.allChats); return; }
      Chats.filterChatList(q);
      // Also search users
      if (q.length >= 2) {
        const users = await Profile.searchUsers(q);
        // Show user results below filtered chats
        // (simplified: just filter chats for now)
      }
    }, 300));

    // New chat button
    document.getElementById('new-chat-btn').addEventListener('click', () => {
      this.openModal('new-chat-modal');
      this.setupNewChatModal();
    });

    // New chat modal tabs
    document.querySelectorAll('#new-chat-modal .modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#new-chat-modal .modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#new-chat-modal .modal-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
      });
    });

    // Chat search in chat
    document.getElementById('search-messages-btn').addEventListener('click', () => {
      const bar = document.getElementById('chat-search-bar');
      bar.classList.toggle('hidden');
      if (!bar.classList.contains('hidden')) document.getElementById('chat-search-input').focus();
    });
    document.getElementById('close-search-btn').addEventListener('click', () => {
      document.getElementById('chat-search-bar').classList.add('hidden');
      document.getElementById('chat-search-input').value = '';
    });
    document.getElementById('chat-search-input').addEventListener('input', Utils.debounce((e) => {
      const q = e.target.value.trim();
      if (q.length >= 2) Messages.highlightSearch(q);
    }, 400));

    // Chat info
    document.getElementById('chat-info-btn').addEventListener('click', () => Chats.openChatInfo());
    document.getElementById('chat-header-info').addEventListener('click', () => Chats.openChatInfo());

    // Message input
    const msgInput = document.getElementById('message-input');
    msgInput.addEventListener('input', () => {
      // Auto-resize textarea
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 150) + 'px';
      Messages.updateSendBtn();
      Messages.handleTypingInput();
    });
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Send button
    document.getElementById('send-btn').addEventListener('click', () => this.handleSend());

    // File input
    document.getElementById('file-input').addEventListener('change', (e) => {
      Upload.handleFileSelect(e.target.files);
      e.target.value = '';
    });

    // Cancel reply
    document.getElementById('cancel-reply-btn').addEventListener('click', () => Messages.clearReply());

    // Back button (mobile)
    document.getElementById('back-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('hidden-mobile');
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('welcome-screen').style.display = '';
      window.AppState.currentChatId = null;
      if (window.AppState.unsubscribers['messages']) {
        window.AppState.unsubscribers['messages']();
        delete window.AppState.unsubscribers['messages'];
      }
    });

    // Pinned bar click — scroll to pinned message
    document.getElementById('pinned-bar').addEventListener('click', () => {
      const chat = window.AppState.currentChatData;
      if (chat && chat.pinnedMessage && chat.pinnedMessage.messageId) {
        Messages.scrollToMessage(chat.pinnedMessage.messageId);
      }
    });

    // Reaction picker
    document.getElementById('reaction-picker').addEventListener('click', (e) => {
      const option = e.target.closest('.reaction-option');
      if (option) {
        const emoji = option.dataset.emoji;
        const picker = document.getElementById('reaction-picker');
        const msg = picker._msg;
        if (msg) Messages.toggleReaction(msg, emoji);
        picker.classList.add('hidden');
      }
    });

    // Invite join button
    document.getElementById('join-invite-btn').addEventListener('click', () => {
      const code = document.getElementById('invite-code-input').value.trim();
      if (!code) { Utils.toast('Введи код', 'error'); return; }
      Chats.joinViaInviteCode(code);
    });

    // Create group button
    document.getElementById('create-group-btn').addEventListener('click', () => {
      const name = document.getElementById('group-name-input').value;
      const selected = window._selectedGroupMembers || [];
      const avatarInput = document.getElementById('group-avatar-input');
      const avatarFile = avatarInput.files[0] || null;
      Chats.createGroup(name, selected.map(u => u.uid), avatarFile);
    });

    // Group avatar input
    document.getElementById('group-avatar-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const preview = document.getElementById('group-avatar-preview');
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file); img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        preview.innerHTML = ''; preview.appendChild(img);
      }
    });

    document.getElementById('group-avatar-preview').addEventListener('click', () => {
      document.getElementById('group-avatar-input').click();
    });

    // Forward modal search
    document.getElementById('forward-search-input').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('#forward-chat-list .user-result').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Close modals on overlay click or X button
    document.querySelectorAll('.modal').forEach(modal => {
      modal.querySelector('.modal-overlay')?.addEventListener('click', () => this.closeModal(modal.id));
      modal.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal(modal.id));
    });

    // Close context menu & reaction picker on click outside
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('context-menu');
      if (!menu.contains(e.target)) menu.classList.add('hidden');
      const picker = document.getElementById('reaction-picker');
      if (!picker.contains(e.target)) picker.classList.add('hidden');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('context-menu').classList.add('hidden');
        document.getElementById('reaction-picker').classList.add('hidden');
        // Close topmost modal
        const modals = [...document.querySelectorAll('.modal:not(.hidden)')];
        if (modals.length) this.closeModal(modals[modals.length - 1].id);
      }
    });
  },

  // ---- Handle send (normal or edit) ----
  async handleSend() {
    const input = document.getElementById('message-input');
    if (Messages._editingMessageId) {
      // Edit mode
      const text = input.value.trim();
      if (text) {
        await Messages.editMessage(Messages._editingMessageId, text);
        input.value = '';
        input.style.height = 'auto';
        Messages.clearReply();
        Messages.updateSendBtn();
      }
    } else {
      await Messages.sendMessage();
    }
  },

  // ---- New Chat Modal Setup ----
  setupNewChatModal() {
    // DM search
    const dmInput = document.getElementById('dm-search-input');
    const dmResults = document.getElementById('dm-search-results');
    dmInput.value = ''; dmResults.innerHTML = '';
    dmInput.addEventListener('input', Utils.debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { dmResults.innerHTML = ''; return; }
      const users = await Profile.searchUsers(q);
      dmResults.innerHTML = '';
      if (!users.length) {
        dmResults.innerHTML = '<div style="padding:10px;color:var(--text-secondary);font-size:14px;">Пользователи не найдены</div>';
        return;
      }
      users.forEach(u => {
        dmResults.appendChild(Profile.renderUserResult(u, async () => {
          await Chats.openOrCreateDM(u.uid, u);
        }));
      });
    }, 400));

    // Group search
    window._selectedGroupMembers = [];
    const groupInput = document.getElementById('group-search-input');
    const groupResults = document.getElementById('group-search-results');
    const selectedEl = document.getElementById('selected-members');
    groupInput.value = ''; groupResults.innerHTML = ''; selectedEl.innerHTML = '';
    document.getElementById('group-name-input').value = '';
    document.getElementById('group-avatar-preview').innerHTML = '📷<input type="file" id="group-avatar-input" accept="image/*" hidden>';

    groupInput.addEventListener('input', Utils.debounce(async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { groupResults.innerHTML = ''; return; }
      const users = await Profile.searchUsers(q);
      groupResults.innerHTML = '';
      users.forEach(u => {
        const alreadySelected = window._selectedGroupMembers.some(s => s.uid === u.uid);
        if (alreadySelected) return;
        groupResults.appendChild(Profile.renderUserResult(u, () => {
          window._selectedGroupMembers.push(u);
          groupResults.innerHTML = '';
          groupInput.value = '';
          this.renderSelectedMembers(selectedEl);
        }));
      });
    }, 400));

    // Invite tab
    document.getElementById('invite-code-input').value = '';
  },

  renderSelectedMembers(container) {
    container.innerHTML = '';
    (window._selectedGroupMembers || []).forEach((u, i) => {
      const chip = document.createElement('div'); chip.className = 'member-chip';
      chip.innerHTML = `${Utils.escapeHtml(u.displayName)} <button>✕</button>`;
      chip.querySelector('button').onclick = () => {
        window._selectedGroupMembers.splice(i, 1);
        this.renderSelectedMembers(container);
      };
      container.appendChild(chip);
    });
  },
};

// ---- Start App ----
document.addEventListener('DOMContentLoaded', () => App.init());
