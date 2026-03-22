// ============================================
// POLLS — Опросы в чатах (Nyx)
// ============================================

const Polls = {

  // ---- Render poll in message bubble ----
  renderPoll(msg, isOwn) {
    const poll = msg.poll;
    if (!poll) return null;
    const myUid = window.AppState.currentUser.uid;
    const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || []).length, 0);
    const myVote = poll.options.findIndex(o => (o.votes || []).includes(myUid));
    const voted = myVote !== -1;

    const container = document.createElement('div'); container.className = 'poll-container';
    const question = document.createElement('div'); question.className = 'poll-question'; question.textContent = poll.question;
    container.appendChild(question);

    poll.options.forEach((opt, i) => {
      const votes = (opt.votes || []).length;
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      const isMyVote = myVote === i;

      const optEl = document.createElement('div');
      optEl.className = 'poll-option' + (isMyVote ? ' voted' : '');

      const fill = document.createElement('div'); fill.className = 'poll-option-fill';
      fill.style.width = voted ? pct + '%' : '0%';

      const content = document.createElement('div'); content.className = 'poll-option-content';
      const text = document.createElement('span'); text.className = 'poll-option-text'; text.textContent = opt.text;
      const pctEl = document.createElement('span'); pctEl.className = 'poll-option-pct';
      pctEl.textContent = voted ? pct + '%' : '';

      content.append(text, pctEl);
      optEl.append(fill, content);

      if (!voted) {
        optEl.onclick = () => this.vote(msg.id, i);
      }
      container.appendChild(optEl);
    });

    const meta = document.createElement('div'); meta.className = 'poll-meta';
    meta.textContent = totalVotes + ' голос' + (totalVotes === 1 ? '' : totalVotes < 5 ? 'а' : 'ов') + ' · 📊 Опрос';
    container.appendChild(meta);
    return container;
  },

  // ---- Vote ----
  // Firestore doesn't support arrayUnion on array-indexed nested fields,
  // so we read the full poll, update client-side, write back atomically.
  async vote(messageId, optionIndex) {
    const chatId = window.AppState.currentChatId;
    const myUid = window.AppState.currentUser.uid;
    if (!chatId) return;
    try {
      const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
      await db.runTransaction(async tx => {
        const doc = await tx.get(msgRef);
        if (!doc.exists) return;
        const poll = doc.data().poll;
        if (!poll || !poll.options) return;

        // Check not already voted
        const alreadyVoted = poll.options.some(o => (o.votes || []).includes(myUid));
        if (alreadyVoted) return;

        // Add vote to chosen option
        const updatedOptions = poll.options.map((opt, i) => {
          if (i === optionIndex) {
            return { ...opt, votes: [...(opt.votes || []), myUid] };
          }
          return opt;
        });
        tx.update(msgRef, { 'poll.options': updatedOptions });
      });
    } catch (e) { Utils.toast('Ошибка голосования: ' + e.message, 'error'); }
  },

  // ---- Poll creator UI helpers ----
  addOption() {
    const list = document.getElementById('poll-options-list');
    if (!list) return;
    if (list.children.length >= 6) { Utils.toast('Максимум 6 вариантов', 'error'); return; }
    const wrap = document.createElement('div');
    wrap.className = 'poll-option-input-wrap';
    wrap.innerHTML = `<input type="text" class="poll-option-input" placeholder="Вариант \${list.children.length + 1}"><button class="remove-poll-option" onclick="Polls.removeOption(this)">✕</button>`;
    list.appendChild(wrap);
    wrap.querySelector('input').focus();
  },

  removeOption(btn) {
    const list = document.getElementById('poll-options-list');
    if (!list) return;
    if (list.children.length <= 2) { Utils.toast('Минимум 2 варианта', 'error'); return; }
    btn.closest('.poll-option-input-wrap').remove();
  },

    // ---- Create poll message ----
  async sendPoll(question, options) {
    const chatId = window.AppState.currentChatId;
    const myUid = window.AppState.currentUser.uid;
    const myData = window.AppState.currentUserData;
    if (!chatId || !question.trim() || options.filter(o => o.trim()).length < 2) {
      Utils.toast('Нужен вопрос и минимум 2 варианта', 'error'); return;
    }

    const pollOptions = options.filter(o => o.trim()).map(text => ({ text: text.trim(), votes: [] }));
    const msgData = {
      senderId: myUid,
      senderName: myData.displayName,
      senderPhotoURL: myData.photoURL || null,
      type: 'poll',
      text: '📊 ' + question.trim(),
      poll: { question: question.trim(), options: pollOptions },
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      edited: false, deleted: false,
      readBy: [myUid],
    };

    await db.collection('chats').doc(chatId).collection('messages').add(msgData);
    await db.collection('chats').doc(chatId).update({
      lastMessage: {
        text: '📊 ' + question.trim(),
        type: 'poll',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        senderId: myUid, senderName: myData.displayName,
      },
    });
  },
};

window.Polls = Polls;
