# Realzentic — Best-in-Class Real Estate CRM Implementation Plan

## Background & Research

### Competitors Analyzed
| CRM | Price Range | Target | Key Differentiator |
|---|---|---|---|
| **Sell.Do** | ₹25K–₹2L/mo | Indian Developers | Full lifecycle: lead → possession. Channel partner portal, unit-level inventory |
| **kvCORE (Lofty)** | $499–$1500/mo | US Brokerages | IDX website + CRM + marketing all-in-one |
| **Follow Up Boss** | $69–$1000/mo | Teams & Agents | Speed-to-lead, 250+ integrations, smart lists |
| **LeadSquared** | ₹15K–₹1.5L/mo | Enterprise India | High-volume multi-city ops, portal integrations |
| **Buildesk** | ₹20K–₹80K/mo | Builders | Backend-heavy: CRM + inventory + post-sales + accounting |
| **Absolute CX** | Custom (₹1L+/mo) | Premium Developers | AI buyer agents, e-commerce-style lifecycle tracking |

### What We Already Have ✅
- Lead management with follow-ups
- Appointments & walk-ins
- Staff management, attendance (GPS), payroll
- Field visits with photos
- Daily payments & expenses
- Financial reports (P&L, Balance Sheet, Cash Flow)
- WhatsApp Marketing (full API integration with pipelines, deals, broadcasts)
- Email marketing with A/B testing
- Instagram & Facebook inbox
- AI calling agent (LiveKit)
- IndiaMart lead sync
- Automation engine
- Reviews management

### What Premium Competitors Have That We Don't ❌
1. **Property / Project / Inventory Management** — Unit-level tracking (tower → floor → unit)
2. **Deal Pipeline with Stages** — Visual kanban for deal progression
3. **Channel Partner / Broker Portal** — Dedicated login, commission tracking, lead attribution
4. **Document Management** — Agreement generation, KYC upload, e-signatures
5. **AI Property Matching** — Preference-based auto-recommendations
6. **EMI / Loan Calculator** — Built-in affordability calculator for buyers
7. **Enhanced Site Visit Module** — Geo-check-in, live photo capture, feedback forms
8. **Buyer / Customer Portal** — Self-service: payment history, construction updates, documents
9. **RERA Compliance Dashboard** — Project registration tracking, compliance alerts
10. **Advanced Analytics Dashboard** — Conversion funnels, source ROI, agent scorecards

### Our Unique Edge (Not in Any Competitor) 🚀
11. **AI Deal Predictor** — ML-based deal close probability using engagement signals
12. **Smart Inventory Heatmap** — Visual floor-plan with color-coded unit availability
13. **WhatsApp-Native Buyer Journey** — Full property selection → booking → payment via WhatsApp flows
14. **Voice AI Site Visit Scheduler** — Autonomous AI calling agent books site visits without human intervention
15. **Unified Omnichannel Timeline** — Single timeline merging calls, WhatsApp, email, visits, payments per contact

---

## Proposed Changes

### Phase 1 — Core Real Estate Foundation (Priority: Critical)

> [!IMPORTANT]
> These 3 modules form the backbone of every premium real estate CRM. Without them, we cannot compete.

---

#### Module 1: Property & Inventory Management

##### [NEW] `prisma/schema.prisma` — New Models
```
Project          → name, location, RERA number, type (Residential/Commercial), status, builder, total units, photos
Tower            → project relation, name (A/B/C), total floors
Unit             → tower relation, floor, unit number, type (1BHK/2BHK/3BHK/Shop/Office), carpet area, super built-up area, facing, status (Available/Blocked/Booked/Sold), base price, premium, total price, parking
UnitPriceHistory → unit relation, price, effective date (for price revision tracking)
Amenity          → project relation, name, icon, category
```

##### [NEW] `app/(dashboard)/properties/page.js`
- Project listing with cards: photo, name, location, RERA, unit count, availability %
- Click into project → tower view → floor plan grid
- Unit detail drawer: area, price, status, booking history
- Add/edit project wizard with multi-step form

##### [NEW] `app/actions/properties.ts`
- CRUD for projects, towers, units
- Unit status transitions (Available → Blocked → Booked → Sold)
- Price revision history
- Inventory analytics (% sold, revenue potential)

---

#### Module 2: Deal Pipeline & Booking

##### [NEW] `prisma/schema.prisma` — New Models
```
Deal             → contact, unit, assigned agent, stage, value, expected close date, source, notes
DealStage        → name, order, color, is_won, is_lost (customizable pipeline)
DealActivity     → deal relation, type (call/email/visit/note/stage_change), description, timestamp
Booking          → deal relation, unit relation, booking date, agreement value, payment plan, status
PaymentMilestone → booking relation, milestone name, due date, amount, status (Pending/Paid/Overdue)
```

##### [NEW] `app/(dashboard)/deals/page.js`
- Kanban board view with drag-and-drop stages
- Deal cards showing: contact name, property, value, days in stage
- List view with filters (agent, project, value range, date)
- Deal detail page: timeline, linked unit, payment milestones, documents

##### [NEW] `app/actions/deals.ts`
- Deal CRUD with stage transitions
- Auto-activity logging on stage change
- Deal value analytics and forecasting
- Overdue milestone alerts

---

#### Module 3: Channel Partner / Broker Portal

##### [NEW] `prisma/schema.prisma` — New Models
```
ChannelPartner      → name, company, RERA number, phone, email, type (Individual/Firm), status, commission rate
CPLogin             → channel partner relation, email, hashed password
CPLead              → channel partner relation, lead relation, attribution date, commission status
CPCommission        → channel partner relation, deal relation, amount, percentage, status (Pending/Approved/Paid), payment date
CPPayoutBatch       → batch of commission payouts, total amount, date, status
```

##### [NEW] `app/(dashboard)/channel-partners/page.js`
- Partner listing with performance metrics (leads brought, conversions, commission earned)
- Add/onboard partner form with RERA verification
- Commission ledger and payout management
- Individual partner profile with full history

##### [NEW] `app/channel-portal/page.js` (separate layout, no sidebar)
- Dedicated login for channel partners (like staff portal)
- View available inventory across projects
- Submit new leads
- Track lead status and commissions
- Download commission statements

---

### Phase 2 — Document & Financial Tools (Priority: High)

---

#### Module 4: Document Management & Agreement Generation

##### [NEW] `prisma/schema.prisma` — New Models
```
Document         → contact/deal/booking relation, type (KYC/Agreement/Receipt/NOC/Allotment), file URL, status (Pending/Verified/Rejected), uploaded by, verified by
DocumentTemplate → name, type, HTML body with merge fields, category
KYCRecord        → contact relation, document type (Aadhaar/PAN/Passport), number, verified, document URL
```

##### [NEW] `app/(dashboard)/documents/page.js`
- Document center organized by contact/deal
- Upload with drag-and-drop, auto-categorization
- KYC status tracker per contact (green/yellow/red indicators)
- Template-based agreement generation with auto-filled merge fields (buyer name, unit details, price, payment plan)
- PDF preview and download

##### [NEW] `app/actions/documents.ts`
- Document CRUD with file upload to local storage
- KYC verification workflow
- Merge-field template rendering to PDF
- Document expiry alerts

---

#### Module 5: EMI & Affordability Calculator

##### [NEW] `app/(dashboard)/emi-calculator/page.js`
- Standalone calculator page (also embeddable in deal detail)
- Inputs: property value, down payment %, loan tenure, interest rate
- Outputs: monthly EMI, total interest, total payment, amortization schedule
- Bank rate comparison table (pre-configured rates for SBI, HDFC, ICICI, etc.)
- Stamp duty & registration charge estimator (state-wise)
- Save calculation to deal/contact for reference

> [!NOTE]
> This is a pure frontend component — no new database models needed. Calculations done client-side. Saved results stored as JSON in the Deal model.

---

#### Module 6: Enhanced Site Visit 2.0

##### [MODIFY] `prisma/schema.prisma` — Extend FieldVisit
```
Add fields:
  - propertyId     (link to Project)
  - unitIds        (which units shown)
  - geoCheckInLat/Lng  (GPS proof of visit)
  - buyerRating    (1-5 stars, post-visit)
  - feedbackNotes  (structured: liked/disliked/concerns)
  - followUpAction (Next step: "Send quote" / "Schedule 2nd visit" / "Not interested")
```

##### [MODIFY] `app/(dashboard)/staff-portal/page.js`
- Add geo-check-in button that captures GPS coordinates on arrival
- Structured feedback form after visit completion
- Show linked property/units during visit
- One-tap follow-up action buttons

##### [MODIFY] `app/actions/field-visits.ts`
- Geo-validation (confirm agent is within 500m of property location)
- Auto-create follow-up lead activity based on visit feedback
- Visit analytics: conversion rate per project, avg visits before booking

---

### Phase 3 — AI & Intelligence Layer (Priority: Medium)

---

#### Module 7: AI Property Matching Engine

##### [NEW] `app/actions/ai-matching.ts`
- Input: buyer preferences (budget range, location, BHK type, facing, floor preference, amenities)
- Algorithm: weighted scoring against all available units
- Output: ranked list of matching properties with match % score
- Auto-suggest when new inventory is added that matches existing leads
- WhatsApp notification to lead when a matching property becomes available

##### [MODIFY] `app/(dashboard)/leads/page.js`
- Add "AI Match" button on lead detail
- Show recommended properties with match score
- One-click "Send to buyer via WhatsApp" for matched properties

---

#### Module 8: AI Deal Predictor (Unique — Not in Market)

##### [NEW] `app/actions/ai-deal-predictor.ts`
- Scoring factors:
  - Number of site visits (more visits = higher intent)
  - Response time to messages
  - Document submission status (KYC uploaded = high intent)
  - Budget-to-property-price ratio
  - Days since last engagement
  - Source quality (referral > portal > social)
- Output: 0-100 "Close Probability" score per deal
- Auto-flag "Hot Deals" (score > 80) and "At Risk" (score < 30, no activity in 7 days)

##### [MODIFY] `app/(dashboard)/deals/page.js`
- Show probability badge on deal cards
- Sort/filter by AI score
- "At Risk" alert panel

---

### Phase 4 — Buyer Experience & Compliance (Priority: Medium-Low)

---

#### Module 9: Buyer Self-Service Portal

##### [NEW] `app/buyer-portal/page.js` (separate layout)
- OTP-based login using registered phone number
- View booked units with full details
- Payment milestone tracker with pay-now integration
- Download receipts, agreements, allotment letters
- Construction progress updates (photo timeline from admin)
- Raise support tickets / queries

##### [NEW] `prisma/schema.prisma` — New Models
```
BuyerPortalSession → contact relation, OTP, verified, expires
ConstructionUpdate → project relation, title, description, photos, date, milestone %
SupportTicket      → contact relation, subject, description, status, priority, assigned to
```

---

#### Module 10: RERA Compliance Dashboard

##### [NEW] `app/(dashboard)/compliance/page.js`
- Project-wise RERA registration tracker
- Expiry alerts (30/60/90 days before RERA expiry)
- Compliance checklist per project
- Document upload for RERA certificates
- Auto-reminder notifications to admin

> [!NOTE]
> This is primarily a tracking and alerting tool. RERA data is stored in the Project model (`reraNumber`, `reraExpiry`, `reraStatus`).

---

#### Module 11: Enhanced Analytics Dashboard

##### [MODIFY] `app/(dashboard)/page.js`
Add new dashboard widgets:
- **Conversion Funnel**: Lead → Site Visit → Booking → Sold (with drop-off %)
- **Source ROI**: Cost per lead, cost per conversion by source (WhatsApp/Facebook/99acres etc.)
- **Agent Scorecard**: Leads handled, site visits done, deals closed, revenue generated — per agent
- **Revenue Forecast**: Based on deal pipeline stages and expected close dates
- **Inventory Heatmap**: Visual grid showing unit availability by project/tower/floor
- **Payment Collection Tracker**: Expected vs received this month, overdue amount

---

## Open Questions

> [!IMPORTANT]
> Please review these before I start building:

1. **Property Types**: Should we support only residential (apartments/villas) or also commercial (shops/offices/plots)?
2. **Multi-Project**: Will the CRM manage multiple projects simultaneously, or is it focused on a single project/agency at a time?
3. **Channel Partner Commission**: Should commissions be percentage-based, slab-based, or both? Should they auto-calculate on deal close?
4. **Buyer Portal**: Do you want OTP-based login (via SMS/WhatsApp) or email-based login for buyers?
5. **Payment Gateway**: Should we integrate Razorpay/PayU for online payment collection from buyers, or is this just tracking?
6. **RERA State**: Which Indian states should we support for stamp duty/registration calculations? (Each state has different rates)
7. **Priority Order**: Do you agree with the 4-phase priority order, or would you like to reshuffle?

---

## Verification Plan

### After Each Module
- `npx prisma db push` — verify schema compiles
- `npm run build` — verify zero build errors
- Manual UI testing on `localhost:3000`

### After Full Implementation
- End-to-end flow test: Create Project → Add Units → Capture Lead → AI Match → Schedule Visit → Create Deal → Move through Pipeline → Generate Booking → Track Payments
- Channel partner flow: CP Login → View Inventory → Submit Lead → Track Commission
- Buyer portal flow: OTP Login → View Booking → Check Milestones → Download Documents

---

## Summary

| Phase | Modules | New Pages | New Models | Estimated Effort |
|---|---|---|---|---|
| **Phase 1** | Properties, Deals, Channel Partners | 4 pages + 1 portal | ~12 models | Large |
| **Phase 2** | Documents, EMI Calculator, Site Visit 2.0 | 2 pages | ~4 models | Medium |
| **Phase 3** | AI Matching, AI Deal Predictor | 0 new pages (enhancements) | 0 models | Medium |
| **Phase 4** | Buyer Portal, RERA, Analytics | 2 pages | ~3 models | Medium |

**Total**: 8 new pages, 2 new portals, ~19 new database models, enhancements to 5+ existing pages.
