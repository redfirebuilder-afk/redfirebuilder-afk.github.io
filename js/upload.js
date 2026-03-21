// ============================================
// UPLOAD — Загрузка фото через ImgBB (бесплатно)
// Документация: https://api.imgbb.com/
// ============================================

const Upload = {

  pendingImages: [], // Files selected but not yet sent

  // ---- Upload one image to ImgBB ----
  async uploadImage(file) {
    if (!IMGBB_API_KEY) {
      throw new Error('Добавь IMGBB_API_KEY в js/config.js');
    }

    // Convert file to base64
    const base64 = await this._fileToBase64(file);

    const formData = new FormData();
    formData.append('image', base64);
    formData.append('key', IMGBB_API_KEY);

    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`ImgBB ошибка: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error?.message || 'Ошибка загрузки в ImgBB');
    }

    // Return the direct image URL
    return data.data.url;
  },

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Strip "data:image/xxx;base64," prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ---- Handle multiple file selection ----
  handleFileSelect(files) {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!fileArray.length) { Utils.toast('Только изображения поддерживаются', 'error'); return; }
    if (fileArray.length > 10) { Utils.toast('Максимум 10 фото за раз', 'error'); return; }

    for (const f of fileArray) {
      if (f.size > 32 * 1024 * 1024) {
        Utils.toast(`${f.name} слишком большой (макс. 32MB для ImgBB)`, 'error');
        return;
      }
    }

    this.pendingImages = fileArray;
    this.renderPendingPreview();
  },

  renderPendingPreview() {
    const previewEl = document.getElementById('img-send-preview');
    previewEl.innerHTML = '';

    if (!this.pendingImages.length) {
      previewEl.classList.add('hidden');
      return;
    }

    previewEl.classList.remove('hidden');
    this.pendingImages.forEach((file, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'img-send-thumb';

      const img = document.createElement('img');
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.onload = () => URL.revokeObjectURL(objectUrl);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-img';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => {
        this.pendingImages.splice(i, 1);
        this.renderPendingPreview();
      };

      thumb.append(img, removeBtn);
      previewEl.appendChild(thumb);
    });

    Messages.updateSendBtn();
  },

  // ---- Upload all pending images, return URLs ----
  async uploadPendingImages() {
    if (!this.pendingImages.length) return [];
    const files = [...this.pendingImages];
    this.pendingImages = [];
    this.renderPendingPreview();

    const urls = [];
    for (const file of files) {
      try {
        Utils.toast(`Загружаю ${urls.length + 1}/${files.length}...`, 'default');
        const url = await this.uploadImage(file);
        urls.push(url);
      } catch (e) {
        Utils.toast(`Ошибка загрузки: ${e.message}`, 'error');
      }
    }
    return urls;
  },

  clearPending() {
    this.pendingImages = [];
    this.renderPendingPreview();
  },

  // ---- Drag & Drop ----
  setupDragDrop() {
    const overlay = document.getElementById('drop-overlay');
    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
      if (!window.AppState.currentChatId) return;
      if ([...e.dataTransfer.items].some(i => i.kind === 'file' && i.type.startsWith('image/'))) {
        dragCounter++;
        overlay.classList.add('active');
      }
    });

    document.addEventListener('dragleave', () => {
      dragCounter--;
      if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
    });

    document.addEventListener('dragover', (e) => { e.preventDefault(); });

    document.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.remove('active');
      if (!window.AppState.currentChatId) return;
      const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
      if (files.length) this.handleFileSelect(files);
    });
  },
};

window.Upload = Upload;
