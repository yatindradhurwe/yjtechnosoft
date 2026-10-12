require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const { notFound, errorHandler } = require('./middleware/error');
const { UPLOAD_ROOT } = require('./middleware/upload');
const { startCron } = require('./services/cron');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()), credentials: true }));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Uploaded files (resumes are only reachable through authenticated admin UI links, but kept simple here)
app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '7d' }));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), { maxAge: '30d' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/hr', require('./routes/hr'));
app.use('/api/work', require('./routes/work'));
app.use('/api/recruitment', require('./routes/recruitment'));
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
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`YJTechnosoft API running on http://localhost:${PORT}`);
    if (process.env.DISABLE_CRON !== '1') startCron();
  });
}

module.exports = app;
