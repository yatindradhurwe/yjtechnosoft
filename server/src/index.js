require('dotenv').config();
// All attendance / invoice dates are local Indian time unless configured otherwise
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
require('./config/urls').normaliseEnvUrls();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { notFound, errorHandler } = require('./middleware/error');
const { UPLOAD_ROOT, privateUploads } = require('./middleware/upload');
const { startCron } = require('./services/cron');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()), credentials: true }));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Private uploads (resumes, HR documents, receipts) require a staff login; everything else is public
app.use('/uploads', privateUploads, express.static(UPLOAD_ROOT, { maxAge: '7d' }));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), { maxAge: '30d' }));

// Health check – open /api/health in the browser to see if the database is connected
app.get('/api/health', async (req, res) => {
  try {
    await require('./config/db').query('SELECT 1 FROM users LIMIT 1');
    res.json({ ok: true, database: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, database: 'error', error: `${e.code || ''} ${e.message}`.trim(), hint: 'Check DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (or DATABASE_URL) and that the user has ALL PRIVILEGES on the database.' });
  }
});
app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/hr', require('./routes/hr'));
app.use('/api/work', require('./routes/work'));
app.use('/api/recruitment', require('./routes/recruitment'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api', require('./routes/settings'));
app.use('/api/admin', require('./routes/crud'));
app.use('/api', notFound);

// Serve the built React app (client/dist) in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(errorHandler);

const PORT = Number(process.env.PORT || 5000);
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24)) {
  console.warn('⚠  Set a long random JWT_SECRET in server/.env before going live.');
}
// Create / upgrade tables automatically – no manual SQL import or admin login needed.
// If MySQL is not reachable yet (e.g. starts after the app), keep retrying every 30s.
async function setupDb(attempt = 1) {
  try {
    await require('../database/seed').setupDatabase({ quiet: true });
    console.log('✔ Database ready');
  } catch (e) {
    console.error(`✖ Database setup failed (attempt ${attempt}): ${e.code || ''} ${e.message}`);
    console.error('  Check DB_HOST / DB_NAME / DB_USER / DB_PASSWORD (or DATABASE_URL) and that the user has ALL PRIVILEGES on the database.');
    if (attempt < 20) setTimeout(() => setupDb(attempt + 1), 30000);
  }
}

async function start() {
  if (process.env.AUTO_SETUP !== '0') await setupDb();
  app.listen(PORT, () => {
    console.log(`YJTechnosoft API running on http://localhost:${PORT}`);
    if (process.env.DISABLE_CRON !== '1') startCron();
  });
}

if (require.main === module) start();

module.exports = app;
