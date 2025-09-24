const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'src/uploads';
const ALLOWED = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp').split(',');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function isAllowedMime(mime) {
  return ALLOWED.includes(mime);
}

// helper для формирования публичного URL, если статика смонтирована как app.use('/uploads', express.static(UPLOAD_DIR))
function toPublicUrl(localFilePath) {
  // ожидаем, что localFilePath внутри UPLOAD_DIR
  const basename = localFilePath.replace(/\\/g, '/').split('/').slice(-1)[0];
  return `/uploads/${basename}`;
}

module.exports = { ensureUploadDir, isAllowedMime, toPublicUrl };
