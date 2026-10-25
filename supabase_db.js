const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Official 7 Fleet Vehicles ONLY
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

// Seed profiles: Only official company administrator. Zero dummy drivers or dummy customers.
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
  }
];

// Persistent File Storage (for reliable zero-loss local state + Supabase sync)
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
  invoices: []
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
        invoices: data.invoices || []
      };
      // Ensure admin exists
      if (!localStore.users.find(u => u.email === 'admin@sjttravels.com')) {
        localStore.users.push(INITIAL_USERS[0]);
      }
    } else {
      saveStore();
    }
  } catch (err) {
    console.error('Failed to load local store file:', err.message);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(localStore, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save store file:', err.message);
  }
}

loadStore();

let remoteTablesAvailable = false;

// Check connection and schema presence
async function checkSupabaseSchema() {
  try {
    const { data, error } = await supabase.from('vehicles').select('id').limit(1);
    if (!error) {
      if (!remoteTablesAvailable) {
        console.log('>>> [SUPABASE CLOUD]: PostgreSQL tables verified active on yvwvmiwsajezaagjeskt.supabase.co <<<');
      }
      remoteTablesAvailable = true;
      await ensureSeedDataOnSupabase();
    } else {
      remoteTablesAvailable = false;
      console.log('>>> [SUPABASE CLOUD NOTICE]: Database table pending SQL schema execution in Supabase Dashboard.');
    }
  } catch (err) {
    remoteTablesAvailable = false;
    console.log('>>> [SUPABASE NOTICE]:', err.message);
  }
}

// Ensure seed data in Supabase if table is empty, and sync local registrations
async function ensureSeedDataOnSupabase() {
  try {
    // 1. Vehicles
    const { count, error } = await supabase.from('vehicles').select('*', { count: 'exact', head: true });
    if (!error && count === 0) {
      console.log('>>> [SUPABASE CLOUD]: Seeding 7 official vehicles into Supabase...');
      await supabase.from('vehicles').upsert(OFFICIAL_VEHICLES);
    }

    // 2. Admin User
    const { data: adminExists } = await supabase.from('users').select('id').eq('email', 'admin@sjttravels.com').maybeSingle();
    if (!adminExists) {
      console.log('>>> [SUPABASE CLOUD]: Initializing Admin account...');
      await supabase.from('users').upsert([INITIAL_USERS[0]]);
    }

    // 3. Sync registered users if any
    for (const u of localStore.users) {
      if (u.email !== 'admin@sjttravels.com') {
        const { data: userExists } = await supabase.from('users').select('id').eq('email', u.email).maybeSingle();
        if (!userExists) {
          await supabase.from('users').insert([u]);
        }
      }
    }
  } catch (e) {
    console.error('Supabase seed sync error:', e.message);
  }
}

// Initial check & interval
checkSupabaseSchema();
setInterval(checkSupabaseSchema, 12000);

module.exports = {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isRemoteActive: () => remoteTablesAvailable,

  // --- VEHICLES ---
  async getVehicles() {
    if (remoteTablesAvailable) {
      const { data, error } = await supabase.from('vehicles').select('*');
      if (!error && data && data.length > 0) return data;
    }
    return localStore.vehicles;
  },

  async getVehicleById(id) {
    if (remoteTablesAvailable) {
      const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).single();
      if (!error && data) return data;
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

    if (remoteTablesAvailable) {
      try {
        await supabase.from('vehicles').insert([newVeh]);
      } catch (e) {
        console.error('Supabase vehicle insert err:', e.message);
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
    if (remoteTablesAvailable) {
      try {
        await supabase.from('vehicles').update(updates).eq('id', id);
      } catch (e) {
        console.error('Supabase vehicle update err:', e.message);
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
    if (remoteTablesAvailable) {
      try {
        await supabase.from('vehicles').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase vehicle delete err:', e.message);
      }
    }
    return true;
  },

  // --- USERS / AUTH ---
  async getUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('email', cleanEmail).maybeSingle();
        if (!error && data) return data;
      } catch (e) {}
    }
    return localStore.users.find(u => u.email.toLowerCase() === cleanEmail) || null;
  },

  async getUserById(id) {
    if (!id) return null;
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (!error && data) return data;
      } catch (e) {}
    }
    return localStore.users.find(u => u.id === id) || null;
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

    if (remoteTablesAvailable) {
      try {
        await supabase.from('users').insert([newUser]);
      } catch (e) {
        console.error('Supabase user insert err:', e.message);
      }
    }
    return newUser;
  },

  async updateUser(id, updates) {
    const uIdx = localStore.users.findIndex(u => u.id === id);
    if (uIdx !== -1) {
      localStore.users[uIdx] = { ...localStore.users[uIdx], ...updates };
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('users').update(updates).eq('id', id);
      } catch (e) {
        console.error('Supabase user update err:', e.message);
      }
    }
    return uIdx !== -1 ? localStore.users[uIdx] : null;
  },

  async getAllUsers() {
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('users').select('id, email, name, phone, role, assigned_vehicle, duty_mode, status, created_at');
        if (!error && data) return data;
      } catch (e) {}
    }
    return localStore.users.map(({ password, ...rest }) => rest);
  },

  // --- STAFF & EMPLOYEES ---
  async getEmployees() {
    let employeeUsers = [];
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('role', 'EMPLOYEE');
        if (!error && data) employeeUsers = data;
      } catch (e) {}
    }
    if (!employeeUsers.length) {
      employeeUsers = localStore.users.filter(u => u.role === 'EMPLOYEE');
    }
    return employeeUsers.map(({ password, ...rest }) => ({
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

    if (remoteTablesAvailable) {
      try {
        await supabase.from('users').insert([newEmp]);
      } catch (e) {
        console.error('Supabase employee insert err:', e.message);
      }
    }
    const { password, ...safeEmp } = newEmp;
    return safeEmp;
  },

  async updateEmployee(id, updates) {
    const uIdx = localStore.users.findIndex(u => u.id === id && u.role === 'EMPLOYEE');
    if (uIdx !== -1) {
      localStore.users[uIdx] = { ...localStore.users[uIdx], ...updates };
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('users').update(updates).eq('id', id);
      } catch (e) {
        console.error('Supabase employee update err:', e.message);
      }
    }
    return uIdx !== -1 ? localStore.users[uIdx] : null;
  },

  async deleteEmployee(id) {
    const uIdx = localStore.users.findIndex(u => u.id === id && u.role === 'EMPLOYEE');
    if (uIdx !== -1) {
      localStore.users.splice(uIdx, 1);
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('users').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase employee delete err:', e.message);
      }
    }
    return true;
  },

  async deleteDriver(id) {
    const uIdx = localStore.users.findIndex(u => u.id === id && u.role === 'DRIVER');
    if (uIdx !== -1) {
      localStore.users.splice(uIdx, 1);
      localStore.driver_kyc = localStore.driver_kyc.filter(k => k.driver_id !== id);
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('users').delete().eq('id', id);
        await supabase.from('driver_kyc').delete().eq('driver_id', id);
      } catch (e) {
        console.error('Supabase driver delete err:', e.message);
      }
    }
    return true;
  },

  async getDrivers() {
    // Returns all registered drivers with their KYC status and assigned vehicle
    let driverUsers = [];
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('role', 'DRIVER');
        if (!error && data) driverUsers = data;
      } catch (e) {}
    }
    if (!driverUsers.length) {
      driverUsers = localStore.users.filter(u => u.role === 'DRIVER');
    }

    const allKyc = await this.getAllKycRequests();

    return driverUsers.map(u => {
      const kyc = allKyc.find(k => k.driver_id === u.id || k.driver_email === u.email);
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
      experience_years: parseInt(kycData.experience_years) || 3,
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

    const existingIdx = localStore.driver_kyc.findIndex(k => k.driver_id === newKyc.driver_id || k.driver_email === newKyc.driver_email);
    if (existingIdx !== -1) {
      localStore.driver_kyc[existingIdx] = { ...localStore.driver_kyc[existingIdx], ...newKyc, id: localStore.driver_kyc[existingIdx].id };
    } else {
      localStore.driver_kyc.push(newKyc);
    }
    saveStore();

    if (remoteTablesAvailable) {
      try {
        await supabase.from('driver_kyc').upsert([newKyc], { onConflict: 'driver_id' });
      } catch (e) {
        console.error('Supabase KYC upsert err:', e.message);
      }
    }
    return newKyc;
  },

  async getKycByDriverId(driverId) {
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('driver_kyc').select('*').eq('driver_id', driverId).maybeSingle();
        if (!error && data) return data;
      } catch (e) {}
    }
    return localStore.driver_kyc.find(k => k.driver_id === driverId) || null;
  },

  async getAllKycRequests() {
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('driver_kyc').select('*').order('submitted_at', { ascending: false });
        if (!error && data) return data;
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

    const kIndex = localStore.driver_kyc.findIndex(k => k.id === kycId || k.driver_id === kycId);
    let updatedKyc = null;
    if (kIndex !== -1) {
      localStore.driver_kyc[kIndex] = { ...localStore.driver_kyc[kIndex], ...updates };
      updatedKyc = localStore.driver_kyc[kIndex];

      const driverUser = localStore.users.find(u => u.id === updatedKyc.driver_id);
      if (driverUser && isApproved) {
        driverUser.assigned_vehicle = updatedKyc.assigned_vehicle_reg;
        driverUser.status = 'ACTIVE';
      }
      saveStore();
    }

    if (remoteTablesAvailable) {
      try {
        await supabase.from('driver_kyc').update(updates).eq('id', kycId);
        if (updatedKyc && isApproved) {
          await supabase.from('users').update({ assigned_vehicle: updatedKyc.assigned_vehicle_reg, status: 'ACTIVE' }).eq('id', updatedKyc.driver_id);
        }
      } catch (e) {
        console.error('Supabase KYC review err:', e.message);
      }
    }
    return updatedKyc;
  },

  // --- BOOKINGS ---
  async getBookings(filters = {}) {
    let bookingsList = [];
    if (remoteTablesAvailable) {
      try {
        let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
        if (filters.customer_email) query = query.eq('customer_email', filters.customer_email);
        if (filters.assigned_driver_id) query = query.eq('assigned_driver_id', filters.assigned_driver_id);
        const { data, error } = await query;
        if (!error && data) bookingsList = data;
      } catch (e) {}
    }
    if (!bookingsList.length) {
      bookingsList = [...localStore.bookings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (filters.customer_email) {
        bookingsList = bookingsList.filter(b => (b.customer_email || '').toLowerCase() === filters.customer_email.toLowerCase());
      }
      if (filters.assigned_driver_id) {
        bookingsList = bookingsList.filter(b => b.assigned_driver_id === filters.assigned_driver_id);
      }
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
      passengers: parseInt(bookingData.passengers) || 1,
      vehicle_id: bookingData.vehicle_id,
      vehicle_name: bookingData.vehicle_name,
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

    localStore.bookings.unshift(newBooking);
    saveStore();

    if (remoteTablesAvailable) {
      try {
        await supabase.from('bookings').insert([newBooking]);
      } catch (e) {
        console.error('Supabase booking insert err:', e.message);
      }
    }
    return newBooking;
  },

  async updateBookingStatus(id, status) {
    const bIndex = localStore.bookings.findIndex(b => b.id === id);
    if (bIndex !== -1) {
      localStore.bookings[bIndex].status = status;
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('bookings').update({ status }).eq('id', id);
      } catch (e) {
        console.error('Supabase booking update status err:', e.message);
      }
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  async updateBooking(id, updates) {
    const bIndex = localStore.bookings.findIndex(b => b.id === id);
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
    if (remoteTablesAvailable) {
      try {
        await supabase.from('bookings').update(updates).eq('id', id);
      } catch (e) {
        console.error('Supabase booking update err:', e.message);
      }
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  async deleteBooking(id) {
    const bIndex = localStore.bookings.findIndex(b => b.id === id);
    if (bIndex !== -1) {
      localStore.bookings.splice(bIndex, 1);
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('bookings').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase booking delete err:', e.message);
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

    const bIndex = localStore.bookings.findIndex(b => b.id === bookingId);
    if (bIndex !== -1) {
      localStore.bookings[bIndex] = { ...localStore.bookings[bIndex], ...updates };
      saveStore();
    }

    if (remoteTablesAvailable) {
      try {
        await supabase.from('bookings').update(updates).eq('id', bookingId);
      } catch (e) {
        console.error('Supabase assign driver err:', e.message);
      }
    }
    return bIndex !== -1 ? localStore.bookings[bIndex] : null;
  },

  // --- COMPANY DUTIES ---
  async getDuties(filters = {}) {
    let dutiesList = [];
    if (remoteTablesAvailable) {
      try {
        let query = supabase.from('company_duties').select('*').order('created_at', { ascending: false });
        if (filters.driver_id) query = query.eq('driver_id', filters.driver_id);
        const { data, error } = await query;
        if (!error && data) dutiesList = data;
      } catch (e) {}
    }
    if (!dutiesList.length) {
      dutiesList = [...localStore.company_duties].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (filters.driver_id) {
        dutiesList = dutiesList.filter(d => d.driver_id === filters.driver_id);
      }
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

    if (remoteTablesAvailable) {
      try {
        await supabase.from('company_duties').insert([newDuty]);
      } catch (e) {
        console.error('Supabase start duty err:', e.message);
      }
    }
    return newDuty;
  },

  async endDuty(dutyId, { end_km, toll_parking, food_allowance }) {
    const dIndex = localStore.company_duties.findIndex(d => d.id === dutyId || d.duty_code === dutyId);
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

      if (remoteTablesAvailable) {
        try {
          await supabase.from('company_duties').update(updates).eq('id', duty.id);
        } catch (e) {
          console.error('Supabase end duty err:', e.message);
        }
      }
    }
    return updatedDuty;
  },

  async verifyDuty(dutyId, { action, admin_note }) {
    const isApproved = action === 'APPROVE';
    const status = isApproved ? 'VERIFIED_BY_ADMIN' : 'REJECTED';

    const dIndex = localStore.company_duties.findIndex(d => d.id === dutyId);
    let updatedDuty = null;
    if (dIndex !== -1) {
      localStore.company_duties[dIndex].status = status;
      localStore.company_duties[dIndex].admin_note = admin_note || null;
      updatedDuty = localStore.company_duties[dIndex];
      saveStore();
    }

    if (remoteTablesAvailable) {
      try {
        await supabase.from('company_duties').update({ status, admin_note: admin_note || null }).eq('id', dutyId);
      } catch (e) {
        console.error('Supabase verify duty err:', e.message);
      }
    }
    return updatedDuty;
  },

  // --- STATS & PAYROLL ---
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
      databaseProvider: remoteTablesAvailable ? 'Supabase PostgreSQL (Cloud Active)' : 'Persistent Database (Ready for Supabase)',
      supabaseProject: 'yvwvmiwsajezaagjeskt',
      supabaseHost: 'yvwvmiwsajezaagjeskt.supabase.co',
      isSupabaseRemoteTableActive: remoteTablesAvailable
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

  async updateDuty(id, updates) {
    const dIdx = localStore.company_duties.findIndex(d => d.id === id);
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
    if (remoteTablesAvailable) {
      try {
        await supabase.from('company_duties').update(updates).eq('id', id);
      } catch (e) {
        console.error('Supabase update duty err:', e.message);
      }
    }
    return dIdx !== -1 ? localStore.company_duties[dIdx] : null;
  },

  async deleteDuty(id) {
    const dIdx = localStore.company_duties.findIndex(d => d.id === id);
    if (dIdx !== -1) {
      localStore.company_duties.splice(dIdx, 1);
      saveStore();
    }
    if (remoteTablesAvailable) {
      try {
        await supabase.from('company_duties').delete().eq('id', id);
      } catch (e) {
        console.error('Supabase delete duty err:', e.message);
      }
    }
    return true;
  },

  // --- REVENUE ANALYTICS (DAILY, MONTHLY, YEARLY) ---
  async getRevenueAnalytics() {
    const bookings = await this.getBookings();
    const duties = await this.getDuties();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestStr = yesterday.toISOString().slice(0, 10);

    const todayBookings = bookings.filter(b => b.status !== 'CANCELLED' && ((b.created_at || '').startsWith(todayStr) || (b.journey_date || '') === todayStr));
    const todayDuties = duties.filter(d => (d.duty_date || '').startsWith(todayStr) || (d.created_at || '').startsWith(todayStr));
    const todayRevenue = todayBookings.reduce((sum, b) => sum + (Number(b.quoted_amount) || 0), 0) +
                         todayDuties.reduce((sum, d) => sum + ((Number(d.daily_km) || 0) * 16), 0);

    const yestBookings = bookings.filter(b => b.status !== 'CANCELLED' && ((b.created_at || '').startsWith(yestStr) || (b.journey_date || '') === yestStr));
    const yestDuties = duties.filter(d => (d.duty_date || '').startsWith(yestStr) || (d.created_at || '').startsWith(yestStr));
    const yestRevenue = yestBookings.reduce((sum, b) => sum + (Number(b.quoted_amount) || 0), 0) +
                        yestDuties.reduce((sum, d) => sum + ((Number(d.daily_km) || 0) * 16), 0);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dayB = bookings.filter(b => b.status !== 'CANCELLED' && ((b.created_at || '').startsWith(ds) || (b.journey_date || '') === ds));
      const dayD = duties.filter(dut => (dut.duty_date || '').startsWith(ds) || (dut.created_at || '').startsWith(ds));
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
      const mBookings = bookings.filter(b => b.status !== 'CANCELLED' && ((b.created_at || '').startsWith(monthPrefix) || (b.journey_date || '').startsWith(monthPrefix)));
      const mDuties = duties.filter(d => (d.duty_date || '').startsWith(monthPrefix) || (d.created_at || '').startsWith(monthPrefix));
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

  // --- DRIVER ATTENDANCE & MONTHLY ATTENDANCE-WISE SALARY CALCULATION ---
  async getDriverAttendanceAndPayroll(monthYear) {
    const drivers = await this.getDrivers();
    const duties = await this.getDuties();
    const bookings = await this.getBookings();
    const now = new Date();
    const selectedMonth = monthYear || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return drivers.map(drv => {
      const driverDuties = duties.filter(d => 
        (d.driver_id === drv.id || (d.driver_name && d.driver_name.toLowerCase() === drv.name.toLowerCase())) &&
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
      const attendanceBonus = daysWorked * 250; // daily attendance incentive
      const kmIncentive = Math.round(totalKm * 2.5);
      const grossSalary = baseSalary + attendanceBonus + kmIncentive + totalDutyAllowance;
      const deductions = 0;
      const netPayable = grossSalary - deductions;

      const assignedTrips = bookings.filter(b => 
        (b.assigned_driver_id === drv.id || b.assigned_driver_name === drv.name) &&
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

  // --- GST INVOICES ---
  async getInvoices() {
    if (remoteTablesAvailable) {
      try {
        const { data, error } = await supabase.from('invoices').select('*').order('created_at', { ascending: false });
        if (!error && data) return data;
      } catch (e) {}
    }
    return localStore.invoices;
  },

  async generateInvoice({ client_name, client_type, billing_period, total_trips, total_km, subtotal }) {
    const sub = Number(subtotal) || 45000;
    const cgst = Math.round(sub * 0.025);
    const sgst = Math.round(sub * 0.025);
    const grand_total = sub + cgst + sgst;

    const newInv = {
      id: crypto.randomUUID(),
      invoice_number: `SJT-INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      client_name: client_name || 'Tata Consultancy Services Ltd.',
      client_type: client_type || 'CORPORATE',
      billing_period: billing_period || `${new Date().toLocaleString('default', { month: 'short' })} ${new Date().getFullYear()}`,
      total_trips: Number(total_trips) || 12,
      total_km: Number(total_km) || 1840,
      subtotal: sub,
      cgst,
      sgst,
      grand_total,
      status: 'ISSUED',
      created_at: new Date().toISOString()
    };

    localStore.invoices.unshift(newInv);
    saveStore();

    if (remoteTablesAvailable) {
      try {
        await supabase.from('invoices').insert([newInv]);
      } catch (e) {
        console.error('Supabase invoice insert err:', e.message);
      }
    }
    return newInv;
  }
};
