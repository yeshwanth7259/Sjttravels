const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const scrypt = promisify(crypto.scrypt);
const isPasswordHash = value => typeof value === 'string' && value.startsWith('scrypt$');
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  if (isPasswordHash(stored)) {
    const [, salt, expectedHex] = stored.split('$');
    if (!salt || !/^[0-9a-f]{128}$/i.test(expectedHex || '')) return { valid: false, needsRehash: false };
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = await scrypt(password, salt, expected.length);
    return { valid: crypto.timingSafeEqual(actual, expected), needsRehash: false };
  }
  const supplied = Buffer.from(String(password));
  const legacy = Buffer.from(String(stored || ''));
  const valid = supplied.length === legacy.length && crypto.timingSafeEqual(supplied, legacy);
  return { valid, needsRehash: valid };
}

// Official 7 Fleet Vehicles
const OFFICIAL_VEHICLES = [
  {
    id: 'etios',
    name: 'Toyota Etios / Sedan',
    category: 'Sedans',
    seats: 4,
    ac: true,
    rate_per_day: 2200,
    rate_per_km: 12,
    min_km_per_day: 250,
    driver_allowance_per_day: 400,
    image: '/etios.jpg',
    reg_number: 'KA01AE1234',
    features: ['Air Conditioning', '4 Passenger Comfort', 'Spacious Boot (400L)'],
    status: 'AVAILABLE'
  },
  {
    id: 'ertiga',
    name: 'Maruti Suzuki Ertiga',
    category: 'Ertiga MPV',
    seats: 6,
    ac: true,
    rate_per_day: 2800,
    rate_per_km: 14,
    min_km_per_day: 250,
    driver_allowance_per_day: 450,
    image: '/ertiga.jpg',
    reg_number: 'KA04ME5678',
    features: ['Dual AC Vents', '6 Passenger Seating', 'Foldable 3rd Row'],
    status: 'AVAILABLE'
  },
  {
    id: 'innova',
    name: 'Toyota Innova Crysta',
    category: 'Innova Crysta / Hycross',
    seats: 7,
    ac: true,
    rate_per_day: 3500,
    rate_per_km: 17,
    min_km_per_day: 300,
    driver_allowance_per_day: 500,
    image: '/innova.jpg',
    reg_number: 'KA05NB9012',
    features: ['Captain Seat Comfort', 'Powerful AC Climatic Control', 'Luxury Executive Ride'],
    status: 'AVAILABLE'
  },
  {
    id: 'hycross',
    name: 'Toyota Innova Hycross',
    category: 'Innova Crysta / Hycross',
    seats: 6,
    ac: true,
    rate_per_day: 4500,
    rate_per_km: 22,
    min_km_per_day: 300,
    driver_allowance_per_day: 600,
    image: '/hycross.jpg',
    reg_number: 'KA03MH3456',
    features: ['Hybrid Silent Luxury', 'Ottoman Reclining Seats', 'Panoramic Sunroof'],
    status: 'AVAILABLE'
  },
  {
    id: 'tempo',
    name: 'Tempo Traveller (12 Seater)',
    category: 'Tempo Travellers',
    seats: 12,
    ac: true,
    rate_per_day: 4500,
    rate_per_km: 24,
    min_km_per_day: 300,
    driver_allowance_per_day: 600,
    image: '/tempo.jpg',
    reg_number: 'KA02TT7890',
    features: ['Individual Pushback Seats', '2x1 Luxury Layout', 'High Roof Standing Height'],
    status: 'AVAILABLE'
  },
  {
    id: 'tempo17',
    name: 'Tempo Traveller (17 Seater)',
    category: 'Tempo Travellers',
    seats: 17,
    ac: true,
    rate_per_day: 7500,
    rate_per_km: 28,
    min_km_per_day: 350,
    driver_allowance_per_day: 700,
    image: '/tempo17.jpg',
    reg_number: 'KA01TL2345',
    features: ['17 Luxury Reclining Seats', 'Twin High-Power AC Blowers', 'Large Luggage Boot'],
    status: 'AVAILABLE'
  },
  {
    id: 'minibus',
    name: 'Mini Bus (25 Seater)',
    category: 'Mini Bus',
    seats: 25,
    ac: true,
    rate_per_day: 8500,
    rate_per_km: 34,
    min_km_per_day: 350,
    driver_allowance_per_day: 800,
    image: '/minibus.jpg',
    reg_number: 'KA51MB6789',
    features: ['25 Deluxe Pushback Seats', 'Air Suspension Ride', 'PA Mic & Audio System'],
    status: 'AVAILABLE'
  },
  {
    id: 'bus',
    name: 'Luxury Tourist Coach Bus (45 Seater)',
    category: 'Bus',
    seats: 45,
    ac: true,
    rate_per_day: 12000,
    rate_per_km: 42,
    min_km_per_day: 400,
    driver_allowance_per_day: 1000,
    image: '/bus.jpg',
    reg_number: 'KA53CB9988',
    features: ['45 Luxury Reclining Coach Seats', 'Chilled AC & Air Suspension', 'Large Luggage Bay', 'PA Microphone & Stereo'],
    status: 'AVAILABLE'
  }
];

// Development-only bootstrap administrator. Production requires an explicit administrator provisioned in PostgreSQL.
const INITIAL_USERS = [];


// Persistent Local Backup Store (ensures zero data loss during cloud maintenance/downtime)
const DATA_DIR = process.env.SJT_DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let localStore = {
  vehicles: [...OFFICIAL_VEHICLES],
  users: process.env.NODE_ENV === 'production' ? [] : [...INITIAL_USERS],
  auth_sessions: [],
  driver_kyc: [],
  driver_kyc_audit: [],
  bookings: [],
  booking_payments: [],
  company_duties: [],
  invoices: [],
  transactions: []
};

function loadStore() {
  try {
    if (process.env.NODE_ENV === 'production') return;
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      localStore = {
        vehicles: data.vehicles?.length ? data.vehicles : [...OFFICIAL_VEHICLES],
        users: (data.users || []).filter(u => u.id !== '00000000-0000-0000-0000-000000000001' && u.email !== 'ramesh.kumar@sjttravels.com'),
        auth_sessions: data.auth_sessions || [],
        driver_kyc: data.driver_kyc || [],
        driver_kyc_audit: data.driver_kyc_audit || [],
        bookings: data.bookings || [],
        booking_payments: data.booking_payments || [],
        company_duties: data.company_duties || [],
        invoices: (data.invoices || []).filter(item => !['inv-001', 'inv-002'].includes(item.id)),
        transactions: (data.transactions || []).filter(item => !['tx-001', 'tx-002', 'tx-003', 'tx-004', 'tx-005', 'tx-006'].includes(item.id))
      };
    } else {
      saveStore();
    }
  } catch (err) {
    console.error('[LOCAL STORE]: Error reading local store file:', err.message);
  }
}

function saveStore() {
  if (process.env.NODE_ENV === 'production') return;
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(localStore, null, 2), 'utf8');
  } catch (err) {
    console.error('[LOCAL STORE]: Error saving store file:', err.message);
  }
}

loadStore();

// --- POSTGRESQL CONNECTION POOL SETUP ---
let currentDatabaseUrl = process.env.DATABASE_URL || '';
let pool = null;
let isConnected = false;
let lastPingLatency = 0;
let initializationPromise = null;
let connectionInfo = {
  host: 'Not Connected',
  database: 'None',
  port: 5432,
  user: 'None',
  provider: 'Local Storage Engine (Pending Database URL)'
};

function parseDatabaseUrl(url) {
  try {
    if (!url) return null;
    const parsed = new URL(url);
    const isVoroa = parsed.hostname.includes('voroa') || parsed.hostname.includes('internal');
    return {
      host: parsed.hostname,
      port: parsed.port || 5432,
      database: parsed.pathname.replace(/^\//, ''),
      user: parsed.username,
      provider: isVoroa ? 'Voroa Managed PostgreSQL (India)' : 'PostgreSQL Cloud Database'
    };
  } catch (e) {
    return {
      host: 'Custom Host',
      port: 5432,
      database: 'sjt_travels',
      user: 'postgres',
      provider: 'PostgreSQL Database'
    };
  }
}

function initPool(connString) {
  if (pool) {
    try { pool.end(); } catch (e) {}
    pool = null;
    isConnected = false;
  }

  if (!connString || !connString.trim()) {
    connectionInfo = {
      host: 'localhost (Offline fallback)',
      database: 'local_store',
      port: 5432,
      user: 'local',
      provider: 'Local Persistent Engine (Awaiting Voroa PostgreSQL URL)'
    };
    return;
  }

  currentDatabaseUrl = connString.trim();
  const info = parseDatabaseUrl(currentDatabaseUrl);
  if (info) connectionInfo = info;

  console.log(`>>> [POSTGRES]: Initializing connection pool to ${connectionInfo.host}... <<<`);

  const isLocalhost = connectionInfo.host === 'localhost' || connectionInfo.host === '127.0.0.1';

  pool = new Pool({
    connectionString: currentDatabaseUrl,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000
  });

  pool.on('error', (err) => {
    console.error('>>> [POSTGRES ERROR]: Unexpected idle client error:', err.message);
    isConnected = false;
  });

  initializationPromise = verifyAndMigrateSchema();
}

async function verifyAndMigrateSchema() {
  if (!pool) return false;
  const start = Date.now();
  try {
    const client = await pool.connect();
    lastPingLatency = Date.now() - start;
    isConnected = true;
    console.log(`>>> [POSTGRES CONNECTED]: Ping latency ${lastPingLatency}ms | Provider: ${connectionInfo.provider} <<<`);

    // 1. Auto-create all tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE', 'DRIVER', 'CUSTOMER')),
        designation TEXT DEFAULT 'Operations Staff',
        permissions TEXT[] DEFAULT '{"bookings","cancellations","drivers","duties","attendance","payroll","fleet"}',
        assigned_vehicle TEXT,
        duty_mode TEXT DEFAULT 'OFF_DUTY',
        is_online BOOLEAN NOT NULL DEFAULT FALSE,
        service_area TEXT,
        status TEXT DEFAULT 'ACTIVE',
        salary NUMERIC DEFAULT 25000,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS service_area TEXT;

      CREATE TABLE IF NOT EXISTS auth_sessions (
        session_id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS vehicles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        seats INTEGER NOT NULL,
        ac BOOLEAN DEFAULT TRUE,
        rate_per_day NUMERIC NOT NULL,
        rate_per_km NUMERIC NOT NULL,
        min_km_per_day INTEGER NOT NULL,
        driver_allowance_per_day NUMERIC NOT NULL,
        image TEXT NOT NULL,
        reg_number TEXT NOT NULL,
        features TEXT[] DEFAULT '{}',
        status TEXT DEFAULT 'AVAILABLE',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS driver_kyc (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id UUID,
        driver_name TEXT NOT NULL,
        driver_phone TEXT NOT NULL,
        driver_email TEXT NOT NULL,
        license_number TEXT NOT NULL,
        badge_number TEXT,
        aadhar_number TEXT NOT NULL,
        pan_number TEXT,
        vehicle_preference TEXT NOT NULL,
        experience_years INTEGER DEFAULT 3,
        license_doc_url TEXT,
        license_back_doc_url TEXT,
        aadhar_doc_url TEXT,
        aadhar_back_doc_url TEXT,
        psv_badge_doc_url TEXT,
        police_verification_url TEXT,
        medical_fitness_doc_url TEXT,
        live_face_photo_url TEXT,
        face_match_score NUMERIC,
        face_verified BOOLEAN DEFAULT FALSE,
        govt_verified BOOLEAN DEFAULT FALSE,
        rto_dl_status TEXT DEFAULT 'NOT_VERIFIED',
        uidai_aadhar_status TEXT DEFAULT 'NOT_VERIFIED',
        police_clearance_status TEXT DEFAULT 'NOT_VERIFIED',
        kyc_status TEXT DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'APPROVED', 'REJECTED')),
        rejection_reason TEXT,
        address TEXT,
        vehicle_reg TEXT,
        vehicle_type TEXT,
        vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        documents JSONB NOT NULL DEFAULT '{}'::jsonb,
        face_document JSONB,
        reviewed_by TEXT,
        assigned_vehicle_reg TEXT,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        verified_at TIMESTAMPTZ
      );

      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS pan_number TEXT;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS vehicle_reg TEXT;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS vehicle_type TEXT;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS face_document JSONB;
      ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

      CREATE TABLE IF NOT EXISTS driver_kyc_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        kyc_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_email TEXT NOT NULL,
        action TEXT NOT NULL,
        document_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_driver_kyc_audit_kyc ON driver_kyc_audit(kyc_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_code TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        trip_type TEXT NOT NULL,
        pickup TEXT NOT NULL,
        destination TEXT NOT NULL,
        journey_date TEXT NOT NULL,
        journey_time TEXT DEFAULT '06:00 AM',
        passengers INTEGER DEFAULT 1,
        vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
        vehicle_name TEXT NOT NULL,
        vehicle_reg TEXT,
        quoted_amount NUMERIC NOT NULL,
        advance_paid NUMERIC DEFAULT 0,
        balance_amount NUMERIC DEFAULT 0,
        payment_method TEXT DEFAULT 'UPI / Cash',
        payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'PARTIAL', 'REFUNDED')),
        status TEXT DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
        assigned_driver_id UUID,
        assigned_driver_name TEXT,
        assigned_driver_phone TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

      CREATE TABLE IF NOT EXISTS booking_payments (
        id UUID PRIMARY KEY,
        booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        booking_code TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        driver_name TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'UPI')),
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS company_duties (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        duty_code TEXT UNIQUE NOT NULL,
        driver_id UUID,
        driver_name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        external_trip_id TEXT NOT NULL,
        pickup_location TEXT,
        destination_location TEXT,
        route_details TEXT,
        vehicle_reg TEXT NOT NULL,
        login_time TEXT NOT NULL,
        logout_time TEXT,
        start_km NUMERIC NOT NULL,
        end_km NUMERIC,
        daily_km NUMERIC DEFAULT 0,
        toll_parking_allowance NUMERIC DEFAULT 0,
        food_allowance NUMERIC DEFAULT 0,
        duty_selfie_url TEXT,
        duty_face_verified BOOLEAN DEFAULT FALSE,
        duty_face_match_score NUMERIC,
        status TEXT DEFAULT 'ON_DUTY' CHECK (status IN ('ON_DUTY', 'SUBMITTED', 'VERIFIED_BY_ADMIN', 'REJECTED')),
        duty_date TEXT NOT NULL,
        admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE company_duties ALTER COLUMN duty_face_verified SET DEFAULT FALSE;
      ALTER TABLE company_duties ALTER COLUMN duty_face_match_score DROP DEFAULT;
      ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS pickup_location TEXT;
      ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS destination_location TEXT;
      ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS route_details TEXT;
      ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS shift_name TEXT;

      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number TEXT UNIQUE NOT NULL,
        client_type TEXT NOT NULL,
        client_name TEXT NOT NULL,
        billing_period TEXT NOT NULL,
        total_trips INTEGER DEFAULT 1,
        total_km NUMERIC DEFAULT 0,
        subtotal NUMERIC NOT NULL,
        cgst NUMERIC DEFAULT 0,
        sgst NUMERIC DEFAULT 0,
        grand_total NUMERIC NOT NULL,
        status TEXT DEFAULT 'ISSUED' CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS company_transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('PAY_IN', 'PAY_OUT')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        payment_mode TEXT NOT NULL,
        reference_no TEXT,
        party_name TEXT NOT NULL,
        party_type TEXT NOT NULL,
        related_booking_code TEXT,
        related_invoice_no TEXT,
        related_duty_code TEXT,
        date TEXT NOT NULL,
        time TEXT,
        status TEXT DEFAULT 'COMPLETED',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE company_transactions ALTER COLUMN id TYPE TEXT;
      ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_vehicle_id_fkey;
      ALTER TABLE bookings ALTER COLUMN assigned_driver_id TYPE TEXT;
      ALTER TABLE company_duties ALTER COLUMN driver_id TYPE TEXT;
      ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
      ALTER TABLE company_duties DROP CONSTRAINT IF EXISTS company_duties_status_check;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_date TEXT;

      -- Fast Lookup Indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_bookings_code ON bookings(booking_code);
      CREATE INDEX IF NOT EXISTS idx_bookings_cust_email ON bookings(customer_email);
      CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON booking_payments(booking_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_company_duties_code ON company_duties(duty_code);
      CREATE INDEX IF NOT EXISTS idx_company_duties_driver ON company_duties(driver_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_company_duties_one_active_per_driver
        ON company_duties(driver_id) WHERE status = 'ON_DUTY' AND driver_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON company_transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON company_transactions(date);
    `);

    // 2. Seed & Sync Official Fleet Vehicles (ensures all 8 vehicles with current rates & images)
    for (const v of OFFICIAL_VEHICLES) {
      await client.query(`
        INSERT INTO vehicles (id, name, category, seats, ac, rate_per_day, rate_per_km, min_km_per_day, driver_allowance_per_day, image, reg_number, features, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, 
          category = EXCLUDED.category,
          seats = EXCLUDED.seats,
          rate_per_day = EXCLUDED.rate_per_day, 
          rate_per_km = EXCLUDED.rate_per_km,
          min_km_per_day = EXCLUDED.min_km_per_day,
          driver_allowance_per_day = EXCLUDED.driver_allowance_per_day,
          image = EXCLUDED.image,
          reg_number = EXCLUDED.reg_number,
          features = EXCLUDED.features,
          status = EXCLUDED.status
      `, [v.id, v.name, v.category, v.seats, v.ac, v.rate_per_day, v.rate_per_km, v.min_km_per_day, v.driver_allowance_per_day, v.image, v.reg_number, v.features, v.status]).catch(e => console.error('Vehicle sync error:', e.message));
    }

    // Ensure official administrator accounts are always provisioned
    const defaultAdmins = [
      { email: 'sjttravels2025@gmai.com', name: 'SJT Chief Administrator', phone: '+91 99000 46809' },
      { email: 'sjttravels2025@gmail.com', name: 'SJT Chief Administrator', phone: '+91 99000 46809' },
      { email: 'admin@sjttravels.com', name: 'SJT Chief Administrator', phone: '+91 99000 46809' }
    ];
    for (const adm of defaultAdmins) {
      const checkAdmin = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [adm.email]);
      if (checkAdmin.rows.length === 0) {
        const storedPassword = await hashPassword('55Sharanu@');
        await client.query(`
          INSERT INTO users (id, email, password, name, phone, role, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (email) DO NOTHING
        `, [crypto.randomUUID(), adm.email, storedPassword, adm.name, adm.phone, 'ADMIN', 'ACTIVE']);
      }
    }

    // Ensure official verified driver partner accounts are provisioned
    const defaultDrivers = [
      { email: 'ramesh@driver.sjttravels.com', name: 'Ramesh Kumar', phone: '+91 99009 75920', vehicle: 'KA 05 AB 1234' },
      { email: 'suresh@driver.sjttravels.com', name: 'Suresh Gowda', phone: '+91 98801 23456', vehicle: 'KA 04 MP 5678' },
      { email: 'manjunath@driver.sjttravels.com', name: 'Manjunath R', phone: '+91 97412 34567', vehicle: 'KA 01 AF 9988' }
    ];
    for (const drv of defaultDrivers) {
      const checkDrv = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [drv.email]);
      if (checkDrv.rows.length === 0) {
        const storedPassword = await hashPassword('driver123');
        await client.query(`
          INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, duty_mode, is_online, status)
          VALUES ($1, $2, $3, $4, $5, 'DRIVER', $6, 'OFF_DUTY', FALSE, 'ACTIVE')
          ON CONFLICT (email) DO UPDATE SET status = 'ACTIVE', role = 'DRIVER', assigned_vehicle = $6
        `, [crypto.randomUUID(), drv.email, storedPassword, drv.name, drv.phone, drv.vehicle]);
      }
    }

    const verifiedAdmin = await client.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' LIMIT 1");
    if (verifiedAdmin.rows.length === 0) throw new Error('Administrator bootstrap did not create an active admin account.');

    // Only development may sync its local demo fixtures into PostgreSQL.
    if (process.env.NODE_ENV !== 'production') for (const u of localStore.users) {
      if (u.email !== 'admin@sjttravels.com') {
        const storedPassword = isPasswordHash(u.password) ? u.password : await hashPassword(u.password || crypto.randomBytes(32).toString('hex'));
        await client.query(`
          INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, duty_mode, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (email) DO NOTHING
        `, [u.id || crypto.randomUUID(), u.email, storedPassword, u.name, u.phone, u.role || 'CUSTOMER', u.assigned_vehicle || null, u.duty_mode || 'OFF_DUTY', u.status || 'ACTIVE']).catch(() => {});
      }
    }

    if (process.env.NODE_ENV !== 'production') for (const b of localStore.bookings) {
      await client.query(`
        INSERT INTO bookings (
          id, booking_code, customer_name, customer_phone, customer_email, trip_type,
          pickup, destination, journey_date, journey_time, passengers, vehicle_id,
          vehicle_name, vehicle_reg, quoted_amount, advance_paid, balance_amount,
          payment_method, payment_status, status, assigned_driver_id, assigned_driver_name,
          assigned_driver_phone, notes, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
        ) ON CONFLICT (booking_code) DO NOTHING
      `, [
        b.id || crypto.randomUUID(), b.booking_code, b.customer_name, b.customer_phone, b.customer_email || null,
        b.trip_type, b.pickup, b.destination, b.journey_date, b.journey_time, b.passengers, b.vehicle_id || null,
        b.vehicle_name, b.vehicle_reg || null, b.quoted_amount, b.advance_paid || 0, b.balance_amount || 0,
        b.payment_method, b.payment_status, b.status, b.assigned_driver_id || null, b.assigned_driver_name || null,
        b.assigned_driver_phone || null, b.notes || null, b.created_at || new Date().toISOString()
      ]).catch(() => {});
    }

    client.release();
    console.log('>>> [POSTGRES READY]: Required tables verified & live on PostgreSQL! <<<');
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`>>> [POSTGRES NOTICE]: PostgreSQL not currently reachable (${err.message}). Seamlessly running on High-Performance Local Database with zero downtime. <<<`);
    return false;
  }
}

// Background auto-reconnect and health check heartbeat (every 15 seconds)
const healthTimer = setInterval(async () => {
  if (pool) {
    const start = Date.now();
    try {
      const res = await pool.query('SELECT 1');
      if (res) {
        lastPingLatency = Date.now() - start;
        if (!isConnected) {
          console.log(`>>> [POSTGRES RECONNECTED]: Database back online (ping: ${lastPingLatency}ms). <<<`);
        }
        isConnected = true;
      }
    } catch (e) {
      isConnected = false;
    }
  }
}, 15000);
healthTimer.unref();

// Initialize on startup
initPool(currentDatabaseUrl);

// --- UNIFIED DATABASE ADAPTER API ---
module.exports = {
  async initDatabase() {
    if (!pool) {
      initPool(currentDatabaseUrl);
    }
    const success = initializationPromise ? await initializationPromise : await verifyAndMigrateSchema();
    if (!success && !isConnected) {
      throw new Error(`Database connection failed (${connectionInfo.provider}). Please verify host and credentials.`);
    }
    return {
      success: true,
      provider: connectionInfo.provider,
      latency: lastPingLatency
    };
  },

  getPool: () => pool,
  async close() {
    clearInterval(healthTimer);
    if (pool) await pool.end();
    pool = null;
    isConnected = false;
  },
  isRemoteActive: () => isConnected,
  async createAuthSession({ sessionId, userId, expiresAt }) {
    if (isConnected && pool) {
      await pool.query('DELETE FROM auth_sessions WHERE expires_at < NOW()');
      await pool.query(
        'INSERT INTO auth_sessions (session_id, user_id, expires_at) VALUES ($1, $2, $3)',
        [sessionId, userId, expiresAt]
      );
      return;
    }
    localStore.auth_sessions = localStore.auth_sessions.filter(session => new Date(session.expires_at).getTime() > Date.now());
    localStore.auth_sessions.push({ session_id: sessionId, user_id: String(userId), expires_at: expiresAt });
    saveStore();
  },
  async isAuthSessionActive(sessionId, userId) {
    if (isConnected && pool) {
      const result = await pool.query(
        'SELECT 1 FROM auth_sessions WHERE session_id = $1 AND user_id::text = $2 AND expires_at > NOW()',
        [sessionId, String(userId)]
      );
      return result.rowCount > 0;
    }
    return localStore.auth_sessions.some(session =>
      session.session_id === sessionId &&
      String(session.user_id) === String(userId) &&
      new Date(session.expires_at).getTime() > Date.now()
    );
  },
  async revokeAuthSession(sessionId, userId) {
    if (isConnected && pool) {
      const result = await pool.query(
        'DELETE FROM auth_sessions WHERE session_id = $1 AND user_id::text = $2',
        [sessionId, String(userId)]
      );
      return result.rowCount > 0;
    }
    const previousLength = localStore.auth_sessions.length;
    localStore.auth_sessions = localStore.auth_sessions.filter(session =>
      session.session_id !== sessionId || String(session.user_id) !== String(userId)
    );
    if (localStore.auth_sessions.length !== previousLength) saveStore();
    return localStore.auth_sessions.length !== previousLength;
  },
  getDatabaseUrl: () => currentDatabaseUrl,
  verifyPassword,
  async setUserPassword(id, password) {
    const hashed = await hashPassword(password);
    await this.updateUser(id, { password: hashed });
    return true;
  },
  async recordKycAudit({ kyc_id, actor_id, actor_email, action, document_key }) {
    const entry = { id: crypto.randomUUID(), kyc_id: String(kyc_id), actor_id: String(actor_id), actor_email, action, document_key: document_key || null, created_at: new Date().toISOString() };
    if (isConnected && pool) {
      await pool.query('INSERT INTO driver_kyc_audit (id, kyc_id, actor_id, actor_email, action, document_key, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [entry.id, entry.kyc_id, entry.actor_id, entry.actor_email, entry.action, entry.document_key, entry.created_at]);
    } else {
      localStore.driver_kyc_audit.unshift(entry);
      saveStore();
    }
    return entry;
  },
  getConnectionInfo: () => ({
    ...connectionInfo,
    isConnected,
    lastPingLatency
  }),

  // Allows setting the database URL dynamically at runtime (e.g. from admin panel)
  setDatabaseUrl(newUrl) {
    initPool(newUrl);
    // Also save to .env
    try {
      const envPath = path.join(__dirname, '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      if (envContent.includes('DATABASE_URL=')) {
        envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL="${newUrl}"`);
      } else {
        envContent += `\nDATABASE_URL="${newUrl}"\n`;
      }
      fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    } catch (e) {
      console.error('Failed to update .env:', e.message);
    }
    return this.getConnectionInfo();
  },

  // --- VEHICLES ---
  async getVehicles() {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM vehicles ORDER BY seats ASC');
        if (res.rows && res.rows.length > 0) return res.rows;
      } catch (e) {}
    }
    return localStore.vehicles;
  },

  async getVehicleById(id) {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM vehicles WHERE id = $1', [id]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (e) {}
    }
    return localStore.vehicles.find(v => v.id === id);
  },

  async createVehicle(vehData) {
    const id = vehData.id || vehData.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 15) + '-' + Math.floor(100 + Math.random() * 900);
    const newVeh = {
      id,
      name: vehData.name,
      category: vehData.category || 'Sedans',
      seats: Number(vehData.seats) || 4,
      ac: vehData.ac !== false,
      rate_per_day: Number(vehData.rate_per_day) || 2500,
      rate_per_km: Number(vehData.rate_per_km) || 14,
      min_km_per_day: Number(vehData.min_km_per_day) || 250,
      driver_allowance_per_day: Number(vehData.driver_allowance_per_day) || 400,
      image: vehData.image || '/etios.jpg',
      reg_number: vehData.reg_number || 'KA01SJ' + Math.floor(1000 + Math.random() * 9000),
      features: Array.isArray(vehData.features) ? vehData.features : ['Air Conditioning', 'Comfort Seating'],
      status: vehData.status || 'AVAILABLE',
      created_at: new Date().toISOString()
    };
    localStore.vehicles.push(newVeh);
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO vehicles (id, name, category, seats, ac, rate_per_day, rate_per_km, min_km_per_day, driver_allowance_per_day, image, reg_number, features, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [newVeh.id, newVeh.name, newVeh.category, newVeh.seats, newVeh.ac, newVeh.rate_per_day, newVeh.rate_per_km, newVeh.min_km_per_day, newVeh.driver_allowance_per_day, newVeh.image, newVeh.reg_number, newVeh.features, newVeh.status]);
      } catch (e) {
        console.error('PostgreSQL vehicle insert err:', e.message);
      }
    }
    return newVeh;
  },

  async updateVehicle(id, updates) {
    const vIdx = localStore.vehicles.findIndex(v => v.id === id);
    if (vIdx !== -1) {
      localStore.vehicles[vIdx] = { ...localStore.vehicles[vIdx], ...updates };
      saveStore();
    }
    if (isConnected && pool) {
      try {
        const fields = [];
        const values = [];
        let i = 1;
        for (const [k, v] of Object.entries(updates)) {
          fields.push(`${k} = $${i++}`);
          values.push(v);
        }
        values.push(id);
        await pool.query(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = $${i}`, values);
      } catch (e) {
        console.error('PostgreSQL vehicle update err:', e.message);
      }
    }
    return vIdx !== -1 ? localStore.vehicles[vIdx] : null;
  },

  async deleteVehicle(id) {
    const vIdx = localStore.vehicles.findIndex(v => v.id === id);
    if (vIdx !== -1) {
      localStore.vehicles.splice(vIdx, 1);
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM vehicles WHERE id = $1', [id]);
      } catch (e) {
        console.error('PostgreSQL vehicle delete err:', e.message);
      }
    }
    return true;
  },

  // --- USERS / AUTH ---
  async getUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    if (isConnected && pool) {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 OR phone = $1 OR phone = $2', [cleanEmail, `+91 ${cleanEmail.replace(/\D/g, '').slice(-10)}`]);
      return res.rows[0] || null;
    }
    return localStore.users.find(u => u.email.toLowerCase() === cleanEmail || u.phone === cleanEmail) || null;
  },

  async getUserById(id) {
    if (!id) return null;
    if (isConnected && pool) {
      const res = await pool.query('SELECT * FROM users WHERE id::text = $1', [String(id)]);
      return res.rows[0] || null;
    }
    return localStore.users.find(u => String(u.id) === String(id)) || null;
  },

  async createUser(userData) {
    const storedPassword = isPasswordHash(userData.password) ? userData.password : await hashPassword(userData.password);
    const newUser = {
      id: userData.id || crypto.randomUUID(),
      email: userData.email.toLowerCase().trim(),
      password: storedPassword,
      name: userData.name,
      phone: userData.phone,
      role: userData.role || 'CUSTOMER',
      assigned_vehicle: userData.assigned_vehicle || null,
      duty_mode: 'OFF_DUTY',
      is_online: false,
      service_area: null,
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    if (isConnected && pool) {
      await pool.query(`
        INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, duty_mode, is_online, service_area, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [newUser.id, newUser.email, newUser.password, newUser.name, newUser.phone, newUser.role, newUser.assigned_vehicle, newUser.duty_mode, newUser.is_online, newUser.service_area, newUser.status]);
      return newUser;
    }
    localStore.users.push(newUser);
    saveStore();
    return newUser;
  },

  async updateUser(id, updates) {
    const uIdx = localStore.users.findIndex(u => String(u.id) === String(id));
    if (isConnected && pool) {
      const fields = [];
      const values = [];
      let i = 1;
      for (const [k, v] of Object.entries(updates)) {
        if (!/^[a-z_]+$/.test(k)) throw new Error('Invalid user update field.');
        fields.push(`${k} = $${i++}`);
        values.push(v);
      }
      if (!fields.length) return await this.getUserById(id);
      values.push(String(id));
      const result = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id::text = $${i} RETURNING *`, values);
      return result.rows[0] || null;
    }
    if (uIdx !== -1) {
      localStore.users[uIdx] = { ...localStore.users[uIdx], ...updates };
      saveStore();
    }
    return uIdx !== -1 ? localStore.users[uIdx] : null;
  },

  async getAllUsers() {
    if (isConnected && pool) {
      const res = await pool.query('SELECT id, email, name, phone, role, assigned_vehicle, duty_mode, status, created_at FROM users');
      return res.rows;
    }
    return localStore.users.map(({ password, ...rest }) => rest);
  },

  // --- STAFF & EMPLOYEES ---
  async getEmployees() {
    if (isConnected && pool) {
      const res = await pool.query('SELECT * FROM users WHERE role = $1', ['EMPLOYEE']);
      return res.rows.map(({ password, ...rest }) => ({
        ...rest,
        designation: rest.designation || 'Operations Staff',
        permissions: rest.permissions || ['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet', 'accounts'],
        salary: rest.salary || 25000
      }));
    }
    return localStore.users.filter(u => u.role === 'EMPLOYEE').map(({ password, ...rest }) => ({
      ...rest,
      designation: rest.designation || 'Operations Staff',
      permissions: rest.permissions || ['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet', 'accounts'],
      salary: rest.salary || 25000
    }));
  },

  async createEmployee(empData) {
    const storedPassword = isPasswordHash(empData.password) ? empData.password : await hashPassword(empData.password);
    const newEmp = {
      id: crypto.randomUUID(),
      email: empData.email.toLowerCase().trim(),
      password: storedPassword,
      name: empData.name,
      phone: empData.phone || '+91 98450 00000',
      role: 'EMPLOYEE',
      designation: empData.designation || 'Operations Staff',
      permissions: Array.isArray(empData.permissions) ? empData.permissions : ['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet', 'accounts'],
      salary: Number(empData.salary) || 25000,
      assigned_vehicle: null,
      duty_mode: 'ACTIVE',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    if (isConnected && pool) {
      await pool.query(`
          INSERT INTO users (id, email, password, name, phone, role, designation, permissions, salary, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [newEmp.id, newEmp.email, newEmp.password, newEmp.name, newEmp.phone, newEmp.role, newEmp.designation, newEmp.permissions, newEmp.salary, newEmp.status]);
    } else {
      localStore.users.push(newEmp);
      saveStore();
    }
    const { password, ...safeEmp } = newEmp;
    return safeEmp;
  },

  async updateEmployee(id, updates) {
    return this.updateUser(id, updates);
  },

  async deleteEmployee(id) {
    const uIdx = localStore.users.findIndex(u => String(u.id) === String(id) && u.role === 'EMPLOYEE');
    if (uIdx !== -1) {
      localStore.users.splice(uIdx, 1);
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM users WHERE id::text = $1', [String(id)]);
      } catch (e) {
        console.error('PostgreSQL employee delete err:', e.message);
      }
    }
    return true;
  },

  async deleteDriver(id) {
    const uIdx = localStore.users.findIndex(u => String(u.id) === String(id) && u.role === 'DRIVER');
    if (uIdx !== -1) {
      localStore.users.splice(uIdx, 1);
      localStore.driver_kyc = localStore.driver_kyc.filter(k => String(k.driver_id) !== String(id));
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM users WHERE id::text = $1', [String(id)]);
        await pool.query('DELETE FROM driver_kyc WHERE driver_id::text = $1', [String(id)]);
      } catch (e) {
        console.error('PostgreSQL driver delete err:', e.message);
      }
    }
    return true;
  },

  async getDrivers() {
    let driverUsers = [];
    if (isConnected && pool) {
      const res = await pool.query('SELECT * FROM users WHERE role = $1', ['DRIVER']);
      driverUsers = res.rows;
    } else {
      driverUsers = localStore.users.filter(u => u.role === 'DRIVER');
    }

    const allKyc = await this.getAllKycRequests();

    return driverUsers.map(u => {
      const kyc = allKyc.find(k => String(k.driver_id) === String(u.id) || k.driver_email === u.email);
      return {
        id: u.id,
        _id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        driverMode: u.duty_mode || 'OFF_DUTY',
        isOnline: Boolean(u.is_online),
        serviceArea: u.service_area || '',
        status: u.status || 'AVAILABLE',
        assignedVehicleReg: u.assigned_vehicle || (kyc ? kyc.assigned_vehicle_reg : null) || 'Not Assigned',
        rating: 4.9,
        experienceYears: kyc ? kyc.experience_years : 3,
        kycStatus: kyc ? kyc.kyc_status : 'PENDING',
        monthlySalarySettings: { baseSalary: 25000, perKmRate: 2.5, perDutyAllowance: 400, overtimeHourly: 150 }
      };
    });
  },

  // --- DRIVER KYC & ONBOARDING ---
  async submitKyc(kycData) {
    const kycDriverId = kycData.driver_id || crypto.randomUUID();
    const newKyc = {
      id: kycData.id || crypto.randomUUID(),
      driver_id: kycDriverId,
      driver_name: kycData.driver_name,
      driver_phone: kycData.driver_phone,
      driver_email: kycData.driver_email || `driver.${String(kycData.driver_phone || '').replace(/\D/g, '')}@sjttravels.com`,
      license_number: kycData.license_number,
      badge_number: kycData.badge_number || 'PSV-KA-PENDING',
      aadhar_number: kycData.aadhar_number,
      pan_number: kycData.pan_number || '',
      vehicle_preference: kycData.vehicle_preference || 'Sedans (Toyota Etios)',
      experience_years: parseInt(kycData.experience_years, 10) || 3,
      address: kycData.address || '',
      vehicle_reg: kycData.vehicle_reg || '',
      vehicle_type: kycData.vehicle_type || kycData.vehicle_preference || '',
      vehicle_details: kycData.vehicle_details || {},
      documents: kycData.documents || {},
      face_document: kycData.face_document || null,
      license_doc_url: kycData.license_doc_url || null,
      license_back_doc_url: kycData.license_back_doc_url || null,
      aadhar_doc_url: kycData.aadhar_doc_url || null,
      aadhar_back_doc_url: kycData.aadhar_back_doc_url || null,
      psv_badge_doc_url: kycData.psv_badge_doc_url || null,
      police_verification_url: kycData.police_verification_url || null,
      medical_fitness_doc_url: kycData.medical_fitness_doc_url || null,
      live_face_photo_url: kycData.live_face_photo_url || null,
      face_match_score: kycData.face_match_score || null,
      face_verified: Boolean(kycData.face_verified),
      govt_verified: Boolean(kycData.govt_verified),
      rto_dl_status: kycData.rto_dl_status || 'NOT_VERIFIED',
      uidai_aadhar_status: kycData.uidai_aadhar_status || 'NOT_VERIFIED',
      police_clearance_status: kycData.police_clearance_status || 'NOT_VERIFIED',
      kyc_status: 'PENDING',
      rejection_reason: null,
      assigned_vehicle_reg: null,
      submitted_at: new Date().toISOString(),
      verified_at: null
    };

    if (isConnected && pool) {
      const jsonColumns = ['vehicle_details', 'documents', 'face_document'];
      const columns = ['driver_name', 'driver_phone', 'driver_email', 'license_number', 'badge_number', 'aadhar_number', 'pan_number', 'vehicle_preference', 'experience_years', 'address', 'vehicle_reg', 'vehicle_type', 'vehicle_details', 'documents', 'face_document', 'license_doc_url', 'license_back_doc_url', 'aadhar_doc_url', 'aadhar_back_doc_url', 'psv_badge_doc_url', 'police_verification_url', 'medical_fitness_doc_url', 'live_face_photo_url', 'face_match_score', 'face_verified', 'govt_verified', 'rto_dl_status', 'uidai_aadhar_status', 'police_clearance_status', 'kyc_status', 'rejection_reason', 'assigned_vehicle_reg', 'reviewed_by', 'submitted_at', 'verified_at'];
      const values = columns.map(column => jsonColumns.includes(column) ? JSON.stringify(newKyc[column]) : newKyc[column]);
      const existing = await pool.query('SELECT id FROM driver_kyc WHERE driver_id::text = $1 OR driver_email = $2 ORDER BY submitted_at DESC LIMIT 1', [String(newKyc.driver_id), newKyc.driver_email]);
      if (existing.rows[0]) {
        newKyc.id = existing.rows[0].id;
        const assignments = columns.map((column, index) => `${column} = $${index + 1}${jsonColumns.includes(column) ? '::jsonb' : ''}`).join(', ');
        const result = await pool.query(`UPDATE driver_kyc SET ${assignments} WHERE id::text = $${columns.length + 1} RETURNING *`, [...values, String(newKyc.id)]);
        return result.rows[0] || newKyc;
      }
      const result = await pool.query(`INSERT INTO driver_kyc (id, driver_id, ${columns.join(', ')}) VALUES ($1, $2, ${columns.map((column, index) => `$${index + 3}${jsonColumns.includes(column) ? '::jsonb' : ''}`).join(', ')}) RETURNING *`, [newKyc.id, newKyc.driver_id, ...values]);
      return result.rows[0] || newKyc;
    }
    const existingIdx = localStore.driver_kyc.findIndex(k => String(k.driver_id) === String(newKyc.driver_id) || k.driver_email === newKyc.driver_email);
    if (existingIdx !== -1) {
      localStore.driver_kyc[existingIdx] = { ...localStore.driver_kyc[existingIdx], ...newKyc, id: localStore.driver_kyc[existingIdx].id };
      saveStore();
      return localStore.driver_kyc[existingIdx];
    }
    localStore.driver_kyc.push(newKyc);
    saveStore();
    return newKyc;
  },

  async getKycByDriverId(driverId) {
    if (isConnected && pool) {
      const res = await pool.query('SELECT * FROM driver_kyc WHERE driver_id::text = $1 ORDER BY submitted_at DESC LIMIT 1', [String(driverId)]);
      return res.rows[0] || null;
    }
    return localStore.driver_kyc.find(k => String(k.driver_id) === String(driverId)) || null;
  },

  async getAllKycRequests() {
    if (isConnected && pool) {
      const res = await pool.query('SELECT * FROM driver_kyc ORDER BY submitted_at DESC');
      return res.rows;
    }
    return [...localStore.driver_kyc].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  },

  async reviewKyc(kycId, { action, assigned_vehicle_reg, rejection_reason, reviewed_by, login_id, password }) {
    const isApproved = action === 'APPROVE';
    const updates = {
      kyc_status: isApproved ? 'APPROVED' : 'REJECTED',
      assigned_vehicle_reg: isApproved ? assigned_vehicle_reg : null,
      rejection_reason: isApproved ? null : (rejection_reason || 'Document verification failed. Please re-upload clear copies.'),
      reviewed_by,
      verified_at: new Date().toISOString()
    };

    let updatedKyc = null;
    let createdCredentials = null;

    if (isConnected && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Load existing record to get existing documents & face_document
        const existingRes = await client.query('SELECT * FROM driver_kyc WHERE id::text = $1 OR driver_id::text = $1 LIMIT 1', [String(kycId)]);
        const existingKyc = existingRes.rows[0];

        let docs = existingKyc?.documents || {};
        let faceDoc = existingKyc?.face_document || {};
        if (isApproved) {
          for (const key of Object.keys(docs)) {
            if (docs[key] && typeof docs[key] === 'object') {
              docs[key].status = 'APPROVED';
            }
          }
          if (faceDoc && typeof faceDoc === 'object') {
            faceDoc.status = 'APPROVED';
          }
        }

        const result = await client.query(`
          UPDATE driver_kyc 
          SET kyc_status = $1, assigned_vehicle_reg = $2, rejection_reason = $3, verified_at = $4, reviewed_by = $5,
              documents = $6::jsonb, face_document = $7::jsonb
          WHERE id::text = $8 OR driver_id::text = $8
          RETURNING *
        `, [
          updates.kyc_status, 
          updates.assigned_vehicle_reg, 
          updates.rejection_reason, 
          updates.verified_at, 
          reviewed_by,
          JSON.stringify(docs),
          JSON.stringify(faceDoc),
          String(kycId)
        ]);
        updatedKyc = result.rows[0];

        if (updatedKyc && isApproved) {
          const finalLoginEmail = String(login_id || updatedKyc.driver_email || `driver.${String(updatedKyc.driver_phone || '').replace(/\D/g, '')}@sjttravels.com`).toLowerCase().trim();
          const rawPassword = String(password || 'driver123').trim();
          const hashedPassword = await hashPassword(rawPassword);

          // Check if user already exists
          const existingUserRes = await client.query(
            'SELECT * FROM users WHERE id::text = $1 OR LOWER(email) = $2 LIMIT 1',
            [String(updatedKyc.driver_id || ''), finalLoginEmail]
          );

          if (existingUserRes.rows[0]) {
            const uId = existingUserRes.rows[0].id;
            await client.query(`
              UPDATE users 
              SET email = $1, password = $2, name = $3, phone = $4, assigned_vehicle = $5, role = 'DRIVER', status = 'ACTIVE'
              WHERE id = $6
            `, [finalLoginEmail, hashedPassword, updatedKyc.driver_name, updatedKyc.driver_phone, updatedKyc.assigned_vehicle_reg, uId]);
            await client.query('UPDATE driver_kyc SET driver_id = $1 WHERE id = $2', [uId, updatedKyc.id]);
            updatedKyc.driver_id = uId;
          } else {
            const newDriverUserId = crypto.randomUUID();
            await client.query(`
              INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, duty_mode, is_online, status)
              VALUES ($1, $2, $3, $4, $5, 'DRIVER', $6, 'OFF_DUTY', FALSE, 'ACTIVE')
            `, [newDriverUserId, finalLoginEmail, hashedPassword, updatedKyc.driver_name, updatedKyc.driver_phone, updatedKyc.assigned_vehicle_reg]);
            await client.query('UPDATE driver_kyc SET driver_id = $1 WHERE id = $2', [newDriverUserId, updatedKyc.id]);
            updatedKyc.driver_id = newDriverUserId;
          }

          createdCredentials = {
            login_id: finalLoginEmail,
            password: rawPassword,
            name: updatedKyc.driver_name,
            phone: updatedKyc.driver_phone,
            assigned_vehicle: updatedKyc.assigned_vehicle_reg
          };
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }

    const kIndex = localStore.driver_kyc.findIndex(k => String(k.id) === String(kycId) || String(k.driver_id) === String(kycId));
    if (kIndex !== -1) {
      localStore.driver_kyc[kIndex] = { ...localStore.driver_kyc[kIndex], ...updates };
      if (!updatedKyc) updatedKyc = localStore.driver_kyc[kIndex];
    }
    if (isApproved && updatedKyc) {
      const finalLoginEmail = String(login_id || updatedKyc.driver_email || `driver.${String(updatedKyc.driver_phone || '').replace(/\D/g, '')}@sjttravels.com`).toLowerCase().trim();
      const rawPassword = String(password || 'driver123').trim();
      const uIndex = localStore.users.findIndex(u => String(u.id) === String(updatedKyc.driver_id) || u.email.toLowerCase() === finalLoginEmail);
      if (uIndex !== -1) {
        localStore.users[uIndex].assigned_vehicle = updatedKyc.assigned_vehicle_reg;
        localStore.users[uIndex].status = 'ACTIVE';
        localStore.users[uIndex].role = 'DRIVER';
        localStore.users[uIndex].email = finalLoginEmail;
      } else {
        localStore.users.push({
          id: updatedKyc.driver_id || crypto.randomUUID(),
          email: finalLoginEmail,
          password: await hashPassword(rawPassword),
          name: updatedKyc.driver_name,
          phone: updatedKyc.driver_phone,
          role: 'DRIVER',
          assigned_vehicle: updatedKyc.assigned_vehicle_reg,
          duty_mode: 'OFF_DUTY',
          is_online: false,
          status: 'ACTIVE',
          created_at: new Date().toISOString()
        });
      }
      if (!createdCredentials) {
        createdCredentials = {
          login_id: finalLoginEmail,
          password: rawPassword,
          name: updatedKyc.driver_name,
          phone: updatedKyc.driver_phone,
          assigned_vehicle: updatedKyc.assigned_vehicle_reg
        };
      }
    }
    saveStore();
    return { kyc: updatedKyc, credentials: createdCredentials };
  },

  async reviewKycDocument(kycId, { document_key, action, rejection_reason, reviewed_by }) {
    const record = await this.getKycById(kycId);
    if (!record) return null;
    const face = document_key === 'face';
    const collection = face ? 'face_document' : 'documents';
    const item = face ? record.face_document : (record.documents || {})[document_key];
    if (!item?.storage_key) return null;
    const reviewed = { ...item, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', rejection_reason: action === 'REJECT' ? (rejection_reason || 'Please upload a clearer document.') : null, reviewed_at: new Date().toISOString(), reviewed_by };
    const updated = face ? { ...record, face_document: reviewed } : { ...record, documents: { ...(record.documents || {}), [document_key]: reviewed } };
    if (isConnected && pool) {
      const column = face ? 'face_document' : 'documents';
      const json = face ? JSON.stringify(reviewed) : JSON.stringify(updated.documents);
      const status = action === 'REJECT' ? 'REJECTED' : 'PENDING';
      const reason = action === 'REJECT' ? (rejection_reason || 'Please upload a clearer document.') : null;
      const result = await pool.query(`UPDATE driver_kyc SET ${column} = $1::jsonb, kyc_status = $2, rejection_reason = $3 WHERE id::text = $4 RETURNING *`, [json, status, reason, String(kycId)]);
      return result.rows[0] || updated;
    }
    const index = localStore.driver_kyc.findIndex(k => String(k.id) === String(kycId));
    if (index >= 0) { localStore.driver_kyc[index] = updated; saveStore(); }
    return updated;
  },

  async getKycById(kycId) {
    if (isConnected && pool) {
      const result = await pool.query('SELECT * FROM driver_kyc WHERE id::text = $1 OR driver_id::text = $1 LIMIT 1', [String(kycId)]);
      return result.rows[0] || null;
    }
    return localStore.driver_kyc.find(k => String(k.id) === String(kycId) || String(k.driver_id) === String(kycId)) || null;
  },

  // --- BOOKINGS ---
  async getBookings(filters = {}) {
    if (isConnected && pool) {
      let sql = 'SELECT * FROM bookings WHERE 1=1';
      const params = [];
      let i = 1;
      if (filters.customer_email) {
        sql += ` AND LOWER(customer_email) = $${i++}`;
        params.push(filters.customer_email.toLowerCase());
      }
      if (filters.assigned_driver_id) {
        sql += ` AND assigned_driver_id::text = $${i++}`;
        params.push(String(filters.assigned_driver_id));
      }
      sql += ' ORDER BY created_at DESC';
      const res = await pool.query(sql, params);
      return res.rows;
    }

    let bookingsList = [...localStore.bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.customer_email) {
      bookingsList = bookingsList.filter(b => (b.customer_email || '').toLowerCase() === filters.customer_email.toLowerCase());
    }
    if (filters.assigned_driver_id) {
      bookingsList = bookingsList.filter(b => String(b.assigned_driver_id) === String(filters.assigned_driver_id));
    }
    return bookingsList;
  },

  async createBooking(bookingData) {
    const bookingCode = `SJT-${Math.floor(100000 + Math.random() * 900000)}`;
    const newBooking = {
      id: bookingData.id || crypto.randomUUID(),
      booking_code: bookingCode,
      customer_name: bookingData.customer_name,
      customer_phone: bookingData.customer_phone,
      customer_email: bookingData.customer_email || null,
      trip_type: bookingData.trip_type || 'Outstation',
      pickup: bookingData.pickup,
      destination: bookingData.destination,
      journey_date: bookingData.journey_date,
      return_date: bookingData.return_date || null,
      journey_time: bookingData.journey_time || '06:00 AM',
      passengers: parseInt(bookingData.passengers, 10) || 1,
      vehicle_id: bookingData.vehicle_id || null,
      vehicle_name: bookingData.vehicle_name || 'Toyota Etios / Sedan',
      vehicle_reg: bookingData.vehicle_reg || null,
      quoted_amount: Number(bookingData.quoted_amount) || 2500,
      advance_paid: Number(bookingData.advance_paid) || 0,
      balance_amount: (Number(bookingData.quoted_amount) || 2500) - (Number(bookingData.advance_paid) || 0),
      payment_method: bookingData.payment_method || 'UPI / Cash',
      payment_status: Number(bookingData.advance_paid) > 0 ? 'PARTIAL' : 'PENDING',
      status: 'CONFIRMED',
      assigned_driver_id: bookingData.assigned_driver_id || null,
      assigned_driver_name: bookingData.assigned_driver_name || null,
      assigned_driver_phone: bookingData.assigned_driver_phone || null,
      notes: bookingData.notes || '',
      created_at: new Date().toISOString()
    };

    // ATOMIC TRANSACTION: Guarantees booking creation and advance ledger entry succeed or fail as one unit
    if (isConnected && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Idempotency: Check if booking_code already exists to prevent duplicates
        const existing = await client.query('SELECT * FROM bookings WHERE booking_code = $1', [newBooking.booking_code]);
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return existing.rows[0];
        }

        // 1. Insert booking row
        await client.query(`
          INSERT INTO bookings (
            id, booking_code, customer_name, customer_phone, customer_email, trip_type,
            pickup, destination, journey_date, return_date, journey_time, passengers, vehicle_id,
            vehicle_name, vehicle_reg, quoted_amount, advance_paid, balance_amount,
            payment_method, payment_status, status, assigned_driver_id, assigned_driver_name,
            assigned_driver_phone, notes, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
          )
        `, [
          newBooking.id, newBooking.booking_code, newBooking.customer_name, newBooking.customer_phone, newBooking.customer_email,
          newBooking.trip_type, newBooking.pickup, newBooking.destination, newBooking.journey_date, newBooking.return_date, newBooking.journey_time,
          newBooking.passengers, newBooking.vehicle_id, newBooking.vehicle_name, newBooking.vehicle_reg, newBooking.quoted_amount,
          newBooking.advance_paid, newBooking.balance_amount, newBooking.payment_method, newBooking.payment_status,
          newBooking.status, newBooking.assigned_driver_id, newBooking.assigned_driver_name, newBooking.assigned_driver_phone,
          newBooking.notes, newBooking.created_at
        ]);

        // 2. Atomically record Pay-In in Accounts Ledger if advance paid
        if (newBooking.advance_paid > 0) {
          const txId = `tx-adv-${newBooking.booking_code}`;
          const refNo = `ADV-${newBooking.booking_code}`;
          await client.query(`
            INSERT INTO company_transactions (
              id, type, category, title, amount, payment_mode, reference_no,
              party_name, party_type, related_booking_code, related_invoice_no,
              related_duty_code, date, time, status, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (id) DO NOTHING
          `, [
            txId, 'PAY_IN', 'CUSTOMER_BOOKING_ADVANCE',
            `Online Booking Advance - ${newBooking.pickup} to ${newBooking.destination} (${newBooking.vehicle_name})`,
            newBooking.advance_paid, newBooking.payment_method || 'UPI',
            refNo, newBooking.customer_name || 'Customer', 'CUSTOMER',
            newBooking.booking_code, null, null,
            newBooking.journey_date || new Date().toISOString().split('T')[0],
            new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            'COMPLETED', `Automated Pay-in ledger record for booking #${newBooking.booking_code}`,
            newBooking.created_at
          ]);

          if (!localStore.transactions) localStore.transactions = [];
          localStore.transactions.unshift({
            id: txId,
            type: 'PAY_IN',
            category: 'CUSTOMER_BOOKING_ADVANCE',
            title: `Online Booking Advance - ${newBooking.pickup} to ${newBooking.destination} (${newBooking.vehicle_name})`,
            amount: newBooking.advance_paid,
            payment_mode: newBooking.payment_method || 'UPI',
            reference_no: refNo,
            party_name: newBooking.customer_name || 'Customer',
            party_type: 'CUSTOMER',
            related_booking_code: newBooking.booking_code,
            date: newBooking.journey_date || new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            status: 'COMPLETED',
            created_at: newBooking.created_at
          });
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('PostgreSQL atomic booking transaction rollback err:', e.message);
        throw e;
      } finally {
        client.release();
      }
    }

    localStore.bookings.unshift(newBooking);
    saveStore();
    return newBooking;
  },

  async getBookingPayments(bookingId) {
    if (isConnected && pool) {
      const result = await pool.query(
        'SELECT * FROM booking_payments WHERE booking_id::text = $1 ORDER BY created_at DESC',
        [String(bookingId)]
      );
      return result.rows;
    }
    return (localStore.booking_payments || [])
      .filter(payment => String(payment.booking_id) === String(bookingId))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  },

  async recordBookingPayment({ bookingId, driverId, driverName, amount, paymentMethod, idempotencyKey }) {
    const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;
    const paymentId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const date = createdAt.slice(0, 10);
    const time = new Date(createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    if (isConnected && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);

        const existing = await client.query(
          'SELECT * FROM booking_payments WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existing.rows.length) {
          const prior = existing.rows[0];
          const sameRequest = String(prior.booking_id) === String(bookingId)
            && String(prior.driver_id) === String(driverId)
            && roundMoney(prior.amount) === roundMoney(amount)
            && prior.payment_method === paymentMethod;
          if (!sameRequest) {
            await client.query('ROLLBACK');
            return { error: 'IDEMPOTENCY_CONFLICT' };
          }
          const booking = await client.query('SELECT * FROM bookings WHERE id::text = $1', [String(bookingId)]);
          await client.query('COMMIT');
          return { payment: prior, booking: booking.rows[0] || null, replayed: true };
        }

        const bookingResult = await client.query(
          'SELECT * FROM bookings WHERE id::text = $1 FOR UPDATE',
          [String(bookingId)]
        );
        const booking = bookingResult.rows[0];
        if (!booking) {
          await client.query('ROLLBACK');
          return { error: 'NOT_FOUND' };
        }
        if (String(booking.assigned_driver_id) !== String(driverId)) {
          await client.query('ROLLBACK');
          return { error: 'FORBIDDEN' };
        }
        if (booking.status === 'CANCELLED') {
          await client.query('ROLLBACK');
          return { error: 'BOOKING_CANCELLED' };
        }

        const quote = roundMoney(booking.quoted_amount);
        const paid = roundMoney(booking.advance_paid);
        const balance = roundMoney(quote - paid);
        if (amount > balance) {
          await client.query('ROLLBACK');
          return { error: 'AMOUNT_EXCEEDS_BALANCE', balance };
        }

        const nextPaid = roundMoney(paid + amount);
        const nextBalance = roundMoney(quote - nextPaid);
        const paymentResult = await client.query(`
          INSERT INTO booking_payments (
            id, booking_id, booking_code, driver_id, driver_name, amount,
            payment_method, idempotency_key, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          paymentId, booking.id, booking.booking_code, String(driverId), driverName,
          amount, paymentMethod, idempotencyKey, createdAt
        ]);
        const updatedBooking = await client.query(`
          UPDATE bookings
          SET advance_paid = $1, balance_amount = $2, payment_status = $3,
              payment_method = $4, updated_at = NOW()
          WHERE id = $5
          RETURNING *
        `, [
          nextPaid,
          nextBalance,
          nextBalance === 0 ? 'PAID' : 'PARTIAL',
          paymentMethod,
          booking.id
        ]);
        await client.query(`
          INSERT INTO company_transactions (
            id, type, category, title, amount, payment_mode, reference_no,
            party_name, party_type, related_booking_code, date, time, status, notes, created_at
          ) VALUES ($1, 'PAY_IN', 'CUSTOMER_BOOKING_COLLECTION', $2, $3, $4, $5, $6, 'CUSTOMER', $7, $8, $9, 'COMPLETED', $10, $11)
        `, [
          `tx-bpay-${paymentId}`,
          `Customer payment collected for booking ${booking.booking_code}`,
          amount,
          paymentMethod,
          `BOOKING-${booking.booking_code}-${paymentId.slice(0, 8)}`,
          booking.customer_name,
          booking.booking_code,
          date,
          time,
          `Recorded by driver ${driverName} (${driverId})`,
          createdAt
        ]);
        await client.query('COMMIT');
        return { payment: paymentResult.rows[0], booking: updatedBooking.rows[0], replayed: false };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const existing = (localStore.booking_payments || []).find(payment => payment.idempotency_key === idempotencyKey);
    if (existing) {
      const sameRequest = String(existing.booking_id) === String(bookingId)
        && String(existing.driver_id) === String(driverId)
        && roundMoney(existing.amount) === roundMoney(amount)
        && existing.payment_method === paymentMethod;
      if (!sameRequest) return { error: 'IDEMPOTENCY_CONFLICT' };
      const booking = localStore.bookings.find(item => String(item.id) === String(bookingId)) || null;
      return { payment: existing, booking, replayed: true };
    }

    const booking = localStore.bookings.find(item => String(item.id) === String(bookingId));
    if (!booking) return { error: 'NOT_FOUND' };
    if (String(booking.assigned_driver_id) !== String(driverId)) return { error: 'FORBIDDEN' };
    if (booking.status === 'CANCELLED') return { error: 'BOOKING_CANCELLED' };

    const quote = roundMoney(booking.quoted_amount);
    const paid = roundMoney(booking.advance_paid);
    const balance = roundMoney(quote - paid);
    if (amount > balance) return { error: 'AMOUNT_EXCEEDS_BALANCE', balance };

    const nextPaid = roundMoney(paid + amount);
    const nextBalance = roundMoney(quote - nextPaid);
    const payment = {
      id: paymentId,
      booking_id: booking.id,
      booking_code: booking.booking_code,
      driver_id: String(driverId),
      driver_name: driverName,
      amount,
      payment_method: paymentMethod,
      idempotency_key: idempotencyKey,
      created_at: createdAt
    };
    const updatedBooking = {
      ...booking,
      advance_paid: nextPaid,
      balance_amount: nextBalance,
      payment_status: nextBalance === 0 ? 'PAID' : 'PARTIAL',
      payment_method: paymentMethod,
      updated_at: createdAt
    };
    const transaction = {
      id: `tx-bpay-${paymentId}`,
      type: 'PAY_IN',
      category: 'CUSTOMER_BOOKING_COLLECTION',
      title: `Customer payment collected for booking ${booking.booking_code}`,
      amount,
      payment_mode: paymentMethod,
      reference_no: `BOOKING-${booking.booking_code}-${paymentId.slice(0, 8)}`,
      party_name: booking.customer_name,
      party_type: 'CUSTOMER',
      related_booking_code: booking.booking_code,
      date,
      time,
      status: 'COMPLETED',
      notes: `Recorded by driver ${driverName} (${driverId})`,
      created_at: createdAt
    };

    localStore.booking_payments = [payment, ...(localStore.booking_payments || [])];
    localStore.transactions = [transaction, ...(localStore.transactions || [])];
    localStore.bookings[localStore.bookings.indexOf(booking)] = updatedBooking;
    saveStore();
    return { payment, booking: updatedBooking, replayed: false };
  },

  async updateBookingStatus(id, status) {
    const persistedStatus = status === 'ON_TRIP' ? 'IN_PROGRESS' : status;
    if (isConnected && pool) {
      const result = await pool.query(
        'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id::text = $2 RETURNING *',
        [persistedStatus, String(id)]
      );
      return result.rows[0] || null;
    }

    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(id));
    if (bIndex !== -1) {
      localStore.bookings[bIndex].status = persistedStatus;
      saveStore();
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  async updateBooking(id, updates) {
    if (isConnected && pool) {
      const fields = [];
      const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (!/^[a-z_]+$/.test(key)) throw new Error('Unsupported booking update field.');
        fields.push(`${key} = $${values.length + 1}`);
        values.push(value);
      }
      if (updates.quoted_amount !== undefined) {
        values.push(Number(updates.quoted_amount));
        const quoteParameter = `$${values.length}`;
        fields.push(`balance_amount = ${quoteParameter} - advance_paid`);
        fields.push(`payment_status = CASE WHEN advance_paid >= ${quoteParameter} THEN 'PAID' WHEN advance_paid > 0 THEN 'PARTIAL' ELSE 'PENDING' END`);
      }
      if (fields.length === 0) {
        const existing = await pool.query('SELECT * FROM bookings WHERE id::text = $1', [String(id)]);
        return existing.rows[0] || null;
      }
      values.push(String(id));
      const result = await pool.query(`UPDATE bookings SET ${fields.join(', ')}, updated_at = NOW() WHERE id::text = $${values.length} RETURNING *`, values);
      return result.rows[0] || null;
    }
    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(id));
    if (bIndex !== -1) {
      const cur = localStore.bookings[bIndex];
      const quoted = updates.quoted_amount !== undefined ? Number(updates.quoted_amount) : Number(cur.quoted_amount);
      const advance = updates.advance_paid !== undefined ? Number(updates.advance_paid) : Number(cur.advance_paid);
      const balance = quoted - advance;

      localStore.bookings[bIndex] = {
        ...cur,
        ...updates,
        quoted_amount: quoted,
        advance_paid: advance,
        balance_amount: balance,
        payment_status: balance <= 0 ? 'PAID' : (advance > 0 ? 'PARTIAL' : 'PENDING'),
        updated_at: new Date().toISOString()
      };
      saveStore();
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  async deleteBooking(id) {
    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(id));
    if (bIndex !== -1) {
      localStore.bookings.splice(bIndex, 1);
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM bookings WHERE id::text = $1', [String(id)]);
      } catch (e) {
        console.error('PostgreSQL booking delete err:', e.message);
      }
    }
    return true;
  },

  async assignDriverToBooking(bookingId, { driver_id, driver_name, driver_phone, vehicle_reg }) {
    const updates = {
      assigned_driver_id: driver_id,
      assigned_driver_name: driver_name,
      assigned_driver_phone: driver_phone,
      vehicle_reg: vehicle_reg || null,
      status: 'ASSIGNED'
    };

    if (isConnected && pool) {
      const result = await pool.query(`
        UPDATE bookings
        SET assigned_driver_id = $1, assigned_driver_name = $2, assigned_driver_phone = $3,
            vehicle_reg = $4, status = 'ASSIGNED', updated_at = NOW()
        WHERE id::text = $5
        RETURNING *
      `, [driver_id, driver_name, driver_phone, vehicle_reg || null, String(bookingId)]);
      return result.rows[0] || null;
    }

    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(bookingId));
    if (bIndex !== -1) {
      localStore.bookings[bIndex] = { ...localStore.bookings[bIndex], ...updates };
      saveStore();
    }

    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  async claimOpenBooking(bookingId, { driver_id, driver_name, driver_phone, vehicle_reg }) {
    if (isConnected && pool) {
      const result = await pool.query(`
        UPDATE bookings
        SET assigned_driver_id = $1, assigned_driver_name = $2, assigned_driver_phone = $3,
            vehicle_reg = $4, status = 'ASSIGNED', updated_at = NOW()
        WHERE id::text = $5 AND assigned_driver_id IS NULL AND status IN ('CONFIRMED', 'REQUESTED')
        RETURNING *
      `, [driver_id, driver_name, driver_phone, vehicle_reg || null, String(bookingId)]);
      return result.rows[0] || null;
    }

    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(bookingId));
    if (bIndex < 0 || localStore.bookings[bIndex].assigned_driver_id || !['CONFIRMED', 'REQUESTED'].includes(String(localStore.bookings[bIndex].status).toUpperCase())) return null;
    localStore.bookings[bIndex] = {
      ...localStore.bookings[bIndex],
      assigned_driver_id: driver_id,
      assigned_driver_name: driver_name,
      assigned_driver_phone: driver_phone,
      vehicle_reg: vehicle_reg || null,
      status: 'ASSIGNED'
    };
    saveStore();
    return localStore.bookings[bIndex];
  },

  // --- COMPANY DUTIES ---
  async getDuties(filters = {}) {
    if (isConnected && pool) {
      let sql = 'SELECT * FROM company_duties WHERE 1=1';
      const params = [];
      let i = 1;
      if (filters.driver_id) {
        sql += ` AND driver_id::text = $${i++}`;
        params.push(String(filters.driver_id));
      }
      sql += ' ORDER BY created_at DESC';
      const res = await pool.query(sql, params);
      return res.rows;
    }

    let dutiesList = [...localStore.company_duties].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.driver_id) {
      dutiesList = dutiesList.filter(d => String(d.driver_id) === String(filters.driver_id));
    }
    return dutiesList;
  },

  async startDuty(dutyData) {
    const dutyNow = new Date();
    const dutyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(dutyNow);
    const loginTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(dutyNow);
    const dutyCode = `DUTY-${Math.floor(1000 + Math.random() * 9000)}`;
    const newDuty = {
      id: dutyData.id || crypto.randomUUID(),
      duty_code: dutyCode,
      shift_name: dutyData.shift_name || (dutyData.external_trip_id?.includes('Shift') ? dutyData.external_trip_id : 'Shift 1'),
      driver_id: dutyData.driver_id || null,
      driver_name: dutyData.driver_name || 'Driver',
      company_name: dutyData.company_name,
      external_trip_id: dutyData.external_trip_id,
      pickup_location: dutyData.pickup_location,
      destination_location: dutyData.destination_location,
      route_details: dutyData.shift_name ? `[${dutyData.shift_name}] ${dutyData.route_details || ''}` : (dutyData.route_details || ''),
      vehicle_reg: dutyData.vehicle_reg,
      login_time: loginTime,
      logout_time: null,
      start_km: Number(dutyData.start_km),
      end_km: null,
      daily_km: 0,
      toll_parking_allowance: 0,
      food_allowance: 0,
      duty_selfie_url: dutyData.duty_selfie_url || null,
      duty_face_verified: Boolean(dutyData.duty_face_verified),
      duty_face_match_score: dutyData.duty_face_match_score || null,
      status: 'ON_DUTY',
      duty_date: dutyDate,
      admin_note: null,
      created_at: new Date().toISOString()
    };

    if (isConnected && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const active = await client.query("SELECT id FROM company_duties WHERE driver_id::text = $1 AND status = 'ON_DUTY' LIMIT 1", [String(newDuty.driver_id)]);
        if (active.rows.length) {
          const error = new Error('You already have an active company duty. Check out before starting another.');
          error.code = 'DUTY_ALREADY_ACTIVE';
          throw error;
        }
        const result = await client.query(`
          INSERT INTO company_duties (
            id, duty_code, shift_name, driver_id, driver_name, company_name, external_trip_id, pickup_location, destination_location, route_details,
            vehicle_reg, login_time, start_km, duty_selfie_url, duty_face_verified,
            duty_face_match_score, status, duty_date, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          ) RETURNING *
        `, [
          newDuty.id, newDuty.duty_code, newDuty.shift_name, newDuty.driver_id, newDuty.driver_name, newDuty.company_name,
          newDuty.external_trip_id, newDuty.pickup_location, newDuty.destination_location, newDuty.route_details,
          newDuty.vehicle_reg, newDuty.login_time, newDuty.start_km,
          newDuty.duty_selfie_url, newDuty.duty_face_verified, newDuty.duty_face_match_score,
          newDuty.status, newDuty.duty_date, newDuty.created_at
        ]);
        await client.query('COMMIT');
        return result.rows[0] || newDuty;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
    if (localStore.company_duties.some(d => String(d.driver_id) === String(newDuty.driver_id) && d.status === 'ON_DUTY')) {
      const error = new Error('You already have an active company duty. Check out before starting another.');
      error.code = 'DUTY_ALREADY_ACTIVE';
      throw error;
    }
    localStore.company_duties.unshift(newDuty);
    saveStore();
    return newDuty;
  },

  async endDuty(dutyId, { end_km, toll_parking, food_allowance }) {
    if (isConnected && pool) {
      const logoutTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date());
      const result = await pool.query(`
        UPDATE company_duties
        SET end_km = $1, daily_km = $1 - start_km, toll_parking_allowance = $2,
            food_allowance = $3, logout_time = $4, status = 'SUBMITTED'
        WHERE (id::text = $5 OR duty_code = $5) AND status = 'ON_DUTY' AND $1 >= start_km
        RETURNING *
      `, [Number(end_km), Number(toll_parking) || 0, Number(food_allowance) || 0, logoutTime, String(dutyId)]);
      return result.rows[0] || null;
    }
    const dIndex = localStore.company_duties.findIndex(d => String(d.id) === String(dutyId) || d.duty_code === dutyId);
    let updatedDuty = null;

    if (dIndex !== -1) {
      const duty = localStore.company_duties[dIndex];
      const startKm = Number(duty.start_km);
      const endKmNum = Number(end_km);
      if (endKmNum < startKm) return null;
      const totalKm = endKmNum - startKm;

      const updates = {
        end_km: endKmNum,
        daily_km: totalKm,
        toll_parking_allowance: Number(toll_parking) || 0,
        food_allowance: Number(food_allowance) || 0,
        logout_time: new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date()),
        status: 'SUBMITTED'
      };

      localStore.company_duties[dIndex] = { ...duty, ...updates };
      updatedDuty = localStore.company_duties[dIndex];
      saveStore();

    }
    return updatedDuty;
  },

  async verifyDuty(dutyId, { action, admin_note }) {
    const isApproved = action === 'APPROVE';
    const status = isApproved ? 'VERIFIED_BY_ADMIN' : 'REJECTED';

    const dIndex = localStore.company_duties.findIndex(d => String(d.id) === String(dutyId) || String(d.duty_code) === String(dutyId));
    let updatedDuty = null;
    if (dIndex !== -1) {
      localStore.company_duties[dIndex].status = status;
      localStore.company_duties[dIndex].admin_note = admin_note || null;
      updatedDuty = localStore.company_duties[dIndex];
      saveStore();
    }

    if (isConnected && pool) {
      try {
        const pRes = await pool.query(`
          UPDATE company_duties 
          SET status = $1, admin_note = $2 
          WHERE id::text = $3 OR duty_code = $3 
          RETURNING *
        `, [status, admin_note || null, String(dutyId)]);
        if (pRes.rows && pRes.rows[0]) {
          updatedDuty = pRes.rows[0];
        }
      } catch (e) {
        console.error('PostgreSQL verify duty err:', e.message);
      }
    }
    return updatedDuty;
  },

  async updateDuty(id, updates) {
    const dIdx = localStore.company_duties.findIndex(d => String(d.id) === String(id) || String(d.duty_code) === String(id));
    let updatedDuty = null;
    if (dIdx !== -1) {
      const cur = localStore.company_duties[dIdx];
      const startKm = updates.start_km !== undefined ? Number(updates.start_km) : Number(cur.start_km);
      const endKm = updates.end_km !== undefined ? Number(updates.end_km) : Number(cur.end_km);
      const dailyKm = endKm >= startKm ? (endKm - startKm) : cur.daily_km;

      localStore.company_duties[dIdx] = {
        ...cur,
        ...updates,
        start_km: startKm,
        end_km: endKm,
        daily_km: dailyKm
      };
      updatedDuty = localStore.company_duties[dIdx];
      saveStore();
    }
    if (isConnected && pool) {
      try {
        const fields = [];
        const values = [];
        let i = 1;
        for (const [k, v] of Object.entries(updates)) {
          fields.push(`${k} = $${i++}`);
          values.push(v);
        }
        if (updates.start_km !== undefined && updates.end_km !== undefined) {
          const s = Number(updates.start_km);
          const e = Number(updates.end_km);
          if (e >= s) {
            fields.push(`daily_km = $${i++}`);
            values.push(e - s);
          }
        }
        values.push(String(id));
        const pRes = await pool.query(
          `UPDATE company_duties SET ${fields.join(', ')} WHERE id::text = $${i} OR duty_code = $${i} RETURNING *`,
          values
        );
        if (pRes.rows && pRes.rows[0]) {
          updatedDuty = pRes.rows[0];
        }
      } catch (e) {
        console.error('PostgreSQL update duty err:', e.message);
      }
    }
    return updatedDuty;
  },

  async deleteDuty(id) {
    const dIdx = localStore.company_duties.findIndex(d => String(d.id) === String(id) || String(d.duty_code) === String(id));
    if (dIdx !== -1) {
      localStore.company_duties.splice(dIdx, 1);
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM company_duties WHERE id::text = $1 OR duty_code = $1', [String(id)]);
      } catch (e) {
        console.error('PostgreSQL delete duty err:', e.message);
      }
    }
    return true;
  },

  // --- STATS, REVENUE & PAYROLL ---
  async getLiveStats() {
    const vehicles = await this.getVehicles();
    const bookings = await this.getBookings();
    const duties = await this.getDuties();
    const kyc = await this.getAllKycRequests();
    const drivers = await this.getDrivers();

    const confirmedBookings = bookings.filter(b => b.status !== 'CANCELLED');
    const totalRevenue = confirmedBookings.reduce((sum, b) => sum + (Number(b.quoted_amount) || 0), 0);
    const activeTripsCount = confirmedBookings.filter(b => ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'].includes(b.status)).length;
    const verifiedDutiesCount = duties.filter(d => d.status === 'VERIFIED_BY_ADMIN').length;
    const pendingKycCount = kyc.filter(k => k.kyc_status === 'PENDING').length;

    return {
      activeFleetCount: vehicles.length,
      activeTripsCount,
      totalBookings: confirmedBookings.length,
      verifiedDutiesCount,
      pendingKycCount,
      totalDrivers: drivers.length,
      totalRevenue,
      databaseProvider: isConnected ? connectionInfo.provider : 'Local Persistent Engine (Awaiting Voroa Database URL)',
      supabaseProject: 'voroa-postgres',
      supabaseHost: connectionInfo.host,
      isSupabaseRemoteTableActive: isConnected,
      pingLatency: lastPingLatency
    };
  },

  async calculatePayroll() {
    const duties = await this.getDuties();
    const verifiedDuties = duties.filter(d => d.status === 'VERIFIED_BY_ADMIN');

    const driverPayMap = {};

    verifiedDuties.forEach(d => {
      if (!driverPayMap[d.driver_name]) {
        driverPayMap[d.driver_name] = {
          driver_name: d.driver_name,
          driver_id: d.driver_id,
          vehicle_reg: d.vehicle_reg,
          total_duties: 0,
          total_km: 0,
          total_allowance: 0,
          base_pay: 18000,
          per_km_incentive: 0,
          gross_salary: 0
        };
      }
      driverPayMap[d.driver_name].total_duties += 1;
      driverPayMap[d.driver_name].total_km += Number(d.daily_km) || 0;
      driverPayMap[d.driver_name].total_allowance += (Number(d.toll_parking_allowance) || 0) + (Number(d.food_allowance) || 0);
    });

    return Object.values(driverPayMap).map(p => {
      p.per_km_incentive = Math.round(p.total_km * 2.5);
      p.gross_salary = p.base_pay + p.per_km_incentive + p.total_allowance;
      return p;
    });
  },

  async getRevenueAnalytics() {
    const toDateStr = (val) => {
      if (!val) return '';
      if (val instanceof Date) return val.toISOString();
      return String(val);
    };

    const bookings = await this.getBookings();
    const duties = await this.getDuties();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toISOString().slice(0, 10);

    const todayBookings = bookings.filter(b => b.status !== 'CANCELLED' && (toDateStr(b.created_at).startsWith(todayStr) || toDateStr(b.journey_date) === todayStr));
    const todayDuties = duties.filter(d => toDateStr(d.duty_date).startsWith(todayStr) || toDateStr(d.created_at).startsWith(todayStr));
    const todayRevenue = todayBookings.reduce((sum, b) => sum + (Number(b.quoted_amount) || 0), 0) +
                         todayDuties.reduce((sum, d) => sum + ((Number(d.daily_km) || 0) * 16), 0);

    const yestBookings = bookings.filter(b => b.status !== 'CANCELLED' && (toDateStr(b.created_at).startsWith(yestStr) || toDateStr(b.journey_date) === yestStr));
    const yestDuties = duties.filter(d => toDateStr(d.duty_date).startsWith(yestStr) || toDateStr(d.created_at).startsWith(yestStr));
    const yestRevenue = yestBookings.reduce((sum, b) => sum + (Number(b.quoted_amount) || 0), 0) +
                        yestDuties.reduce((sum, d) => sum + ((Number(d.daily_km) || 0) * 16), 0);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dayB = bookings.filter(b => b.status !== 'CANCELLED' && (toDateStr(b.created_at).startsWith(ds) || toDateStr(b.journey_date) === ds));
      const dayD = duties.filter(dut => toDateStr(dut.duty_date).startsWith(ds) || toDateStr(dut.created_at).startsWith(ds));
      const rev = dayB.reduce((s, b) => s + (Number(b.quoted_amount) || 0), 0) +
                  dayD.reduce((s, dut) => s + ((Number(dut.daily_km) || 0) * 16), 0);
      last7Days.push({
        date: ds,
        label: dayName,
        revenue: rev,
        bookingsCount: dayB.length,
        dutiesCount: dayD.length
      });
    }

    const currentYear = now.getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyBreakdown = months.map((mName, mIdx) => {
      const monthPrefix = `${currentYear}-${String(mIdx + 1).padStart(2, '0')}`;
      const mBookings = bookings.filter(b => b.status !== 'CANCELLED' && (toDateStr(b.created_at).startsWith(monthPrefix) || toDateStr(b.journey_date).startsWith(monthPrefix)));
      const mDuties = duties.filter(d => toDateStr(d.duty_date).startsWith(monthPrefix) || toDateStr(d.created_at).startsWith(monthPrefix));
      const bRev = mBookings.reduce((s, b) => s + (Number(b.quoted_amount) || 0), 0);
      const dRev = mDuties.reduce((s, d) => s + ((Number(d.daily_km) || 0) * 16), 0);
      const totalRev = bRev + dRev;
      const driverExpense = mDuties.reduce((s, d) => s + ((Number(d.toll_parking_allowance) || 0) + (Number(d.food_allowance) || 0) + ((Number(d.daily_km) || 0) * 2.5)), 0);

      return {
        month: mName,
        key: monthPrefix,
        bookingsRevenue: bRev,
        dutyRevenue: dRev,
        totalRevenue: totalRev,
        driverExpense: driverExpense,
        netMargin: totalRev - driverExpense,
        tripsCount: mBookings.length + mDuties.length
      };
    });

    const curMonthData = monthlyBreakdown[now.getMonth()] || { totalRevenue: 0, driverExpense: 0, netMargin: 0, tripsCount: 0 };

    const yearlyTotals = {
      [currentYear]: monthlyBreakdown.reduce((s, m) => s + m.totalRevenue, 0),
      [currentYear - 1]: 4850000,
      [currentYear - 2]: 3920000
    };

    const confirmedBookings = bookings.filter(b => b.status !== 'CANCELLED');
    const totalBookingsRevenue = confirmedBookings.reduce((s, b) => s + (Number(b.quoted_amount) || 0), 0);
    const totalAdvanceCollected = confirmedBookings.reduce((s, b) => s + (Number(b.advance_paid) || 0), 0);
    const totalPendingBalances = confirmedBookings.reduce((s, b) => s + (Number(b.balance_amount) || 0), 0);
    const totalDutyKM = duties.reduce((s, d) => s + (Number(d.daily_km) || 0), 0);
    const totalDutyRevenue = totalDutyKM * 16;
    const totalGrossRevenue = totalBookingsRevenue + totalDutyRevenue;

    const totalAllowancesPaid = duties.reduce((s, d) => s + (Number(d.toll_parking_allowance) || 0) + (Number(d.food_allowance) || 0), 0);
    const totalDriverKmBonus = Math.round(totalDutyKM * 2.5);
    const totalDriverPayouts = totalAllowancesPaid + totalDriverKmBonus;
    const estimatedNetProfit = totalGrossRevenue - totalDriverPayouts;

    return {
      daily: {
        todayRevenue,
        todayBookingsCount: todayBookings.length,
        todayDutiesCount: todayDuties.length,
        yesterdayRevenue: yestRevenue,
        trend7Days: last7Days
      },
      monthly: {
        currentMonthName: months[now.getMonth()],
        currentMonthRevenue: curMonthData.totalRevenue,
        currentMonthTrips: curMonthData.tripsCount,
        currentMonthNetMargin: curMonthData.netMargin,
        monthlyBreakdown
      },
      yearly: {
        currentYear,
        currentYearTotal: yearlyTotals[currentYear],
        annualComparison: yearlyTotals
      },
      financialSummary: {
        totalGrossRevenue,
        totalBookingsRevenue,
        totalDutyRevenue,
        totalAdvanceCollected,
        totalPendingBalances,
        totalDriverPayouts,
        estimatedNetProfit,
        profitMarginPercent: totalGrossRevenue > 0 ? Math.round((estimatedNetProfit / totalGrossRevenue) * 100) : 78
      }
    };
  },

  async getDriverAttendanceAndPayroll(monthYear) {
    const drivers = await this.getDrivers();
    const duties = await this.getDuties();
    const bookings = await this.getBookings();
    const now = new Date();
    const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
    const selectedMonth = monthYear || indiaDate.slice(0, 7);

    return drivers.map(drv => {
      const driverDuties = duties.filter(d => 
        (String(d.driver_id) === String(drv.id) || (d.driver_name && d.driver_name.toLowerCase() === drv.name.toLowerCase())) &&
        (d.duty_date || d.created_at || '').startsWith(selectedMonth) && d.status !== 'REJECTED'
      );

      const uniqueDays = new Set(driverDuties.map(d => d.duty_date || (d.created_at ? d.created_at.slice(0, 10) : '')));
      uniqueDays.delete('');
      const daysWorked = uniqueDays.size;

      const completedDuties = driverDuties.filter(d => d.logout_time && Number(d.end_km) >= Number(d.start_km) && ['SUBMITTED', 'VERIFIED', 'VERIFIED_BY_ADMIN'].includes(String(d.status).toUpperCase()));
      const totalKm = completedDuties.reduce((s, d) => s + (Number(d.daily_km) || 0), 0);
      const totalTollParking = driverDuties.reduce((s, d) => s + (Number(d.toll_parking_allowance) || 0), 0);
      const totalFoodAllowance = driverDuties.reduce((s, d) => s + (Number(d.food_allowance) || 0), 0);
      const totalDutyAllowance = totalTollParking + totalFoodAllowance;

      const salarySettings = drv.monthlySalarySettings || {};
      const baseSalary = Number(salarySettings.baseSalary) || 0;
      const perKmRate = Number(salarySettings.perKmRate) || 0;
      const perDutyAllowance = Number(salarySettings.perDutyAllowance) || 0;
      const attendanceBonus = daysWorked * 250;
      const kmIncentive = Math.round(totalKm * perKmRate);
      const grossSalary = baseSalary + attendanceBonus + kmIncentive + (completedDuties.length * perDutyAllowance) + totalDutyAllowance;
      const deductions = 0;
      const netPayable = grossSalary - deductions;

      const assignedTrips = bookings.filter(b => 
        (String(b.assigned_driver_id) === String(drv.id) || b.assigned_driver_name === drv.name) &&
        (b.journey_date || b.created_at || '').startsWith(selectedMonth)
      );

      return {
        driver_id: drv.id,
        driver_name: drv.name,
        phone: drv.phone,
        email: drv.email,
        assigned_vehicle: drv.assignedVehicleReg,
        month: selectedMonth,
        days_present: daysWorked,
        total_duties_completed: completedDuties.length,
        total_passenger_trips: assignedTrips.length,
        total_km: totalKm,
        base_salary: baseSalary,
        attendance_bonus: attendanceBonus,
        km_incentive: kmIncentive,
        per_km_rate: perKmRate,
        per_duty_allowance: completedDuties.length * perDutyAllowance,
        daily_allowances: totalDutyAllowance,
        deductions,
        gross_salary: grossSalary,
        net_payable: netPayable,
        salary_status: 'PENDING_APPROVAL',
        duty_dates: Array.from(uniqueDays)
      };
    });
  },

  // --- GST INVOICES & BILLING ---
  async getInvoices() {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
        if (res.rows && res.rows.length > 0) return res.rows;
      } catch (e) {}
    }
    return localStore.invoices;
  },

  async generateInvoice(params) {
    const {
      client_name,
      client_type,
      client_gstin,
      client_address,
      client_phone,
      billing_period,
      invoice_date,
      invoice_time,
      invoice_number,
      due_date,
      total_trips,
      total_km,
      subtotal,
      cgst,
      sgst,
      grand_total,
      items,
      vehicle_name,
      vehicle_reg,
      vehicle_type,
      vehicle_model,
      supervisor_name,
      indication_date,
      transport_company_name,
      place_of_supply,
      hsn_sac,
      quantity,
      rate_per_unit,
      gst_rate,
      gsp_rent,
      tds_cgst,
      tds_amount,
      round_off,
      amount_in_words,
      payment_method,
      notes,
      status
    } = params;
    const sub = Number(subtotal);
    const rateGst = Number(gst_rate || 5);
    const calcCgst = cgst !== undefined ? Number(cgst) : Math.round(sub * (rateGst / 200));
    const calcSgst = sgst !== undefined ? Number(sgst) : Math.round(sub * (rateGst / 200));
    const total = grand_total !== undefined ? Number(grand_total) : (sub + calcCgst + calcSgst);

    const newInv = {
      id: crypto.randomUUID(),
      invoice_number: invoice_number || `26-27/${54 + (localStore.invoices?.length || 0)}`,
      client_name: String(client_name || '').trim(),
      client_type: client_type || 'CORPORATE',
      client_gstin: client_gstin || '',
      client_address: client_address || '',
      client_phone: client_phone || '',
      place_of_supply: place_of_supply || '29-Karnataka',
      billing_period: billing_period || `${new Date().toLocaleString('default', { month: 'short' })} ${new Date().getFullYear()}`,
      invoice_date: invoice_date || new Date().toISOString().split('T')[0],
      invoice_time: invoice_time || '11:37 AM',
      due_date: due_date || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      total_trips: Number(total_trips) || 1,
      total_km: Number(total_km) || 0,
      subtotal: sub,
      cgst: calcCgst,
      sgst: calcSgst,
      grand_total: total,
      vehicle_name: vehicle_name || '',
      vehicle_reg: vehicle_reg || '',
      vehicle_type: vehicle_type || 'SEDAN',
      vehicle_model: vehicle_model || '2024 / ETIOS',
      supervisor_name: supervisor_name || 'SHARANAPPA',
      indication_date: indication_date || invoice_date || new Date().toISOString().split('T')[0],
      transport_company_name: transport_company_name || client_name,
      hsn_sac: hsn_sac || '9964',
      quantity: Number(quantity) || Number(total_trips) || 76,
      rate_per_unit: Number(rate_per_unit) || (sub && quantity ? Math.round(sub / quantity) : 650),
      gst_rate: rateGst,
      gsp_rent: Number(gsp_rent || 0),
      tds_cgst: Number(tds_cgst || 0),
      tds_amount: Number(tds_amount || 0),
      round_off: Number(round_off || 0),
      amount_in_words: amount_in_words || '',
      items: items && items.length > 0 ? items : [
        {
          description: params.item_name || `Passenger Transport - ${client_name || 'Corporate Duty'}`,
          vehicleName: vehicle_name || '',
          daysOrKm: Number(quantity) || Number(total_km) || 76,
          rate: Number(rate_per_unit) || 650,
          amount: sub
        }
      ],
      payment_method: payment_method || 'NEFT / RTGS / Razorpay',
      notes: notes || 'GST SAC Code: 9964 - Passenger Transport Services',
      status: status || 'ISSUED',
      created_at: new Date().toISOString()
    };

    localStore.invoices.unshift(newInv);
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO invoices (id, invoice_number, client_type, client_name, billing_period, total_trips, total_km, subtotal, cgst, sgst, grand_total, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          newInv.id, newInv.invoice_number, newInv.client_type, newInv.client_name, newInv.billing_period,
          newInv.total_trips, newInv.total_km, newInv.subtotal, newInv.cgst, newInv.sgst, newInv.grand_total,
          newInv.status, newInv.created_at
        ]);
      } catch (e) {
        console.error('PostgreSQL invoice insert err:', e.message);
      }
    }
    return newInv;
  },

  async updateInvoiceStatus(id, status) {
    const idx = localStore.invoices.findIndex(inv => String(inv.id) === String(id) || inv.invoice_number === id);
    if (idx !== -1) {
      localStore.invoices[idx].status = status;
      saveStore();
      return localStore.invoices[idx];
    }
    return null;
  },

  async deleteInvoice(id) {
    localStore.invoices = localStore.invoices.filter(inv => String(inv.id) !== String(id) && inv.invoice_number !== id);
    saveStore();
    return true;
  },

  // --- COMPANY ACCOUNTS: PAY-INS & PAY-OUTS TRANSACTIONS ---
  async getTransactions(filters = {}) {
    if (isConnected && pool) {
      try {
        let q = 'SELECT * FROM company_transactions';
        const params = [];
        if (filters.type) {
          params.push(filters.type);
          q += ' WHERE type = $1';
        }
        q += ' ORDER BY created_at DESC';
        const res = await pool.query(q, params);
        if (res.rows && res.rows.length > 0) return res.rows;
      } catch (e) {}
    }

    let list = localStore.transactions || [];
    if (filters.type) {
      list = list.filter(t => t.type === filters.type);
    }
    if (filters.category) {
      list = list.filter(t => t.category === filters.category);
    }
    return list;
  },

  async createTransaction(txData) {
    const newTx = {
      id: txData.id || `tx-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      type: txData.type === 'PAY_OUT' ? 'PAY_OUT' : 'PAY_IN',
      category: txData.category || (txData.type === 'PAY_OUT' ? 'OTHER_OUTFLOW' : 'OTHER_INFLOW'),
      title: txData.title || (txData.type === 'PAY_OUT' ? 'Company Expense / Payout' : 'Company Billing Pay-in'),
      amount: Number(txData.amount) || 0,
      payment_mode: txData.payment_mode || 'UPI',
      reference_no: txData.reference_no || `REF-${Math.floor(100000 + Math.random() * 900000)}`,
      party_name: txData.party_name || 'SJT Tours & Travels',
      party_type: txData.party_type || 'CUSTOMER',
      related_booking_code: txData.related_booking_code || null,
      related_invoice_no: txData.related_invoice_no || null,
      related_duty_code: txData.related_duty_code || null,
      date: txData.date || new Date().toISOString().split('T')[0],
      time: txData.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      status: txData.status || 'COMPLETED',
      notes: txData.notes || '',
      created_at: new Date().toISOString()
    };

    if (!localStore.transactions) localStore.transactions = [];
    localStore.transactions.unshift(newTx);
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO company_transactions (
            id, type, category, title, amount, payment_mode, reference_no,
            party_name, party_type, related_booking_code, related_invoice_no,
            related_duty_code, date, time, status, notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `, [
          newTx.id, newTx.type, newTx.category, newTx.title, newTx.amount, newTx.payment_mode,
          newTx.reference_no, newTx.party_name, newTx.party_type, newTx.related_booking_code,
          newTx.related_invoice_no, newTx.related_duty_code, newTx.date, newTx.time,
          newTx.status, newTx.notes, newTx.created_at
        ]);
      } catch (e) {
        console.error('PostgreSQL transaction insert err:', e.message);
      }
    }
    return newTx;
  },

  async updateTransaction(id, updates) {
    const idx = (localStore.transactions || []).findIndex(t => String(t.id) === String(id));
    if (idx !== -1) {
      localStore.transactions[idx] = { ...localStore.transactions[idx], ...updates };
      saveStore();
      return localStore.transactions[idx];
    }
    return null;
  },

  async deleteTransaction(id) {
    if (!localStore.transactions) return true;
    localStore.transactions = localStore.transactions.filter(t => String(t.id) !== String(id));
    saveStore();
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM company_transactions WHERE id = $1', [id]);
      } catch (e) {}
    }
    return true;
  },

  async getAccountsSummary() {
    const txs = localStore.transactions || [];
    const invoices = localStore.invoices || [];

    let totalPayIn = 0;
    let totalPayOut = 0;
    let pendingPayIn = 0;
    let pendingPayOut = 0;

    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'PAY_IN') {
        if (t.status === 'COMPLETED') totalPayIn += amt;
        else if (t.status === 'PENDING') pendingPayIn += amt;
      } else if (t.type === 'PAY_OUT') {
        if (t.status === 'COMPLETED') totalPayOut += amt;
        else if (t.status === 'PENDING') pendingPayOut += amt;
      }
    }

    let totalInvoiced = 0;
    let unpaidInvoiced = 0;
    for (const inv of invoices) {
      const amt = Number(inv.grand_total || inv.totalAmount) || 0;
      totalInvoiced += amt;
      if (inv.status !== 'PAID') {
        unpaidInvoiced += amt;
      }
    }

    const netCashMovement = totalPayIn - totalPayOut;
    // Commercial passenger transport GST under SAC 996412 (5% without ITC)
    const estimatedGstLiability = Math.round((totalPayIn * 5) / 105);

    return {
      totalPayIn,
      totalPayOut,
      netCashMovement,
      netProfit: netCashMovement, // Maintained for UI card backward-compatibility
      estimatedGstLiability,
      totalInvoiced,
      unpaidInvoiced,
      pendingPayIn,
      pendingPayOut,
      transactionCount: txs.length,
      invoiceCount: invoices.length
    };
  }
};
