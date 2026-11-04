-- ==============================================================================
-- SJT TOURS & TRAVELS PVT. LTD. - COMPLETE SUPABASE CLOUD DATABASE SCHEMA
-- Instructions: Copy and paste this script into your PostgreSQL SQL Editor:
-- https://supabase.com/dashboard/project/yvwvmiwsajezaagjeskt/sql/new
-- Click 'Run' to execute.
-- ZERO DUMMY USERS | ZERO DUMMY DRIVERS | REAL REGISTRATION READY
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. USERS TABLE (Admin, Self-Registered Drivers, Self-Registered Customers)
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

-- 4. OFFICIAL FLEET VEHICLES TABLE (7 Official SJT Vehicles)
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

-- 5. DRIVER KYC & ONBOARDING VERIFICATION TABLE
CREATE TABLE IF NOT EXISTS driver_kyc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    driver_name TEXT NOT NULL,
    driver_phone TEXT NOT NULL,
    driver_email TEXT NOT NULL,
    license_number TEXT NOT NULL,
    badge_number TEXT,
    aadhar_number TEXT NOT NULL,
    pan_number TEXT,
    vehicle_preference TEXT NOT NULL,
    experience_years INTEGER DEFAULT 3,
    address TEXT,
    vehicle_reg TEXT,
    vehicle_type TEXT,
    vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    face_document JSONB,
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
    reviewed_by TEXT,
    assigned_vehicle_reg TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ
);
ALTER TABLE driver_kyc ADD COLUMN IF NOT EXISTS vehicle_details JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 6. LIVE BOOKINGS TABLE (Customer Bookings from Web & App)
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
    vehicle_id TEXT REFERENCES vehicles(id),
    vehicle_name TEXT NOT NULL,
    vehicle_reg TEXT,
    quoted_amount NUMERIC NOT NULL,
    advance_paid NUMERIC DEFAULT 0,
    balance_amount NUMERIC DEFAULT 0,
    payment_method TEXT DEFAULT 'UPI / Cash',
    payment_status TEXT DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'PARTIAL', 'REFUNDED')),
    status TEXT DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    assigned_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_driver_name TEXT,
    assigned_driver_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS return_date TEXT;
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
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking ON booking_payments(booking_id, created_at DESC);

-- 7. COMPANY DUTIES & LOGS (Corporate Duty Tracking with Odometer & Trips)
CREATE TABLE IF NOT EXISTS company_duties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    duty_code TEXT UNIQUE NOT NULL,
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS pickup_location TEXT;
ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS destination_location TEXT;
ALTER TABLE company_duties ADD COLUMN IF NOT EXISTS route_details TEXT;

-- 8. GST TAX INVOICES TABLE
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

-- ==============================================================================
-- Row-level security defaults to deny for public/anon clients. The trusted API
-- connects with its server-side database credentials.
-- ==============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all users" ON users;
DROP POLICY IF EXISTS "Allow public all vehicles" ON vehicles;
DROP POLICY IF EXISTS "Allow public all bookings" ON bookings;
DROP POLICY IF EXISTS "Allow public all company_duties" ON company_duties;
DROP POLICY IF EXISTS "Allow public all invoices" ON invoices;

-- ==============================================================================
-- OFFICIAL SEED DATA: 7 FLEET VEHICLES ONLY (Official SJT Commercial Fleet)
-- ==============================================================================
INSERT INTO vehicles (id, name, category, seats, ac, rate_per_day, rate_per_km, min_km_per_day, driver_allowance_per_day, image, reg_number, features, status)
VALUES
('etios', 'Toyota Etios / Sedan', 'Sedans', 4, true, 2200, 12, 250, 400, '/etios.jpg', 'KA01AE1234', ARRAY['Air Conditioning', '4 Passenger Comfort', 'Spacious Boot (400L)'], 'AVAILABLE'),
('ertiga', 'Maruti Suzuki Ertiga', 'Ertiga MPV', 6, true, 2800, 14, 250, 450, '/ertiga.jpg', 'KA04ME5678', ARRAY['Dual AC Vents', '6 Passenger Seating', 'Foldable 3rd Row'], 'AVAILABLE'),
('innova', 'Toyota Innova Crysta', 'Innova Crysta / Hycross', 7, true, 3500, 17, 300, 500, '/innova.jpg', 'KA05NB9012', ARRAY['Captain Seat Comfort', 'Powerful AC Climatic Control', 'Luxury Executive Ride'], 'AVAILABLE'),
('hycross', 'Toyota Innova Hycross', 'Innova Crysta / Hycross', 6, true, 4500, 22, 300, 600, '/hycross.jpg', 'KA03MH3456', ARRAY['Hybrid Silent Luxury', 'Ottoman Reclining Seats', 'Panoramic Sunroof'], 'AVAILABLE'),
('tempo', 'Tempo Traveller (12 Seater)', 'Tempo Travellers', 12, true, 4500, 24, 300, 600, '/tempo.jpg', 'KA02TT7890', ARRAY['Individual Pushback Seats', '2x1 Luxury Layout', 'High Roof Standing Height'], 'AVAILABLE'),
('tempo17', 'Tempo Traveller (17 Seater)', 'Tempo Travellers', 17, true, 7500, 28, 350, 700, '/tempo17.jpg', 'KA01TL2345', ARRAY['17 Luxury Reclining Seats', 'Twin High-Power AC Blowers', 'Large Luggage Boot'], 'AVAILABLE'),
('minibus', 'Mini Bus (25 Seater)', 'Tempo Travellers', 25, true, 8500, 34, 350, 800, '/minibus.jpg', 'KA51MB6789', ARRAY['25 Deluxe Pushback Seats', 'Air Suspension Ride', 'PA Mic & Audio System'], 'AVAILABLE')
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- Create the first admin using the server's secure bootstrap environment
-- variables. Never seed a shared/default admin password into the database.
-- ==============================================================================
-- ZERO DUMMY DRIVERS - Real drivers create their own login ID & password.
-- ZERO DUMMY BOOKINGS - Real customer bookings only.
-- ZERO DUMMY DUTIES - Real driver duty logs only.
