import supabase from '../config/supabase.js';
import User from '../models/User.js';

const tokenCache = new Map();
const TOKEN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of tokenCache.entries()) {
    if (val.expiry < now) tokenCache.delete(key);
  }
}, 5 * 60 * 1000);

async function verifyTokenWithCache(token) {
  if (!token) return null;

  const cached = tokenCache.get(token);
  if (cached && cached.expiry > Date.now()) {
    return cached.decoded;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw error || new Error('Invalid or expired Supabase token');
  }

  const decoded = {
    uid: data.user.id,
    email: data.user.email,
    role: data.user.user_metadata?.role || null,
    emailVerified: Boolean(data.user.email_confirmed_at),
  };

  tokenCache.set(token, {
    decoded,
    expiry: Date.now() + TOKEN_CACHE_TTL,
  });

  return decoded;
}

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const decodedToken = await verifyTokenWithCache(token);
    let role = String(decodedToken.role || 'user').toLowerCase();
    let dbUser = null;

    if (decodedToken.email) {
      dbUser = await User.findOne({ uid: decodedToken.uid, email: decodedToken.email.toLowerCase() }).catch(() => null);
      if (dbUser?.role) {
        role = String(dbUser.role).toLowerCase();
      }
    }

    req.user = {
      id: decodedToken.uid,
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: role || 'user',
      approved: Boolean(decodedToken.emailVerified),
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ status: 401, message: 'Invalid or expired token' });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 401, message: 'Invalid or expired token' });
    }

    const decodedToken = await verifyTokenWithCache(token);
    let role = String(decodedToken.role || 'user').toLowerCase();

    if (decodedToken.email) {
      const dbUser = await User.findOne({ uid: decodedToken.uid, email: decodedToken.email.toLowerCase() }).catch(() => null);
      if (dbUser?.role) {
        role = String(dbUser.role).toLowerCase();
      }
    }

    if (role !== 'admin') {
      return res.status(403).json({ status: 403, message: 'Admin role required' });
    }

    req.user = {
      id: decodedToken.uid,
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
      approved: Boolean(decodedToken.emailVerified),
    };

    next();
  } catch (error) {
    console.error('Verify admin error:', error);
    return res.status(401).json({ status: 401, message: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role === 'admin') {
    return next();
  }
  return res.status(403).json({ status: 403, message: 'Admin role required' });
};

const roleMiddleware = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ status: 403, message: 'Access restricted. Admin role required.' });
    }

    next();
  };
};

export { authMiddleware, roleMiddleware, requireAdmin, verifyAdmin };
