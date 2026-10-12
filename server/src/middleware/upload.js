const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];
const DOC_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.zip'];

function makeUploader(folder = 'misc', { maxMb = 10, allow = [...IMAGE_EXT, ...DOC_EXT] } = {}) {
  const dir = path.join(UPLOAD_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path
        .basename(file.originalname, ext)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${base}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allow.includes(ext)) return cb(new Error(`File type ${ext} is not allowed`));
      cb(null, true);
    },
  });
}

const fileUrl = (folder, file) => (file ? `/uploads/${folder}/${file.filename}` : null);

module.exports = { makeUploader, fileUrl, UPLOAD_ROOT, IMAGE_EXT, DOC_EXT };
