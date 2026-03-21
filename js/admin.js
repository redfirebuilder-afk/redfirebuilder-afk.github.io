// ============================================
// ADMIN — Супер-админ возможности
// ============================================

const Admin = {

  isSuperAdmin() {
    return window.AppState.currentUserData && window.AppState.currentUserData.superAdmin === true;
  },

  async banUser(uid, displayName) {
    if (!this.isSuperAdmin()) return;
    if (!confirm(`Забанить ${displayName}? Пользователь потеряет доступ.`)) return;
    try {
      await db.collection('users').doc(uid).update({
        banned: true,
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
        bannedBy: window.AppState.currentUser.uid,
      });
      // Remove from all shared chats
      Utils.toast(`${displayName} забанен`, 'success');
    } catch (e) {
      Utils.toast('Ошибка бана: ' + e.message, 'error');
    }
  },

  async unbanUser(uid, displayName) {
    if (!this.isSuperAdmin()) return;
    try {
      await db.collection('users').doc(uid).update({ banned: false });
      Utils.toast(`${displayName} разбанен`, 'success');
    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
    }
  },

  // Super admin can delete any message and still see its contents
  async superDeleteMessage(messageId, chatId) {
    if (!this.isSuperAdmin()) return;
    try {
      await db.collection('chats').doc(chatId).collection('messages').doc(messageId).update({
        deletedBySuperAdmin: true,
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      Utils.toast('Сообщение удалено (Admin)', 'success');
    } catch (e) {
      Utils.toast('Ошибка: ' + e.message, 'error');
    }
  },

  // Check if user is banned on auth
  async checkBanned(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists && doc.data().banned) {
      await Auth.logout();
      Utils.toast('Ваш аккаунт заблокирован', 'error');
      return true;
    }
    return false;
  },
};

window.Admin = Admin;
