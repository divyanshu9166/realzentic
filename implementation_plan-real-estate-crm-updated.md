# Realzentic — Best-in-Class Real Estate CRM Implementation Plan

## Background & Research

### Competitors Analyzed (Round 1 + Round 2)
| CRM | Price Range | Target | Key Differentiator |
|---|---|---|---|
| **Sell.Do** | ₹25K–₹2L/mo | Indian Developers | Full lifecycle: lead → possession. Channel partner portal, unit-level inventory, demand letters |
| **kvCORE (Lofty)** | $499–$1500/mo | US Brokerages | IDX website + CRM + marketing all-in-one |
| **Follow Up Boss** | $69–$1000/mo | Teams & Agents | Speed-to-lead, 250+ integrations, smart lists |
| **LeadSquared** | ₹15K–₹1.5L/mo | Enterprise India | High-volume multi-city ops, portal integrations (99acres, MagicBricks) |
| **Buildesk** | ₹20K–₹80K/mo | Builders | Post-sales module: demand letters, cost sheets, possession management, buyer app |
| **Absolute CX** | Custom (₹1L+/mo) | Premium Developers | AI buyer agents, e-commerce-style lifecycle tracking |
| **Realatic** | ₹10K–₹50K/mo | Mid-size Builders | AI lead qualification, visual inventory, gamified leaderboards |
| **Layouts360** | ₹8K–₹30K/mo | Plot/Apartment Sales | Specialized visual floor-plan maps, anti-double-booking |

### What We Already Have ✅
- Lead management with follow-ups
- Appointments & walk-ins
- Staff management, attendance (GPS), payroll
- Field visits with photos
- Daily payments & expenses
- Financial reports (P&L, Balance Sheet, Cash Flow, Trial Balance)
- WhatsApp Marketing (full API integration with pipelines, deals, broadcasts)
- Email marketing with A/B testing
- Instagram & Facebook inbox
- AI calling agent (LiveKit)
- IndiaMart lead sync
- Automation engine (workflow builder)
- Reviews management
- Notification system (in-app)

### What Premium Competitors Have That We Don't ❌

#### Core Gaps (Every competitor has these)
1. **Property / Project / Inventory Management** — Unit-level tracking (project → tower → floor → unit)
2. **Deal Pipeline with Kanban Stages** — Visual drag-and-drop deal progression
3. **Channel Partner / Broker Portal** — Dedicated login, commission tracking, lead attribution
4. **Document Management & KYC** — Agreement generation, KYC upload, e-signatures
5. **Cost Sheet & Payment Plan Builder** — Auto-generate cost sheets with floor-rise, view premiums
6. **Demand Letter Automation** — Milestone-triggered payment demand letters via WhatsApp/Email

#### Advanced Gaps (Top 3 competitors have these)
7. **AI Property Matching** — Preference-based auto-recommendations
8. **EMI / Loan Calculator** — Built-in affordability calculator with bank rate comparison
9. **Enhanced Site Visit Module** — OTP verification, geo-check-in, structured feedback
10. **Buyer / Customer Portal** — Self-service: payment tracking, construction updates, documents
11. **RERA Compliance Dashboard** — Registration tracking, expiry alerts, compliance checklists
12. **Duplicate Lead Detection** — Fuzzy matching on phone/email/name to prevent double-assignment

#### Experience & Intelligence Gaps
13. **Possession & Handover Management** — Digital checklists, snag lists, sign-off
14. **Property Portal Integration** — Auto-capture from 99acres, MagicBricks, Housing.com
15. **Team Leaderboard & Gamification** — Real-time agent performance rankings, badges, competitions
16. **Unified Contact Timeline** — Single chronological feed merging all touchpoints per contact

### Our Unique Edge (Not in Any Competitor) 🚀
17. **AI Deal Predictor** — ML-based deal close probability using engagement signals
18. **Smart Inventory Heatmap** — Visual floor-plan with color-coded unit availability
19. **WhatsApp-Native Buyer Journey** — Full property selection → booking → payment via WhatsApp flows
20. **Voice AI Site Visit Scheduler** — AI calling agent autonomously books site visits
21. **Referral Program Engine** — Automated referral tracking with reward/commission payouts
22. **AI-Generated Property Descriptions** — One-click brochure/listing copy generation per unit

---

## Proposed Changes

### Phase 1 — Core Real Estate Foundation (Priority: CRITICAL)

> [!IMPORTANT]
> These 4 modules form the backbone of every premium real estate CRM. Without them, we cannot compete with even basic competitors like Buildesk.

---

#### Module 1: Property & Inventory Management

##### [NEW] `prisma/schema.prisma` — New Models
```
Project          → name, location, city, state, RERA number, RERA expiry, type (Residential/Commercial/Mixed),
                   status (Upcoming/Under Construction/Ready to Move), builder name, total units,
                   description, amenities JSON, brochure URL, photos[], lat/lng, possession date

Tower            → project FK, name (A/B/C/Wing-1), total floors, status

Floor            → tower FK, floor number, floor plan image URL

Unit             → tower FK, floor number, unit number, type (1BHK/2BHK/3BHK/4BHK/Shop/Office/Plot),
                   carpet area sqft, super built-up area sqft, facing (N/S/E/W/NE/NW/SE/SW),
                   status (Available/Blocked/Booked/Sold/Mortgaged),
                   base price per sqft, floor rise premium, view premium, total price,
                   parking type (Open/Covered/None), parking count,
                   blocked by (staff/CP), blocked until (timed hold expiry),
                   booked by (contact FK), booking date

UnitPriceHistory → unit FK, old price, new price, changed by, effective date, reason

Amenity          → project FK, name, icon, category (Club/Sports/Security/Green/Parking)
```

##### [NEW] `app/(dashboard)/properties/page.js`
- Project listing with cards: photo, name, location, RERA badge, unit count, % sold progress bar
- Click into project → **Tower selector tabs** → **Visual floor grid** (units color-coded by status)
- Unit detail drawer: area, price breakdown, status, booking history, linked deals
- Add/edit project wizard (multi-step: Basic Info → Towers & Floors → Units → Amenities → Pricing)
- **Bulk unit creation** (e.g., "Add 10 units per floor × 15 floors = 150 units at once")
- Filter/search units by: type, status, price range, area range, facing, floor

##### [NEW] `app/actions/properties.ts`
- CRUD for projects, towers, units
- Unit status transitions with validation (Available → Blocked → Booked → Sold)
- **Timed blocking** — auto-release after X hours if not converted to booking
- Price revision with full history audit trail
- Inventory analytics (% sold, revenue potential, available stock value)

---

#### Module 2: Cost Sheet & Payment Plan Builder

##### [NEW] `prisma/schema.prisma` — New Models
```
CostSheet        → unit FK, contact FK, base cost, floor rise, view premium, parking charges,
                   clubhouse charges, legal charges, stamp duty, GST, registration, total,
                   discount, net payable, generated by (staff), generated at, PDF URL

PaymentPlan      → project FK, name (e.g., "Construction Linked", "Down Payment", "Flexi"),
                   milestones JSON [{name, percentage, due_description}], is_default

PaymentSchedule  → booking FK, payment plan FK, milestones with actual due dates and amounts
```

##### [NEW] `app/(dashboard)/cost-sheets/page.js` (also embedded in Deal detail)
- Select unit → auto-populate base price, premiums, charges
- Configurable add-ons: parking, club membership, legal fees
- Stamp duty auto-calculation (state-wise rates)
- GST calculation (5% under-construction / 0% ready-to-move)
- One-click PDF generation with company branding
- Share via WhatsApp / Email directly from CRM

##### [MODIFY] `app/actions/properties.ts`
- Cost sheet generation logic
- Payment plan templates (Construction Linked / Down Payment / Flexi)
- Schedule generation from plan template + booking date

---

#### Module 3: Deal Pipeline & Booking Engine

##### [NEW] `prisma/schema.prisma` — New Models
```
DealStage        → name, order, color, is_won, is_lost, auto_actions JSON

Deal             → contact FK, unit FK (nullable), assigned agent FK, channel partner FK (nullable),
                   stage FK, value, expected close date, source, notes, AI score (0-100),
                   lost reason, won date, created at

DealActivity     → deal FK, type (call/email/visit/note/stage_change/document/payment),
                   description, old_stage, new_stage, timestamp, performed by

Booking          → deal FK, unit FK, contact FK, booking date, agreement value,
                   token amount, token receipt number, token date, token mode,
                   payment plan FK, status (Active/Cancelled/Transferred),
                   cancelled reason, cancelled date

BookingMilestone → booking FK, milestone name, due date, amount, paid amount,
                   status (Upcoming/Due/Overdue/Paid), payment date, receipt URL,
                   demand letter sent, demand letter date
```

##### [NEW] `app/(dashboard)/deals/page.js`
- **Kanban board** with drag-and-drop stages (New Inquiry → Site Visit Scheduled → Site Visit Done → Negotiation → Booking → Won / Lost)
- Deal cards: contact name, property, value, days in stage, AI probability badge
- **List view** with advanced filters (agent, project, value range, stage, date range, source)
- Deal detail page:
  - Contact info + property info side-by-side
  - Full activity timeline (auto-logged)
  - Linked documents
  - Payment milestone tracker
  - Cost sheet viewer
  - "Convert to Booking" button (blocks unit + generates payment schedule)

##### [NEW] `app/actions/deals.ts`
- Deal CRUD with stage transition validation
- Auto-log activity on every stage change
- Token amount recording with digital receipt generation
- Booking conversion workflow (Deal → Booking + Unit status change + Schedule generation)
- Deal analytics: avg days per stage, conversion rates, revenue forecast

---

#### Module 4: Channel Partner / Broker Portal

##### [NEW] `prisma/schema.prisma` — New Models
```
ChannelPartner      → name, company, RERA broker number, phone, email,
                       type (Individual/Firm), status (Active/Inactive/Blacklisted),
                       commission rate (%), commission type (Percentage/Fixed/Slab),
                       agreement doc URL, onboarding date, PAN, bank details JSON

CPLead              → channel partner FK, lead FK, submitted date, status,
                       commission eligible (bool), attribution verified (bool)

CPCommission        → channel partner FK, deal FK, booking FK, amount, percentage,
                       status (Pending/Approved/Paid/Disputed), approved by,
                       payment date, UTR/reference number, invoice URL

CPPayoutBatch       → batch name, total amount, partner count, date, status (Draft/Processing/Completed)
```

##### [NEW] `app/(dashboard)/channel-partners/page.js` (Admin view)
- Partner listing with metrics: leads submitted, conversions, total commission, pending payout
- Add/onboard partner form with RERA verification field
- Commission ledger per partner (all deals, amounts, statuses)
- Payout batch management (select partners → approve commissions → generate payout)
- Performance comparison charts

##### [NEW] `app/channel-portal/` (Separate layout — no sidebar, own login)
- **Dedicated login** for channel partners (email + password)
- **Dashboard**: My leads, my commissions, my performance
- **Inventory browser**: View all projects & available units (live from main system)
- **Submit lead form**: Client name, phone, email, interested property, budget
- **Lead tracker**: See status of submitted leads (New → Contacted → Site Visit → Booked)
- **Commission statements**: Download monthly/quarterly commission reports as PDF
- **Profile & KYC**: Update bank details, PAN, RERA number

---

### Phase 2 — Document & Financial Intelligence (Priority: HIGH)

---

#### Module 5: Document Management & KYC Center

##### [NEW] `prisma/schema.prisma` — New Models
```
Document         → entity type (Contact/Deal/Booking/Project), entity ID,
                   type (KYC/Agreement/Receipt/NOC/Allotment Letter/Possession Letter/Cost Sheet),
                   file URL, file name, file size, status (Pending/Verified/Rejected),
                   uploaded by, verified by, verified at, notes, expiry date

DocumentTemplate → name, type, category, HTML body with {{merge_fields}},
                   header image URL, footer text, is_default

KYCRecord        → contact FK, doc type (Aadhaar/PAN/Voter ID/Passport/Driving License),
                   doc number, front image URL, back image URL,
                   verified (bool), verified by, verified at, auto_verified (bool)
```

##### [NEW] `app/(dashboard)/documents/page.js`
- **Document center** with tabs: All / By Contact / By Deal / By Project
- Upload with drag-and-drop, auto-categorization by file name patterns
- **KYC dashboard**: Per-contact KYC completion status (✅ Aadhaar ✅ PAN ⬜ Photo)
- Template-based document generation:
  - Allotment letter (auto-fill: buyer name, unit, price, payment plan)
  - Booking confirmation receipt
  - Demand letters (milestone-triggered)
  - NOC / Possession letter
- PDF preview, download, and share via WhatsApp/Email
- Document expiry alerts (e.g., expired PAN for NRI buyers)

##### [NEW] `app/actions/documents.ts`
- Document CRUD with file upload to `uploads/` directory
- KYC verification workflow (upload → review → approve/reject)
- Template rendering engine: HTML template → merge fields → PDF
- Bulk document status report per project

---

#### Module 6: Demand Letter & Payment Automation

##### [MODIFY] `app/actions/deals.ts` — Add demand letter functions
- Auto-generate demand letters when a milestone's due date approaches (configurable: 7/15/30 days before)
- Send via WhatsApp (template message with PDF attachment) + Email
- Track: demand sent date, reminder count, payment received date
- Overdue escalation: Auto-notify manager when payment is overdue by X days
- Dashboard widget: "Overdue Collections" with total amount and contact list

##### [MODIFY] `app/(dashboard)/deals/page.js` — Booking detail sub-page
- Payment milestone timeline with visual progress bar
- Each milestone row: name, due date, amount, status badge, "Send Demand" button, "Mark Paid" button
- Demand letter history: who sent, when, via which channel, read receipt

---

#### Module 7: EMI & Affordability Calculator

##### [NEW] `app/(dashboard)/tools/emi-calculator/page.js`
- **Calculator inputs**: Property value, down payment %, loan tenure (years), interest rate %
- **Calculator outputs**: Monthly EMI, total interest, total payment, amortization schedule table
- **Bank rate comparison table**: Pre-configured rates for top banks (SBI, HDFC, ICICI, Axis, Kotak, PNB)
- **Stamp duty & registration estimator**: State-wise (Maharashtra, Karnataka, UP, Gujarat, etc.)
- **Save to deal**: Attach calculated EMI breakdown to any deal record as JSON
- **Share**: Generate shareable link or WhatsApp message with EMI summary

> [!NOTE]
> Pure frontend calculations — no new database models needed. Saved results stored as JSON in Deal metadata.

---

#### Module 8: Duplicate Lead Detection

##### [MODIFY] `app/actions/leads.ts`
- On lead creation: fuzzy match against existing contacts by phone (exact), email (exact), name (Levenshtein distance < 3)
- If match found: show warning modal with existing contact details + option to merge or create new
- Duplicate confidence score: Exact phone = 100%, Exact email = 90%, Similar name = 60%
- **Dedup report page**: List of suspected duplicates with merge/dismiss actions

##### [MODIFY] `app/(dashboard)/leads/page.js`
- Duplicate warning badge on lead cards
- "Merge Contacts" dialog with field-by-field comparison (keep newest / keep oldest / manual pick)

---

### Phase 3 — Enhanced Visit & Agent Experience (Priority: MEDIUM-HIGH)

---

#### Module 9: Site Visit 2.0

##### [MODIFY] `prisma/schema.prisma` — Extend FieldVisit
```
Add fields:
  - projectId       (FK to Project — which property was visited)
  - unitIds         (Int[] — which units were shown)
  - geoCheckInLat   (Float — GPS proof of arrival)
  - geoCheckInLng   (Float)
  - geoCheckInTime  (DateTime)
  - otpCode         (String — visitor verification OTP)
  - otpVerified     (Boolean)
  - buyerRating     (Int 1-5 — post-visit rating)
  - feedback        (JSON — structured: {liked: [], disliked: [], concerns: []})
  - followUpAction  (String — "Send Quote" / "Schedule 2nd Visit" / "Not Interested" / "Ready to Book")
  - visitDuration   (Int — minutes spent on site)
```

##### [MODIFY] `app/(dashboard)/staff-portal/page.js`
- **OTP verification**: Send OTP to visitor's phone before visit starts, verify in-app
- **Geo-check-in button**: Captures GPS coordinates on arrival, validates within 500m of project location
- **Unit showcase**: Select which units were shown during visit (links to inventory)
- **Structured feedback form**: What buyer liked / disliked / concerns (checkboxes + free text)
- **Quick follow-up action**: One-tap buttons post-visit ("Send Cost Sheet" / "Book 2nd Visit" / "Create Deal")
- **Duration tracker**: Auto-calculate time from check-in to form submission

##### [MODIFY] `app/actions/field-visits.ts`
- OTP generation and verification via WhatsApp/SMS
- Geo-validation (confirm agent is within 500m of project)
- Auto-create deal or follow-up activity based on visit feedback
- Visit analytics: conversion rate per project, avg visits before booking, avg duration

---

#### Module 10: Team Leaderboard & Gamification

##### [NEW] `prisma/schema.prisma` — New Models
```
AgentScore       → staff FK, period (YYYY-MM), metrics JSON
                   {calls, site_visits, deals_created, deals_won, revenue, response_time_avg}

Badge            → name, description, icon, criteria JSON, tier (Bronze/Silver/Gold)

AgentBadge       → staff FK, badge FK, earned date, period
```

##### [NEW] `app/(dashboard)/leaderboard/page.js`
- **Real-time leaderboard**: Ranked table of agents by configurable metric (revenue / deals closed / site visits / calls)
- **Period selector**: Today / This Week / This Month / This Quarter
- **Agent scorecard**: Radar chart showing multi-dimensional performance
- **Badges panel**: Earned badges with descriptions ("🏆 10 Site Visits This Week", "🔥 3-Day Streak")
- **Competition mode**: Admin can create time-bound competitions with custom metrics and prizes

##### [MODIFY] `app/(dashboard)/page.js` — Dashboard
- Add "Top Performers" widget showing top 3 agents with key metrics
- Quick badges earned this week

---

#### Module 11: Unified Contact Timeline

##### [MODIFY] `app/(dashboard)/leads/page.js` — Lead detail view
- **Single chronological timeline** merging ALL touchpoints for a contact:
  - 📞 Calls (from CallLog)
  - 💬 WhatsApp messages (from WaMessage)
  - 📧 Emails sent (from EmailRecipient)
  - 🏠 Site visits (from FieldVisit)
  - 💰 Payments received (from DailyPayment)
  - 📄 Documents uploaded (from Document)
  - 🔄 Deal stage changes (from DealActivity)
  - 📝 Notes and activities (from StaffActivity)
- Each entry: icon, type badge, description, timestamp, performed by
- Filter by type (show only calls, show only payments, etc.)

##### [NEW] `app/actions/timeline.ts`
- Aggregate data from 8+ tables for a given contactId
- Sort chronologically
- Paginate (load 20 at a time, infinite scroll)

---

#### Module 12: Property Portal Integration

##### [NEW] `prisma/schema.prisma` — New Models
```
PortalConfig     → portal name (99acres/MagicBricks/Housing.com/NoBroker),
                   enabled, API key, webhook URL, last sync, auto_assign_to (staff FK)

PortalLead       → portal config FK, lead FK, portal lead ID, portal name,
                   inquiry date, property name, buyer message, raw payload JSON,
                   synced at, deduplicated (bool)
```

##### [NEW] `app/(dashboard)/settings/portal-integrations/page.js`
- Configuration cards for each portal (99acres, MagicBricks, Housing.com)
- API key / webhook URL setup
- Auto-assign rules (which agent gets portal leads)
- Sync status and last sync time
- Manual "Sync Now" button

##### [MODIFY] `app/actions/leads.ts`
- Portal webhook handler: receive lead → dedup check → create Contact + Lead → auto-assign → notify agent
- Source attribution tagging (lead.source = "99acres" / "MagicBricks" etc.)

---

### Phase 4 — AI & Intelligence Layer (Priority: MEDIUM)

---

#### Module 13: AI Property Matching Engine

##### [NEW] `app/actions/ai-matching.ts`
- **Input**: Buyer preferences from lead record:
  - Budget range (min–max)
  - Location / project preference
  - BHK type
  - Facing preference
  - Floor preference (low/mid/high)
  - Carpet area range
  - Amenity requirements
- **Algorithm**: Weighted scoring against all available units across all projects
- **Output**: Ranked list with match % score (e.g., "Unit A-1204: 92% match")
- **Auto-notifications**: When new inventory is added matching existing leads' preferences → auto-trigger WhatsApp message with property details

##### [MODIFY] `app/(dashboard)/leads/page.js`
- "🤖 AI Match" button on lead detail
- Matched properties panel with score bars
- One-click "Send to buyer via WhatsApp" with unit brochure

##### [MODIFY] `app/(dashboard)/deals/page.js`
- AI-suggested units when creating a deal (pre-fill unit based on contact preferences)

---

#### Module 14: AI Deal Predictor (Unique — Not in Market)

##### [NEW] `app/actions/ai-deal-predictor.ts`
- **Scoring factors** (weighted):
  - Number of site visits (×15 weight — more visits = higher intent)
  - Response time to messages (×10 — fast responder = engaged)
  - KYC documents uploaded (×20 — uploaded = very serious)
  - Budget-to-property-price ratio (×10 — within range = feasible)
  - Days since last engagement (×15 — decay factor)
  - Source quality (×10 — Referral > Walk-in > Portal > Social)
  - Cost sheet viewed/shared (×10)
  - Payment token paid (×10 — auto 90+ score)
- **Output**: 0-100 "Close Probability" score stored on Deal record
- **Auto-actions**:
  - Score > 80 → Flag as "🔥 Hot Deal" + notify manager
  - Score < 30 + no activity in 7 days → Flag as "⚠️ At Risk" + auto-send nurture message
  - Score recalculated daily via cron job

##### [MODIFY] `app/(dashboard)/deals/page.js`
- Probability badge on kanban cards (color: green > 70, yellow 40-70, red < 40)
- Sort/filter by AI score
- "At Risk Deals" alert panel on dashboard

---

### Phase 5 — Buyer Experience & Compliance (Priority: MEDIUM-LOW)

---

#### Module 15: Buyer Self-Service Portal

##### [NEW] `prisma/schema.prisma` — New Models
```
BuyerSession         → contact FK, phone, OTP, OTP expiry, verified, session token, created at

ConstructionUpdate   → project FK, title, description, photos[], date, milestone %,
                       category (Foundation/Structure/Finishing/Handover)

SupportTicket        → contact FK, booking FK, subject, description, category,
                       status (Open/In Progress/Resolved/Closed), priority (Low/Medium/High),
                       assigned to (staff FK), resolved at, resolution notes

PossessionChecklist  → booking FK, items JSON [{name, status, photo, notes}],
                       inspection date, inspector (staff FK), buyer signed (bool),
                       buyer signature URL, handover date, keys handed (bool)
```

##### [NEW] `app/buyer-portal/` (Separate layout — own auth)
- **OTP-based login** using registered phone number (WhatsApp or SMS)
- **My Bookings**: View booked units with full details (project, unit, area, price)
- **Payment Tracker**: Milestone-wise progress bar with amounts, due dates, paid/pending status
- **Pay Now**: Link to payment gateway (or show bank details + UPI QR)
- **Documents**: Download allotment letter, receipts, agreements, NOCs
- **Construction Updates**: Photo timeline showing project progress with milestone %
- **Support**: Raise and track support tickets
- **Possession**: Digital handover checklist, snag reporting, sign-off

---

#### Module 16: Referral Program Engine (Unique — Not in Market)

##### [NEW] `prisma/schema.prisma` — New Models
```
ReferralProgram  → name, reward type (Cash/Discount/Gift), reward value,
                   active (bool), terms, valid from, valid until

Referral         → referrer contact FK, referred contact FK, program FK, deal FK,
                   status (Submitted/Qualified/Converted/Rewarded),
                   reward amount, reward paid (bool), reward paid date
```

##### [NEW] `app/(dashboard)/referrals/page.js`
- Active referral programs list
- Create/edit program (define reward structure)
- Referral tracking: who referred whom, current status, reward due
- Payout management
- Shareable referral link per contact (generates unique URL that pre-fills referrer)

##### [MODIFY] `app/buyer-portal/`
- "Refer a Friend" section with unique shareable link
- Track referral status and earned rewards

---

## Updated Open Questions

> [!IMPORTANT]
> Please review these before I start building — your answers directly affect the database schema and UI design:

1. **Property Types**: Should we support only residential (apartments/villas) or also commercial (shops/offices) and plots?
2. **Multi-Project**: Will the CRM manage multiple projects simultaneously, or one at a time?
3. **Channel Partner Commission**: Percentage-based, slab-based (different % for different deal values), or both?
4. **Buyer Portal Login**: OTP via WhatsApp, SMS, or both?
5. **Payment Gateway**: Should "Pay Now" in buyer portal integrate Razorpay/PayU for actual collection, or just show bank/UPI details for manual transfer?
6. **Stamp Duty States**: Which Indian states should we support? (Each has different rates — Maharashtra, Karnataka, UP, Delhi, Gujarat, Tamil Nadu, Telangana, Rajasthan?)
7. **Portal Integrations**: Which property portals do you want first? 99acres / MagicBricks / Housing.com / NoBroker?
8. **Phase Priority**: Do you agree with the 5-phase order, or would you like to reshuffle any modules?
9. **Cost Sheet Branding**: Should generated PDFs include company logo, watermark, and custom header/footer?
10. **Gamification**: Should leaderboard be visible to all agents (competition) or only managers (performance review)?

---

## Verification Plan

### After Each Module
- `npx prisma db push` — schema compiles and syncs to database
- `npm run build` — zero build errors across all 95+ pages
- Manual UI testing on `localhost:3000`

### After Full Implementation
- **End-to-end buyer flow**: Lead Capture → AI Match → Schedule Visit → OTP Verify Visit → Create Deal → Kanban Stage Move → Generate Cost Sheet → Convert to Booking → Token Payment → Milestone Tracking → Demand Letters → Possession Handover
- **Channel partner flow**: CP Login → Browse Inventory → Submit Lead → Track Status → View Commission → Download Statement
- **Buyer portal flow**: OTP Login → View Booking → Check Milestones → Download Documents → View Construction Updates → Raise Ticket
- **Admin analytics flow**: Dashboard → Conversion Funnel → Source ROI → Agent Scorecard → Revenue Forecast → Inventory Heatmap

---

## Summary

| Phase | Modules | New Pages | New Models | Priority |
|---|---|---|---|---|
| **Phase 1** | Properties, Cost Sheets, Deals, Channel Partners | 5 pages + 1 portal | ~16 models | 🔴 Critical |
| **Phase 2** | Documents/KYC, Demand Letters, EMI Calculator, Dedup | 3 pages | ~5 models | 🟠 High |
| **Phase 3** | Site Visit 2.0, Leaderboard, Timeline, Portal Integration | 2 pages | ~5 models | 🟡 Medium-High |
| **Phase 4** | AI Matching, AI Deal Predictor | 0 new pages (enhancements) | 0 models | 🟢 Medium |
| **Phase 5** | Buyer Portal, Referral Program | 1 portal + 1 page | ~6 models | 🔵 Medium-Low |

**Total**: ~11 new pages, 2 new portals (Channel Partner + Buyer), ~32 new database models, enhancements to 8+ existing pages.

> [!TIP]
> This plan positions Realzentic ahead of every Indian real estate CRM by combining **Sell.Do's lifecycle management** + **Buildesk's post-sales automation** + **Follow Up Boss's speed-to-lead** + **unique AI features no competitor offers**. The result is a platform that covers the full real estate journey from lead capture to possession handover.
