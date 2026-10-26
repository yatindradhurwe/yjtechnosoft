const jwt = require('jsonwebtoken');
const { one } = require('../config/db');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET(), { expiresIn: process.env.JWT_EXPIRES || '7d' });
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, SECRET());
    // mobile app tokens only work on /api/mobile/v1 (where device sessions can be revoked)
    if (payload.aud === 'mobile') return res.status(401).json({ message: 'Use the mobile API for this token' });
    const user = await one(
      'SELECT id, name, email, phone, role, employee_id, avatar, status FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user || user.status !== 'active') return res.status(401).json({ message: 'Account disabled or not found' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

/** authorize('admin','hr') – admin always passes */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ message: 'You do not have permission for this action' });
  };
}

const isStaffManager = (user) => ['admin', 'hr'].includes(user.role);

module.exports = { SECRET, signToken, authenticate, authorize, isStaffManager };
