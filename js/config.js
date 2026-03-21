// ============================================
// КОНФИГУРАЦИЯ — вставь сюда свои ключи
// ============================================

// 🔥 Firebase — скопируй из Firebase Console → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "AIzaSyDXvtgGSgEkPTSlghPzLL_PyFC2MVpVAVE",
  authDomain: "my-messenger-b2f6e.firebaseapp.com",
  projectId: "my-messenger-b2f6e",
  storageBucket: "my-messenger-b2f6e.firebasestorage.app",
  messagingSenderId: "964983478248",
  appId: "1:964983478248:web:d156bc692bce9729c9f65d"
};

// 🖼 ImgBB — бесплатный хостинг картинок
// Получи ключ за 1 минуту: https://api.imgbb.com/
// (Нажми "Get API key" → зарегистрируйся → скопируй ключ)
const IMGBB_API_KEY = "e813322e890332b8fec68a0a9cd4292d";

// ============================================

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Firestore settings
db.settings({ ignoreUndefinedProperties: true });

// Super Admin emails — эти аккаунты имеют полный доступ
const SUPER_ADMIN_EMAILS = [
  "maksmlrd@gmail.com",
  "maxxxxwww@gmail.com"
];

console.log("✅ Firebase initialized");
