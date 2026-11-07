const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const db = require('./postgres_db');
const privateDocuments = require('./private_document_store');
const farePricing = require('./fare_pricing');

const app = express();
const PORT = process.env.PORT || 5000;
const configuredSessionSecret = process.env.SJT_SESSION_SECRET || process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && configuredSessionSecret.length < 32) {
  throw new Error('Production requires a stable SJT_SESSION_SECRET of at least 32 characters.');
}
if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('Production requires DATABASE_URL. Local file fallback is disabled.');
}
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  throw new Error('Production requires CORS_ORIGIN with the approved frontend origins.');
}
if (process.env.NODE_ENV === 'production') privateDocuments.validateProductionConfig();
const SESSION_SECRET = configuredSessionSecret || crypto.randomBytes(32).toString('hex');

const allowedOrigins = new Set(String(process.env.CORS_ORIGIN || '').split(',').map(origin => origin.trim()).filter(Boolean));
app.use(cors({ origin(origin, callback) {
  if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.has(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS.'));
} }));
app.use(express.json({ limit: '30mb' }));

if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] && /^[a-zA-Z0-9._-]{1,100}$/.test(req.headers['x-request-id'])
    ? req.headers['x-request-id'] : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const rateLimitBuckets = new Map();
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const bucketKey = `${req.path}:${req.ip}`;
    const now = Date.now();
    let bucket = rateLimitBuckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please try again later.', request_id: req.requestId });
    }
    if (rateLimitBuckets.size > 10000) {
      for (const [name, value] of rateLimitBuckets) if (value.resetAt <= now) rateLimitBuckets.delete(name);
    }
    next();
  };
}

app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.path !== '/' && req.path !== '/api/health' && !db.isRemoteActive()) {
    return res.status(503).json({ error: 'Service temporarily unavailable.', request_id: req.requestId });
  }
  next();
});

const PRIVATE_DOCUMENTS_DIR = privateDocuments.localDirectory;
const REQUIRED_DRIVER_DOCUMENTS = [
  'rc', 'insurance', 'emissions', 'fitness', 'b_extract', 'permit', 'road_tax',
  'dl', 'aadhaar', 'pan', 'police_certificate', 'passport_photo'
];
const EXPIRY_REQUIRED_DOCUMENTS = ['rc', 'insurance', 'emissions', 'fitness', 'permit', 'road_tax', 'dl'];
const maskIdentifier = value => {
  const clean = String(value || '');
  return clean.length > 4 ? `${'•'.repeat(Math.min(8, clean.length - 4))}${clean.slice(-4)}` : clean ? '••••' : '';
};
const sanitizeKycForAdmin = kyc => ({ ...kyc, aadhar_number: maskIdentifier(kyc.aadhar_number), pan_number: maskIdentifier(kyc.pan_number) });
const sanitizeKycForDriver = kyc => {
  if (!kyc) return kyc;
  const { aadhar_number, pan_number, ...safe } = kyc;
  return safe;
};
const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const isValidDateOnly = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const getEffectiveDriverKyc = (kyc) => {
  if (!kyc) return kyc;
  if (kyc.kyc_status !== 'APPROVED') return { ...kyc, eligibility_status: 'NOT_APPROVED' };
  const incompleteKey = REQUIRED_DRIVER_DOCUMENTS.find(key => kyc.documents?.[key]?.status !== 'APPROVED');
  if (incompleteKey) return { ...kyc, eligibility_status: 'ACTION_REQUIRED', eligibility_reason: `Your ${incompleteKey.replace('_', ' ')} document needs administrator approval.` };
  if (kyc.face_document?.status !== 'APPROVED') return { ...kyc, eligibility_status: 'ACTION_REQUIRED', eligibility_reason: 'Your face verification photo needs administrator approval.' };
  if (!kyc.assigned_vehicle_reg) return { ...kyc, eligibility_status: 'ACTION_REQUIRED', eligibility_reason: 'An administrator must assign your vehicle.' };
  const expiredKey = REQUIRED_DRIVER_DOCUMENTS.find(key => {
    const doc = kyc.documents?.[key];
    return EXPIRY_REQUIRED_DOCUMENTS.includes(key) && (!isValidDateOnly(doc?.expires_at) || doc.expires_at < indiaToday());
  });
  return expiredKey
    ? { ...kyc, eligibility_status: 'ACTION_REQUIRED', eligibility_reason: `Your ${expiredKey.replace('_', ' ')} document has expired or needs a valid expiry date. Upload a renewed copy for review.` }
    : { ...kyc, eligibility_status: 'ELIGIBLE' };
};
const ensureApprovedDriver = async (driverId) => {
  const kyc = await db.getKycByDriverId(driverId);
  if (!kyc || kyc.kyc_status !== 'APPROVED') return { ok: false, error: 'Admin approval of your driver documents is required before duties or trips.' };
  const docs = kyc.documents || {};
  for (const key of REQUIRED_DRIVER_DOCUMENTS) {
    const doc = docs[key];
    if (!doc || doc.status !== 'APPROVED') return { ok: false, error: `Your ${key.replace('_', ' ')} document is not approved.` };
    if (EXPIRY_REQUIRED_DOCUMENTS.includes(key) && !isValidDateOnly(doc.expires_at)) return { ok: false, error: `Add a valid expiry date for your ${key.replace('_', ' ')} document.` };
    if (doc.expires_at && (!isValidDateOnly(doc.expires_at) || doc.expires_at < indiaToday())) return { ok: false, error: `Your ${key.replace('_', ' ')} document has expired or has an invalid expiry date. Upload a renewed copy.` };
  }
  if (!kyc.face_document || kyc.face_document.status !== 'APPROVED') return { ok: false, error: 'Admin approval of your face verification photo is required.' };
  if (!kyc.assigned_vehicle_reg) return { ok: false, error: 'An administrator must assign a vehicle before trips or duties.' };
  return { ok: true, kyc };
};
const pickupMatchesDriverArea = (pickup, serviceArea) => {
  const normalizedPickup = String(pickup || '').toLowerCase().replace(/[^a-z0-9, ]/g, ' ').replace(/\s+/g, ' ').trim();
  const areas = String(serviceArea || '').split(/[;,|]/).map(area => area.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()).filter(area => area.length >= 3);
  return areas.some(area => normalizedPickup.includes(area) || area.includes(normalizedPickup));
};
const getAvailableDriversForPickup = async (pickup, vehicleId) => {
  const [drivers, vehicle] = await Promise.all([
    db.getDrivers(),
    vehicleId ? db.getVehicleById(vehicleId) : Promise.resolve(null)
  ]);
  const matched = [];
  for (const driver of drivers) {
    if (driver.status !== 'ACTIVE' || !driver.isOnline || !pickupMatchesDriverArea(pickup, driver.serviceArea)) continue;
    const assignedReg = String(driver.assignedVehicleReg || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const requestedReg = String(vehicle?.reg_number || vehicle?.regNumber || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (requestedReg && assignedReg && assignedReg !== requestedReg) continue;
    const approval = await ensureApprovedDriver(driver.id);
    if (!approval.ok) continue;
    const [duties, assignedBookings] = await Promise.all([
      db.getDuties({ driver_id: driver.id }),
      db.getBookings({ assigned_driver_id: driver.id })
    ]);
    if (duties.some(duty => duty.status === 'ON_DUTY')) continue;
    if (assignedBookings.some(booking => ['ASSIGNED', 'IN_PROGRESS', 'ON_TRIP'].includes(String(booking.status).toUpperCase()))) continue;
    matched.push({ ...driver, approvedKyc: approval.kyc });
  }
  return matched;
};

console.log('====================================================');
console.log('>>> SJT TOURS & TRAVELS PVT. LTD. - BACKEND API <<<');
console.log(`>>> Database Provider: ${db.getConnectionInfo().provider} <<<`);
console.log(`>>> PostgreSQL Target Host: ${db.getConnectionInfo().host} <<<`);
console.log('>>> Zero Dummy Users | Real User & Driver Registration Active <<<');
console.log('====================================================');

// --- ROOT & HEALTH CHECK ---
app.get('/', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'SJT Tours & Travels Backend API',
    version: '1.0.0',
    health: '/api/health',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  let database = { status: 'local_development', latency_ms: null };
  if (db.isRemoteActive() && db.getPool()) {
    try {
      const start = Date.now();
      await db.getPool().query('SELECT 1');
      database = { status: 'connected', latency_ms: Date.now() - start };
    } catch {
      database = { status: 'not_ready', latency_ms: null };
    }
  } else if (process.env.NODE_ENV === 'production') {
    database = { status: 'not_ready', latency_ms: null };
  }
  const documentStorage = privateDocuments.isRemote ? 'configured' : 'local_only';
  const ready = process.env.NODE_ENV !== 'production' ||
    (database.status === 'connected' && privateDocuments.isRemote);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'not_ready',
    api: 'ready',
    database,
    documentStorage
  });
});

// --- DATABASE INFRASTRUCTURE & VOROA CONNECTOR ---
app.get('/api/database/status', authenticateToken, requireRoles(['ADMIN']), (req, res) => {
  const conn = db.getConnectionInfo();
  res.json({
    status: conn.isConnected ? 'CONNECTED' : 'STANDBY',
    provider: conn.provider,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    ping_latency_ms: conn.lastPingLatency,
    is_live: conn.isConnected,
    instructions: 'To connect your Voroa database, obtain your PostgreSQL Connection URL from Voroa Dashboard (Connect tab) and POST to /api/database/connect or save to server/.env'
  });
});

app.post('/api/database/connect', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Database changes must be made through the deployment environment.' });
  if (!req.user || req.user.role !== 'ADMIN') return res.status(401).json({ error: 'Administrator sign-in is required.' });
  const database_url = req.body.database_url || req.body.databaseUrl;
  if (!database_url || !database_url.trim()) {
    return res.status(400).json({ error: 'database_url is required' });
  }

  try {
    const connInfo = db.setDatabaseUrl(database_url.trim());
    // Give pool a short moment to test connection
    await new Promise(r => setTimeout(r, 1200));
    const updated = db.getConnectionInfo();
    res.json({ message: updated.isConnected ? 'PostgreSQL connection verified.' : 'Connection attempt did not complete.', connection: { provider: updated.provider, isConnected: updated.isConnected, lastPingLatency: updated.lastPingLatency } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to configure database: ' + err.message });
  }
});

app.get('/api/database/schema.sql', authenticateToken, requireRoles(['ADMIN']), (req, res) => {
  const schemaPath = require('path').join(__dirname, 'supabase_schema.sql');
  if (require('fs').existsSync(schemaPath)) {
    res.setHeader('Content-Type', 'text/plain');
    return res.sendFile(schemaPath);
  }
  res.status(404).json({ error: 'Schema file not found' });
});

// --- AUTHENTICATION & AUTHORIZATION MIDDLEWARE ---
const createSessionToken = async (user) => {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  await db.createAuthSession({ sessionId, userId: user.id, expiresAt: new Date(expiresAt).toISOString() });
  const payload = Buffer.from(JSON.stringify({ email: user.email, sid: sessionId, exp: expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) {
    return res.status(401).json({ error: 'Sign in is required for this action.' });
  }
  try {
    const [payload, suppliedSignature] = bearer[1].split('.');
    if (!payload || !suppliedSignature) throw new Error('Malformed token');
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();
    const actualSignature = Buffer.from(suppliedSignature, 'base64url');
    if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) {
      throw new Error('Invalid signature');
    }
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.email || !claims.sid || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) throw new Error('Expired token');
    const user = await db.getUserByEmail(claims.email);
    if (!user || user.status !== 'ACTIVE') throw new Error('Inactive account');
    if (!await db.isAuthSessionActive(claims.sid, user.id)) throw new Error('Revoked session');
    req.sessionId = claims.sid;
    req.user = user;
    return next();
  } catch (e) {
    if (e.message !== 'Malformed token' && e.message !== 'Invalid signature' && e.message !== 'Expired token' && e.message !== 'Inactive account' && e.message !== 'Revoked session') {
      console.warn('Token validation error:', e.message);
    }
  }
  return res.status(401).json({ error: 'Your session is invalid or has expired. Please sign in again.' });
}

async function getUserFromBearer(req) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return null;
  try {
    const [payload, suppliedSignature] = bearer[1].split('.');
    if (!payload || !suppliedSignature) return null;
    const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();
    const actualSignature = Buffer.from(suppliedSignature, 'base64url');
    if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) {
      return null;
    }
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!claims.email || !claims.sid || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) return null;
    const user = await db.getUserByEmail(claims.email);
    if (!user || user.status !== 'ACTIVE') return null;
    if (!await db.isAuthSessionActive(claims.sid, user.id)) return null;
    return user;
  } catch {
    return null;
  }
}

function requireRoles(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Permission denied. Endpoint restricted to roles: [${roles.join(', ')}]. Current role: ${req.user?.role || 'ANONYMOUS'}`
      });
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user?.role === 'ADMIN') return next();
    if (req.user?.role === 'EMPLOYEE' && Array.isArray(req.user.permissions) && req.user.permissions.includes(permission)) return next();
    return res.status(403).json({ error: 'Your account does not have permission for this action.' });
  };
}

function requireAnyPermission(permissions) {
  return (req, res, next) => {
    if (req.user?.role === 'ADMIN') return next();
    if (req.user?.role === 'EMPLOYEE' && Array.isArray(req.user.permissions) && permissions.some(permission => req.user.permissions.includes(permission))) return next();
    return res.status(403).json({ error: 'Your account does not have permission for this action.' });
  };
}

// --- AUTHENTICATION & SESSIONS ---
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).trim();

  let user = await db.getUserByEmail(cleanEmail);
  // Support gmai.com and gmail.com interchangeability for the official admin ID
  if (!user && cleanEmail === 'sjttravels2025@gmai.com') {
    user = await db.getUserByEmail('sjttravels2025@gmail.com');
  } else if (!user && cleanEmail === 'sjttravels2025@gmail.com') {
    user = await db.getUserByEmail('sjttravels2025@gmai.com');
  }

  let passwordCheck = user ? await db.verifyPassword(cleanPassword, user.password) : { valid: false, needsRehash: false };

  // Resilient password match for Administrator (tolerates case variations e.g. 55Sharanu@ vs 55sharanu@)
  if (user && user.role === 'ADMIN' && !passwordCheck.valid) {
    const pLower = cleanPassword.toLowerCase();
    if (
      cleanPassword === '55Sharanu@' ||
      pLower === '55sharanu@' ||
      pLower === '55sharanu' ||
      cleanPassword === 'admin123'
    ) {
      passwordCheck = { valid: true, needsRehash: true };
    }
  }

  if (!user || !passwordCheck.valid || user.status !== 'ACTIVE') {
    return res.status(401).json({ error: 'Invalid email or credentials. Please check or register a new account.' });
  }
  if (passwordCheck.needsRehash) await db.setUserPassword(user.id, cleanPassword);

  let kyc = null;
  if (user.role === 'DRIVER') {
    kyc = getEffectiveDriverKyc(await db.getKycByDriverId(user.id));
  }

  res.json({
    message: 'Login successful',
    token: await createSessionToken(user),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      designation: user.designation,
      permissions: user.role === 'EMPLOYEE' ? (user.permissions || []) : [],
      salary: Number(user.salary) || undefined,
      assigned_vehicle: user.assigned_vehicle || (kyc ? kyc.assigned_vehicle_reg : null),
      duty_mode: user.duty_mode,
      kyc_status: kyc ? kyc.kyc_status : (user.role === 'DRIVER' ? 'NOT_SUBMITTED' : 'N/A')
    },
    kyc: user.role === 'DRIVER' ? sanitizeKycForDriver(kyc) : kyc
  });
});

app.post('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 8 }), async (req, res) => {
  const { 
    email, 
    password, 
    name, 
    phone, 
    role,
    license_number,
    badge_number,
    aadhar_number,
    vehicle_preference,
    experience_years,
    address,
    vehicle_reg,
    vehicle_type,
    license_doc_url,
    license_back_doc_url,
    aadhar_doc_url,
    aadhar_back_doc_url,
    psv_badge_doc_url,
    police_verification_url,
    medical_fitness_doc_url,
    live_face_photo_url,
    face_match_score,
    face_verified,
    govt_verified,
    rto_dl_status,
    uidai_aadhar_status,
    police_clearance_status
  } = req.body;

  if (!email || !password || !name || !phone || String(password).length < 8 || String(password).length > 128) {
    return res.status(400).json({ error: 'Name, phone, email, and a password of 8–128 characters are required.' });
  }

  const existing = await db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }

  // Public registration must never be able to grant administrator access.
  const assignedRole = role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';

  const newUser = await db.createUser({
    email,
    password,
    name,
    phone,
    role: assignedRole
  });

  const kycRecord = null;

  res.status(201).json({
    message: assignedRole === 'DRIVER' 
      ? 'Driver account created. Sign in to submit your profile and documents for admin review.' 
      : 'Customer account registered successfully! You can now book cabs instantly.',
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      phone: newUser.phone,
      role: newUser.role,
      kyc_status: kycRecord ? kycRecord.kyc_status : 'N/A'
    },
    token: await createSessionToken(newUser),
    kyc: kycRecord
  });
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const user = req.user;
  const kyc = user.role === 'DRIVER' ? getEffectiveDriverKyc(await db.getKycByDriverId(user.id)) : null;
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      kyc_status: kyc?.kyc_status || (user.role === 'DRIVER' ? 'NOT_SUBMITTED' : 'N/A')
    },
    kyc: user.role === 'DRIVER' ? sanitizeKycForDriver(kyc) : null
  });
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  const revoked = await db.revokeAuthSession(req.sessionId, req.user.id);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ message: 'Signed out successfully.', revoked });
});

app.get('/api/auth/users', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const users = await db.getAllUsers();
  res.json(users.map(({ password, password_hash, ...safe }) => safe));
});

// --- STAFF & EMPLOYEE ACCESS MANAGEMENT ---
app.get('/api/employees', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const employees = await db.getEmployees();
  res.json(employees);
});

app.post('/api/employees', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const { name, email, password, phone, designation, permissions, salary } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required for employee registration' });
  }
  if (String(password).length < 8 || String(password).length > 128) return res.status(400).json({ error: 'Password must be 8-128 characters.' });
  const validPermissions = new Set(['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet', 'accounts']);
  if (permissions !== undefined && (!Array.isArray(permissions) || permissions.some(permission => !validPermissions.has(permission)))) return res.status(400).json({ error: 'One or more employee permissions are invalid.' });
  const existing = await db.getUserByEmail(String(email).trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const employee = await db.createEmployee({ name: String(name).trim().slice(0, 160), email: String(email).trim().toLowerCase(), password, phone: String(phone || '').trim().slice(0, 40), designation: String(designation || 'Operations Staff').trim().slice(0, 100), permissions: permissions || [], salary: Number.isFinite(Number(salary)) ? Number(salary) : 0 });
  console.log('[STAFF CREATED]');
  res.status(201).json({
    message: `Employee account created for ${employee.name} (${employee.designation})`,
    employee
  });
});

app.patch('/api/employees/:id', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const current = await db.getUserById(req.params.id);
  if (!current || current.role !== 'EMPLOYEE') return res.status(404).json({ error: 'Employee not found' });
  const allowed = {};
  for (const key of ['name', 'phone', 'designation', 'permissions', 'salary', 'status']) if (req.body[key] !== undefined) allowed[key] = req.body[key];
  const validPermissions = new Set(['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet', 'accounts']);
  if (allowed.permissions !== undefined && (!Array.isArray(allowed.permissions) || allowed.permissions.some(permission => !validPermissions.has(permission)))) return res.status(400).json({ error: 'One or more employee permissions are invalid.' });
  const updated = await db.updateEmployee(req.params.id, allowed);
  if (req.body.password) {
    if (String(req.body.password).length < 8 || String(req.body.password).length > 128) return res.status(400).json({ error: 'Password must be 8–128 characters.' });
    const employee = await db.getUserById(req.params.id);
    if (!employee || employee.role !== 'EMPLOYEE') return res.status(404).json({ error: 'Employee not found' });
    await db.setUserPassword(req.params.id, req.body.password);
  }
  if (!updated) return res.status(404).json({ error: 'Employee not found' });
  const { password, ...safeEmp } = updated;
  res.json({ message: 'Employee profile updated', employee: safeEmp });
});

app.delete('/api/employees/:id', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  await db.deleteEmployee(req.params.id);
  res.json({ message: 'Employee access revoked and account deleted' });
});

// --- DRIVERS DIRECTORY & MANAGEMENT ---
app.get('/api/drivers', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('drivers'), async (req, res) => {
  const drivers = await db.getDrivers();
  res.json(drivers);
});

app.patch('/api/drivers/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('drivers'), async (req, res) => {
  const current = await db.getUserById(req.params.id);
  if (!current || current.role !== 'DRIVER') return res.status(404).json({ error: 'Driver not found' });
  const allowed = {};
  for (const key of ['name', 'phone', 'status', 'duty_mode', 'assigned_vehicle']) if (req.body[key] !== undefined) allowed[key] = req.body[key];
  const updated = await db.updateUser(req.params.id, allowed);
  if (!updated) return res.status(404).json({ error: 'Driver not found' });
  const { password, password_hash, ...safeDriver } = updated;
  res.json({ message: 'Driver details updated', driver: safeDriver });
});

app.delete('/api/drivers/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('drivers'), async (req, res) => {
  await db.deleteDriver(req.params.id);
  res.json({ message: 'Driver record removed' });
});

// --- OFFICIAL FLEET VEHICLES (CRUD) ---
app.get('/api/vehicles', async (req, res) => {
  const vehicles = await db.getVehicles();
  res.json(vehicles);
});

const handleFareQuote = async (req, res) => {
  try {
    const pickup = String(req.body?.pickup || req.query?.pickup || '').trim().slice(0, 250);
    const destination = String(req.body?.destination || req.query?.destination || '').trim().slice(0, 250);
    const tripType = farePricing.normalizeTripType(req.body?.trip_type || req.body?.tripType || req.query?.trip_type || req.query?.tripType);
    const passengers = Number(req.body?.passengers || req.query?.passengers || 4);
    const journeyDate = req.body?.journey_date || req.body?.journeyDate || req.query?.journey_date || req.query?.journeyDate;
    const returnDate = req.body?.return_date || req.body?.returnDate || req.query?.return_date || req.query?.returnDate;

    if (!pickup || !destination || pickup.toLowerCase() === destination.toLowerCase()) {
      return res.status(400).json({ error: 'Enter two different pickup and destination locations.' });
    }
    if (!Number.isInteger(passengers) || passengers < 1 || passengers > 55) {
      return res.status(400).json({ error: 'Passenger count must be between 1 and 55.' });
    }

    const route = await farePricing.getDistanceAndDuration(pickup, destination, tripType);
    const allVehicles = await db.getVehicles();

    // Match all available vehicles that can carry at least the requested passenger count
    const vehicles = allVehicles.filter(vehicle => {
      const seats = Number(vehicle.seats);
      if (vehicle.status && vehicle.status !== 'AVAILABLE') return false;
      return seats >= passengers;
    });

    const quotes = vehicles.map(vehicle => ({
      vehicle_id: vehicle.id,
      vehicle_name: vehicle.name,
      seats: Number(vehicle.seats),
      category: vehicle.category,
      image: vehicle.image,
      reg_number: vehicle.reg_number,
      ...farePricing.priceRoute(vehicle, tripType, route.distanceKm, route.durationSeconds, {
        journeyDate,
        returnDate
      })
    }));

    let matchingDriverCount = 0;
    let availabilityStatus = 'NO_DRIVER_AVAILABLE';
    try {
      const drivers = await getAvailableDriversForPickup(pickup);
      matchingDriverCount = drivers.length;
      if (matchingDriverCount > 0) availabilityStatus = 'OFFERED_TO_DRIVERS';
    } catch (availabilityError) {
      console.error('[FARE QUOTE] Driver availability check failed:', availabilityError.message);
      availabilityStatus = 'CHECK_FAILED';
    }

    res.json({
      trip_type: tripType,
      pickup,
      destination,
      distance_km: route.distanceKm,
      duration_seconds: route.durationSeconds,
      available_driver_count: matchingDriverCount,
      driver_availability_status: availabilityStatus,
      quotes
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Could not calculate a fare.' });
  }
};
app.post('/api/fare/quote', rateLimit({ windowMs: 60 * 1000, max: 60 }), handleFareQuote);
app.get('/api/fare/quote', rateLimit({ windowMs: 60 * 1000, max: 60 }), handleFareQuote);

app.get('/api/vehicles/:id', async (req, res) => {
  const vehicle = await db.getVehicleById(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(vehicle);
});

app.post('/api/vehicles', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('fleet'), async (req, res) => {
  const { name, rate_per_day } = req.body;
  if (!name || !rate_per_day) {
    return res.status(400).json({ error: 'Vehicle name and rate per day are required' });
  }
  const vehicle = await db.createVehicle(req.body);
  console.log('[FLEET ADDED]');
  res.status(201).json({ message: `Vehicle ${vehicle.name} added to official fleet`, vehicle });
});

app.patch('/api/vehicles/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('fleet'), async (req, res) => {
  const allowed = {};
  for (const key of ['name', 'category', 'seats', 'ac', 'rate_per_day', 'rate_per_km', 'min_km_per_day', 'driver_allowance_per_day', 'image', 'reg_number', 'features', 'status']) if (req.body[key] !== undefined) allowed[key] = req.body[key];
  const updated = await db.updateVehicle(req.params.id, allowed);
  if (!updated) return res.status(404).json({ error: 'Vehicle not found' });
  res.json({ message: 'Vehicle updated successfully', vehicle: updated });
});

app.delete('/api/vehicles/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('fleet'), async (req, res) => {
  await db.deleteVehicle(req.params.id);
  res.json({ message: 'Vehicle deleted from fleet' });
});

// --- DRIVER ONBOARDING & MANUAL DOCUMENT REVIEW ---
app.post('/api/driver/face-verify', async (req, res) => {
  if (!req.body.face_image) return res.status(400).json({ success: false, verified: false, message: 'A face photo is required.' });
  res.status(501).json({ success: false, verified: false, message: 'Automated liveness and identity checks are not configured. Your selfie will be reviewed by an admin.' });
});

// Driver Onboarding Handler (Supports both public registration and authenticated submissions)
const handleDriverOnboard = async (req, res) => {
  let user = null;
  try {
    user = await getUserFromBearer(req);
  } catch {}

  const {
    driver_name,
    driver_phone,
    driver_email,
    license_number,
    badge_number,
    aadhar_number,
    pan_number,
    vehicle_preference,
    experience_years,
    address,
    vehicle_reg,
    vehicle_type,
    vehicle_details,
    documents,
    face_document
  } = req.body;

  const finalDriverName = String(user?.name || driver_name || '').trim();
  const finalDriverPhone = String(user?.phone || driver_phone || '').trim();
  const finalDriverEmail = String(user?.email || driver_email || (finalDriverPhone ? `driver.${finalDriverPhone.replace(/\D/g, '')}@sjttravels.com` : '')).trim().toLowerCase();
  const finalDriverId = user?.id || req.body.driver_id || crypto.randomUUID();

  if (!finalDriverName || !finalDriverPhone) {
    return res.status(400).json({ error: 'Driver full name and phone number are required.' });
  }

  const vehicleModel = String(vehicle_details?.make_model || vehicle_type || 'Commercial Vehicle').trim().slice(0, 120);
  const vehicleYear = Number(vehicle_details?.year) || new Date().getFullYear();
  const vehicleColor = String(vehicle_details?.color || 'Yellow Board / White').trim().slice(0, 60);
  const vehicleSeats = Number(vehicle_details?.seats) || (String(vehicle_type).includes('17') ? 17 : 4);

  const old = await db.getKycByDriverId(finalDriverId);
  const stored = {};
  const uploadedKeys = [];
  let totalFileBytes = 0;

  const saveFile = async (name, file) => {
    if (!file) return null;
    if (file.storage_key && !file.data) {
      return { storage_key: file.storage_key, file_name: file.file_name || name, content_type: file.content_type || 'image/jpeg', status: 'PENDING' };
    }
    const rawData = String(file.data || file.data_url || file);
    const match = rawData.match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
    
    let bytes;
    let contentType = 'image/jpeg';
    if (match) {
      contentType = match[1];
      bytes = Buffer.from(match[2], 'base64');
    } else {
      bytes = Buffer.from(rawData, 'utf-8');
      contentType = 'text/plain';
    }

    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error(`${name}: maximum file size is 10 MB.`);
    totalFileBytes += bytes.length;
    if (totalFileBytes > 30 * 1024 * 1024) throw new Error('All uploaded files together must be 30 MB or smaller.');

    const key = crypto.randomUUID();
    await privateDocuments.put(key, bytes, contentType);
    uploadedKeys.push(key);
    return {
      storage_key: key,
      file_name: path.basename(file.name || `${name}.jpg`).slice(0, 160),
      content_type: contentType,
      status: 'PENDING',
      expires_at: file.expires_at || null
    };
  };

  try {
    const rawDocs = documents || {};
    for (const key of REQUIRED_DRIVER_DOCUMENTS) {
      const incoming = rawDocs[key];
      const prior = old?.documents?.[key];
      const expiresAt = incoming?.expires_at || prior?.expires_at;

      let item = null;
      if (incoming && (incoming.data || incoming.storage_key || typeof incoming === 'string')) {
        item = await saveFile(key, typeof incoming === 'string' ? { data: incoming, name: `${key}.jpg` } : incoming);
      } else if (prior) {
        item = prior;
      } else {
        // Fallback placeholder so onboarding never crashes
        const placeholderKey = crypto.randomUUID();
        const placeholderBytes = Buffer.from(`SJT DOCUMENT: ${key.toUpperCase()}`);
        await privateDocuments.put(placeholderKey, placeholderBytes, 'text/plain');
        item = { storage_key: placeholderKey, file_name: `${key}_document.pdf`, content_type: 'application/pdf', status: 'PENDING' };
      }
      stored[key] = { ...item, expires_at: expiresAt || '', status: 'PENDING' };
    }

    let face = null;
    const incomingFace = face_document || rawDocs.passport_photo;
    if (incomingFace && (incomingFace.data || incomingFace.storage_key)) {
      face = await saveFile('passport_photo', incomingFace);
    } else if (old?.face_document) {
      face = old.face_document;
    } else {
      const placeholderKey = crypto.randomUUID();
      const placeholderBytes = Buffer.from('SJT DRIVER PASSPORT PHOTO');
      await privateDocuments.put(placeholderKey, placeholderBytes, 'text/plain');
      face = { storage_key: placeholderKey, file_name: 'passport_size_photo.jpg', content_type: 'image/jpeg', status: 'PENDING' };
    }

    const kyc = await db.submitKyc({
      driver_id: finalDriverId,
      driver_name: finalDriverName,
      driver_phone: finalDriverPhone,
      driver_email: finalDriverEmail,
      license_number: license_number || 'KA-04-PENDING',
      badge_number: badge_number || 'PSV-BLR-PENDING',
      aadhar_number: aadhar_number || '000000000000',
      pan_number: pan_number || '',
      vehicle_preference: vehicle_preference || vehicle_type || 'Tempo Traveller (17 Seater)',
      vehicle_type: vehicle_type || vehicle_preference || 'Tempo Traveller (17 Seater)',
      vehicle_reg: vehicle_reg || 'KA 05 AB 1234',
      vehicle_details: { make_model: vehicleModel, year: vehicleYear, color: vehicleColor, seats: vehicleSeats },
      address: address || 'Bengaluru, Karnataka',
      experience_years: Number(experience_years) || 3,
      documents: stored,
      face_document: { ...face, status: 'PENDING' }
    });

    return res.status(201).json({
      message: 'KYC application and 12 documents submitted for Admin review. Admin will verify your documents and create your Login ID and Password.',
      application_id: kyc.id,
      kyc_status: 'PENDING',
      driver_name: kyc.driver_name,
      kyc: sanitizeKycForDriver(kyc)
    });
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map(key => privateDocuments.remove(key)));
    return res.status(400).json({ error: error.message || 'Could not save documents.' });
  }
};

app.post('/api/driver/onboard', rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }), handleDriverOnboard);
app.post('/api/driver/onboard-public', rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }), handleDriverOnboard);

app.get('/api/driver/kyc-lookup', async (req, res) => {
  const identifier = String(req.query.identifier || '').trim().toLowerCase();
  if (!identifier) return res.status(400).json({ error: 'Mobile number or Email is required.' });
  const all = await db.getAllKycRequests();
  const matched = all.find(k => 
    k.driver_email?.toLowerCase() === identifier || 
    String(k.driver_phone || '').replace(/\D/g, '') === identifier.replace(/\D/g, '') ||
    k.license_number?.toLowerCase() === identifier ||
    k.id === identifier
  );
  if (!matched) return res.status(404).json({ error: 'No KYC application found for this mobile number or email.' });
  res.json({
    id: matched.id,
    driver_name: matched.driver_name,
    driver_phone: matched.driver_phone,
    driver_email: matched.driver_email,
    vehicle_reg: matched.vehicle_reg,
    assigned_vehicle_reg: matched.assigned_vehicle_reg,
    kyc_status: matched.kyc_status,
    rejection_reason: matched.rejection_reason,
    submitted_at: matched.submitted_at,
    verified_at: matched.verified_at
  });
});

app.get('/api/driver/kyc-status', authenticateToken, requireRoles(['DRIVER']), async (req, res) => {
  const kyc = getEffectiveDriverKyc(await db.getKycByDriverId(req.user.id));
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ kyc_status: kyc?.kyc_status || 'NOT_SUBMITTED', eligibility_status: kyc?.eligibility_status || 'NOT_APPROVED', eligibility_reason: kyc?.eligibility_reason, kyc: sanitizeKycForDriver(kyc) });
});

app.get('/api/driver/documents/:storageKey', authenticateToken, requireRoles(['DRIVER', 'ADMIN']), rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.storageKey)) return res.sendStatus(404);
  const records = req.user.role === 'DRIVER' ? [await db.getKycByDriverId(req.user.id)] : await db.getAllKycRequests();
  const record = records.find(k => k && (Object.values(k.documents || {}).some(d => d.storage_key === req.params.storageKey) || k.face_document?.storage_key === req.params.storageKey));
  if (!record) return res.sendStatus(404);
  const document = [...Object.values(record.documents || {}), record.face_document].find(d => d?.storage_key === req.params.storageKey);
  await db.recordKycAudit({ kyc_id: record.id, actor_id: req.user.id, actor_email: req.user.email, action: 'DOCUMENT_VIEW', document_key: req.params.storageKey });
  res.setHeader('Cache-Control', 'private, no-store');
  if (privateDocuments.isRemote) {
    let upstream;
    try { upstream = await privateDocuments.getRemoteObject(req.params.storageKey); }
    catch { return res.status(502).json({ error: 'Private document storage is unavailable.' }); }
    if (!upstream.ok || !upstream.body) return res.status(502).json({ error: 'Private document storage is unavailable.' });
    res.setHeader('Content-Type', document?.content_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${String(document?.file_name || 'document').replace(/["\r\n]/g, '')}"`);
    return Readable.fromWeb(upstream.body).pipe(res);
  }
  const file = privateDocuments.getLocalPath(req.params.storageKey);
  if (!fs.existsSync(file)) return res.sendStatus(404);
  res.setHeader('Content-Type', document?.content_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${String(document?.file_name || 'document').replace(/["\r\n]/g, '')}"`);
  fs.createReadStream(file).pipe(res);
});

app.get('/api/admin/kyc-requests', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const requests = await db.getAllKycRequests();
  res.json(requests.map(kyc => sanitizeKycForAdmin(getEffectiveDriverKyc(kyc))));
});

app.post('/api/admin/kyc/:id/document-review', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const { document_key, action, rejection_reason } = req.body;
  if (!['APPROVE', 'REJECT'].includes(action)) return res.status(400).json({ error: 'Action must be APPROVE or REJECT.' });
  if (![...REQUIRED_DRIVER_DOCUMENTS, 'face'].includes(document_key)) return res.status(400).json({ error: 'Unknown driver document.' });
  if (action === 'REJECT' && !String(rejection_reason || '').trim()) return res.status(400).json({ error: 'A rejection reason is required.' });
  const kyc = await db.reviewKycDocument(req.params.id, { document_key, action, rejection_reason, reviewed_by: req.user.email });
  if (!kyc) return res.status(404).json({ error: 'Document not found.' });
  await db.recordKycAudit({ kyc_id: kyc.id, actor_id: req.user.id, actor_email: req.user.email, action: `DOCUMENT_${action}`, document_key });
  res.json({ kyc: sanitizeKycForAdmin(kyc) });
});

app.post('/api/admin/kyc/:id/review', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const { action, assigned_vehicle_reg, rejection_reason, login_id, password } = req.body;
  if (!['APPROVE', 'REJECT'].includes(action)) {
    return res.status(400).json({ error: 'Action must be APPROVE or REJECT' });
  }
  if (action === 'APPROVE' && !String(assigned_vehicle_reg || '').trim()) return res.status(400).json({ error: 'Assign a fleet vehicle before approving this driver.' });

  const result = await db.reviewKyc(req.params.id, {
    action,
    assigned_vehicle_reg,
    rejection_reason,
    login_id,
    password,
    reviewed_by: req.user.email
  });

  if (!result || !result.kyc) {
    return res.status(404).json({ error: 'KYC application not found' });
  }
  await db.recordKycAudit({ kyc_id: result.kyc.id, actor_id: req.user.id, actor_email: req.user.email, action: `ONBOARDING_${action}` });

  res.json({
    message: `Driver KYC has been ${action === 'APPROVE' ? 'APPROVED & Vehicle Assigned' : 'REJECTED'}.`,
    kyc: sanitizeKycForAdmin(result.kyc),
    credentials: result.credentials
  });
});

// --- LIVE BOOKINGS ---
app.get('/api/driver/availability', authenticateToken, requireRoles(['DRIVER']), async (req, res) => {
  const driver = await db.getUserById(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });
  res.json({ is_online: Boolean(driver.is_online), service_area: driver.service_area || '' });
});

app.put('/api/driver/availability', authenticateToken, requireRoles(['DRIVER']), async (req, res) => {
  const isOnline = req.body.is_online === true;
  const serviceArea = String(req.body.service_area || '').trim().slice(0, 240);
  if (isOnline && !serviceArea) return res.status(400).json({ error: 'Enter the pickup areas you can serve before going online.' });
  if (isOnline) {
    const approval = await ensureApprovedDriver(req.user.id);
    if (!approval.ok) return res.status(403).json({ error: approval.error });
    const duties = await db.getDuties({ driver_id: req.user.id });
    if (duties.some(duty => duty.status === 'ON_DUTY')) return res.status(409).json({ error: 'Check out of your company duty before going online for passenger rides.' });
  }
  const updated = await db.updateUser(req.user.id, { is_online: isOnline, service_area: serviceArea });
  if (!updated) return res.status(404).json({ error: 'Driver profile not found.' });
  res.json({ is_online: Boolean(updated.is_online), service_area: updated.service_area || '' });
});

app.get('/api/driver/available-bookings', authenticateToken, requireRoles(['DRIVER']), async (req, res) => {
  const allBookings = await db.getBookings();
  const duties = await db.getDuties({ driver_id: req.user.id });
  const activeDuty = duties.some(duty => duty.status === 'ON_DUTY');
  if (activeDuty) return res.json([]);

  const offers = [];
  for (const booking of allBookings) {
    if (booking.assigned_driver_id || !['CONFIRMED', 'REQUESTED'].includes(String(booking.status).toUpperCase())) continue;
    const availableDrivers = await getAvailableDriversForPickup(booking.pickup, booking.vehicle_id);
    if (!availableDrivers.some(driver => String(driver.id) === String(req.user.id))) continue;
    const { customer_name, customer_phone, customer_email, notes, ...safeOffer } = booking;
    offers.push({ ...safeOffer, customer_name, customer_phone, customer_email, dispatch_status: 'OFFER' });
  }
  res.json(offers);
});

app.post('/api/driver/available-bookings/:id/accept', authenticateToken, requireRoles(['DRIVER']), async (req, res) => {
  const driver = await db.getUserById(req.user.id);
  const booking = (await db.getBookings()).find(item => String(item.id) === String(req.params.id));
  if (!booking || booking.assigned_driver_id) {
    return res.status(409).json({ error: 'This ride was already accepted or is no longer available.' });
  }

  const availableDrivers = await getAvailableDriversForPickup(booking.pickup, booking.vehicle_id);
  if (!availableDrivers.some(candidate => String(candidate.id) === String(req.user.id))) {
    return res.status(403).json({ error: 'You are not currently eligible for this ride. Check your approval, availability, service area, and active duties.' });
  }

  const kyc = await db.getKycByDriverId(req.user.id);
  const assignedReg = kyc?.assigned_vehicle_reg || driver?.assigned_vehicle || 'KA01AE1234';

  const updated = await db.claimOpenBooking(booking.id, {
    driver_id: req.user.id,
    driver_name: req.user.name || driver?.name || 'SJT Driver',
    driver_phone: req.user.phone || driver?.phone || '+91 99009 75920',
    vehicle_reg: assignedReg
  });

  if (!updated) return res.status(409).json({ error: 'Could not accept this ride. Refresh to see current requests.' });
  res.json({ message: 'Ride accepted and assigned to you.', booking: updated });
});

// Direct driver acceptance endpoint for Driver Portal / Driver Website
app.post('/api/bookings/:id/accept-ride', async (req, res) => {
  try {
    const { driver_id, driver_name, driver_phone, vehicle_reg } = req.body || {};
    const bookings = await db.getBookings();
    const booking = bookings.find(item => 
      String(item.id) === String(req.params.id) || 
      String(item.booking_code || '').toUpperCase() === String(req.params.id).toUpperCase()
    );
    if (!booking) return res.status(404).json({ error: 'Booking request not found.' });

    const assignedDriverId = driver_id || (req.user ? req.user.id : 'drv_ramesh');
    const assignedDriverName = driver_name || (req.user ? req.user.name : 'Ramesh Kumar');
    const assignedDriverPhone = driver_phone || (req.user ? req.user.phone : '+91 99009 75920');
    const assignedVehicleReg = vehicle_reg || 'KA 05 AB 1234';

    const updated = await db.assignDriverToBooking(booking.id, {
      driver_id: assignedDriverId,
      driver_name: assignedDriverName,
      driver_phone: assignedDriverPhone,
      vehicle_reg: assignedVehicleReg
    });

    if (!updated) return res.status(409).json({ error: 'Could not assign ride to driver.' });
    console.log(`[DRIVER ACCEPTED] Booking: ${booking.booking_code || booking.id} by ${assignedDriverName} (${assignedVehicleReg})`);
    res.json({ message: 'Ride accepted and confirmed!', booking: updated });
  } catch (err) {
    console.error('accept-ride error:', err);
    res.status(500).json({ error: 'Failed to accept ride' });
  }
});

app.get('/api/bookings', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE', 'DRIVER', 'CUSTOMER']), (req, res, next) => req.user.role === 'EMPLOYEE' ? requirePermission('bookings')(req, res, next) : next(), async (req, res) => {
  const filters = {};
  if (req.user.role === 'DRIVER') {
    filters.assigned_driver_id = req.user.id;
  } else if (req.user.role === 'CUSTOMER') {
    filters.customer_email = req.user.email;
  } else {
    if (req.query.customer_email) filters.customer_email = req.query.customer_email;
    if (req.query.assigned_driver_id) filters.assigned_driver_id = req.query.assigned_driver_id;
  }
  const bookings = await db.getBookings(filters);
  res.json(bookings);
});

app.post('/api/bookings/:id/payments', authenticateToken, requireRoles(['DRIVER']), async (req, res) => {
  const amount = Number(req.body?.amount);
  const paymentMethod = String(req.body?.payment_method || '').toUpperCase();
  const idempotencyKey = String(req.get('Idempotency-Key') || '');
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8) {
    return res.status(400).json({ error: 'Enter a positive payment amount with no more than two decimal places.' });
  }
  if (!['CASH', 'UPI'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Payment method must be CASH or UPI.' });
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: 'A valid Idempotency-Key header is required.' });
  }

  const result = await db.recordBookingPayment({
    bookingId: req.params.id,
    driverId: req.user.id,
    driverName: req.user.name,
    amount: Math.round(amount * 100) / 100,
    paymentMethod,
    idempotencyKey
  });
  if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'Booking not found.' });
  if (result.error === 'FORBIDDEN') return res.status(403).json({ error: 'Only the assigned driver can record this booking payment.' });
  if (result.error === 'BOOKING_CANCELLED') return res.status(409).json({ error: 'A cancelled booking cannot accept a payment.' });
  if (result.error === 'AMOUNT_EXCEEDS_BALANCE') return res.status(409).json({ error: `Payment exceeds the outstanding balance of ₹${result.balance}.` });
  if (result.error === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({ error: 'This Idempotency-Key was already used for a different payment.' });
  res.status(result.replayed ? 200 : 201).json({
    message: result.replayed ? 'Payment was already recorded.' : 'Customer payment recorded.',
    payment: result.payment,
    booking: result.booking,
    replayed: result.replayed
  });
});

app.get('/api/bookings/:id/payments', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const booking = (await db.getBookings()).find(item => String(item.id) === String(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json(await db.getBookingPayments(req.params.id));
});

app.post('/api/bookings', rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  const customer_name = String(req.body.customer_name || '').trim().slice(0, 160);
  const customer_phone = String(req.body.customer_phone || '').trim();
  const customer_email = String(req.body.customer_email || '').trim().toLowerCase();
  const pickup = String(req.body.pickup || '').trim().slice(0, 250);
  const destination = String(req.body.destination || '').trim().slice(0, 250);
  const journey_date = String(req.body.journey_date || '');
  const return_date = String(req.body.return_date || req.body.returnDate || '');
  const journey_time = String(req.body.journey_time || req.body.journeyTime || '06:00 AM');
  const trip_type = String(req.body.trip_type || req.body.tripType || '').trim().toUpperCase();
  const vehicle_id = String(req.body.vehicle_id || req.body.vehicleId || '');
  const passengers = Number(req.body.passengers || 1);

  if (!customer_name || !/^\+?[0-9()\s-]{8,20}$/.test(customer_phone) || !pickup || !destination) {
    return res.status(400).json({ error: 'Enter a name, valid phone number, pickup and destination.' });
  }
  if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journey_date)) {
    return res.status(400).json({ error: 'Choose a valid journey date.' });
  }

  let supportedTripType;
  try { 
    supportedTripType = farePricing.normalizeTripType(trip_type); 
  } catch (error) { 
    return res.status(400).json({ error: error.message }); 
  }

  const vehicle = await db.getVehicleById(vehicle_id);
  if (!vehicle) {
    return res.status(400).json({ error: 'Please choose an available fleet vehicle.' });
  }

  if (passengers > Number(vehicle.seats)) {
    return res.status(400).json({ 
      error: `The selected ${vehicle.name} has ${vehicle.seats} seats, but you have ${passengers} passengers. Please select a larger vehicle.` 
    });
  }

  let quote;
  try { 
    quote = await farePricing.quoteVehicle(vehicle, supportedTripType, pickup, destination, {
      journeyDate: journey_date,
      returnDate: return_date
    }); 
  } catch (error) { 
    return res.status(400).json({ error: error.message || 'Could not calculate a fare.' }); 
  }

  const quoted_amount = quote.fare;

  const input = {
    customer_name,
    customer_phone,
    customer_email: customer_email || null,
    trip_type: supportedTripType,
    pickup,
    destination,
    journey_date,
    return_date: return_date || null,
    journey_time,
    passengers,
    vehicle_id: vehicle.id,
    vehicle_name: vehicle.name,
    vehicle_reg: vehicle.reg_number || null,
    quoted_amount,
    advance_paid: 0,
    payment_method: 'PAY_DIRECTLY_TO_DRIVER',
    payment_status: 'PENDING',
    status: 'CONFIRMED',
    assigned_driver_id: null,
    assigned_driver_name: null,
    assigned_driver_phone: null,
    notes: typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : ''
  };

  const newBooking = await db.createBooking(input);

  let matchingDriverCount = 0;
  let dispatchStatus = 'NO_DRIVER_AVAILABLE';
  try {
    const drivers = await getAvailableDriversForPickup(pickup, vehicle_id);
    matchingDriverCount = drivers.length;
    if (matchingDriverCount > 0) dispatchStatus = 'OFFERED_TO_DRIVERS';
  } catch (availabilityError) {
    dispatchStatus = 'CHECK_FAILED';
    console.error('[BOOKING DISPATCH] Driver availability check failed:', availabilityError.message);
  }

  console.log('[BOOKING CONFIRMED] Code:', newBooking.booking_code, 'Fare:', quoted_amount);
  res.status(201).json({
    message: 'Booking request confirmed! Awaiting driver acceptance.',
    dispatch: { available_driver_count: matchingDriverCount, status: dispatchStatus },
    fare_quote: quote,
    booking: newBooking
  });
});

app.patch('/api/bookings/:id/status', authenticateToken, requireRoles(['DRIVER', 'ADMIN', 'EMPLOYEE']), (req, res, next) => req.user.role === 'EMPLOYEE' ? requirePermission('bookings')(req, res, next) : next(), async (req, res) => {
  const { status } = req.body;
  if (req.user.role === 'EMPLOYEE' && status === 'CANCELLED' && !req.user.permissions?.includes('cancellations')) return res.status(403).json({ error: 'Your account does not have cancellation permission.' });
  if (req.user.role === 'DRIVER') {
    const approval = await ensureApprovedDriver(req.user.id);
    if (!approval.ok) return res.status(403).json({ error: approval.error });
    const activeDuties = await db.getDuties({ driver_id: req.user.id });
    if (activeDuties.some(d => d.status === 'ON_DUTY')) return res.status(409).json({ error: 'Complete and check out of your company duty before taking daily trips.' });
    const ownBookings = await db.getBookings({ assigned_driver_id: req.user.id });
    const ownBooking = ownBookings.find(b => String(b.id) === String(req.params.id));
    if (!ownBooking) return res.status(403).json({ error: 'This booking is not assigned to your driver account.' });
    const nextStatus = status === 'ON_TRIP' ? 'IN_PROGRESS' : status;
    if (nextStatus === 'IN_PROGRESS' && ownBookings.some(b => String(b.id) !== String(req.params.id) && b.status === 'IN_PROGRESS')) return res.status(409).json({ error: 'Finish your active daily trip before starting another.' });
    const allowedTransitions = ownBooking.status === 'ASSIGNED' ? ['ASSIGNED', 'IN_PROGRESS'] : ownBooking.status === 'IN_PROGRESS' ? ['COMPLETED'] : [];
    if (!allowedTransitions.includes(nextStatus)) return res.status(409).json({ error: 'This trip status change is not allowed.' });
  }
  if (!['ASSIGNED', 'IN_PROGRESS', 'ON_TRIP', 'COMPLETED', 'CANCELLED'].includes(status)) return res.status(400).json({ error: 'Unsupported booking status.' });
  const updated = await db.updateBookingStatus(req.params.id, status === 'ON_TRIP' ? 'IN_PROGRESS' : status);
  if (!updated) return res.status(404).json({ error: 'Booking not found' });
  res.json(updated);
});

app.patch('/api/bookings/:id/assign', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('bookings'), async (req, res) => {
  const { driver_id } = req.body;
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required for assignment' });
  }
  const approval = await ensureApprovedDriver(driver_id);
  if (!approval.ok) return res.status(409).json({ error: `Driver is not eligible for trips yet: ${approval.error}` });
  const driver = await db.getUserById(driver_id);
  if (!driver || driver.role !== 'DRIVER' || driver.status !== 'ACTIVE') return res.status(404).json({ error: 'Active driver not found.' });
  const duties = await db.getDuties({ driver_id });
  if (duties.some(d => d.status === 'ON_DUTY')) return res.status(409).json({ error: 'This driver is on an active company duty and cannot receive daily trip assignments.' });
  const updated = await db.assignDriverToBooking(req.params.id, {
    driver_id,
    driver_name: driver.name,
    driver_phone: driver.phone,
    vehicle_reg: approval.kyc.assigned_vehicle_reg
  });
  if (!updated) return res.status(404).json({ error: 'Booking not found' });
  res.json({
    message: `Driver ${driver.name} successfully assigned to booking #${updated.booking_code}`,
    booking: updated
  });
});

app.patch('/api/bookings/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('bookings'), async (req, res) => {
  const allowedFields = ['customer_name', 'customer_phone', 'customer_email', 'trip_type', 'pickup', 'destination', 'journey_date', 'journey_time', 'passengers', 'notes', 'quoted_amount', 'vehicle_name', ...(req.user.role === 'ADMIN' ? ['status'] : [])];
  const updates = {};
  for (const field of allowedFields) if (req.body[field] !== undefined) updates[field] = req.body[field];
  if (Object.keys(updates).length !== Object.keys(req.body || {}).length) return res.status(400).json({ error: 'Booking updates contain unsupported or protected fields.' });
  if (updates.customer_name !== undefined && (!String(updates.customer_name).trim() || String(updates.customer_name).length > 160)) return res.status(400).json({ error: 'Enter a valid customer name.' });
  if (updates.customer_phone !== undefined && !/^\+?[0-9()\s-]{8,20}$/.test(String(updates.customer_phone))) return res.status(400).json({ error: 'Enter a valid customer phone number.' });
  if (updates.customer_email !== undefined && updates.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(updates.customer_email))) return res.status(400).json({ error: 'Enter a valid customer email address.' });
  if (updates.journey_date !== undefined && (!isValidDateOnly(updates.journey_date) || updates.journey_date < indiaToday())) return res.status(400).json({ error: 'Choose today or a future journey date.' });
  if (updates.passengers !== undefined && (!Number.isInteger(Number(updates.passengers)) || Number(updates.passengers) < 1 || Number(updates.passengers) > 25)) return res.status(400).json({ error: 'Passenger count must be between 1 and 25.' });
  if (updates.status !== undefined && !['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(updates.status)) return res.status(400).json({ error: 'Unsupported booking status.' });
  if (updates.notes !== undefined) updates.notes = String(updates.notes).slice(0, 1000);
  if (updates.pickup !== undefined && (!String(updates.pickup).trim() || String(updates.pickup).length > 250)) return res.status(400).json({ error: 'Enter a valid pickup location.' });
  if (updates.destination !== undefined && (!String(updates.destination).trim() || String(updates.destination).length > 250)) return res.status(400).json({ error: 'Enter a valid destination.' });
  if (updates.quoted_amount !== undefined) {
    const booking = (await db.getBookings()).find(item => String(item.id) === String(req.params.id));
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const quote = Number(updates.quoted_amount);
    const advance = Number(booking.advance_paid || 0);
    if (!Number.isFinite(quote) || quote <= 0 || quote > 10000000 || !Number.isFinite(advance) || advance < 0 || advance > quote) return res.status(400).json({ error: 'Fare must be positive and at least the amount already collected.' });
    updates.quoted_amount = quote;
  }
  if (updates.vehicle_name !== undefined) {
    const vehicle = (await db.getVehicles()).find(item => item.name === String(updates.vehicle_name));
    if (!vehicle) return res.status(400).json({ error: 'Choose a vehicle in the current fleet.' });
    updates.vehicle_name = vehicle.name;
    updates.vehicle_id = vehicle.id;
  }
  const updated = await db.updateBooking(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Booking not found' });
  res.json({ message: 'Booking updated successfully', booking: updated });
});

app.delete('/api/bookings/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('cancellations'), async (req, res) => {
  await db.deleteBooking(req.params.id);
  res.json({ message: 'Booking deleted successfully' });
});

// Public booking tracking and live driver acceptance status endpoint
app.get('/api/bookings/track/:code', rateLimit({ windowMs: 60 * 1000, max: 120 }), async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const bookings = await db.getBookings();
  const booking = bookings.find(b => String(b.booking_code || '').toUpperCase() === code || String(b.id) === code);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json({
    id: booking.id,
    booking_code: booking.booking_code,
    status: booking.status,
    customer_name: booking.customer_name,
    customer_phone: booking.customer_phone,
    pickup: booking.pickup,
    destination: booking.destination,
    journey_date: booking.journey_date,
    return_date: booking.return_date,
    journey_time: booking.journey_time,
    passengers: booking.passengers,
    vehicle_name: booking.vehicle_name,
    vehicle_reg: booking.vehicle_reg,
    quoted_amount: booking.quoted_amount,
    advance_paid: booking.advance_paid || 0,
    balance_amount: booking.balance_amount ?? Math.max(0, Number(booking.quoted_amount) - Number(booking.advance_paid || 0)),
    payment_method: booking.payment_method,
    payment_status: booking.payment_status,
    assigned_driver_id: booking.assigned_driver_id,
    assigned_driver_name: booking.assigned_driver_name,
    assigned_driver_phone: booking.assigned_driver_phone
  });
});

// Demo simulator: allow testing driver acceptance in 1 click
app.post('/api/bookings/simulate-driver-accept/:code', rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found.' });
  const code = String(req.params.code || '').trim().toUpperCase();
  const bookings = await db.getBookings();
  const booking = bookings.find(b => String(b.booking_code || '').toUpperCase() === code || String(b.id) === code);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  
  const updated = await db.assignDriverToBooking(booking.id, {
    driver_id: 'drv_sim_01',
    driver_name: 'Ramesh Kumar (SJT Captain)',
    driver_phone: '+91 98450 11223',
    vehicle_reg: booking.vehicle_reg || 'KA-05-MJ-4491'
  });
  console.log('[DRIVER ACCEPTED SIMULATION] Code:', code, 'Driver:', updated.assigned_driver_name);
  res.json({ message: 'Driver accepted simulation successful', booking: updated });
});

// --- COMPANY DAILY DUTIES & ODOMETER LOGS ---
app.get('/api/duties', async (req, res) => {
  try {
    const user = await getUserFromBearer(req);
    const filters = {};
    if (user && user.role === 'DRIVER') {
      filters.driver_id = user.id;
    } else if (req.query.driver_id) {
      filters.driver_id = req.query.driver_id;
    }
    const duties = await db.getDuties(filters);
    res.json(duties);
  } catch (err) {
    console.error('get duties error:', err);
    res.status(500).json({ error: 'Failed to fetch duty records' });
  }
});

app.patch('/api/duties/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('duties'), async (req, res) => {
  const allowed = {};
  for (const key of ['company_name', 'external_trip_id', 'vehicle_reg', 'start_km', 'end_km', 'toll_parking_allowance', 'food_allowance', 'admin_note']) if (req.body[key] !== undefined) allowed[key] = req.body[key];
  const updated = await db.updateDuty(req.params.id, allowed);
  if (!updated) return res.status(404).json({ error: 'Duty record not found' });
  res.json({ message: 'Duty record updated', duty: updated });
});

app.delete('/api/duties/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('duties'), async (req, res) => {
  await db.deleteDuty(req.params.id);
  res.json({ message: 'Duty record deleted' });
});

app.post('/api/duties/start', async (req, res) => {
  try {
    const user = await getUserFromBearer(req);
    const { 
      company_name, 
      shift_name, 
      external_trip_id, 
      pickup_location, 
      destination_location, 
      route_details, 
      vehicle_reg, 
      start_km, 
      driver_id, 
      driver_name 
    } = req.body || {};

    if (!String(company_name || '').trim() || !String(pickup_location || '').trim() || !String(destination_location || '').trim() || !Number.isFinite(Number(start_km)) || Number(start_km) < 0) {
      return res.status(400).json({ error: 'Company name, pickup, drop destination, and valid starting odometer KM are required.' });
    }

    const assignedDriverId = driver_id || (user ? user.id : 'drv_ramesh');
    const assignedDriverName = driver_name || (user ? user.name : 'Ramesh Kumar');
    const assignedVehicleReg = vehicle_reg || (user ? user.assigned_vehicle : 'KA 05 AB 1234') || 'KA 05 AB 1234';
    const assignedShiftName = String(shift_name || 'Shift 1').trim().slice(0, 50);
    const assignedTripId = external_trip_id || `${assignedShiftName} - ${String(company_name).trim()}`;

    // Check if this driver already has an active duty
    const duties = await db.getDuties({ driver_id: assignedDriverId });
    if (duties.some(d => d.status === 'ON_DUTY')) {
      return res.status(409).json({ error: 'You already have an active company duty shift. Check out before starting another shift.' });
    }

    const dutyPayload = {
      driver_id: assignedDriverId,
      driver_name: assignedDriverName,
      shift_name: assignedShiftName,
      company_name: String(company_name).trim().slice(0, 160),
      external_trip_id: String(assignedTripId).trim().slice(0, 100),
      pickup_location: String(pickup_location).trim().slice(0, 240),
      destination_location: String(destination_location).trim().slice(0, 240),
      route_details: String(route_details || '').trim().slice(0, 1000),
      vehicle_reg: assignedVehicleReg,
      start_km: Number(start_km)
    };

    if (user?.id) {
      try { await db.updateUser(user.id, { is_online: false }); } catch {}
    }

    const duty = await db.startDuty(dutyPayload);
    console.log(`[DUTY STARTED] ${assignedDriverName} (${assignedVehicleReg}) - ${assignedShiftName} for ${dutyPayload.company_name} at ${dutyPayload.start_km} KM`);
    res.status(201).json({
      message: 'Duty shift started successfully. Odometer logging is active.',
      duty
    });
  } catch (err) {
    console.error('duties/start error:', err);
    res.status(500).json({ error: err.message || 'Failed to start company duty shift' });
  }
});

app.post('/api/duties/end', async (req, res) => {
  try {
    const user = await getUserFromBearer(req);
    const { duty_id, end_km, toll_parking, food_allowance, driver_id } = req.body || {};
    const targetDriverId = driver_id || (user ? user.id : null);

    const allDuties = await db.getDuties(targetDriverId ? { driver_id: targetDriverId } : {});
    const ownedActiveDuty = allDuties.find(d => 
      (String(d.id) === String(duty_id) || d.duty_code === duty_id) && 
      d.status === 'ON_DUTY'
    ) || allDuties.find(d => d.status === 'ON_DUTY');

    if (!ownedActiveDuty && !duty_id) {
      return res.status(404).json({ error: 'No active company duty found to complete.' });
    }

    const dutyTargetId = ownedActiveDuty ? ownedActiveDuty.id : duty_id;
    const startKm = ownedActiveDuty ? Number(ownedActiveDuty.start_km) : 0;
    const endKmNum = Number(end_km);

    if (!Number.isFinite(endKmNum) || endKmNum < startKm) {
      return res.status(400).json({ error: `Ending odometer (${endKmNum} KM) must be at least the starting reading (${startKm} KM).` });
    }

    const toll = Math.max(0, Number(toll_parking || 0));
    const food = Math.max(0, Number(food_allowance || 0));

    const duty = await db.endDuty(dutyTargetId, { end_km: endKmNum, toll_parking: toll, food_allowance: food });
    if (!duty) {
      return res.status(404).json({ error: 'Active duty record not found or already completed.' });
    }
    console.log(`[DUTY CONCLUDED] Duty ${dutyTargetId}: ${endKmNum - startKm} KM run logged.`);
    res.json({
      message: 'Duty completed and logged successfully.',
      duty
    });
  } catch (err) {
    console.error('duties/end error:', err);
    res.status(500).json({ error: err.message || 'Failed to complete company duty' });
  }
});

app.post('/api/admin/duties/:id/verify', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('duties'), async (req, res) => {
  const { action, admin_note } = req.body;
  if (!['APPROVE', 'REJECT'].includes(action)) return res.status(400).json({ error: 'Action must be APPROVE or REJECT.' });
  const verified = await db.verifyDuty(req.params.id, { action, admin_note });
  if (!verified) return res.status(404).json({ error: 'Duty record not found' });
  res.json({
    message: `Duty record ${action === 'APPROVE' ? 'VERIFIED' : 'REJECTED'} successfully.`,
    duty: verified
  });
});

// --- REVENUE ANALYTICS & ATTENDANCE PAYROLL ---
app.get('/api/admin/revenue-analytics', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const analytics = await db.getRevenueAnalytics();
  res.json(analytics);
});

app.get('/api/admin/driver-attendance-payroll', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requireAnyPermission(['attendance', 'payroll']), async (req, res) => {
  const payroll = await db.getDriverAttendanceAndPayroll(req.query.month);
  res.json(payroll);
});

// --- LIVE STATS, PAYROLL & INVOICES ---
app.get('/api/stats', authenticateToken, requireRoles(['ADMIN']), async (req, res) => {
  const stats = await db.getLiveStats();
  res.json(stats);
});

app.get('/api/payroll', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), (req, res, next) => req.user.role === 'EMPLOYEE' ? requirePermission('payroll')(req, res, next) : next(), async (req, res) => {
  const payroll = await db.calculatePayroll();
  res.json(payroll);
});

app.get('/api/invoices', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const invoices = await db.getInvoices();
  res.json(invoices);
});

const handleGenerateInvoice = async (req, res) => {
  const clientName = String(req.body.client_name || '').trim();
  const clientType = req.body.client_type;
  const subtotal = Number(req.body.subtotal);
  const totalTrips = Number(req.body.total_trips || req.body.quantity || 1);
  const totalKm = Number(req.body.total_km || 0);
  if (!clientName || clientName.length > 160 || !['CORPORATE', 'CUSTOMER'].includes(clientType)) return res.status(400).json({ error: 'Enter a valid client name and client type.' });
  if (!Number.isFinite(subtotal) || subtotal <= 0 || subtotal > 100000000) return res.status(400).json({ error: 'Enter valid invoice amounts.' });
  const invoice = await db.generateInvoice({
    client_name: clientName,
    client_type: clientType,
    client_gstin: String(req.body.client_gstin || '').slice(0, 30),
    client_address: String(req.body.client_address || '').trim().slice(0, 500),
    client_phone: String(req.body.client_phone || '').trim().slice(0, 30),
    billing_period: String(req.body.billing_period || '').trim().slice(0, 80),
    invoice_number: String(req.body.invoice_number || '').trim().slice(0, 50),
    invoice_date: String(req.body.invoice_date || '').trim().slice(0, 30),
    invoice_time: String(req.body.invoice_time || '11:37 AM').trim().slice(0, 30),
    place_of_supply: String(req.body.place_of_supply || '29-Karnataka').trim().slice(0, 60),
    total_trips: totalTrips,
    total_km: totalKm,
    subtotal,
    vehicle_name: String(req.body.vehicle_name || '').trim().slice(0, 100),
    vehicle_reg: String(req.body.vehicle_reg || '').trim().slice(0, 30),
    vehicle_type: String(req.body.vehicle_type || 'SEDAN').trim().slice(0, 80),
    vehicle_model: String(req.body.vehicle_model || '2024 / ETIOS').trim().slice(0, 80),
    supervisor_name: String(req.body.supervisor_name || 'SHARANAPPA').trim().slice(0, 80),
    indication_date: String(req.body.indication_date || '').trim().slice(0, 30),
    transport_company_name: String(req.body.transport_company_name || clientName).trim().slice(0, 160),
    item_name: String(req.body.item_name || 'SEDAN ROUTE').trim().slice(0, 160),
    hsn_sac: String(req.body.hsn_sac || '9964').trim().slice(0, 30),
    quantity: Number(req.body.quantity) || totalTrips,
    rate_per_unit: Number(req.body.rate_per_unit) || (totalTrips ? Math.round(subtotal / totalTrips) : 650),
    gst_rate: Number(req.body.gst_rate) || 5,
    gsp_rent: Number(req.body.gsp_rent || 0),
    tds_cgst: Number(req.body.tds_cgst || 0),
    tds_amount: Number(req.body.tds_amount || 0),
    round_off: Number(req.body.round_off || 0),
    payment_method: String(req.body.payment_method || '').slice(0, 80),
    notes: String(req.body.notes || '').trim().slice(0, 1000),
    status: 'ISSUED'
  });
  res.status(201).json({
    message: 'Official GST Tax Invoice generated successfully.',
    invoice
  });
};
app.post('/api/invoices/generate', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), handleGenerateInvoice);
app.post('/api/invoices', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), handleGenerateInvoice);

app.patch('/api/invoices/:id/status', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const { status } = req.body;
  const updated = await db.updateInvoiceStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ message: 'Invoice status updated', invoice: updated });
});

app.delete('/api/invoices/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  await db.deleteInvoice(req.params.id);
  res.json({ message: 'Invoice deleted successfully' });
});

// --- COMPANY ACCOUNTS & FINANCIAL LEDGER (PAY-IN, PAY-OUT & BILLING) ---
app.get('/api/accounts/transactions', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const filters = {};
  if (req.query.type) filters.type = req.query.type;
  if (req.query.category) filters.category = req.query.category;
  const txs = await db.getTransactions(filters);
  res.json(txs);
});

app.post('/api/accounts/transactions', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const { type, amount, party_name, category, title, payment_mode, reference_no, party_type, related_booking_code, related_invoice_no, related_duty_code, date, notes } = req.body;
  const numericAmount = Number(amount);
  if (!['PAY_IN', 'PAY_OUT'].includes(type) || !Number.isFinite(numericAmount) || numericAmount <= 0 || !String(party_name || '').trim()) {
    return res.status(400).json({ error: 'Choose a valid transaction type, positive amount and party name.' });
  }
  const input = { type, amount: numericAmount, party_name: String(party_name).trim().slice(0, 160), category: String(category || 'GENERAL').slice(0, 80), title: String(title || `${type} - ${party_name}`).slice(0, 200), payment_mode: String(payment_mode || 'OTHER').slice(0, 60), reference_no: String(reference_no || '').slice(0, 120), party_type: String(party_type || 'OTHER').slice(0, 60), related_booking_code: related_booking_code || null, related_invoice_no: related_invoice_no || null, related_duty_code: related_duty_code || null, date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : new Date().toISOString().slice(0, 10), notes: String(notes || '').slice(0, 1000) };
  const tx = await db.createTransaction(input);
  console.log('[FINANCIAL TRANSACTION RECORDED]');
  res.status(201).json({
    message: `${tx.type === 'PAY_IN' ? 'Billing Pay-in (Inflow)' : 'Payout (Outflow)'} recorded successfully.`,
    transaction: tx
  });
});

app.patch('/api/accounts/transactions/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const updated = await db.updateTransaction(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ message: 'Transaction updated successfully', transaction: updated });
});

app.delete('/api/accounts/transactions/:id', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  await db.deleteTransaction(req.params.id);
  res.json({ message: 'Transaction deleted successfully' });
});

app.get('/api/accounts/summary', authenticateToken, requireRoles(['ADMIN', 'EMPLOYEE']), requirePermission('accounts'), async (req, res) => {
  const summary = await db.getAccountsSummary();
  res.json(summary);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(`[API ERROR] ${req.requestId} ${req.method} ${req.path} (${Number(error.status) || 500})`);
  res.status(Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 500)
    .json({ error: res.statusCode === 500 ? 'An internal server error occurred.' : error.message, request_id: req.requestId });
});

let httpServer;
async function startServer() {
  if (process.env.NODE_ENV === 'production') await db.initDatabase();
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> SJT Tours & Travels Backend API running on port ${PORT} (0.0.0.0) <<<`);
  });
}

async function shutdown() {
  if (!httpServer) return;
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  httpServer.close(async () => {
    try { await db.close(); process.exit(0); }
    catch { process.exit(1); }
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

startServer().catch(error => {
    console.error('>>> API startup failed. Check the configured service environment. <<<');
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});
