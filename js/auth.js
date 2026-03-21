// ============================================
// AUTH — Аутентификация
// ============================================

const Auth = {

  async loginWithEmail(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  },

  async registerWithEmail(email, password, displayName, username) {
    // Validate username uniqueness
    username = username.replace(/^@/, '').toLowerCase();
    if (!Utils.validateUsername(username)) {
      throw new Error('Username: только латиница, цифры и _, от 3 до 24 символов');
    }

    const usernameDoc = await db.collection('usernames').doc(username).get();
    if (usernameDoc.exists) {
      throw new Error('Этот @username уже занят. Выбери другой.');
    }

    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // Reserve username
    const batch = db.batch();
    batch.set(db.collection('usernames').doc(username), { uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });

    // Create user document
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
    batch.set(db.collection('users').doc(uid), {
      uid,
      email: email.toLowerCase(),
      displayName: displayName.trim() || email.split('@')[0],
      username,
      photoURL: null,
      bio: '',
      customStatus: '',
      status: 'online',
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      superAdmin: isSuperAdmin,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Update Firebase Auth display name
    await cred.user.updateProfile({ displayName: displayName.trim() });

    return cred;
  },

  async loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    const uid = user.uid;

    // Check if user already exists
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      // First time Google login — create profile
      let username = (user.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '_');
      // Ensure unique username
      let suffix = 0;
      let finalUsername = username;
      while (true) {
        const u = await db.collection('usernames').doc(finalUsername).get();
        if (!u.exists) break;
        suffix++;
        finalUsername = username + suffix;
      }

      const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase());
      const batch = db.batch();
      batch.set(db.collection('usernames').doc(finalUsername), { uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      batch.set(db.collection('users').doc(uid), {
        uid,
        email: user.email.toLowerCase(),
        displayName: user.displayName || user.email.split('@')[0],
        username: finalUsername,
        photoURL: user.photoURL || null,
        bio: '',
        customStatus: '',
        status: 'online',
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        superAdmin: isSuperAdmin,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await batch.commit();
    } else {
      // Update online status
      await db.collection('users').doc(uid).update({
        status: 'online',
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    return result;
  },

  async logout() {
    if (window.AppState && window.AppState.currentUser) {
      try {
        await db.collection('users').doc(window.AppState.currentUser.uid).update({
          status: 'offline',
          lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        });
      } catch {}
    }
    // Unsubscribe all listeners
    if (window.AppState) {
      Object.values(window.AppState.unsubscribers || {}).forEach(fn => { try { fn(); } catch {} });
    }
    await auth.signOut();
  },

  setupOnlineStatus(uid) {
    // Mark online when tab visible, offline when hidden
    const setOnline = () => db.collection('users').doc(uid).update({ status: 'online', lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
    const setOffline = () => db.collection('users').doc(uid).update({ status: 'offline', lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});

    setOnline();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) setOffline(); else setOnline();
    });
    window.addEventListener('beforeunload', setOffline);
    window.addEventListener('focus', setOnline);
    window.addEventListener('blur', setOffline);
  },

  showError(message) {
    const el = document.getElementById('auth-error');
    el.textContent = message; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 5000);
  },

  clearError() {
    const el = document.getElementById('auth-error');
    el.classList.remove('show');
  },

  getErrorMessage(code) {
    const messages = {
      'auth/user-not-found': 'Пользователь с таким email не найден',
      'auth/wrong-password': 'Неверный пароль',
      'auth/email-already-in-use': 'Этот email уже зарегистрирован',
      'auth/invalid-email': 'Неверный формат email',
      'auth/weak-password': 'Пароль слишком слабый (минимум 6 символов)',
      'auth/too-many-requests': 'Слишком много попыток. Попробуй позже.',
      'auth/network-request-failed': 'Ошибка сети. Проверь интернет-соединение.',
      'auth/popup-closed-by-user': 'Окно входа было закрыто',
    };
    return messages[code] || 'Произошла ошибка. Попробуй снова.';
  },
};

window.Auth = Auth;
