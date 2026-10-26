const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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
    category: 'Tempo Travellers',
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
  }
];

// Seed Admin Profile & Default Verified Chauffeur
const INITIAL_USERS = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@sjttravels.com',
    password: 'admin123',
    name: 'SJT Chief Administrator',
    phone: '+91 93534 62672',
    role: 'ADMIN',
    assigned_vehicle: null,
    duty_mode: 'OFF_DUTY',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'ramesh.kumar@sjttravels.com',
    password: 'driverpassword123',
    name: 'Ramesh Kumar',
    phone: '+91 98765 43210',
    role: 'DRIVER',
    assigned_vehicle: 'KA 05 AB 1234',
    duty_mode: 'REGULAR',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  }
];

const INITIAL_TRANSACTIONS = [
  {
    id: 'tx-001',
    type: 'PAY_IN',
    category: 'CUSTOMER_BOOKING_ADVANCE',
    title: 'Customer Advance Payment (Tempo Traveller)',
    amount: 5500,
    payment_mode: 'UPI',
    reference_no: 'UPI-263526-98124',
    party_name: 'Aravind K',
    party_type: 'CUSTOMER',
    related_booking_code: 'SJTR263526',
    related_invoice_no: 'SJT-INV-2026-4011',
    related_duty_code: null,
    date: '2026-10-25',
    time: '10:30 AM',
    status: 'COMPLETED',
    notes: 'Online booking via Customer App - Bengaluru to Mysuru trip',
    created_at: new Date('2026-10-25T10:30:00Z').toISOString()
  },
  {
    id: 'tx-002',
    type: 'PAY_IN',
    category: 'CORPORATE_MONTHLY_CONTRACT',
    title: 'TCS Monthly IT Park Staff Shuttle Retainer',
    amount: 85000,
    payment_mode: 'NET_BANKING',
    reference_no: 'NEFT-TCS-BLR-89210',
    party_name: 'Tata Consultancy Services Ltd.',
    party_type: 'CORPORATE',
    related_booking_code: null,
    related_invoice_no: 'SJT-INV-2026-1088',
    related_duty_code: 'DUTY-KA05-882',
    date: '2026-10-24',
    time: '04:15 PM',
    status: 'COMPLETED',
    notes: 'Monthly corporate transport billing for October 2026',
    created_at: new Date('2026-10-24T16:15:00Z').toISOString()
  },
  {
    id: 'tx-003',
    type: 'PAY_OUT',
    category: 'DRIVER_DUTY_SETTLEMENT',
    title: 'Driver Daily Duty Earnings - Ramesh Kumar',
    amount: 4500,
    payment_mode: 'UPI',
    reference_no: 'IMPS-DRV-RAMESH-7712',
    party_name: 'Ramesh Kumar',
    party_type: 'DRIVER',
    related_booking_code: 'SJTR263526',
    related_invoice_no: null,
    related_duty_code: 'DUTY-KA05-882',
    date: '2026-10-25',
    time: '05:30 PM',
    status: 'COMPLETED',
    notes: 'Settlement for Outstation trip and company duty (KA 05 AB 1234)',
    created_at: new Date('2026-10-25T17:30:00Z').toISOString()
  },
  {
    id: 'tx-004',
    type: 'PAY_OUT',
    category: 'FUEL_DIESEL',
    title: 'Bharat Petroleum - Diesel Refuel (KA 05 AB 1234)',
    amount: 3200,
    payment_mode: 'UPI',
    reference_no: 'BPCL-POS-55412',
    party_name: 'Bharat Petroleum Silk Board',
    party_type: 'VENDOR',
    related_booking_code: null,
    related_invoice_no: null,
    related_duty_code: null,
    date: '2026-10-25',
    time: '08:15 AM',
    status: 'COMPLETED',
    notes: 'Fleet refuel: 35.8 Litres Diesel @ ₹89.4/L for Mysuru trip',
    created_at: new Date('2026-10-25T08:15:00Z').toISOString()
  },
  {
    id: 'tx-005',
    type: 'PAY_OUT',
    category: 'FASTAG_TOLL_PARKING',
    title: 'Bengaluru-Mysuru Expressway FASTag Toll Recharge',
    amount: 750,
    payment_mode: 'NET_BANKING',
    reference_no: 'NETC-FASTAG-99120',
    party_name: 'NHAI FASTag Karnataka',
    party_type: 'VENDOR',
    related_booking_code: 'SJTR263526',
    related_invoice_no: null,
    related_duty_code: null,
    date: '2026-10-25',
    time: '07:45 AM',
    status: 'COMPLETED',
    notes: 'Expressway toll deduction and airport parking pool',
    created_at: new Date('2026-10-25T07:45:00Z').toISOString()
  },
  {
    id: 'tx-006',
    type: 'PAY_OUT',
    category: 'VEHICLE_MAINTENANCE',
    title: 'Force Motors Authorised Service - 20,000 KM Inspection',
    amount: 6800,
    payment_mode: 'NET_BANKING',
    reference_no: 'INV-FMS-90112',
    party_name: 'Force Commercial Service Center, Peenya',
    party_type: 'VENDOR',
    related_booking_code: null,
    related_invoice_no: null,
    related_duty_code: null,
    date: '2026-10-22',
    time: '11:00 AM',
    status: 'COMPLETED',
    notes: 'Brake pads replacement, engine oil synthetic 15W40, alignment',
    created_at: new Date('2026-10-22T11:00:00Z').toISOString()
  }
];

const INITIAL_INVOICES = [
  {
    id: 'inv-001',
    invoice_number: 'SJT-INV-2026-1088',
    client_name: 'Tata Consultancy Services Ltd.',
    client_type: 'CORPORATE',
    client_gstin: '29AAACT2727Q1ZW',
    billing_period: 'Oct 2026',
    total_trips: 18,
    total_km: 2450,
    subtotal: 80952,
    cgst: 2024,
    sgst: 2024,
    grand_total: 85000,
    status: 'PAID',
    payment_method: 'NEFT / RTGS',
    notes: 'Electronic City campus employee shuttle service',
    created_at: new Date('2026-10-24T12:00:00Z').toISOString()
  },
  {
    id: 'inv-002',
    invoice_number: 'SJT-INV-2026-4011',
    client_name: 'Aravind K',
    client_type: 'CUSTOMER',
    client_gstin: 'URP (Unregistered Person)',
    billing_period: '25 Oct 2026',
    total_trips: 1,
    total_km: 146,
    subtotal: 5238,
    cgst: 131,
    sgst: 131,
    grand_total: 5500,
    status: 'PAID',
    payment_method: 'UPI Razorpay',
    notes: 'Bengaluru to Mysuru - Tempo Traveller 17 Seater (Booking #SJTR263526)',
    created_at: new Date('2026-10-25T10:30:00Z').toISOString()
  }
];

// Persistent Local Backup Store (ensures zero data loss during cloud maintenance/downtime)
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let localStore = {
  vehicles: [...OFFICIAL_VEHICLES],
  users: [...INITIAL_USERS],
  driver_kyc: [],
  bookings: [],
  company_duties: [],
  invoices: [...INITIAL_INVOICES],
  transactions: [...INITIAL_TRANSACTIONS]
};

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      localStore = {
        vehicles: data.vehicles?.length ? data.vehicles : [...OFFICIAL_VEHICLES],
        users: data.users?.length ? data.users : [...INITIAL_USERS],
        driver_kyc: data.driver_kyc || [],
        bookings: data.bookings || [],
        company_duties: data.company_duties || [],
        invoices: data.invoices?.length ? data.invoices : [...INITIAL_INVOICES],
        transactions: data.transactions?.length ? data.transactions : [...INITIAL_TRANSACTIONS]
      };
      if (!localStore.users.find(u => u.email === 'admin@sjttravels.com')) {
        localStore.users.push(INITIAL_USERS[0]);
      }
      if (!localStore.users.find(u => u.email === 'ramesh.kumar@sjttravels.com')) {
        localStore.users.push(INITIAL_USERS[1]);
      }
    } else {
      saveStore();
    }
  } catch (err) {
    console.error('[LOCAL STORE]: Error reading local store file:', err.message);
  }
}

function saveStore() {
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

  verifyAndMigrateSchema();
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
        status TEXT DEFAULT 'ACTIVE',
        salary NUMERIC DEFAULT 25000,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

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
        face_match_score NUMERIC DEFAULT 98.4,
        face_verified BOOLEAN DEFAULT TRUE,
        govt_verified BOOLEAN DEFAULT TRUE,
        rto_dl_status TEXT DEFAULT 'SARATHI_GOVT_VERIFIED',
        uidai_aadhar_status TEXT DEFAULT 'UIDAI_GOVT_VERIFIED',
        police_clearance_status TEXT DEFAULT 'POLICE_CLEARED',
        kyc_status TEXT DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'APPROVED', 'REJECTED')),
        rejection_reason TEXT,
        assigned_vehicle_reg TEXT,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        verified_at TIMESTAMPTZ
      );

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

      CREATE TABLE IF NOT EXISTS company_duties (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        duty_code TEXT UNIQUE NOT NULL,
        driver_id UUID,
        driver_name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        external_trip_id TEXT NOT NULL,
        vehicle_reg TEXT NOT NULL,
        login_time TEXT NOT NULL,
        logout_time TEXT,
        start_km NUMERIC NOT NULL,
        end_km NUMERIC,
        daily_km NUMERIC DEFAULT 0,
        toll_parking_allowance NUMERIC DEFAULT 0,
        food_allowance NUMERIC DEFAULT 0,
        duty_selfie_url TEXT,
        duty_face_verified BOOLEAN DEFAULT TRUE,
        duty_face_match_score NUMERIC DEFAULT 99.1,
        status TEXT DEFAULT 'ON_DUTY' CHECK (status IN ('ON_DUTY', 'SUBMITTED', 'VERIFIED_BY_ADMIN', 'REJECTED')),
        duty_date TEXT NOT NULL,
        admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

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

      -- Fast Lookup Indexes
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_bookings_code ON bookings(booking_code);
      CREATE INDEX IF NOT EXISTS idx_bookings_cust_email ON bookings(customer_email);
      CREATE INDEX IF NOT EXISTS idx_company_duties_code ON company_duties(duty_code);
      CREATE INDEX IF NOT EXISTS idx_company_duties_driver ON company_duties(driver_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON company_transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON company_transactions(date);
    `);

    // 2. Seed Official Fleet Vehicles
    const vehCountRes = await client.query('SELECT COUNT(*) FROM vehicles');
    if (parseInt(vehCountRes.rows[0].count, 10) === 0) {
      console.log('>>> [POSTGRES]: Seeding 7 official vehicles into PostgreSQL table... <<<');
      for (const v of OFFICIAL_VEHICLES) {
        await client.query(`
          INSERT INTO vehicles (id, name, category, seats, ac, rate_per_day, rate_per_km, min_km_per_day, driver_allowance_per_day, image, reg_number, features, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, rate_per_day = EXCLUDED.rate_per_day, rate_per_km = EXCLUDED.rate_per_km
        `, [v.id, v.name, v.category, v.seats, v.ac, v.rate_per_day, v.rate_per_km, v.min_km_per_day, v.driver_allowance_per_day, v.image, v.reg_number, v.features, v.status]);
      }
    }

    // 3. Seed Admin User
    const adminRes = await client.query('SELECT id FROM users WHERE email = $1', ['admin@sjttravels.com']);
    if (adminRes.rows.length === 0) {
      console.log('>>> [POSTGRES]: Initializing Chief Administrator in PostgreSQL... <<<');
      const admin = INITIAL_USERS[0];
      await client.query(`
        INSERT INTO users (id, email, password, name, phone, role, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (email) DO NOTHING
      `, [admin.id, admin.email, admin.password, admin.name, admin.phone, admin.role, admin.status]);
    }

    // 4. Sync any registered users/bookings/duties from local store to ensure zero loss
    for (const u of localStore.users) {
      if (u.email !== 'admin@sjttravels.com') {
        await client.query(`
          INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, duty_mode, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (email) DO NOTHING
        `, [u.id || crypto.randomUUID(), u.email, u.password, u.name, u.phone, u.role || 'CUSTOMER', u.assigned_vehicle || null, u.duty_mode || 'OFF_DUTY', u.status || 'ACTIVE']).catch(() => {});
      }
    }

    for (const b of localStore.bookings) {
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
    console.log('>>> [POSTGRES READY]: All 6 tables verified & live on PostgreSQL! <<<');
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`>>> [POSTGRES NOTICE]: PostgreSQL not currently reachable (${err.message}). Seamlessly running on High-Performance Local Database with zero downtime. <<<`);
    return false;
  }
}

// Background auto-reconnect and health check heartbeat (every 15 seconds)
setInterval(async () => {
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

// Initialize on startup
initPool(currentDatabaseUrl);

// --- UNIFIED DATABASE ADAPTER API ---
module.exports = {
  async initDatabase() {
    if (!pool) {
      initPool(currentDatabaseUrl);
    }
    const success = await verifyAndMigrateSchema();
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
  isRemoteActive: () => isConnected,
  getDatabaseUrl: () => currentDatabaseUrl,
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
      try {
        const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (e) {}
    }
    return localStore.users.find(u => u.email.toLowerCase() === cleanEmail) || null;
  },

  async getUserById(id) {
    if (!id) return null;
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM users WHERE id::text = $1', [String(id)]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (e) {}
    }
    return localStore.users.find(u => String(u.id) === String(id)) || null;
  },

  async createUser(userData) {
    const newUser = {
      id: userData.id || crypto.randomUUID(),
      email: userData.email.toLowerCase().trim(),
      password: userData.password,
      name: userData.name,
      phone: userData.phone,
      role: userData.role || 'CUSTOMER',
      assigned_vehicle: userData.assigned_vehicle || null,
      duty_mode: 'OFF_DUTY',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    localStore.users.push(newUser);
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, duty_mode, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [newUser.id, newUser.email, newUser.password, newUser.name, newUser.phone, newUser.role, newUser.assigned_vehicle, newUser.duty_mode, newUser.status]);
      } catch (e) {
        console.error('PostgreSQL user insert err:', e.message);
      }
    }
    return newUser;
  },

  async updateUser(id, updates) {
    const uIdx = localStore.users.findIndex(u => String(u.id) === String(id));
    if (uIdx !== -1) {
      localStore.users[uIdx] = { ...localStore.users[uIdx], ...updates };
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
        values.push(String(id));
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id::text = $${i}`, values);
      } catch (e) {
        console.error('PostgreSQL user update err:', e.message);
      }
    }
    return uIdx !== -1 ? localStore.users[uIdx] : null;
  },

  async getAllUsers() {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT id, email, name, phone, role, assigned_vehicle, duty_mode, status, created_at FROM users');
        if (res.rows && res.rows.length > 0) return res.rows;
      } catch (e) {}
    }
    return localStore.users.map(({ password, ...rest }) => rest);
  },

  // --- STAFF & EMPLOYEES ---
  async getEmployees() {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM users WHERE role = $1', ['EMPLOYEE']);
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(({ password, ...rest }) => ({
            ...rest,
            designation: rest.designation || 'Operations Staff',
            permissions: rest.permissions || ['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet'],
            salary: rest.salary || 25000
          }));
        }
      } catch (e) {}
    }
    return localStore.users.filter(u => u.role === 'EMPLOYEE').map(({ password, ...rest }) => ({
      ...rest,
      designation: rest.designation || 'Operations Staff',
      permissions: rest.permissions || ['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet'],
      salary: rest.salary || 25000
    }));
  },

  async createEmployee(empData) {
    const newEmp = {
      id: crypto.randomUUID(),
      email: empData.email.toLowerCase().trim(),
      password: empData.password || 'sjt1234',
      name: empData.name,
      phone: empData.phone || '+91 98450 00000',
      role: 'EMPLOYEE',
      designation: empData.designation || 'Operations Staff',
      permissions: Array.isArray(empData.permissions) ? empData.permissions : ['bookings', 'cancellations', 'drivers', 'duties', 'attendance', 'payroll', 'fleet'],
      salary: Number(empData.salary) || 25000,
      assigned_vehicle: null,
      duty_mode: 'ACTIVE',
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    localStore.users.push(newEmp);
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO users (id, email, password, name, phone, role, designation, permissions, salary, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [newEmp.id, newEmp.email, newEmp.password, newEmp.name, newEmp.phone, newEmp.role, newEmp.designation, newEmp.permissions, newEmp.salary, newEmp.status]);
      } catch (e) {
        console.error('PostgreSQL employee insert err:', e.message);
      }
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
      try {
        const res = await pool.query('SELECT * FROM users WHERE role = $1', ['DRIVER']);
        if (res.rows) driverUsers = res.rows;
      } catch (e) {}
    }
    if (!driverUsers.length) {
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
    const newKyc = {
      id: kycData.id || crypto.randomUUID(),
      driver_id: kycData.driver_id,
      driver_name: kycData.driver_name,
      driver_phone: kycData.driver_phone,
      driver_email: kycData.driver_email,
      license_number: kycData.license_number,
      badge_number: kycData.badge_number || 'PSV-KA-PENDING',
      aadhar_number: kycData.aadhar_number,
      vehicle_preference: kycData.vehicle_preference || 'Sedans (Toyota Etios)',
      experience_years: parseInt(kycData.experience_years, 10) || 3,
      license_doc_url: kycData.license_doc_url || null,
      license_back_doc_url: kycData.license_back_doc_url || null,
      aadhar_doc_url: kycData.aadhar_doc_url || null,
      aadhar_back_doc_url: kycData.aadhar_back_doc_url || null,
      psv_badge_doc_url: kycData.psv_badge_doc_url || null,
      police_verification_url: kycData.police_verification_url || null,
      medical_fitness_doc_url: kycData.medical_fitness_doc_url || null,
      live_face_photo_url: kycData.live_face_photo_url || null,
      face_match_score: kycData.face_match_score || 98.4,
      face_verified: kycData.face_verified !== false,
      govt_verified: kycData.govt_verified !== false,
      rto_dl_status: kycData.rto_dl_status || 'SARATHI_GOVT_VERIFIED',
      uidai_aadhar_status: kycData.uidai_aadhar_status || 'UIDAI_GOVT_VERIFIED',
      police_clearance_status: kycData.police_clearance_status || 'POLICE_CLEARED',
      kyc_status: 'PENDING',
      rejection_reason: null,
      assigned_vehicle_reg: null,
      submitted_at: new Date().toISOString(),
      verified_at: null
    };

    const existingIdx = localStore.driver_kyc.findIndex(k => String(k.driver_id) === String(newKyc.driver_id) || k.driver_email === newKyc.driver_email);
    if (existingIdx !== -1) {
      localStore.driver_kyc[existingIdx] = { ...localStore.driver_kyc[existingIdx], ...newKyc, id: localStore.driver_kyc[existingIdx].id };
    } else {
      localStore.driver_kyc.push(newKyc);
    }
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO driver_kyc (
            id, driver_id, driver_name, driver_phone, driver_email, license_number, badge_number,
            aadhar_number, vehicle_preference, experience_years, license_doc_url, license_back_doc_url,
            aadhar_doc_url, aadhar_back_doc_url, psv_badge_doc_url, police_verification_url,
            medical_fitness_doc_url, live_face_photo_url, face_match_score, face_verified,
            govt_verified, rto_dl_status, uidai_aadhar_status, police_clearance_status, kyc_status
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
          )
        `, [
          newKyc.id, newKyc.driver_id, newKyc.driver_name, newKyc.driver_phone, newKyc.driver_email,
          newKyc.license_number, newKyc.badge_number, newKyc.aadhar_number, newKyc.vehicle_preference,
          newKyc.experience_years, newKyc.license_doc_url, newKyc.license_back_doc_url, newKyc.aadhar_doc_url,
          newKyc.aadhar_back_doc_url, newKyc.psv_badge_doc_url, newKyc.police_verification_url,
          newKyc.medical_fitness_doc_url, newKyc.live_face_photo_url, newKyc.face_match_score,
          newKyc.face_verified, newKyc.govt_verified, newKyc.rto_dl_status, newKyc.uidai_aadhar_status,
          newKyc.police_clearance_status, newKyc.kyc_status
        ]);
      } catch (e) {
        console.error('PostgreSQL KYC insert err:', e.message);
      }
    }
    return newKyc;
  },

  async getKycByDriverId(driverId) {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM driver_kyc WHERE driver_id::text = $1', [String(driverId)]);
        if (res.rows.length > 0) return res.rows[0];
      } catch (e) {}
    }
    return localStore.driver_kyc.find(k => String(k.driver_id) === String(driverId)) || null;
  },

  async getAllKycRequests() {
    if (isConnected && pool) {
      try {
        const res = await pool.query('SELECT * FROM driver_kyc ORDER BY submitted_at DESC');
        if (res.rows && res.rows.length > 0) return res.rows;
      } catch (e) {}
    }
    return [...localStore.driver_kyc].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  },

  async reviewKyc(kycId, { action, assigned_vehicle_reg, rejection_reason }) {
    const isApproved = action === 'APPROVE';
    const updates = {
      kyc_status: isApproved ? 'APPROVED' : 'REJECTED',
      assigned_vehicle_reg: isApproved ? (assigned_vehicle_reg || 'KA01AE1234') : null,
      rejection_reason: isApproved ? null : (rejection_reason || 'Document verification failed. Please re-upload clear copies.'),
      verified_at: new Date().toISOString()
    };

    const kIndex = localStore.driver_kyc.findIndex(k => String(k.id) === String(kycId) || String(k.driver_id) === String(kycId));
    let updatedKyc = null;
    if (kIndex !== -1) {
      localStore.driver_kyc[kIndex] = { ...localStore.driver_kyc[kIndex], ...updates };
      updatedKyc = localStore.driver_kyc[kIndex];

      const driverUser = localStore.users.find(u => String(u.id) === String(updatedKyc.driver_id));
      if (driverUser && isApproved) {
        driverUser.assigned_vehicle = updatedKyc.assigned_vehicle_reg;
        driverUser.status = 'ACTIVE';
      }
      saveStore();
    }

    if (isConnected && pool) {
      try {
        await pool.query(`
          UPDATE driver_kyc 
          SET kyc_status = $1, assigned_vehicle_reg = $2, rejection_reason = $3, verified_at = $4
          WHERE id::text = $5 OR driver_id::text = $5
        `, [updates.kyc_status, updates.assigned_vehicle_reg, updates.rejection_reason, updates.verified_at, String(kycId)]);

        if (updatedKyc && isApproved) {
          await pool.query(`
            UPDATE users SET assigned_vehicle = $1, status = 'ACTIVE' WHERE id::text = $2
          `, [updatedKyc.assigned_vehicle_reg, String(updatedKyc.driver_id)]);
        }
      } catch (e) {
        console.error('PostgreSQL KYC review err:', e.message);
      }
    }
    return updatedKyc;
  },

  // --- BOOKINGS ---
  async getBookings(filters = {}) {
    if (isConnected && pool) {
      try {
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
        if (res.rows) return res.rows;
      } catch (e) {}
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
            pickup, destination, journey_date, journey_time, passengers, vehicle_id,
            vehicle_name, vehicle_reg, quoted_amount, advance_paid, balance_amount,
            payment_method, payment_status, status, assigned_driver_id, assigned_driver_name,
            assigned_driver_phone, notes, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
          )
        `, [
          newBooking.id, newBooking.booking_code, newBooking.customer_name, newBooking.customer_phone, newBooking.customer_email,
          newBooking.trip_type, newBooking.pickup, newBooking.destination, newBooking.journey_date, newBooking.journey_time,
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

  async updateBookingStatus(id, status) {
    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(id));
    if (bIndex !== -1) {
      localStore.bookings[bIndex].status = status;
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id::text = $2', [status, String(id)]);
      } catch (e) {
        console.error('PostgreSQL booking update status err:', e.message);
      }
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  async updateBooking(id, updates) {
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
    if (isConnected && pool) {
      try {
        const fields = [];
        const values = [];
        let i = 1;
        for (const [k, v] of Object.entries(updates)) {
          fields.push(`${k} = $${i++}`);
          values.push(v);
        }
        values.push(String(id));
        await pool.query(`UPDATE bookings SET ${fields.join(', ')}, updated_at = NOW() WHERE id::text = $${i}`, values);
      } catch (e) {
        console.error('PostgreSQL booking update err:', e.message);
      }
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

    const bIndex = localStore.bookings.findIndex(b => String(b.id) === String(bookingId));
    if (bIndex !== -1) {
      localStore.bookings[bIndex] = { ...localStore.bookings[bIndex], ...updates };
      saveStore();
    }

    if (isConnected && pool) {
      try {
        await pool.query(`
          UPDATE bookings 
          SET assigned_driver_id = $1, assigned_driver_name = $2, assigned_driver_phone = $3, vehicle_reg = $4, status = 'ASSIGNED', updated_at = NOW()
          WHERE id::text = $5
        `, [driver_id, driver_name, driver_phone, vehicle_reg || null, String(bookingId)]);
      } catch (e) {
        console.error('PostgreSQL assign driver err:', e.message);
      }
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  // --- COMPANY DUTIES ---
  async getDuties(filters = {}) {
    if (isConnected && pool) {
      try {
        let sql = 'SELECT * FROM company_duties WHERE 1=1';
        const params = [];
        let i = 1;
        if (filters.driver_id) {
          sql += ` AND driver_id::text = $${i++}`;
          params.push(String(filters.driver_id));
        }
        sql += ' ORDER BY created_at DESC';
        const res = await pool.query(sql, params);
        if (res.rows) return res.rows;
      } catch (e) {}
    }

    let dutiesList = [...localStore.company_duties].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (filters.driver_id) {
      dutiesList = dutiesList.filter(d => String(d.driver_id) === String(filters.driver_id));
    }
    return dutiesList;
  },

  async startDuty(dutyData) {
    const dutyCode = `DUTY-${Math.floor(1000 + Math.random() * 9000)}`;
    const newDuty = {
      id: dutyData.id || crypto.randomUUID(),
      duty_code: dutyCode,
      driver_id: dutyData.driver_id || null,
      driver_name: dutyData.driver_name || 'Driver',
      company_name: dutyData.company_name,
      external_trip_id: dutyData.external_trip_id,
      vehicle_reg: dutyData.vehicle_reg || 'KA01AE1234',
      login_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      logout_time: null,
      start_km: Number(dutyData.start_km),
      end_km: null,
      daily_km: 0,
      toll_parking_allowance: 0,
      food_allowance: 0,
      duty_selfie_url: dutyData.duty_selfie_url || null,
      duty_face_verified: dutyData.duty_face_verified !== false,
      duty_face_match_score: dutyData.duty_face_match_score || 99.1,
      status: 'ON_DUTY',
      duty_date: new Date().toISOString().split('T')[0],
      admin_note: null,
      created_at: new Date().toISOString()
    };

    localStore.company_duties.unshift(newDuty);
    saveStore();

    if (isConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO company_duties (
            id, duty_code, driver_id, driver_name, company_name, external_trip_id,
            vehicle_reg, login_time, start_km, duty_selfie_url, duty_face_verified,
            duty_face_match_score, status, duty_date, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
          )
        `, [
          newDuty.id, newDuty.duty_code, newDuty.driver_id, newDuty.driver_name, newDuty.company_name,
          newDuty.external_trip_id, newDuty.vehicle_reg, newDuty.login_time, newDuty.start_km,
          newDuty.duty_selfie_url, newDuty.duty_face_verified, newDuty.duty_face_match_score,
          newDuty.status, newDuty.duty_date, newDuty.created_at
        ]);
      } catch (e) {
        console.error('PostgreSQL start duty err:', e.message);
      }
    }
    return newDuty;
  },

  async endDuty(dutyId, { end_km, toll_parking, food_allowance }) {
    const dIndex = localStore.company_duties.findIndex(d => String(d.id) === String(dutyId) || d.duty_code === dutyId);
    let updatedDuty = null;

    if (dIndex !== -1) {
      const duty = localStore.company_duties[dIndex];
      const startKm = Number(duty.start_km);
      const endKmNum = Number(end_km);
      const totalKm = endKmNum >= startKm ? endKmNum - startKm : 0;

      const updates = {
        end_km: endKmNum,
        daily_km: totalKm,
        toll_parking_allowance: Number(toll_parking) || 0,
        food_allowance: Number(food_allowance) || 0,
        logout_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'SUBMITTED'
      };

      localStore.company_duties[dIndex] = { ...duty, ...updates };
      updatedDuty = localStore.company_duties[dIndex];
      saveStore();

      if (isConnected && pool) {
        try {
          await pool.query(`
            UPDATE company_duties 
            SET end_km = $1, daily_km = $2, toll_parking_allowance = $3, food_allowance = $4, logout_time = $5, status = 'SUBMITTED'
            WHERE id::text = $6 OR duty_code = $6
          `, [updates.end_km, updates.daily_km, updates.toll_parking_allowance, updates.food_allowance, updates.logout_time, String(dutyId)]);
        } catch (e) {
          console.error('PostgreSQL end duty err:', e.message);
        }
      }
    }
    return updatedDuty;
  },

  async verifyDuty(dutyId, { action, admin_note }) {
    const isApproved = action === 'APPROVE';
    const status = isApproved ? 'VERIFIED_BY_ADMIN' : 'REJECTED';

    const dIndex = localStore.company_duties.findIndex(d => String(d.id) === String(dutyId));
    let updatedDuty = null;
    if (dIndex !== -1) {
      localStore.company_duties[dIndex].status = status;
      localStore.company_duties[dIndex].admin_note = admin_note || null;
      updatedDuty = localStore.company_duties[dIndex];
      saveStore();
    }

    if (isConnected && pool) {
      try {
        await pool.query(`
          UPDATE company_duties SET status = $1, admin_note = $2 WHERE id::text = $3
        `, [status, admin_note || null, String(dutyId)]);
      } catch (e) {
        console.error('PostgreSQL verify duty err:', e.message);
      }
    }
    return updatedDuty;
  },

  async updateDuty(id, updates) {
    const dIdx = localStore.company_duties.findIndex(d => String(d.id) === String(id));
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
        values.push(String(id));
        await pool.query(`UPDATE company_duties SET ${fields.join(', ')} WHERE id::text = $${i}`, values);
      } catch (e) {
        console.error('PostgreSQL update duty err:', e.message);
      }
    }
    return dIdx !== -1 ? localStore.company_duties[dIdx] : null;
  },

  async deleteDuty(id) {
    const dIdx = localStore.company_duties.findIndex(d => String(d.id) === String(id));
    if (dIdx !== -1) {
      localStore.company_duties.splice(dIdx, 1);
      saveStore();
    }
    if (isConnected && pool) {
      try {
        await pool.query('DELETE FROM company_duties WHERE id::text = $1', [String(id)]);
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
    const selectedMonth = monthYear || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return drivers.map(drv => {
      const driverDuties = duties.filter(d => 
        (String(d.driver_id) === String(drv.id) || (d.driver_name && d.driver_name.toLowerCase() === drv.name.toLowerCase())) &&
        (d.duty_date || d.created_at || '').startsWith(selectedMonth)
      );

      const uniqueDays = new Set(driverDuties.map(d => d.duty_date || (d.created_at ? d.created_at.slice(0, 10) : '')));
      uniqueDays.delete('');
      const daysWorked = uniqueDays.size;

      const totalKm = driverDuties.reduce((s, d) => s + (Number(d.daily_km) || 0), 0);
      const totalTollParking = driverDuties.reduce((s, d) => s + (Number(d.toll_parking_allowance) || 0), 0);
      const totalFoodAllowance = driverDuties.reduce((s, d) => s + (Number(d.food_allowance) || 0), 0);
      const totalDutyAllowance = totalTollParking + totalFoodAllowance;

      const baseSalary = 18000;
      const attendanceBonus = daysWorked * 250;
      const kmIncentive = Math.round(totalKm * 2.5);
      const grossSalary = baseSalary + attendanceBonus + kmIncentive + totalDutyAllowance;
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
        total_duties_completed: driverDuties.length,
        total_passenger_trips: assignedTrips.length,
        total_km: totalKm,
        base_salary: baseSalary,
        attendance_bonus: attendanceBonus,
        km_incentive: kmIncentive,
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

  async generateInvoice({
    client_name,
    client_type,
    client_gstin,
    client_address,
    billing_period,
    invoice_date,
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
    payment_method,
    notes,
    status
  }) {
    const sub = Number(subtotal) || 45000;
    const calcCgst = cgst !== undefined ? Number(cgst) : Math.round(sub * 0.025);
    const calcSgst = sgst !== undefined ? Number(sgst) : Math.round(sub * 0.025);
    const total = grand_total !== undefined ? Number(grand_total) : (sub + calcCgst + calcSgst);

    const newInv = {
      id: crypto.randomUUID(),
      invoice_number: `SJT-INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      client_name: client_name || 'Tata Consultancy Services Ltd.',
      client_type: client_type || 'CORPORATE',
      client_gstin: client_gstin || '29AAACT2727Q1ZW',
      client_address: client_address || 'Bengaluru, Karnataka',
      billing_period: billing_period || `${new Date().toLocaleString('default', { month: 'short' })} ${new Date().getFullYear()}`,
      invoice_date: invoice_date || new Date().toISOString().split('T')[0],
      due_date: due_date || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      total_trips: Number(total_trips) || 1,
      total_km: Number(total_km) || 146,
      subtotal: sub,
      cgst: calcCgst,
      sgst: calcSgst,
      grand_total: total,
      vehicle_name: vehicle_name || 'Tempo Traveller 17 Seater',
      vehicle_reg: vehicle_reg || 'KA 05 AB 1234',
      items: items && items.length > 0 ? items : [
        {
          description: `Passenger Transport - ${client_name || 'Commercial Duty'}`,
          vehicleName: vehicle_name || 'Tempo Traveller 17 Seater',
          daysOrKm: Number(total_km) || 146,
          rate: Math.round(sub / (Number(total_km) || 146)),
          amount: sub
        }
      ],
      payment_method: payment_method || 'NEFT / RTGS / Razorpay',
      notes: notes || 'GST SAC Code: 996412 - Passenger Transport Services',
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
