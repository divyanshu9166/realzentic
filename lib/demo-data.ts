/**
 * lib/demo-data.ts
 *
 * Central mock data for DEMO_MODE=true (Vercel showcase).
 * All data is realistic for an Indian Real Estate CRM.
 * Consumed by server actions when process.env.DEMO_MODE === 'true'.
 */

export const DEMO_MODE = process.env.DEMO_MODE === 'true'

// ─── Contacts ────────────────────────────────────────────────────────────────
export const demoContacts = [
  { id: 1, name: 'Rahul Sharma', phone: '9876543210', email: 'rahul.sharma@gmail.com', address: 'Bandra West, Mumbai', source: 'WhatsApp', state: 'Maharashtra', notes: 'Interested in 3BHK', createdAt: '2026-06-01' },
  { id: 2, name: 'Priya Mehta', phone: '9823456789', email: 'priya.mehta@outlook.com', address: 'Koramangala, Bengaluru', source: 'IndiaMart', state: 'Karnataka', notes: 'Looking for commercial plot', createdAt: '2026-06-03' },
  { id: 3, name: 'Amit Patel', phone: '9712345678', email: 'amit.patel@yahoo.com', address: 'Satellite, Ahmedabad', source: 'Website', state: 'Gujarat', notes: 'Budget: 80L-1.2Cr', createdAt: '2026-06-05' },
  { id: 4, name: 'Sunita Verma', phone: '9654321098', email: 'sunita.verma@gmail.com', address: 'Sector 62, Noida', source: 'Facebook', state: 'Uttar Pradesh', notes: 'Wants site visit ASAP', createdAt: '2026-06-08' },
  { id: 5, name: 'Deepak Joshi', phone: '9543210987', email: 'deepak.joshi@gmail.com', address: 'Jubilee Hills, Hyderabad', source: 'Instagram', state: 'Telangana', notes: '2BHK + study room preferred', createdAt: '2026-06-10' },
  { id: 6, name: 'Kavita Nair', phone: '9432109876', email: 'kavita.nair@gmail.com', address: 'Marine Drive, Kochi', source: 'WhatsApp', state: 'Kerala', notes: 'NRI buyer from Dubai', createdAt: '2026-06-12' },
  { id: 7, name: 'Vikram Singh', phone: '9321098765', email: 'vikram.singh@gmail.com', address: 'Civil Lines, Jaipur', source: 'Google Ads', state: 'Rajasthan', notes: 'Investment property', createdAt: '2026-06-15' },
  { id: 8, name: 'Ananya Roy', phone: '9210987654', email: 'ananya.roy@gmail.com', address: 'Salt Lake, Kolkata', source: 'Website', state: 'West Bengal', notes: 'Newly married couple', createdAt: '2026-06-18' },
]

// ─── Leads ───────────────────────────────────────────────────────────────────
export const demoLeads = [
  { id: 1, contactId: 1, name: 'Rahul Sharma', phone: '9876543210', email: 'rahul.sharma@gmail.com', source: 'WhatsApp', interest: '3BHK Apartment - Seabreeze Residency', budget: '1.2Cr - 1.5Cr', status: 'Site Visit', date: '2026-06-20', notes: 'Ready for site visit this weekend', assignedTo: 'Rohan Desai', followUps: [] },
  { id: 2, contactId: 2, name: 'Priya Mehta', phone: '9823456789', email: 'priya.mehta@outlook.com', source: 'IndiaMart', interest: 'Commercial Shop - Skyline Business Park', budget: '80L - 1Cr', status: 'Proposal', date: '2026-06-18', notes: 'Wants flexi payment plan', assignedTo: 'Neha Gupta', followUps: [] },
  { id: 3, contactId: 3, name: 'Amit Patel', phone: '9712345678', email: 'amit.patel@yahoo.com', source: 'Website', interest: '2BHK Apartment - Green Valley Heights', budget: '70L - 90L', status: 'Contacted', date: '2026-06-17', notes: 'Prefers east-facing flat', assignedTo: 'Rohan Desai', followUps: [] },
  { id: 4, contactId: 4, name: 'Sunita Verma', phone: '9654321098', email: 'sunita.verma@gmail.com', source: 'Facebook', interest: 'Villa Plot - Sunrise Township', budget: '2Cr - 3Cr', status: 'New', date: '2026-06-16', notes: 'High priority lead', assignedTo: null, followUps: [] },
  { id: 5, contactId: 5, name: 'Deepak Joshi', phone: '9543210987', email: 'deepak.joshi@gmail.com', source: 'Instagram', interest: '3BHK + Study - Prestige Towers', budget: '1.8Cr - 2.2Cr', status: 'Won', date: '2026-06-10', notes: 'Deal closed! Token paid', assignedTo: 'Neha Gupta', followUps: [] },
  { id: 6, contactId: 6, name: 'Kavita Nair', phone: '9432109876', email: 'kavita.nair@gmail.com', source: 'WhatsApp', interest: 'Penthouse - Marina Heights', budget: '4Cr - 5Cr', status: 'Site Visit', date: '2026-06-14', notes: 'NRI buyer, video tour done', assignedTo: 'Rohan Desai', followUps: [] },
  { id: 7, contactId: 7, name: 'Vikram Singh', phone: '9321098765', email: 'vikram.singh@gmail.com', source: 'Google Ads', interest: '2BHK Investment - Emerald Gardens', budget: '60L - 75L', status: 'Lost', date: '2026-06-08', notes: 'Chose competitor project', assignedTo: 'Neha Gupta', followUps: [] },
  { id: 8, contactId: 8, name: 'Ananya Roy', phone: '9210987654', email: 'ananya.roy@gmail.com', source: 'Website', interest: '1BHK Starter Home - Nest Apartments', budget: '40L - 55L', status: 'Contacted', date: '2026-06-22', notes: 'First-time buyer, needs guidance', assignedTo: null, followUps: [] },
]

// ─── Staff ───────────────────────────────────────────────────────────────────
export const demoStaff = [
  {
    id: 1, name: 'Rohan Desai', role: 'Sales Manager', phone: '9811122233', email: 'rohan.desai@autozentic.com',
    status: 'Active', joinDate: '2024-01-10', avatar: null,
    stats: { leadsHandled: 48, conversions: 12, revenue: 4800000 },
    target: { monthly: 3, achieved: 2 }, commission: { rate: 1.5, earned: 72000 },
    loginUsername: 'rohan.desai', hasLogin: true, loginActive: true,
    attendance: [
      { date: '2026-06-29', clockIn: '09:02', clockOut: '18:45', hours: 9.7, status: 'Present', isLate: false, method: 'gps', clockInDist: 12 },
      { date: '2026-06-28', clockIn: '09:15', clockOut: '18:30', hours: 9.3, status: 'Present', isLate: true, method: 'gps', clockInDist: 18 },
      { date: '2026-06-27', clockIn: null, clockOut: null, hours: null, status: 'Leave', isLate: false, method: 'manual', clockInDist: null },
    ],
    activities: [
      { type: 'Lead', text: 'Followed up with Rahul Sharma', time: '10:30', date: '2026-06-29' },
      { type: 'Site Visit', text: 'Site visit completed at Seabreeze Residency', time: '15:00', date: '2026-06-28' },
    ],
    fieldVisits: [
      { id: 'FV-001', customer: 'Rahul Sharma', address: 'Seabreeze Residency, Phase 2', date: '2026-06-28', time: '15:00', status: 'Completed', type: 'Site Visit', notes: 'Client liked Unit 12B' },
    ],
    leadsCount: 24, walkinsCount: 8,
    basicSalary: 35000, designation: 'Sales Manager', pfEnrolled: true, esiEnrolled: false,
  },
  {
    id: 2, name: 'Neha Gupta', role: 'Sales Executive', phone: '9822233344', email: 'neha.gupta@autozentic.com',
    status: 'Active', joinDate: '2024-03-20', avatar: null,
    stats: { leadsHandled: 36, conversions: 8, revenue: 3200000 },
    target: { monthly: 3, achieved: 1 }, commission: { rate: 1.2, earned: 38400 },
    loginUsername: 'neha.gupta', hasLogin: true, loginActive: true,
    attendance: [
      { date: '2026-06-29', clockIn: '09:00', clockOut: '18:00', hours: 9.0, status: 'Present', isLate: false, method: 'gps', clockInDist: 8 },
      { date: '2026-06-28', clockIn: '09:05', clockOut: '18:30', hours: 9.4, status: 'Present', isLate: false, method: 'gps', clockInDist: 10 },
    ],
    activities: [
      { type: 'Call', text: 'Called Priya Mehta regarding proposal', time: '11:00', date: '2026-06-29' },
      { type: 'Lead', text: 'Closed deal with Deepak Joshi', time: '16:30', date: '2026-06-27' },
    ],
    fieldVisits: [],
    leadsCount: 18, walkinsCount: 5,
    basicSalary: 28000, designation: 'Sales Executive', pfEnrolled: true, esiEnrolled: true,
  },
  {
    id: 3, name: 'Arjun Khanna', role: 'CRM Executive', phone: '9833344455', email: 'arjun.khanna@autozentic.com',
    status: 'Active', joinDate: '2025-01-15', avatar: null,
    stats: { leadsHandled: 20, conversions: 4, revenue: 1600000 },
    target: { monthly: 2, achieved: 1 }, commission: { rate: 1.0, earned: 16000 },
    loginUsername: 'arjun.khanna', hasLogin: true, loginActive: true,
    attendance: [
      { date: '2026-06-29', clockIn: '09:10', clockOut: '18:00', hours: 8.8, status: 'Present', isLate: true, method: 'manual', clockInDist: null },
    ],
    activities: [],
    fieldVisits: [],
    leadsCount: 10, walkinsCount: 3,
    basicSalary: 22000, designation: 'CRM Executive', pfEnrolled: false, esiEnrolled: false,
  },
]

// ─── Walkins ─────────────────────────────────────────────────────────────────
export const demoWalkins = [
  { id: 1, contactId: 1, name: 'Rahul Sharma', phone: '9876543210', requirement: '3BHK ready-to-move', assignedTo: 'Rohan Desai', date: '2026-06-29', time: '11:30', status: 'Interested', budget: '1.2Cr', notes: 'Very serious buyer', source: 'Walk-in', visitDuration: '45 min' },
  { id: 2, contactId: 3, name: 'Amit Patel', phone: '9712345678', requirement: '2BHK with parking', assignedTo: 'Neha Gupta', date: '2026-06-28', time: '14:00', status: 'Follow Up', budget: '80L', notes: 'Needs home loan guidance', source: 'Walk-in', visitDuration: '30 min' },
  { id: 3, contactId: 8, name: 'Ananya Roy', phone: '9210987654', requirement: '1BHK starter flat', assignedTo: 'Neha Gupta', date: '2026-06-27', time: '16:30', status: 'Browsing', budget: '50L', notes: 'First time visitor', source: 'Referral', visitDuration: '20 min' },
  { id: 4, contactId: 4, name: 'Sunita Verma', phone: '9654321098', requirement: 'Villa plot 2000+ sqft', assignedTo: 'Rohan Desai', date: '2026-06-26', time: '10:00', status: 'Converted', budget: '2.5Cr', notes: 'Converted to lead', source: 'Walk-in', visitDuration: '60 min' },
]

// ─── Appointments ────────────────────────────────────────────────────────────
export const demoAppointments = [
  { id: 1, contactId: 1, customer: 'Rahul Sharma', phone: '9876543210', date: '2026-06-30', time: '10:30 AM', purpose: 'Site Visit - Seabreeze Residency', status: 'Scheduled', notes: 'Bring brochure and cost sheet' },
  { id: 2, contactId: 2, customer: 'Priya Mehta', phone: '9823456789', date: '2026-06-30', time: '03:00 PM', purpose: 'Proposal Discussion - Commercial Shop', status: 'Scheduled', notes: 'Discuss payment plan options' },
  { id: 3, contactId: 6, customer: 'Kavita Nair', phone: '9432109876', date: '2026-07-01', time: '11:00 AM', purpose: 'Video Call - Penthouse Tour', status: 'Scheduled', notes: 'NRI buyer, use Zoom' },
  { id: 4, contactId: 7, customer: 'Vikram Singh', phone: '9321098765', date: '2026-06-28', time: '02:00 PM', purpose: 'Document Collection', status: 'Completed', notes: 'KYC docs collected' },
]

// ─── Properties ──────────────────────────────────────────────────────────────
export const demoProperties = [
  {
    id: 1, name: 'Seabreeze Residency', type: 'Apartment', status: 'Active', location: 'Bandra West, Mumbai',
    totalUnits: 120, availableUnits: 34, soldUnits: 82, bookedUnits: 4,
    priceMin: 9500000, priceMax: 18000000, area: '850-1800 sqft',
    description: 'Luxury sea-facing apartments with world-class amenities',
    amenities: ['Swimming Pool', 'Gym', 'Clubhouse', 'Parking', '24x7 Security'],
    images: [], thumbnail: null, reraNumber: 'RERA/MH/2024/001',
    completionDate: '2027-12-31', launchDate: '2024-01-15',
  },
  {
    id: 2, name: 'Green Valley Heights', type: 'Apartment', status: 'Active', location: 'Whitefield, Bengaluru',
    totalUnits: 80, availableUnits: 22, soldUnits: 51, bookedUnits: 7,
    priceMin: 6500000, priceMax: 12000000, area: '1000-2200 sqft',
    description: 'Eco-friendly gated community surrounded by greenery',
    amenities: ['Jogging Track', 'Kids Play Area', 'Solar Power', 'EV Charging'],
    images: [], thumbnail: null, reraNumber: 'RERA/KA/2024/045',
    completionDate: '2026-06-30', launchDate: '2023-09-01',
  },
  {
    id: 3, name: 'Skyline Business Park', type: 'Commercial', status: 'Active', location: 'GIFT City, Gandhinagar',
    totalUnits: 45, availableUnits: 12, soldUnits: 28, bookedUnits: 5,
    priceMin: 7500000, priceMax: 20000000, area: '500-3000 sqft',
    description: 'Grade-A commercial spaces in India\'s first smart city',
    amenities: ['High-Speed Internet', 'Power Backup', 'Food Court', 'Conference Rooms'],
    images: [], thumbnail: null, reraNumber: 'RERA/GJ/2024/088',
    completionDate: '2026-03-31', launchDate: '2023-06-01',
  },
  {
    id: 4, name: 'Sunrise Township', type: 'Plotted', status: 'Active', location: 'Sarjapur Road, Bengaluru',
    totalUnits: 200, availableUnits: 65, soldUnits: 125, bookedUnits: 10,
    priceMin: 4000000, priceMax: 15000000, area: '1200-5000 sqft',
    description: 'RERA-approved plotted development with clear titles',
    amenities: ['24x7 Water', 'Electricity', 'Roads', 'Compound Wall'],
    images: [], thumbnail: null, reraNumber: 'RERA/KA/2023/112',
    completionDate: '2025-12-31', launchDate: '2023-01-01',
  },
]

// ─── Deals ───────────────────────────────────────────────────────────────────
export const demoDeals = [
  { id: 1, contactId: 5, buyerName: 'Deepak Joshi', phone: '9543210987', propertyName: 'Prestige Towers', unitNumber: 'B-1204', dealValue: 19500000, tokenAmount: 500000, status: 'Token Paid', stage: 'BOOKING', assignedTo: 'Neha Gupta', createdAt: '2026-06-10', closingDate: '2026-07-15', notes: 'Home loan approved from HDFC' },
  { id: 2, contactId: 2, buyerName: 'Priya Mehta', phone: '9823456789', propertyName: 'Skyline Business Park', unitNumber: 'G-201', dealValue: 9200000, tokenAmount: 250000, status: 'Agreement Signed', stage: 'AGREEMENT', assignedTo: 'Neha Gupta', createdAt: '2026-06-05', closingDate: '2026-08-01', notes: 'Registry pending' },
  { id: 3, contactId: 1, buyerName: 'Rahul Sharma', phone: '9876543210', propertyName: 'Seabreeze Residency', unitNumber: 'A-802', dealValue: 15000000, tokenAmount: 0, status: 'Proposal Sent', stage: 'PROPOSAL', assignedTo: 'Rohan Desai', createdAt: '2026-06-18', closingDate: null, notes: 'Comparing with one other project' },
  { id: 4, contactId: 6, buyerName: 'Kavita Nair', phone: '9432109876', propertyName: 'Marina Heights', unitNumber: 'PH-01', dealValue: 45000000, tokenAmount: 1000000, status: 'Negotiation', stage: 'NEGOTIATION', assignedTo: 'Rohan Desai', createdAt: '2026-06-12', closingDate: null, notes: 'NRI buyer, discussing forex payment' },
]

// ─── Payments ────────────────────────────────────────────────────────────────
export const demoPayments = [
  { id: 1, displayId: 'PAY-0001', customerName: 'Deepak Joshi', amount: 500000, method: 'Bank Transfer', type: 'Token', status: 'Received', date: '2026-06-10', notes: 'Token for Prestige Towers B-1204' },
  { id: 2, displayId: 'PAY-0002', customerName: 'Priya Mehta', amount: 250000, method: 'Cheque', type: 'Token', status: 'Received', date: '2026-06-05', notes: 'Token for Skyline Business Park G-201' },
  { id: 3, displayId: 'PAY-0003', customerName: 'Kavita Nair', amount: 1000000, method: 'NEFT', type: 'Token', status: 'Received', date: '2026-06-12', notes: 'Token for Marina Heights PH-01' },
  { id: 4, displayId: 'PAY-0004', customerName: 'Deepak Joshi', amount: 1950000, method: 'Bank Transfer', type: 'Installment', status: 'Received', date: '2026-06-25', notes: 'First installment 10%' },
  { id: 5, displayId: 'PAY-0005', customerName: 'Rahul Sharma', amount: 100000, method: 'UPI', type: 'Booking Amount', status: 'Pending', date: '2026-06-29', notes: 'Awaiting confirmation' },
]

// ─── Call Logs ───────────────────────────────────────────────────────────────
export const demoCallLogs = [
  { id: 1, customerName: 'Rahul Sharma', phone: '9876543210', direction: 'OUTBOUND', status: 'COMPLETED', duration: '5:32', durationSec: 332, agent: 'Rohan Desai', date: '2026-06-29', time: '10:00', purpose: 'Follow-up on site visit', outcome: 'Agreed to visit this weekend', notes: 'Very interested', callType: 'manual', aiHandled: false },
  { id: 2, customerName: 'Priya Mehta', phone: '9823456789', direction: 'INBOUND', status: 'COMPLETED', duration: '8:14', durationSec: 494, agent: 'Neha Gupta', date: '2026-06-29', time: '11:30', purpose: 'Payment plan inquiry', outcome: 'Sent payment schedule on WhatsApp', notes: 'Ready to sign agreement', callType: 'manual', aiHandled: false },
  { id: 3, customerName: 'Amit Patel', phone: '9712345678', direction: 'OUTBOUND', status: 'NO_ANSWER', duration: null, durationSec: 0, agent: 'AI Agent', date: '2026-06-28', time: '14:00', purpose: 'Auto follow-up', outcome: 'No answer — retry tomorrow', notes: null, callType: 'ai_outbound', aiHandled: true },
  { id: 4, customerName: 'Sunita Verma', phone: '9654321098', direction: 'INBOUND', status: 'COMPLETED', duration: '12:45', durationSec: 765, agent: 'AI Agent', date: '2026-06-28', time: '16:00', purpose: 'New inquiry', outcome: 'Transferred to Rohan Desai', notes: 'Interested in villa plots', callType: 'ai_inbound', aiHandled: true },
  { id: 5, customerName: 'Kavita Nair', phone: '9432109876', direction: 'OUTBOUND', status: 'COMPLETED', duration: '18:22', durationSec: 1102, agent: 'Rohan Desai', date: '2026-06-27', time: '15:00', purpose: 'Penthouse tour discussion', outcome: 'Video call scheduled for July 1', notes: 'NRI - very serious buyer', callType: 'manual', aiHandled: false },
]

// ─── Follow-up Entries ───────────────────────────────────────────────────────
export const demoFollowUps = [
  { id: 1, contactId: 3, contactName: 'Amit Patel', phone: '9712345678', interest: '2BHK - Green Valley Heights', budget: '80L', followUpDate: '2026-06-30', reason: 'Needs time to compare options', status: 'PENDING', priority: 'High', source: 'Website', notes: 'Call before 12 PM', assignedTo: 'Rohan Desai', lastContactedAt: '2026-06-20' },
  { id: 2, contactId: 8, contactName: 'Ananya Roy', phone: '9210987654', interest: '1BHK - Nest Apartments', budget: '50L', followUpDate: '2026-07-05', reason: 'Waiting for home loan pre-approval', status: 'PENDING', priority: 'Medium', source: 'Website', notes: 'First-time buyer, be patient', assignedTo: 'Neha Gupta', lastContactedAt: '2026-06-22' },
  { id: 3, contactId: 7, contactName: 'Vikram Singh', phone: '9321098765', interest: '2BHK - Emerald Gardens', budget: '70L', followUpDate: '2026-07-10', reason: 'Reconsidering after market research', status: 'CONTACTED', priority: 'Low', source: 'Google Ads', notes: 'Was lost, showing interest again', assignedTo: 'Neha Gupta', lastContactedAt: '2026-06-28' },
]

// ─── Field Visits ────────────────────────────────────────────────────────────
export const demoFieldVisits = [
  { id: 1, displayId: 'FV-001', staffName: 'Rohan Desai', staffRole: 'Sales Manager', customer: 'Rahul Sharma', address: 'Seabreeze Residency, Phase 2', status: 'Completed', scheduledDate: '2026-06-28', scheduledTime: '03:00 PM', completedAt: '2026-06-28', type: 'Site Visit', hasNotes: true },
  { id: 2, displayId: 'FV-002', staffName: 'Neha Gupta', staffRole: 'Sales Executive', customer: 'Priya Mehta', address: 'Skyline Business Park, GIFT City', status: 'Scheduled', scheduledDate: '2026-06-30', scheduledTime: '11:00 AM', completedAt: null, type: 'Property Inspection', hasNotes: false },
  { id: 3, displayId: 'FV-003', staffName: 'Rohan Desai', staffRole: 'Sales Manager', customer: 'Kavita Nair', address: 'Marina Heights, Tower A', status: 'Scheduled', scheduledDate: '2026-07-01', scheduledTime: '10:00 AM', completedAt: null, type: 'NRI Video Tour', hasNotes: false },
]

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export const demoDashboardStats = {
  leadsToday: 3,
  appointmentsToday: 2,
  recentLeads: demoLeads.slice(0, 6).map(l => ({ id: l.id, name: l.name, interest: l.interest, status: l.status, source: l.source })),
  upcomingAppointments: demoAppointments.filter(a => a.status === 'Scheduled').map(a => ({ id: a.id, customer: a.customer, date: a.date, time: a.time, purpose: a.purpose })),
  fieldVisits: demoFieldVisits,
  kpis: { leadsMtd: 28, leadsChangePct: 17, conversionRate: 21.4, conversionChangePct: 3.2, walkinsMtd: 14, walkinsChangePct: 8, callsMtd: 62, callsChangePct: 22 },
  pipeline: [
    { key: 'NEW', label: 'New', count: 8 },
    { key: 'CONTACTED', label: 'Contacted', count: 11 },
    { key: 'SHOWROOM_VISIT', label: 'Site Visit', count: 6 },
    { key: 'QUOTATION', label: 'Proposal', count: 5 },
    { key: 'WON', label: 'Converted', count: 6 },
    { key: 'LOST', label: 'Lost', count: 4 },
  ],
  channelPerformance: [
    { source: 'WhatsApp', leads: 12, won: 3, winRate: 25 },
    { source: 'IndiaMart', leads: 8, won: 2, winRate: 25 },
    { source: 'Website', leads: 7, won: 1, winRate: 14 },
    { source: 'Instagram', leads: 5, won: 2, winRate: 40 },
    { source: 'Google Ads', leads: 4, won: 1, winRate: 25 },
    { source: 'Facebook', leads: 3, won: 0, winRate: 0 },
  ],
  actionCenter: {
    pendingFollowUps: 3,
    dueAppointmentsToday: 2,
    followUpItems: demoFollowUps.map(f => ({ id: f.id, customer: f.contactName, phone: f.phone, interest: f.interest, dueDate: f.followUpDate, assignedTo: f.assignedTo })),
    recentPayments: demoPayments.slice(0, 4).map(p => ({ id: p.id, displayId: p.displayId, amount: p.amount, method: p.method, type: p.type, customerName: p.customerName, date: p.date, status: p.status })),
  },
}

// ─── Expense Summary ─────────────────────────────────────────────────────────
export const demoExpenseSummary = {
  grandTotal: 187500,
  dailyAverage: 6250,
  totalBudget: 200000,
  categoryBreakdown: [
    { categoryId: 1, categoryName: 'Marketing', categoryColor: '#F97316', categoryIcon: 'Megaphone', count: 5, budget: 80000, total: 75000 },
    { categoryId: 2, categoryName: 'Travel', categoryColor: '#6366F1', categoryIcon: 'Truck', count: 12, budget: 50000, total: 42000 },
    { categoryId: 3, categoryName: 'Office Supplies', categoryColor: '#64748B', categoryIcon: 'FileText', count: 8, budget: 20000, total: 18500 },
    { categoryId: 4, categoryName: 'Client Entertainment', categoryColor: '#A855F7', categoryIcon: 'Coffee', count: 4, budget: 30000, total: 32000 },
    { categoryId: 5, categoryName: 'Technology', categoryColor: '#0EA5E9', categoryIcon: 'Wrench', count: 2, budget: 20000, total: 20000 },
  ],
  topVendors: [
    { vendor: 'Google Ads', count: 2, total: 50000 },
    { vendor: 'Facebook Ads', count: 3, total: 25000 },
    { vendor: 'Uber', count: 10, total: 12000 },
    { vendor: 'Taj Hotel', count: 2, total: 25000 },
  ],
  dailyTotals: [
    { date: '2026-06-25', total: 12000 },
    { date: '2026-06-26', total: 45000 },
    { date: '2026-06-27', total: 8000 },
    { date: '2026-06-28', total: 32000 },
    { date: '2026-06-29', total: 15000 },
  ],
  paymentModeBreakdown: [
    { mode: 'Credit Card', total: 100000, count: 12 },
    { mode: 'Bank Transfer', total: 50000, count: 5 },
    { mode: 'Cash', total: 37500, count: 14 },
  ],
}

// ─── Reviews ─────────────────────────────────────────────────────────────────
export const demoReviews = [
  { id: 1, customerName: 'Deepak Joshi', rating: 5, text: 'Excellent service! Rohan was very professional and helped us find the perfect home. Highly recommended!', date: '2026-06-15', product: 'Prestige Towers', platform: 'Google', replied: true },
  { id: 2, customerName: 'Priya Mehta', rating: 4, text: 'Good experience overall. The team was responsive and knowledgeable about commercial properties.', date: '2026-06-20', product: 'Skyline Business Park', platform: 'Google', replied: false },
  { id: 3, customerName: 'Kavita Nair', rating: 5, text: 'Amazing service for NRI buyers! Video tour was very helpful. Trusting them with our biggest investment.', date: '2026-06-22', product: 'Marina Heights', platform: 'Google', replied: true },
]

// ─── Referrals ───────────────────────────────────────────────────────────────
export const demoReferrals = [
  { id: 1, referrerName: 'Deepak Joshi', referredName: 'Vikram Singh', referredPhone: '9321098765', status: 'CONVERTED', commission: 25000, date: '2026-06-12', notes: 'Referred colleague' },
  { id: 2, referrerName: 'Priya Mehta', referredName: 'Suresh Kumar', referredPhone: '9112233445', status: 'PENDING', commission: 0, date: '2026-06-18', notes: 'Friend from office' },
]

// ─── Tasks ───────────────────────────────────────────────────────────────────
export const demoTasks = [
  { id: 1, title: 'Send cost sheet to Rahul Sharma', description: 'Include payment plan for Seabreeze Residency Unit A-802', status: 'PENDING', priority: 'HIGH', dueDate: '2026-06-30', assignedTo: 'Rohan Desai', contactName: 'Rahul Sharma' },
  { id: 2, title: 'Follow up with Priya Mehta on agreement', description: 'Agreement for Skyline Business Park G-201 pending signature', status: 'IN_PROGRESS', priority: 'HIGH', dueDate: '2026-06-30', assignedTo: 'Neha Gupta', contactName: 'Priya Mehta' },
  { id: 3, title: 'Prepare NRI documentation for Kavita Nair', description: 'Compile FEMA compliance docs and forex payment guide', status: 'PENDING', priority: 'MEDIUM', dueDate: '2026-07-01', assignedTo: 'Rohan Desai', contactName: 'Kavita Nair' },
  { id: 4, title: 'Schedule home loan assistance for Ananya Roy', description: 'Connect with HDFC relationship manager', status: 'PENDING', priority: 'LOW', dueDate: '2026-07-05', assignedTo: 'Neha Gupta', contactName: 'Ananya Roy' },
]
