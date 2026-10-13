const jwt = require('jsonwebtoken');
const { one } = require('../config/db');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET(), { expiresIn: process.env.JWT_EXPIRES || '7d' });
}

async function loadUser(req, res, next, { allowCustomer }) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, SECRET());
    const user = await one(
      'SELECT id, name, email, phone, role, employee_id, avatar, status FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user || user.status !== 'active') return res.status(401).json({ message: 'Account disabled or not found' });
    req.user = user;
  } catch (e) {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
  // Profile-builder customers never reach staff, HR or billing routes
  if (!allowCustomer && req.user.role === 'customer') return res.status(403).json({ message: 'This area is for staff only' });
  next();
}

/** Staff login (admin, hr, accounts, employee) */
const authenticate = (req, res, next) => loadUser(req, res, next, { allowCustomer: false });
/** Any signed-in user, including profile-builder customers */
const authenticateAny = (req, res, next) => loadUser(req, res, next, { allowCustomer: true });

/** authorize('admin','hr') – admin always passes */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ message: 'You do not have permission for this action' });
  };
}

const isStaffManager = (user) => ['admin', 'hr'].includes(user.role);

module.exports = { signToken, authenticate, authenticateAny, authorize, isStaffManager };
