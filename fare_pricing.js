const SUPPORTED_TRIP_TYPES = new Set(['LOCAL', 'AIRPORT', 'OUTSTATION', 'ROUND_TRIP']);

function normalizeTripType(value) {
  const clean = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (clean.includes('LOCAL')) return 'LOCAL';
  if (clean.includes('AIRPORT')) return 'AIRPORT';
  if (clean.includes('ROUND')) return 'ROUND_TRIP';
  if (clean.includes('OUTSTATION') || clean.includes('ONE_WAY')) return 'OUTSTATION';
  if (SUPPORTED_TRIP_TYPES.has(clean)) return clean;
  return 'OUTSTATION'; // default safe fallback
}

// Comprehensive Karnataka & South India Highway Distance & City Transit Matrix
const KNOWN_COORDINATES = {
  // Major Karnataka & South India Hubs
  'bangalore': { lat: 12.9716, lng: 77.5946 },
  'bengaluru': { lat: 12.9716, lng: 77.5946 },
  'mysore': { lat: 12.2958, lng: 76.6394 },
  'mysuru': { lat: 12.2958, lng: 76.6394 },
  'coorg': { lat: 12.4244, lng: 75.7382 },
  'madikeri': { lat: 12.4244, lng: 75.7382 },
  'ooty': { lat: 11.4102, lng: 76.6950 },
  'chikmagalur': { lat: 13.3161, lng: 75.7720 },
  'chikkamagaluru': { lat: 13.3161, lng: 75.7720 },
  'tirupati': { lat: 13.6288, lng: 79.4192 },
  'hampi': { lat: 15.3350, lng: 76.4600 },
  'airport': { lat: 13.1986, lng: 77.7066 },
  'kempegowda airport': { lat: 13.1986, lng: 77.7066 },
  'blr airport': { lat: 13.1986, lng: 77.7066 },
  'mangalore': { lat: 12.9141, lng: 74.8560 },
  'mangaluru': { lat: 12.9141, lng: 74.8560 },
  'hassan': { lat: 13.0033, lng: 76.1004 },
  'wayanad': { lat: 11.6854, lng: 76.1320 },
  'pondicherry': { lat: 11.9416, lng: 79.8083 },
  'puducherry': { lat: 11.9416, lng: 79.8083 },
  'chennai': { lat: 13.0827, lng: 80.2707 },
  'goa': { lat: 15.2993, lng: 74.1240 },
  'panaji': { lat: 15.4909, lng: 73.8278 },
  'udupi': { lat: 13.3409, lng: 74.7421 },
  'gokarna': { lat: 14.5479, lng: 74.3188 },
  'murudeshwar': { lat: 14.0940, lng: 74.4899 },
  'hubli': { lat: 15.3647, lng: 75.1240 },
  'hubballi': { lat: 15.3647, lng: 75.1240 },
  'belgaum': { lat: 15.8497, lng: 74.4977 },
  'belagavi': { lat: 15.8497, lng: 74.4977 },
  'davanagere': { lat: 14.4644, lng: 75.9218 },
  'shimoga': { lat: 13.9299, lng: 75.5681 },
  'shivamogga': { lat: 13.9299, lng: 75.5681 },
  'sakleshpur': { lat: 12.9438, lng: 75.7869 },
  'bandipur': { lat: 11.6664, lng: 76.6291 },
  'kabini': { lat: 11.9261, lng: 76.2711 },
  'nagarhole': { lat: 12.0314, lng: 76.1207 },
  'shravanabelagola': { lat: 12.8569, lng: 76.4862 },
  'dharmasthala': { lat: 12.9564, lng: 75.3789 },
  'subramanya': { lat: 12.6644, lng: 75.6186 },
  'kukke': { lat: 12.6644, lng: 75.6186 },
  'coimbatore': { lat: 11.0168, lng: 76.9558 },
  'kodaikanal': { lat: 10.2381, lng: 77.4892 },
  'salem': { lat: 11.6643, lng: 78.1460 },
  'hyderabad': { lat: 17.3850, lng: 78.4867 },

  // Bangalore City Localities
  'yelahanka': { lat: 13.1007, lng: 77.5963 },
  'banashankari': { lat: 12.9255, lng: 77.5468 },
  'whitefield': { lat: 12.9698, lng: 77.7499 },
  'electronic city': { lat: 12.8399, lng: 77.6770 },
  'koramangala': { lat: 12.9352, lng: 77.6245 },
  'indiranagar': { lat: 12.9784, lng: 77.6408 },
  'majestic': { lat: 12.9767, lng: 77.5713 },
  'hebbal': { lat: 13.0358, lng: 77.5970 },
  'hsr layout': { lat: 12.9121, lng: 77.6446 },
  'jayanagar': { lat: 12.9308, lng: 77.5838 },
  'rajajinagar': { lat: 12.9982, lng: 77.5530 },
  'marathahalli': { lat: 12.9591, lng: 77.6974 },
  'btm layout': { lat: 12.9166, lng: 77.6101 },
  'malleshwaram': { lat: 13.0031, lng: 77.5643 },
  'sarjapur': { lat: 12.8601, lng: 77.7865 },
  'bellandur': { lat: 12.9304, lng: 77.6784 },
  'kengeri': { lat: 12.9081, lng: 77.4862 },
  'kr puram': { lat: 13.0075, lng: 77.6959 },
  'yeshwanthpur': { lat: 13.0238, lng: 77.5489 },
  'peenya': { lat: 13.0285, lng: 77.5197 },
  'silk board': { lat: 12.9172, lng: 77.6228 }
};

// Exact Verified Highway Distance Table (km) for popular pairs
const HIGHWAY_DISTANCES = {
  'bangalore_mysore': 145,
  'bengaluru_mysore': 145,
  'bengaluru_mysuru': 145,
  'bangalore_mysuru': 145,
  'bangalore_coorg': 250,
  'bengaluru_coorg': 250,
  'bangalore_madikeri': 250,
  'bangalore_ooty': 275,
  'bengaluru_ooty': 275,
  'bangalore_chikmagalur': 245,
  'bengaluru_chikkamagaluru': 245,
  'bangalore_tirupati': 250,
  'bengaluru_tirupati': 250,
  'bangalore_hampi': 340,
  'bengaluru_hampi': 340,
  'bangalore_kempegowda airport': 38,
  'bangalore_airport': 38,
  'bengaluru_kempegowda airport': 38,
  'bangalore_mangalore': 350,
  'bengaluru_mangalore': 350,
  'bangalore_hassan': 185,
  'bangalore_wayanad': 280,
  'bangalore_pondicherry': 310,
  'bangalore_chennai': 345,
  'bangalore_goa': 560,
  'bangalore_udupi': 400,
  'bangalore_gokarna': 490,
  'bangalore_murudeshwar': 490,
  'bangalore_hubli': 410,
  'bangalore_belgaum': 505,
  'bangalore_davanagere': 260,
  'bangalore_shimoga': 300,
  'bangalore_sakleshpur': 220,
  'bangalore_bandipur': 220,
  'bangalore_dharmasthala': 300,
  'bangalore_kodaikanal': 465,
  'mysore_coorg': 120,
  'mysore_ooty': 125,
  'mysore_bandipur': 75,
  'mysore_wayanad': 130,
  'mysore_kempegowda airport': 180,
  'yelahanka_banashankari': 28,
  'yelahanka_kempegowda airport': 18,
  'yelahanka_airport': 18,
  'banashankari_kempegowda airport': 45,
  'whitefield_kempegowda airport': 42,
  'koramangala_kempegowda airport': 40,
  'electronic city_kempegowda airport': 54,
  'hsr layout_kempegowda airport': 43,
  'indiranagar_kempegowda airport': 38,
  'majestic_kempegowda airport': 33,
  'hebbal_kempegowda airport': 26
};

function extractLocationKey(text) {
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const key of Object.keys(KNOWN_COORDINATES)) {
    if (clean.includes(key)) return key;
  }
  return null;
}

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const airDistance = R * c;
  // Road distance is typically 1.30x to 1.40x air distance in South India
  return Math.round(airDistance * 1.35 * 10) / 10;
}

async function getGoogleRoute(pickup, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null; // Fallback to internal matrix

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration'
      },
      body: JSON.stringify({
        origin: { address: pickup },
        destination: { address: destination },
        travelMode: 'DRIVE',
        regionCode: 'IN',
        languageCode: 'en-IN'
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data.routes?.[0];
    const distanceKm = Number(route?.distanceMeters) / 1000;
    const durationSeconds = Number.parseFloat(String(route?.duration || '').replace(/s$/, ''));
    if (Number.isFinite(distanceKm) && distanceKm > 0) {
      return { 
        distanceKm: Math.round(distanceKm * 10) / 10, 
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : Math.round((distanceKm / 45) * 3600) 
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getDistanceAndDuration(pickup, destination, tripType) {
  // 1. Try Google Routes API first if configured
  try {
    const googleResult = await getGoogleRoute(pickup, destination);
    if (googleResult) return googleResult;
  } catch {}

  // 2. Try High Precision Highway Distance Table
  const key1 = extractLocationKey(pickup);
  const key2 = extractLocationKey(destination);

  if (key1 && key2 && key1 !== key2) {
    const pair1 = `${key1}_${key2}`;
    const pair2 = `${key2}_${key1}`;
    if (HIGHWAY_DISTANCES[pair1]) {
      const km = HIGHWAY_DISTANCES[pair1];
      const avgSpeed = km > 100 ? 50 : 30; // km/h
      return { distanceKm: km, durationSeconds: Math.round((km / avgSpeed) * 3600) };
    }
    if (HIGHWAY_DISTANCES[pair2]) {
      const km = HIGHWAY_DISTANCES[pair2];
      const avgSpeed = km > 100 ? 50 : 30;
      return { distanceKm: km, durationSeconds: Math.round((km / avgSpeed) * 3600) };
    }

    // 3. Coordinate haversine calculation
    const c1 = KNOWN_COORDINATES[key1];
    const c2 = KNOWN_COORDINATES[key2];
    if (c1 && c2) {
      const km = calculateHaversineKm(c1.lat, c1.lng, c2.lat, c2.lng);
      const avgSpeed = km > 100 ? 50 : 30;
      return { distanceKm: Math.max(12, km), durationSeconds: Math.round((km / avgSpeed) * 3600) };
    }
  }

  // 4. City / Local defaults
  if (tripType === 'LOCAL') {
    return { distanceKm: 80, durationSeconds: 8 * 3600 };
  }
  if (tripType === 'AIRPORT') {
    return { distanceKm: 38, durationSeconds: 3600 };
  }

  // 5. Intelligent string heuristic based on Karnataka geography
  const pLower = String(pickup).toLowerCase();
  const dLower = String(destination).toLowerCase();
  let defaultKm = 145; // default intercity Bangalore - Mysore equivalent
  if (pLower.includes('mysor') || dLower.includes('mysor')) defaultKm = 145;
  else if (pLower.includes('coorg') || dLower.includes('coorg') || pLower.includes('madikeri') || dLower.includes('madikeri')) defaultKm = 250;
  else if (pLower.includes('ooty') || dLower.includes('ooty')) defaultKm = 275;
  else if (pLower.includes('chikmagalur') || dLower.includes('chikmagalur')) defaultKm = 245;
  else if (pLower.includes('tirupati') || dLower.includes('tirupati')) defaultKm = 250;
  else if (pLower.includes('hampi') || dLower.includes('hampi')) defaultKm = 340;
  else if (pLower.includes('airport') || dLower.includes('airport')) defaultKm = 38;

  return { distanceKm: defaultKm, durationSeconds: Math.round((defaultKm / 45) * 3600) };
}

// Vehicle Rate Class Config (Realistic Commercial Karnataka Market Rates matching Tejas Travels)
function getVehicleRateConfig(vehicle) {
  const name = `${vehicle.name || ''} ${vehicle.category || ''} ${vehicle.id || ''}`.toLowerCase();
  const seats = Number(vehicle.seats || 4);

  // 1. Bus (33-50 Seater)
  if (/bus/.test(name) && seats >= 26) {
    return {
      vehicleClass: 'BUS',
      localPackage: 12000, // 8hr/80km
      localExtraKm: 42,
      localExtraHr: 800,
      airportPackage: 9500,
      outstationPerKm: Number(vehicle.rate_per_km || 42),
      minKmPerDay: Number(vehicle.min_km_per_day || 400),
      driverBata: Number(vehicle.driver_allowance_per_day || 1000)
    };
  }

  // 2. Mini Bus (25 Seater)
  if (/mini.?bus/.test(name) || (seats >= 18 && seats <= 25)) {
    return {
      vehicleClass: 'MINI_BUS',
      localPackage: 8500, // 8hr/80km
      localExtraKm: 34,
      localExtraHr: 600,
      airportPackage: 6500,
      outstationPerKm: Number(vehicle.rate_per_km || 34),
      minKmPerDay: Number(vehicle.min_km_per_day || 350),
      driverBata: Number(vehicle.driver_allowance_per_day || 800)
    };
  }

  // 3. Tempo Traveller 17 Seater
  if ((/tempo/.test(name) && seats >= 14) || seats === 17) {
    return {
      vehicleClass: 'TEMPO_17',
      localPackage: 6500, // 8hr/80km
      localExtraKm: 28,
      localExtraHr: 500,
      airportPackage: 4500,
      outstationPerKm: Number(vehicle.rate_per_km || 28),
      minKmPerDay: Number(vehicle.min_km_per_day || 350),
      driverBata: Number(vehicle.driver_allowance_per_day || 700)
    };
  }

  // 4. Tempo Traveller 12 Seater
  if (/tempo/.test(name) || (seats >= 8 && seats <= 13)) {
    return {
      vehicleClass: 'TEMPO_12',
      localPackage: 4500, // 8hr/80km
      localExtraKm: 24,
      localExtraHr: 400,
      airportPackage: 3500,
      outstationPerKm: Number(vehicle.rate_per_km || 24),
      minKmPerDay: Number(vehicle.min_km_per_day || 300),
      driverBata: Number(vehicle.driver_allowance_per_day || 600)
    };
  }

  // 5. Innova Hycross Hybrid Luxury SUV
  if (/hycross/.test(name)) {
    return {
      vehicleClass: 'HYCROSS',
      localPackage: 4200, // 8hr/80km
      localExtraKm: 22,
      localExtraHr: 350,
      airportPackage: 3200,
      outstationPerKm: Number(vehicle.rate_per_km || 22),
      minKmPerDay: Number(vehicle.min_km_per_day || 300),
      driverBata: Number(vehicle.driver_allowance_per_day || 600)
    };
  }

  // 6. Innova Crysta Premium SUV
  if (/innova/.test(name) || seats === 7) {
    return {
      vehicleClass: 'INNOVA',
      localPackage: 3500, // 8hr/80km
      localExtraKm: 18,
      localExtraHr: 300,
      airportPackage: 2499,
      outstationPerKm: Number(vehicle.rate_per_km || 18),
      minKmPerDay: Number(vehicle.min_km_per_day || 300),
      driverBata: Number(vehicle.driver_allowance_per_day || 500)
    };
  }

  // 7. Ertiga MPV (6 Seater)
  if (/ertiga|mpv/.test(name) || seats === 6) {
    return {
      vehicleClass: 'MPV',
      localPackage: 2800, // 8hr/80km
      localExtraKm: 16,
      localExtraHr: 250,
      airportPackage: 1999,
      outstationPerKm: Number(vehicle.rate_per_km || 15),
      minKmPerDay: Number(vehicle.min_km_per_day || 250),
      driverBata: Number(vehicle.driver_allowance_per_day || 450)
    };
  }

  // 8. Sedan (Dzire / Etios)
  return {
    vehicleClass: 'SEDAN',
    localPackage: 2200, // 8hr/80km
    localExtraKm: 14,
    localExtraHr: 200,
    airportPackage: 1499,
    outstationPerKm: Number(vehicle.rate_per_km || 13),
    minKmPerDay: Number(vehicle.min_km_per_day || 250),
    driverBata: Number(vehicle.driver_allowance_per_day || 400)
  };
}

function priceRoute(vehicle, tripType, distanceKm, durationSeconds, options = {}) {
  const config = getVehicleRateConfig(vehicle);
  const normalizedType = normalizeTripType(tripType);

  // 1. LOCAL (8 hr / 80 km package)
  if (normalizedType === 'LOCAL') {
    const includedKm = 80;
    const extraKm = Math.max(0, distanceKm - includedKm);
    const extraKmCharge = Math.round(extraKm * config.localExtraKm);
    const fare = config.localPackage + extraKmCharge;

    return {
      trip_type: 'LOCAL',
      distance_km: distanceKm,
      billable_km: Math.max(includedKm, Math.round(distanceKm)),
      estimated_days: 1,
      base_fare: config.localPackage,
      airport_fee: 0,
      driver_allowance: 0,
      extra_km_rate: config.localExtraKm,
      extra_hour_rate: config.localExtraHr,
      package_hours: 8,
      package_km: 80,
      tolls_and_parking: 'Not included; payable at actuals',
      fare: fare,
      rate_note: `8 hr / 80 km package (₹${config.localPackage}) · Extra ₹${config.localExtraKm}/km · Extra ₹${config.localExtraHr}/hr`
    };
  }

  // 2. AIRPORT TRANSFERS
  if (normalizedType === 'AIRPORT') {
    const includedKm = 40;
    const extraKm = Math.max(0, distanceKm - includedKm);
    const extraKmCharge = Math.round(extraKm * config.localExtraKm);
    const fare = config.airportPackage + extraKmCharge;

    return {
      trip_type: 'AIRPORT',
      distance_km: distanceKm,
      billable_km: Math.max(includedKm, Math.round(distanceKm)),
      estimated_days: 1,
      base_fare: config.airportPackage,
      airport_fee: 0,
      driver_allowance: 0,
      extra_km_rate: config.localExtraKm,
      extra_hour_rate: config.localExtraHr,
      tolls_and_parking: 'Airport toll & parking at actuals',
      fare: fare,
      rate_note: `Airport Package: ₹${config.airportPackage.toLocaleString('en-IN')} (incl. ${includedKm} km) · Extra ₹${config.localExtraKm}/km`
    };
  }

  // 3. ROUND TRIP (Outstation)
  if (normalizedType === 'ROUND_TRIP') {
    let days = 1;
    if (options.journeyDate && options.returnDate) {
      const d1 = new Date(`${options.journeyDate}T00:00:00`);
      const d2 = new Date(`${options.returnDate}T00:00:00`);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        days = Math.max(1, diffDays);
      }
    } else {
      // Estimated days based on 2-way distance
      days = Math.max(1, Math.ceil((distanceKm * 2) / config.minKmPerDay));
    }

    const totalRoundTripKm = Math.round(distanceKm * 2 * 10) / 10;
    const minimumBillableKm = config.minKmPerDay * days;
    const billableKm = Math.ceil(Math.max(totalRoundTripKm, minimumBillableKm));
    const baseFare = Math.round(billableKm * config.outstationPerKm);
    const driverAllowance = config.driverBata * days;
    const totalFare = baseFare + driverAllowance;

    return {
      trip_type: 'ROUND_TRIP',
      distance_km: distanceKm,
      billable_km: billableKm,
      estimated_days: days,
      base_fare: baseFare,
      airport_fee: 0,
      driver_allowance: driverAllowance,
      tolls_and_parking: 'State permits, tolls & parking at actuals',
      fare: totalFare,
      rate_note: `₹${config.outstationPerKm}/km · ${days} Days (${totalRoundTripKm} km 2-way, min ${minimumBillableKm} km) + ₹${driverAllowance} driver bata`
    };
  }

  // 4. OUTSTATION ONE-WAY
  const minimumBillableKm = config.minKmPerDay;
  const billableKm = Math.ceil(Math.max(distanceKm, minimumBillableKm));
  const baseFare = Math.round(billableKm * config.outstationPerKm);
  const driverAllowance = config.driverBata;
  const totalFare = baseFare + driverAllowance;

  return {
    trip_type: 'OUTSTATION',
    distance_km: distanceKm,
    billable_km: billableKm,
    estimated_days: 1,
    base_fare: baseFare,
    airport_fee: 0,
    driver_allowance: driverAllowance,
    tolls_and_parking: 'State permits, tolls & parking at actuals',
    fare: totalFare,
    rate_note: `₹${config.outstationPerKm}/km · Min ${minimumBillableKm} km/day + ₹${driverAllowance} driver bata`
  };
}

async function quoteVehicle(vehicle, tripType, pickup, destination, options = {}) {
  const route = await getDistanceAndDuration(pickup, destination, tripType);
  return {
    vehicle_id: vehicle.id,
    vehicle_name: vehicle.name,
    seats: Number(vehicle.seats),
    ...priceRoute(vehicle, tripType, route.distanceKm, route.durationSeconds, options)
  };
}

module.exports = {
  normalizeTripType,
  getGoogleRoute,
  getDistanceAndDuration,
  getVehicleRateConfig,
  priceRoute,
  quoteVehicle
};
