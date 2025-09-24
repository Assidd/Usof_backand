'use strict';

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { ensureUploadDir, isAllowedMime } = require('../utils/files');

// на всякий случай убеждаемся, что папка есть
ensureUploadDir();

// куда пишем: env.UPLOADS_DIR (или UPLOAD_DIR) из .env
const DEST = env.UPLOADS_DIR || env.UPLOAD_DIR || 'src/uploads';

// имя файла: <rand>_<timestamp>.<ext>
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DEST),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `${crypto.randomBytes(12).toString('hex')}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

// фильтр по MIME
function fileFilter(req, file, cb) {
  if (isAllowedMime(file.mimetype)) return cb(null, true);
  const err = new Error('Unsupported file type');
  err.status = 400;
  cb(err);
}

// лимиты
const limits = {
  fileSize: Number(env.MAX_UPLOAD_SIZE_MB || 5) * 1024 * 1024,
  files: 1,
};

const upload = multer({ storage, fileFilter, limits });

// хелппер под одно изображение
function singleImage(field = 'image') {
  return upload.single(field);
}

module.exports = { singleImage };
