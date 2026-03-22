// ============================================
// REPORTS — Система жалоб (Nyx)
// ============================================

const Reports = {

  REASONS: [
    'Спам',
    'Оскорбления / харасмент',
    'Неприемлемый контент',
    'Мошенничество / обман',
    'Распространение личных данных',
    'Нарушение правил сообщества',
    'Другое',
  ],

  // Open report dialog
  open(targetType, targetId, targetName, messageId = null) {
    const existing = document.getElementById('report-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'report-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content" style="max-width:400px;">
        <div class="modal-header">
          <h3>Пожаловаться</h3>
          <button class="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:14px;color:var(--text-secondary);margin-bottom:4px;">
            Жалоба на: <strong>${Utils.escapeHtml(targetName)}</strong>
          </p>
          <div class="section-label">Причина</div>
          <div id="report-reasons" style="display:flex;flex-direction:column;gap:6px;">
            ${this.REASONS.map((r, i) => `
              <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);border:1.5px solid var(--border);cursor:pointer;transition:all var(--t);"
                onmouseover="this.style.borderColor='var(--violet)'" onmouseout="this.style.borderColor='var(--border)'">
                <input type="radio" name="report-reason" value="${r}" style="accent-color:var(--violet);">
                <span style="font-size:14px;">${r}</span>
              </label>`).join('')}
          </div>
          <textarea id="report-comment" class="input-field" placeholder="Дополнительный комментарий (необязательно)..." rows="3" style="resize:none;"></textarea>
          <button id="submit-report-btn" class="btn btn-primary">Отправить жалобу</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector('.modal-overlay').onclick = () => modal.remove();
    modal.querySelector('.modal-close').onclick = () => modal.remove();
    modal.querySelector('#submit-report-btn').onclick = () => this.submit(targetType, targetId, targetName, messageId, modal);
  },

  async submit(targetType, targetId, targetName, messageId, modal) {
    const reasonEl = modal.querySelector('input[name="report-reason"]:checked');
    if (!reasonEl) { Utils.toast('Выбери причину', 'error'); return; }
    const reason = reasonEl.value;
    const comment = modal.querySelector('#report-comment').value.trim();
    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;

    const btn = modal.querySelector('#submit-report-btn');
    btn.textContent = 'Отправляем...'; btn.disabled = true;

    try {
      // Get context (last messages if chat report)
      let context = null;
      if (messageId && window.AppState.currentChatId) {
        try {
          const msgs = await db.collection('chats').doc(window.AppState.currentChatId)
            .collection('messages').orderBy('timestamp', 'desc').limit(10).get();
          context = msgs.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
        } catch {}
      }

      await db.collection('reports').add({
        targetType,      // 'message' | 'user' | 'group' | 'channel' | 'bot'
        targetId,
        targetName,
        messageId: messageId || null,
        chatId: window.AppState.currentChatId || null,
        reason,
        comment: comment || null,
        reporterId: myUid,
        reporterName: myData?.displayName || 'Пользователь',
        context: context || null,
        status: 'pending',  // pending | reviewed | resolved | dismissed
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      modal.remove();
      Utils.toast('Жалоба отправлена. Модераторы рассмотрят её в ближайшее время.', 'success', 4000);
    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
      btn.textContent = 'Отправить жалобу'; btn.disabled = false;
    }
  },
};

window.Reports = Reports;
