# 💬 Messenger

> Приватный мессенджер — Firebase (Auth + Firestore) + ImgBB (фото) + GitHub Pages

## ✨ Возможности

| Функция | Детали |
|---|---|
| 💬 Чаты | Личные переписки + групповые чаты |
| 📷 Медиа | Отправка фото (хранение на ImgBB), превью ссылок YouTube/TikTok |
| 😊 Реакции | 8 эмодзи-реакций на сообщения |
| ↩️ Reply | Ответ на конкретное сообщение |
| ✏️ Редактирование | Изменение отправленного сообщения |
| 🗑 Удаление | Удаление для всех |
| ➡️ Пересылка | Переслать в другой чат |
| 📌 Закреп | Закреплённые сообщения в чате |
| 🔗 Инвайт | Ссылки-приглашения для групп |
| 👥 Роли | Владелец / Админ / Участник |
| 🔍 Поиск | Поиск по сообщениям |
| 🟢 Статусы | Онлайн/офлайн, "печатает...", кастомный статус |
| ✓✓ Прочтение | Галочки прочтения |
| 🌙 Темы | Светлая и тёмная тема |
| 📲 PWA | Установка на телефон как приложение |
| ⚡ Super Admin | Полный доступ (2 email-а захардкожены) |

## 🚀 Настройка (2 ключа)

Открой `js/config.js` и вставь:

```javascript
// 1. Из Firebase Console → Project Settings → Your apps
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  // ...
};

// 2. Из https://api.imgbb.com/ (бесплатно, 1 минута)
const IMGBB_API_KEY = "...";
```

> 📖 Подробные инструкции: [INSTRUCTIONS.md](INSTRUCTIONS.md)

## 🏃 Запуск

```bash
python serve.py   # открывает localhost:8080
```

## 🏗 Структура

```
messenger-app/
├── index.html          ← SPA
├── css/style.css       ← дизайн (Telegram-стиль, тёмная тема)
├── js/
│   ├── config.js       ← 👈 СЮДА ВСТАВЛЯЙ КЛЮЧИ
│   ├── auth.js         ← email/password + Google OAuth
│   ├── chats.js        ← чаты, группы, роли, инвайты
│   ├── messages.js     ← сообщения, реакции, reply, forward
│   ├── upload.js       ← загрузка фото через ImgBB API
│   └── ...
├── serve.py            ← локальный сервер
├── INSTRUCTIONS.md     ← пошаговая инструкция
└── README.md
```

## 🛠 Стек

- **Frontend**: Vanilla JS + CSS3 (без фреймворков)
- **База данных**: Firebase Firestore
- **Авторизация**: Firebase Auth
- **Фото**: ImgBB (бесплатный хостинг)
- **Хостинг**: GitHub Pages
- **PWA**: Service Worker

## ⚡ Super Admin

Аккаунты `maksmlrd@gmail.com` и `maxxxxwww@gmail.com` автоматически получают права супер-администратора.
