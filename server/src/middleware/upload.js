const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// SVG is intentionally excluded – it can carry scripts
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico'];
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

const PRIVATE_FOLDERS = ['resumes', 'documents', 'receipts', 'vault'];

/** Blocks anonymous access to private upload folders (token via ?token= or Authorization header) */
function privateUploads(req, res, next) {
  const folder = req.path.split('/')[1];
  if (!PRIVATE_FOLDERS.includes(folder)) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  try {
    const payload = jwt.verify(token || '', process.env.JWT_SECRET || 'dev-secret-change-me');
    if (['admin', 'hr', 'accounts'].includes(payload.role)) return next();
  } catch (e) {
    /* fall through */
  }
  return res.status(403).send('Forbidden');
}

module.exports = { makeUploader, fileUrl, privateUploads, PRIVATE_FOLDERS, UPLOAD_ROOT, IMAGE_EXT, DOC_EXT };
