# 📖 Инструкция по настройке

## Содержание
1. [Быстрый старт — вставить ключи](#1-быстрый-старт)
2. [Создание Firebase проекта](#2-создание-firebase-проекта)
3. [Получение Firebase ключей](#3-получение-firebase-ключей)
4. [Настройка Authentication](#4-настройка-authentication)
5. [Настройка Firestore](#5-настройка-firestore)
6. [Получение ImgBB ключа](#6-imgbb-ключ-для-загрузки-фото)
7. [Security Rules (обязательно!)](#7-security-rules)
8. [Деплой на GitHub Pages](#8-деплой-на-github-pages)
9. [FAQ](#9-faq)

---

## 1. Быстрый старт

После того как получишь все ключи (шаги 2–6), открой файл `js/config.js` и вставь:

```javascript
const firebaseConfig = {
  apiKey: "сюда",
  authDomain: "сюда",
  projectId: "сюда",
  storageBucket: "сюда",
  messagingSenderId: "сюда",
  appId: "сюда"
};

const IMGBB_API_KEY = "сюда";
```

Сохрани файл → запусти `python serve.py` → готово.

---

## 2. Создание Firebase проекта

1. Открой [https://console.firebase.google.com](https://console.firebase.google.com)
2. Нажми **"Add project"**
3. Введи название, например: `my-messenger`
4. Google Analytics — можно отключить (не нужна)
5. Нажми **"Create project"** → дождись (~30 сек)

---

## 3. Получение Firebase ключей

1. В левом меню нажми **шестерёнку ⚙️** → **Project settings**
2. Прокрути вниз до **"Your apps"**
3. Нажми значок **`</>`** (Web app)
4. Введи любое название приложения, например `messenger-web`
5. **НЕ включай Firebase Hosting** (используем GitHub Pages)
6. Нажми **"Register app"**
7. Скопируй объект `firebaseConfig` — вставь значения в `js/config.js`

---

## 4. Настройка Authentication

### Email/Password
1. **Authentication** → **Sign-in method**
2. Нажми **Email/Password** → включи → **Save**

### Google OAuth
1. Там же нажми **Google** → включи
2. Укажи **Project support email** (твой email) → **Save**

### Авторизованные домены
1. **Authentication** → **Settings** → **Authorized domains**
2. Домен `localhost` уже есть. После деплоя добавь: `твойник.github.io`

---

## 5. Настройка Firestore

1. **Firestore Database** → **"Create database"**
2. Выбери **"Start in production mode"** ← ВАЖНО
3. Регион: `eur3 (Europe)` или ближайший к тебе
4. Нажми **"Done"**

> ⚠️ Firebase Storage **не нужен** — фотографии хранятся на ImgBB (бесплатно).

---

## 6. ImgBB ключ для загрузки фото

ImgBB — бесплатный хостинг изображений. Лимит: 32MB на файл, хранение навсегда.

1. Открой [https://api.imgbb.com/](https://api.imgbb.com/)
2. Нажми **"Get API key"**
3. Зарегистрируйся (email или соцсети)
4. После входа ты сразу на странице с API ключом — скопируй его
5. Вставь в `js/config.js`:
   ```javascript
   const IMGBB_API_KEY = "твой_ключ_здесь";
   ```

Это единственный ключ кроме Firebase. Больше ничего не нужно — Storage Firebase не используется.

---

## 7. Security Rules

**Обязательно!** Без правил Firestore отклонит все запросы.

### Firestore Rules

**Firestore** → **Rules** → вставь и нажми **"Publish"**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Профили пользователей
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth.uid == userId;
      allow update: if request.auth.uid == userId
        || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.superAdmin == true;
    }

    // Username резервирование
    match /usernames/{username} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow delete: if request.auth != null
        && resource.data.uid == request.auth.uid;
    }

    // Чаты
    match /chats/{chatId} {
      allow read: if request.auth != null
        && request.auth.uid in resource.data.members;
      allow create: if request.auth != null
        && request.auth.uid in request.resource.data.members;
      allow update: if request.auth != null
        && request.auth.uid in resource.data.members;

      // Сообщения
      match /messages/{messageId} {
        allow read: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members;
        allow create: if request.auth != null
          && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members
          && request.resource.data.senderId == request.auth.uid;
        allow update: if request.auth != null
          && (
            resource.data.senderId == request.auth.uid
            || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.superAdmin == true
          );
        allow delete: if false;
      }
    }

    // Индикатор "печатает..."
    match /typing/{chatId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

### Firestore Индексы

Firebase может попросить создать составной индекс — ссылка появится в консоли браузера (F12 → Console) как кликабельный URL. Просто открой её и нажми "Create".

Или создай вручную: **Firestore → Indexes → Add index**
- Collection: `chats`
- Fields: `members` (Array), `lastMessage.timestamp` (Descending)

---

## 8. Деплой на GitHub Pages

1. Создай репозиторий на GitHub
2. Загрузи все файлы проекта (с заполненным `js/config.js`)
3. В терминале:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВОй_НИК/РЕПО.git
git push -u origin main
```
4. На GitHub: **Settings → Pages → Source: main branch → Save**

Сайт будет по адресу: `https://ТВОй_НИК.github.io/РЕПО/`

> Не забудь добавить `ТВОй_НИК.github.io` в **Firebase → Authentication → Authorized domains**!

### Обновление в будущем
```bash
git add .
git commit -m "Update"
git push
```

---

## 9. FAQ

**Q: Сколько стоит ImgBB?**  
A: Бесплатно. Бесплатный план: неограниченное хранение, 32MB на файл, без дополнительных требований.

**Q: Firebase Storage нужен?**  
A: Нет. Этот проект намеренно не использует Firebase Storage — только Firestore (база данных) и Authentication. Фото хранятся на ImgBB.

**Q: "Permission denied" в консоли?**  
A: Проверь что Security Rules опубликованы. **Firestore → Rules → Monitor** покажет что именно блокируется.

**Q: Google OAuth не работает на localhost?**  
A: Попробуй добавить `localhost` в Firebase → Authentication → Authorized domains. Или тестируй через email/password.

**Q: Лимиты бесплатного Firebase (Spark plan)?**  
A: 1GB Firestore, 50K чтений/день, 20K записей/день, 10GB трафика/месяц. Для личного мессенджера более чем достаточно.

**Q: Супер-админ не работает?**  
A: Убедись что зарегистрировался именно с `maksmlrd@gmail.com` или `maxxxxwww@gmail.com`. Флаг `superAdmin: true` ставится автоматически при регистрации с этих email-ов.

**Q: Как посмотреть данные в базе?**  
A: **Firebase Console → Firestore → Data** — всё дерево данных видно там.
