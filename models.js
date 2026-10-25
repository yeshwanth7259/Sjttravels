const mongoose = require('mongoose');

// 1. Vehicle Schema
const vehicleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ['SEDAN', 'MPV', 'SUV', 'TEMPO_TRAVELLER', 'MINI_BUS'], required: true },
  seats: { type: String, required: true },
  ac: { type: Boolean, default: true },
  regNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  image: { type: String, default: '/innova.jpg' },
  ratePerDay: { type: Number, required: true },
  ratePerKm: { type: Number, required: true },
  minKmPerDay: { type: Number, default: 300 },
  driverAllowancePerDay: { type: Number, default: 400 },
  status: { type: String, enum: ['AVAILABLE', 'ON_TRIP', 'COMPANY_DUTY', 'MAINTENANCE'], default: 'AVAILABLE' },
  features: [{ type: String }]
}, { timestamps: true });

// 2. Driver Schema
const driverSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true },
  driverMode: { type: String, enum: ['REGULAR', 'COMPANY_DUTY', 'BOTH'], default: 'REGULAR' },
  status: { type: String, enum: ['AVAILABLE', 'ON_TRIP', 'OFF_DUTY'], default: 'AVAILABLE' },
  assignedVehicleReg: { type: String, uppercase: true },
  rating: { type: Number, default: 4.8 },
  experienceYears: { type: Number, default: 5 },
  monthlySalarySettings: {
    baseSalary: { type: Number, default: 25000 },
    perKmRate: { type: Number, default: 2.5 },
    perDutyAllowance: { type: Number, default: 350 },
    overtimeHourly: { type: Number, default: 150 }
  }
}, { timestamps: true });

// 3. Booking Schema
const bookingSchema = new mongoose.Schema({
  bookingCode: { type: String, required: true, unique: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  customerEmail: { type: String, trim: true },
  tripType: { type: String, enum: ['LOCAL', 'OUTSTATION', 'AIRPORT', 'ROUND_TRIP', 'CORPORATE', 'WEDDING'], default: 'OUTSTATION' },
  pickup: { type: String, required: true },
  destination: { type: String, required: true },
  journeyDate: { type: String, required: true },
  returnDate: { type: String },
  vehicleId: { type: String },
  vehicleName: { type: String, required: true },
  passengers: { type: Number, default: 1 },
  quotedAmount: { type: Number, required: true },
  advancePaid: { type: Number, default: 0 },
  paymentMethod: { type: String, enum: ['RAZORPAY_ADVANCE', 'RAZORPAY_FULL', 'PAY_ON_PICKUP'], default: 'RAZORPAY_ADVANCE' },
  paymentStatus: { type: String, enum: ['PAID', 'PARTIALLY_PAID', 'PENDING'], default: 'PENDING' },
  razorpayPaymentId: { type: String },
  status: { type: String, enum: ['REQUESTED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'REQUESTED' },
  assignedDriverId: { type: String },
  assignedDriverName: { type: String },
  source: { type: String, enum: ['WEBSITE', 'CUSTOMER_APP', 'ADMIN'], default: 'WEBSITE' },
  notes: { type: String }
}, { timestamps: true });

// 4. Company Duty Schema
const companyDutySchema = new mongoose.Schema({
  dutyDate: { type: String, required: true },
  driverId: { type: String, required: true },
  driverName: { type: String, required: true },
  companyName: { type: String, required: true },
  externalTripId: { type: String, required: true },
  vehicleReg: { type: String, required: true },
  vehicleName: { type: String, default: 'Toyota Innova Crysta' },
  loginTime: { type: String, required: true },
  logoutTime: { type: String },
  startKm: { type: Number, required: true },
  endKm: { type: Number },
  dailyKm: { type: Number, default: 0 },
  startLocation: { type: String, default: 'Bengaluru' },
  currentLocation: { type: String },
  allowances: { type: Number, default: 350 },
  overtimeHours: { type: Number, default: 0 },
  status: { type: String, enum: ['ON_DUTY', 'SUBMITTED', 'APPROVED', 'REJECTED'], default: 'ON_DUTY' },
  adminNote: { type: String }
}, { timestamps: true });

// 5. Corporate Invoice Schema
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  companyGstin: { type: String, default: '29AABCT1234F1Z5' },
  billingPeriod: { type: String, required: true },
  invoiceDate: { type: String, required: true },
  dueDate: { type: String, required: true },
  items: [{
    description: String,
    vehicleName: String,
    daysOrKm: Number,
    rate: Number,
    amount: Number
  }],
  driverAllowance: { type: Number, default: 0 },
  tollAndParking: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  cgst: { type: Number, required: true },
  sgst: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['PAID', 'PENDING', 'OVERDUE'], default: 'PAID' }
}, { timestamps: true });

module.exports = {
  Vehicle: mongoose.model('Vehicle', vehicleSchema),
  Driver: mongoose.model('Driver', driverSchema),
  Booking: mongoose.model('Booking', bookingSchema),
  CompanyDuty: mongoose.model('CompanyDuty', companyDutySchema),
  CorporateInvoice: mongoose.model('CorporateInvoice', invoiceSchema)
};
