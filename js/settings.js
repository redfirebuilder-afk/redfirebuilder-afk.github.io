// ============================================
// SETTINGS — Расширенные настройки (Nyx)
// ============================================

const Settings = {

  DEFAULTS: {
    greetingMessage: 'Привет! Нашёл тебя в Nyx 👋',
    notifySound: true,
    notifyBadge: true,
    notifyTyping: true,
    enterToSend: true,
    fontSize: 'medium',
    compactMode: false,
    showLastSeen: true,
    allowStrangerDM: true,
    language: 'ru',
  },

  async load() {
    const uid = window.AppState.currentUser?.uid;
    if (!uid) return this.DEFAULTS;
    try {
      const doc = await db.collection('settings').doc(uid).get();
      return doc.exists ? { ...this.DEFAULTS, ...doc.data() } : this.DEFAULTS;
    } catch { return this.DEFAULTS; }
  },

  async save(key, value) {
    const uid = window.AppState.currentUser?.uid;
    if (!uid) return;
    await db.collection('settings').doc(uid).set({ [key]: value }, { merge: true });
    if (window.AppState.userSettings) window.AppState.userSettings[key] = value;
  },

  async open() {
    const settings = await this.load();
    window.AppState.userSettings = settings;

    const existing = document.getElementById('settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content" style="max-width:480px;">
        <div class="modal-header">
          <h3>Настройки</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body" style="gap:0;padding:0;">
          <!-- Settings tabs -->
          <div style="display:flex;border-bottom:1px solid var(--border);padding:0 16px;gap:0;">
            ${['Основные','Уведомления','Приватность','Интерфейс'].map((t,i) =>
              `<button class="settings-tab ${i===0?'active':''}" data-tab="${i}" style="padding:12px 16px;font-size:13.5px;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;transition:all 0.15s;cursor:pointer;background:none;border-left:none;border-right:none;border-top:none;font-family:var(--font);">${t}</button>`
            ).join('')}
          </div>
          <div style="padding:20px;display:flex;flex-direction:column;gap:0;" id="settings-content">
          </div>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector('.modal-overlay').onclick = () => modal.remove();
    modal.querySelector('.modal-close').onclick = () => modal.remove();

    modal.querySelectorAll('.settings-tab').forEach(tab => {
      tab.onclick = () => {
        modal.querySelectorAll('.settings-tab').forEach(t => {
          t.style.color = 'var(--text-muted)';
          t.style.borderBottomColor = 'transparent';
        });
        tab.style.color = 'var(--violet)';
        tab.style.borderBottomColor = 'var(--violet)';
        this.renderTab(parseInt(tab.dataset.tab), settings, modal.querySelector('#settings-content'));
      };
    });
    modal.querySelectorAll('.settings-tab')[0].style.color = 'var(--violet)';
    modal.querySelectorAll('.settings-tab')[0].style.borderBottomColor = 'var(--violet)';
    this.renderTab(0, settings, modal.querySelector('#settings-content'));
  },

  renderTab(tabIndex, settings, container) {
    container.innerHTML = '';
    const tabs = [
      () => this.renderGeneral(settings, container),
      () => this.renderNotifications(settings, container),
      () => this.renderPrivacy(settings, container),
      () => this.renderInterface(settings, container),
    ];
    tabs[tabIndex]?.();
  },

  _row(label, desc, control) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border-light);gap:12px;';
    const left = document.createElement('div');
    left.style.flex = '1';
    left.innerHTML = `<div style="font-size:14.5px;font-weight:600;">${label}</div>${desc ? `<div style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">${desc}</div>` : ''}`;
    row.append(left, control);
    return row;
  },

  _toggle(key, value, settings) {
    const label = document.createElement('label');
    label.style.cssText = 'position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;flex-shrink:0;';
    label.innerHTML = `
      <input type="checkbox" ${value ? 'checked' : ''} style="opacity:0;width:0;height:0;">
      <span style="position:absolute;inset:0;border-radius:24px;background:${value ? 'var(--violet)' : 'var(--border)'};transition:0.2s;"></span>
      <span style="position:absolute;top:3px;left:${value ? '22px' : '3px'};width:18px;height:18px;border-radius:50%;background:#fff;transition:0.2s;box-shadow:0 1px 4px rgba(0,0,0,0.2);"></span>`;
    const input = label.querySelector('input');
    const track = label.querySelectorAll('span')[0];
    const thumb = label.querySelectorAll('span')[1];
    input.onchange = async () => {
      const v = input.checked;
      track.style.background = v ? 'var(--violet)' : 'var(--border)';
      thumb.style.left = v ? '22px' : '3px';
      await this.save(key, v);
      if (settings) settings[key] = v;
    };
    return label;
  },

  renderGeneral(settings, container) {
    // Greeting message
    const greetingRow = document.createElement('div');
    greetingRow.style.cssText = 'padding:14px 0;border-bottom:1px solid var(--border-light);';
    greetingRow.innerHTML = `
      <div style="font-size:14.5px;font-weight:600;margin-bottom:4px;">Приветственное сообщение</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">Отправляется при переходе по твоей ссылке или QR-коду</div>
      <textarea id="greeting-msg-input" class="input-field" rows="2" style="resize:none;font-size:14px;">${Utils.escapeHtml(settings.greetingMessage || '')}</textarea>
      <button id="save-greeting-btn" class="btn btn-primary" style="margin-top:8px;padding:9px;font-size:13px;">Сохранить</button>`;
    container.appendChild(greetingRow);
    container.querySelector('#save-greeting-btn').onclick = async () => {
      const val = container.querySelector('#greeting-msg-input').value.trim();
      await this.save('greetingMessage', val);
      // Also save to user profile
      await db.collection('users').doc(window.AppState.currentUser.uid).update({ greetingMessage: val });
      window.AppState.currentUserData.greetingMessage = val;
      Utils.toast('Сообщение сохранено', 'success');
    };

    // QR code button
    const qrRow = this._row('Мой QR-код', 'Поделись кодом для быстрого добавления в контакты', (() => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'width:auto;padding:8px 16px;font-size:13px;flex-shrink:0;';
      btn.textContent = 'Открыть QR';
      btn.onclick = () => { document.getElementById('settings-modal').remove(); QR.openMyQR(); };
      return btn;
    })());
    container.appendChild(qrRow);

    // Share profile link
    const shareRow = this._row('Ссылка на профиль', 'Скопируй и поделись в других мессенджерах', (() => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'width:auto;padding:8px 16px;font-size:13px;flex-shrink:0;';
      btn.textContent = 'Скопировать';
      btn.onclick = () => {
        const u = window.AppState.currentUserData;
        if (u?.username) Utils.copyToClipboard(QR.profileUrl(u.username));
      };
      return btn;
    })());
    container.appendChild(shareRow);
  },

  renderNotifications(settings, container) {
    container.appendChild(this._row('Звуковые уведомления', 'Звук при новом сообщении', this._toggle('notifySound', settings.notifySound, settings)));
    container.appendChild(this._row('Счётчик непрочитанных', 'Бейдж на вкладке браузера', this._toggle('notifyBadge', settings.notifyBadge, settings)));
    container.appendChild(this._row('"Печатает..."', 'Показывать индикатор набора текста', this._toggle('notifyTyping', settings.notifyTyping, settings)));
  },

  renderPrivacy(settings, container) {
    container.appendChild(this._row('Показывать "был онлайн"', 'Другие видят время последнего визита', this._toggle('showLastSeen', settings.showLastSeen, settings)));
    container.appendChild(this._row('Личные сообщения от незнакомых', 'Разрешить писать пользователям не из контактов', this._toggle('allowStrangerDM', settings.allowStrangerDM, settings)));
  },

  renderInterface(settings, container) {
    container.appendChild(this._row('Enter для отправки', 'Enter отправляет, Shift+Enter — перенос строки', this._toggle('enterToSend', settings.enterToSend, settings)));
    container.appendChild(this._row('Компактный режим', 'Уменьшенные отступы и аватарки', this._toggle('compactMode', settings.compactMode, settings)));

    // Font size select
    const fontRow = this._row('Размер шрифта', 'Размер текста в сообщениях', (() => {
      const sel = document.createElement('select');
      sel.style.cssText = 'background:var(--bg-search);border:1.5px solid var(--border);border-radius:var(--r-sm);padding:7px 10px;font-size:13px;color:var(--text-primary);font-family:var(--font);cursor:pointer;';
      ['small','medium','large'].forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = {small:'Маленький',medium:'Средний',large:'Большой'}[v];
        if (settings.fontSize === v) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = async () => {
        await this.save('fontSize', sel.value);
        document.documentElement.style.setProperty('--msg-font-size', {small:'13px',medium:'15px',large:'17px'}[sel.value]);
      };
      return sel;
    })());
    container.appendChild(fontRow);

    // Theme editor link
    const themeRow = this._row('Редактор тем', 'Создай свою тему оформления', (() => {
      const btn = document.createElement('a');
      btn.href = 'theme-editor.html';
      btn.target = '_blank';
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'width:auto;padding:8px 16px;font-size:13px;flex-shrink:0;text-decoration:none;';
      btn.textContent = 'Открыть редактор';
      return btn;
    })());
    container.appendChild(themeRow);
  },
};

window.Settings = Settings;
