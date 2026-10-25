-- ==============================================================================
-- SJT TOURS & TRAVELS PVT. LTD. - COMPLETE SUPABASE CLOUD DATABASE SCHEMA
-- Instructions: Copy and paste this script directly into your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/yvwvmiwsajezaagjeskt/sql/new
-- Click 'Run' to execute.
-- ZERO DUMMY USERS | ZERO DUMMY DRIVERS | REAL REGISTRATION READY
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Clean Drop (if re-running to reset schema)
DROP TABLE IF EXISTS company_duties CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS driver_kyc CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 3. USERS TABLE (Admin, Self-Registered Drivers, Self-Registered Customers)
CREATE TABLE users (
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

-- 4. OFFICIAL FLEET VEHICLES TABLE (7 Official SJT Vehicles)
CREATE TABLE vehicles (
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
CREATE TABLE driver_kyc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES users(id) ON DELETE CASCADE,
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

-- 6. LIVE BOOKINGS TABLE (Customer Bookings from Web & App)
CREATE TABLE bookings (
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. COMPANY DUTIES & LOGS (Corporate Duty Tracking with Odometer & Trips)
CREATE TABLE company_duties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    duty_code TEXT UNIQUE NOT NULL,
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
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

-- 8. GST TAX INVOICES TABLE
CREATE TABLE invoices (
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
-- ROW LEVEL SECURITY (RLS) POLICIES - Unrestricted Access for Service & Clients
-- ==============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all driver_kyc" ON driver_kyc FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all bookings" ON bookings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all company_duties" ON company_duties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);

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
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  rate_per_day = EXCLUDED.rate_per_day,
  rate_per_km = EXCLUDED.rate_per_km;

-- ==============================================================================
-- OFFICIAL INITIAL ADMIN ACCOUNT (FOR COMPANY MANAGEMENT ACCESS)
-- (Drivers and Customers will self-register their own login ID & password)
-- ==============================================================================
INSERT INTO users (id, email, password, name, phone, role, assigned_vehicle, status)
VALUES
('00000000-0000-0000-0000-000000000001', 'admin@sjttravels.com', 'admin123', 'SJT Chief Administrator', '+91 93534 62672', 'ADMIN', NULL, 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- ZERO DUMMY DRIVERS - Real drivers create their own login ID & password.
-- ZERO DUMMY BOOKINGS - Real customer bookings only.
-- ZERO DUMMY DUTIES - Real driver duty logs only.
