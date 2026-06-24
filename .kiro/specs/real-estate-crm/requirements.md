# Requirements Document

## Introduction

Realzentic is an existing Next.js (App Router, JavaScript + TypeScript) real estate CRM backed by Prisma/PostgreSQL. The platform already provides lead management, appointments, staff/attendance/payroll, field visits, payments/expenses, financial reports, WhatsApp/Email marketing, Instagram/Facebook inbox, an AI calling agent (LiveKit), IndiaMart sync, an automation engine, reviews, and notifications.

This feature set adds **16 new modules** organized into **5 delivery phases** that turn Realzentic into a complete property-sales platform: property & inventory management, cost sheets, a deal pipeline and booking engine, a channel-partner portal, document/KYC management, demand-letter automation, financial calculators, duplicate-lead detection, enhanced site visits, gamification, a unified contact timeline, property-portal integration, AI property matching, an AI deal predictor, a buyer self-service portal, and a referral program.

The work MUST proceed incrementally and reuse the existing Prisma schema and pages. New Prisma models MUST NOT duplicate existing models (`Contact`, `Lead`, `Staff`, `FieldVisit`, `DailyPayment`, `Appointment`, `Walkin`, `Notification`, `Document` does not yet exist, etc.). The user's top priority is correctness: zero UI errors, zero backend/database logic errors, a schema that compiles and syncs, a build that passes with zero errors, and end-to-end flows that work.

### Phase / Module Map

- **Phase 1 — Core Real Estate Foundation (CRITICAL):** Module 1 Property & Inventory, Module 2 Cost Sheet & Payment Plan Builder, Module 3 Deal Pipeline & Booking Engine, Module 4 Channel Partner / Broker Portal.
- **Phase 2 — Document & Financial Intelligence (HIGH):** Module 5 Document Management & KYC, Module 6 Demand Letter & Payment Automation, Module 7 EMI & Affordability Calculator, Module 8 Duplicate Lead Detection.
- **Phase 3 — Enhanced Visit & Agent Experience (MEDIUM-HIGH):** Module 9 Site Visit 2.0, Module 10 Team Leaderboard & Gamification, Module 11 Unified Contact Timeline, Module 12 Property Portal Integration.
- **Phase 4 — AI & Intelligence Layer (MEDIUM):** Module 13 AI Property Matching, Module 14 AI Deal Predictor.
- **Phase 5 — Buyer Experience & Compliance (MEDIUM-LOW):** Module 15 Buyer Self-Service Portal, Module 16 Referral Program Engine.

## Glossary

- **Realzentic**: The overall Next.js + Prisma real estate CRM application.
- **Inventory_Service**: Backend server actions in `app/actions/properties.ts` that manage projects, towers, floors, units, amenities, pricing, and inventory analytics.
- **Cost_Sheet_Service**: Backend logic (in `properties.ts`) that builds, calculates, and renders cost sheets and payment plans.
- **Deal_Service**: Backend server actions in `app/actions/deals.ts` that manage deal stages, deals, deal activities, bookings, milestones, and demand-letter automation.
- **Booking_Engine**: The component of Deal_Service that converts a won deal into a booking, transitions unit status, and generates a payment schedule.
- **Channel_Partner_Service**: Backend logic that manages channel partners, CP leads, commissions, and payout batches.
- **Channel_Portal**: The separate broker-facing application under `app/channel-portal/` with its own authentication.
- **Document_Service**: Backend server actions in `app/actions/documents.ts` that manage document upload, KYC, and template-based generation.
- **EMI_Calculator**: The client-side tool at `app/(dashboard)/tools/emi-calculator/page.js`.
- **Lead_Service**: The existing `app/actions/leads.ts` server actions, extended for duplicate detection and portal lead ingestion.
- **Field_Visit_Service**: The existing field-visit server actions (`field-visits.ts`), extended for Site Visit 2.0.
- **Gamification_Service**: Backend logic that computes agent scores, badges, and leaderboard rankings.
- **Timeline_Service**: Backend server actions in `app/actions/timeline.ts` that aggregate a contact's history across multiple tables.
- **Portal_Integration_Service**: Backend logic that ingests leads from external property portals via webhooks.
- **AI_Matching_Service**: Backend server actions in `app/actions/ai-matching.ts` that score available units against buyer preferences.
- **AI_Deal_Predictor**: Backend server actions in `app/actions/ai-deal-predictor.ts` that compute a 0–100 deal probability score.
- **Buyer_Portal**: The buyer-facing self-service application under `app/buyer-portal/` with OTP login.
- **Referral_Service**: Backend logic that manages referral programs and referral tracking/payout.
- **Staff**: An existing model representing an internal employee/agent.
- **Contact**: The existing unified customer/client identity model (phone is unique).
- **Unit**: A single sellable inventory item (flat, shop, office, or plot) within a tower.
- **Timed_Hold**: A temporary block placed on a unit that auto-releases after a configured duration.
- **RERA**: Real Estate Regulatory Authority registration identifier for a project or broker.
- **Cost_Sheet**: An itemized price breakdown for a unit and contact.
- **Demand_Letter**: A document requesting payment for a due booking milestone.
- **Build_Pipeline**: The `npm run build` process across all Realzentic pages.
- **Schema_Sync**: The `npx prisma db push` operation that applies the Prisma schema to the database.

## Assumptions (Open Questions — Defaults Applied)

The following decisions are unconfirmed by the user. Each is encoded as a default in the acceptance criteria below and flagged here. Each MUST be revisited if the user provides a different answer.

- **A1 — Property types:** Units support residential (1BHK/2BHK/3BHK/4BHK), commercial (Shop/Office), and plots. Default assumption: all three are supported from Phase 1.
- **A2 — Multi-project support:** The system supports multiple concurrent projects. Default: multi-project is enabled.
- **A3 — CP commission model:** Commission type supports Percentage, Fixed, and Slab. Default: all three are modeled; Percentage is the default commission type.
- **A4 — Buyer portal login:** Buyer authentication uses phone-based OTP. Default: WhatsApp OTP with SMS fallback.
- **A5 — Payment gateway:** Default: manual UPI/bank capture (token and milestone payments recorded manually via existing `DailyPayment`), with online gateway (Razorpay/PayU) deferred behind a configurable optional feature.
- **A6 — Stamp-duty states:** Default stamp-duty rates are configurable per state, seeded for Maharashtra; other states configurable in settings.
- **A7 — Property portals first:** Default first-supported portals are 99acres, MagicBricks, Housing, and NoBroker, behind per-portal enable flags.
- **A8 — Phase priority:** Default delivery order follows Phase 1 → 5 as listed.
- **A9 — Cost-sheet PDF branding:** Default branding is sourced from existing `StoreSettings` (store name, logo, bank details).
- **A10 — Leaderboard visibility:** Default leaderboard is visible to all staff; admins may restrict visibility via a configurable setting.

---

## Requirements

### Requirement 1: Project, Tower, Floor & Unit Inventory (Phase 1 / Module 1)

**User Story:** As a sales admin, I want to model projects, towers, floors, and units with full attributes, so that I can manage real estate inventory accurately.

#### Acceptance Criteria

1. THE Inventory_Service SHALL persist a Project with name, location, city, state, RERA number, RERA expiry date, type (Residential, Commercial, or Mixed), status (Upcoming, Under Construction, or Ready to Move), builder name, total units, description, amenities, brochure URL, photo URLs, latitude, longitude, and possession date.
2. THE Inventory_Service SHALL persist Tower records linked to a Project, each with name, total floors, and status.
3. THE Inventory_Service SHALL persist Floor records linked to a Tower, each with floor number and floor-plan image URL.
4. THE Inventory_Service SHALL persist Unit records linked to a Tower, each with floor number, unit number, type (1BHK, 2BHK, 3BHK, 4BHK, Shop, Office, or Plot), carpet area in square feet, super-built-up area in square feet, facing (N, S, E, W, NE, NW, SE, or SW), status (Available, Blocked, Booked, Sold, or Mortgaged), base price per square foot, floor-rise premium, view premium, total price, parking type, parking count, and booking reference fields.
5. WHEN a Unit total price is requested, THE Inventory_Service SHALL compute total price as the sum of base cost (base price per square foot multiplied by the Unit super-built-up area in square feet), floor-rise premium, and view premium.
6. WHEN a user opens the properties listing, THE Realzentic UI SHALL display each project as a card showing photo, name, location, RERA badge, unit count, and percentage sold, where percentage sold equals (count of Booked plus Sold units) divided by total units multiplied by 100, rounded to the nearest integer, and equals 0 when total units is 0.
7. WHEN a user opens a project detail view, THE Realzentic UI SHALL display tower tabs and a visual floor grid in which each unit is color-coded by status.
8. WHEN a user filters the unit list by type, status, price, area, facing, or floor, THE Realzentic UI SHALL display only units matching the selected filters, and SHALL display an empty-state message when no units match.
9. WHERE bulk unit creation is requested, THE Inventory_Service SHALL create multiple Unit records in a single transaction for a specified tower and floor range, and IF any unit in the batch fails validation, THEN THE Inventory_Service SHALL roll back the entire transaction and create no units.
10. IF a Project, Tower, Floor, or Unit persist request omits a required field or supplies an out-of-range value or invalid enum value, THEN THE Inventory_Service SHALL reject the write and return an error identifying the invalid field.

### Requirement 2: Unit Status Transitions & Timed Holds (Phase 1 / Module 1)

**User Story:** As a sales admin, I want controlled unit status changes and timed holds, so that the same unit is never double-booked.

#### Acceptance Criteria

1. WHEN a Unit status change is requested, THE Inventory_Service SHALL permit only the transitions Available→Blocked, Blocked→Available, Blocked→Booked, Available→Booked, Booked→Sold, Booked→Available, and Sold→Mortgaged.
2. IF a Unit status change is requested that is not in the permitted transition set, THEN THE Inventory_Service SHALL reject the change, leave the Unit status unchanged, and return an error identifying the current and requested status.
3. IF a booking or block is requested for a Unit whose status is not Available, THEN THE Inventory_Service SHALL reject the request and return an error identifying the current status.
4. WHEN two requests attempt to block or book the same Available Unit concurrently, THE Inventory_Service SHALL allow only the first to succeed and SHALL reject the second, so that the same unit is never double-booked.
5. WHEN a Unit is blocked with a Timed_Hold, THE Inventory_Service SHALL record the blocking staff or channel partner, the hold-creation timestamp, and a hold-expiry timestamp set between 1 and 168 hours ahead (default 48 hours).
6. WHEN a Timed_Hold expiry timestamp is reached and the Unit has not progressed to Booked, THE Inventory_Service SHALL return the Unit status to Available and clear the hold record.
7. WHEN a Unit price is revised, THE Inventory_Service SHALL create a UnitPriceHistory record capturing old price, new price, changed-by, effective date, and reason (1 to 500 characters).
8. WHEN inventory analytics are requested for a project, THE Inventory_Service SHALL return percentage sold, total revenue potential (sum of total price across all units), and available stock value (sum of total price across Available units).

### Requirement 3: Cost Sheet & Payment Plan Builder (Phase 1 / Module 2)

**User Story:** As a sales agent, I want to generate itemized cost sheets and payment plans for a unit and buyer, so that I can share accurate pricing.

#### Acceptance Criteria

1. WHEN a user selects a Unit for a Cost_Sheet, THE Cost_Sheet_Service SHALL auto-populate base cost, floor rise, view premium, and parking charges from the Unit.
2. THE Cost_Sheet_Service SHALL persist a Cost_Sheet linked to a Unit and a Contact with base cost, floor rise, view premium, parking charges, clubhouse charges, legal charges, stamp duty, GST, registration charges, total, discount, net payable, generated-by, generated-at, and PDF URL.
3. WHEN a Cost_Sheet net payable is computed, THE Cost_Sheet_Service SHALL set net payable equal to total plus all add-on charges minus discount, where each monetary field is in the range 0.00 to 999,999,999.99.
4. IF a discount exceeds the gross amount (total plus all add-on charges), THEN THE Cost_Sheet_Service SHALL reject the Cost_Sheet and return an error, so that net payable can never be negative.
5. WHEN stamp duty is calculated, THE Cost_Sheet_Service SHALL apply the configured state-wise stamp-duty rate for the project's state, and WHERE no rate is configured for that state, THE Cost_Sheet_Service SHALL apply the Maharashtra default rate per assumption A6.
6. WHILE a project status is Under Construction, THE Cost_Sheet_Service SHALL apply a GST rate of 5 percent.
7. WHILE a project status is Ready to Move, THE Cost_Sheet_Service SHALL apply a GST rate of 0 percent.
8. WHILE a project status is neither Under Construction nor Ready to Move, THE Cost_Sheet_Service SHALL apply a GST rate of 5 percent so that the GST rate is always determinate.
9. WHEN a user requests a Cost_Sheet PDF, THE Cost_Sheet_Service SHALL generate a branded PDF using StoreSettings branding per assumption A9, and IF PDF generation fails, THEN THE Cost_Sheet_Service SHALL preserve the existing PDF URL and return an error.
10. WHERE sharing is requested, THE Realzentic UI SHALL allow sending the Cost_Sheet via WhatsApp or Email and SHALL record an observable delivery status for the send.
11. THE Cost_Sheet_Service SHALL persist at most one default PaymentPlan per project, each PaymentPlan with name and milestone definitions, and SHALL persist PaymentSchedule records linking a booking and payment plan to dated milestone amounts whose sum equals the Cost_Sheet net payable.

### Requirement 4: Deal Pipeline (Phase 1 / Module 3)

**User Story:** As a sales manager, I want a configurable Kanban deal pipeline with activity logging, so that I can track deals through stages reliably.

#### Acceptance Criteria

1. THE Deal_Service SHALL persist DealStage records with name (1 to 100 characters), order (positive integer), color, is-won flag (boolean), is-lost flag (boolean), and auto-action definitions.
2. THE Deal_Service SHALL persist Deal records with contact, optional unit, assigned agent, optional channel partner, stage, value (0.00 to 999,999,999.99), expected close date, source, notes (0 to 5000 characters), AI score (0 to 100), lost reason, won date, and created-at.
3. WHEN a Deal is moved to a different stage that exists, THE Deal_Service SHALL create a DealActivity record capturing type, description, old stage, new stage, timestamp, and performed-by.
4. IF a Deal is moved to a stage that does not exist, THEN THE Deal_Service SHALL reject the move, retain the deal's current stage, and return an error indicating the target stage is invalid.
5. WHEN a user drags a deal card to a different stage column on the Kanban board, THE Realzentic UI SHALL update the deal stage and display the card in the target column within 2 seconds.
6. IF the stage update fails after a user drags a deal card, THEN THE Realzentic UI SHALL return the card to its original column and display an error message indicating the update did not succeed.
7. WHEN a user opens a deal detail view, THE Realzentic UI SHALL display the activity timeline, documents, milestone tracker, and cost-sheet viewer.
8. WHEN deal analytics are requested, THE Deal_Service SHALL return, within 3 seconds, the deal count and the sum of deal values grouped by stage.
9. IF a Deal is moved to a stage whose is-lost flag is true and no lost reason is provided, THEN THE Deal_Service SHALL reject the save, retain the deal's current stage, and return an error indicating a lost reason is required.

### Requirement 5: Booking Engine & Milestones (Phase 1 / Module 3)

**User Story:** As a sales manager, I want to convert a won deal into a booking that locks the unit and generates a payment schedule, so that inventory and collections stay consistent.

#### Acceptance Criteria

1. WHEN a user converts a Deal to a Booking, THE Booking_Engine SHALL create a Booking linked to the deal, unit, and contact with booking date, agreement value (0.00 to 999,999,999.99), token amount (0.00 to agreement value), token receipt number (1 to 50 characters), token date, token mode, payment plan, and status, performing all writes in a single transaction.
2. WHEN a Booking is created, THE Booking_Engine SHALL transition the associated Unit status to Booked within the same transaction.
3. IF the associated Unit is not Available or Blocked at conversion time, THEN THE Booking_Engine SHALL reject the conversion, leave the Unit status and Deal unchanged, and return an error identifying the current Unit status.
4. IF two conversions target the same Unit concurrently, THEN THE Booking_Engine SHALL allow only the first to succeed and SHALL reject the second with an error, so that a Unit is never double-booked.
5. WHEN a Booking is created, THE Booking_Engine SHALL generate BookingMilestone records from the selected payment plan, each with milestone name, due date, amount, paid amount, and status (Upcoming, Due, Overdue, or Paid), and the sum of milestone amounts SHALL equal the Booking agreement value.
6. WHEN a token payment is recorded for a Booking, THE Booking_Engine SHALL store the token receipt number and link the payment using the existing DailyPayment model per assumption A5.
7. WHEN a Booking status is set to Cancelled, THE Booking_Engine SHALL record cancellation reason and date and SHALL return the associated Unit status to Available within the same transaction.
8. WHEN a BookingMilestone due date has passed and its paid amount is less than its amount, THE Booking_Engine SHALL set that BookingMilestone status to Overdue.

### Requirement 6: Channel Partner Management (Phase 1 / Module 4)

**User Story:** As an admin, I want to onboard and manage channel partners with commission tracking, so that broker-sourced deals are attributed and paid correctly.

#### Acceptance Criteria

1. THE Channel_Partner_Service SHALL persist ChannelPartner records with name, company, RERA broker number, phone, email, type (Individual, Firm, or Company), status (Active, Inactive, or Suspended), commission rate (0 to 100 when commission type is Percentage; a non-negative amount otherwise), commission type (Percentage, Fixed, or Slab), agreement document URL, onboarding date, PAN, and bank details.
2. THE Channel_Partner_Service SHALL persist CPLead records linking a channel partner and a lead with submitted date, status, commission-eligible flag, and attribution-verified flag.
3. THE Channel_Partner_Service SHALL persist CPCommission records linking a channel partner, deal, and booking with amount, percentage, status (Pending, Approved, Paid, or Disputed), approved-by, payment date, UTR, and invoice URL.
4. WHEN a commission is computed for a Percentage partner, THE Channel_Partner_Service SHALL set commission amount to the partner commission rate divided by 100, multiplied by the booking agreement value, rounded to 2 decimal places.
5. WHERE a partner commission type is Slab, THE Channel_Partner_Service SHALL apply the matching slab rate to the booking agreement value per assumption A3, rounded to 2 decimal places.
6. WHEN a payout batch is created, THE Channel_Partner_Service SHALL persist a CPPayoutBatch with batch name, total amount, partner count, date, and status (Draft, Processing, or Completed), and WHEN a payout batch status transitions to Completed, THE Channel_Partner_Service SHALL set all included commissions to status Paid.
7. WHEN a user opens the channel-partners admin page, THE Realzentic UI SHALL display partner listings with metrics (partner count, total commission amount by status, and pending payout total), an onboarding form requiring RERA broker number, a commission ledger, and payout-batch management.
8. WHEN a commission is computed for a Fixed partner, THE Channel_Partner_Service SHALL set commission amount to the partner configured fixed commission amount independent of the booking agreement value.
9. IF a channel-partner onboarding submission omits the RERA broker number or supplies a RERA broker number that already exists on another ChannelPartner, THEN THE Channel_Partner_Service SHALL reject the submission, return an error indicating the missing or duplicate RERA broker number, and SHALL NOT create the ChannelPartner record.

### Requirement 7: Channel Partner Portal (Phase 1 / Module 4)

**User Story:** As a channel partner, I want a separate portal to browse inventory, submit leads, and view commissions, so that I can transact without access to the internal CRM.

#### Acceptance Criteria

1. THE Channel_Portal SHALL authenticate channel partners with email and password credentials independent of the internal Realzentic dashboard authentication, and SHALL grant access only to partners whose status is Active.
2. IF channel-partner login fails 5 times within 15 minutes, THEN THE Channel_Portal SHALL block further login attempts for that account for 15 minutes.
3. WHILE a channel partner is authenticated, THE Channel_Portal SHALL display only data belonging to that partner.
4. IF a request attempts to access another partner's leads, commissions, or statements, THEN THE Channel_Portal SHALL deny the request and return an authorization error.
5. WHEN a channel partner browses inventory, THE Channel_Portal SHALL display Available units sourced live from Inventory_Service, and IF Inventory_Service is unavailable, THEN THE Channel_Portal SHALL display an error state rather than stale data.
6. WHEN a channel partner submits a lead with the required fields (client name, phone, interested property, budget), THE Channel_Portal SHALL create a CPLead attributed to that partner and display a confirmation; IF a required field is missing, THEN THE Channel_Portal SHALL reject the submission and return a validation error.
7. WHEN a channel partner opens commission statements, THE Channel_Portal SHALL display that partner's commissions with their status and SHALL allow downloading a statement PDF; IF PDF generation fails, THEN THE Channel_Portal SHALL return an error.
8. IF an unauthenticated request reaches a Channel_Portal protected route, THEN THE Channel_Portal SHALL redirect the request to the portal login.

### Requirement 8: Document Management & KYC Center (Phase 2 / Module 5)

**User Story:** As an operations user, I want a central document and KYC repository with template-based generation, so that paperwork is organized and verifiable.

#### Acceptance Criteria

1. THE Document_Service SHALL persist Document records with entity type, entity ID, type, file URL, file name, file size, status, uploaded-by, verified-by, verified-at, notes, and expiry date.
2. WHEN a user uploads a document of an accepted type and a size between 1 byte and 25 MB, THE Document_Service SHALL store the file under the `uploads/` directory and auto-categorize it by its selected type.
3. IF an uploaded file exceeds 25 MB or is not an accepted type, THEN THE Document_Service SHALL reject the upload and return an error identifying the reason.
4. THE Document_Service SHALL persist KYCRecord records linking a Contact with document type, document number, front image, back image, verified flag, verified-by, verified-at, and auto-verified flag.
5. THE Document_Service SHALL persist DocumentTemplate records with name, type, category, HTML body containing merge fields, header, footer, and default flag.
6. WHEN a user generates a document from a template, THE Document_Service SHALL render the template HTML with merged field values and produce a PDF; IF any merge field cannot be resolved, THEN THE Document_Service SHALL reject generation and return an error identifying the unresolved field.
7. WHEN a document expiry date is within the configured alert window (default 30 days, configurable 1 to 365 days), THE Realzentic UI SHALL display an expiry alert for that document.
8. WHEN a user opens the documents page, THE Realzentic UI SHALL display tabs for All, Contact, Deal, and Project documents and SHALL support drag-and-drop upload subject to the same size and type validation as criterion 2.

### Requirement 9: Demand Letter & Payment Automation (Phase 2 / Module 6)

**User Story:** As a collections manager, I want automated demand letters and overdue tracking, so that milestone payments are collected on time.

#### Acceptance Criteria

1. WHEN a BookingMilestone whose status is not Paid has a due date within the configured lead window (7, 15, or 30 days), THE Deal_Service SHALL generate a Demand_Letter for that milestone, and IF a Demand_Letter already exists for that milestone within the same window, THEN THE Deal_Service SHALL NOT generate a duplicate.
2. WHEN a Demand_Letter is generated, THE Deal_Service SHALL send it via a WhatsApp template and Email and SHALL record per-channel sent status and sent date.
3. IF a Demand_Letter send fails on a channel, THEN THE Deal_Service SHALL retry up to 3 times and, on continued failure, record a failed status and notify the assigned manager.
4. WHEN a BookingMilestone is unpaid and its due date has passed, THE Deal_Service SHALL set its status to Overdue and notify the assigned manager using the existing Notification model.
5. WHEN a user opens a booking detail sub-page, THE Realzentic UI SHALL display a milestone timeline showing each milestone's name, due date, amount, paid amount, and status, with per-milestone "Send Demand" and "Mark Paid" actions and a demand-letter history.
6. WHEN the dashboard is loaded, THE Realzentic UI SHALL display an "Overdue Collections" widget showing the count of overdue milestones and the sum of their unpaid amounts.
7. WHEN a milestone is marked paid with an amount less than the milestone amount, THE Deal_Service SHALL add the amount to paid amount and set status to Partially_Paid; WHEN paid amount is greater than or equal to the milestone amount, THE Deal_Service SHALL set status to Paid.
8. IF a payment amount that is zero, negative, or greater than the outstanding amount is submitted for a milestone, THEN THE Deal_Service SHALL reject the payment, leave the milestone unchanged, and return an error.

### Requirement 10: EMI & Affordability Calculator (Phase 2 / Module 7)

**User Story:** As a sales agent, I want an EMI and affordability calculator, so that I can show buyers financing options.

#### Acceptance Criteria

1. WHEN a user enters property value, down payment, tenure, and interest rate, THE EMI_Calculator SHALL compute the monthly EMI, total interest, and an amortization schedule.
2. THE EMI_Calculator SHALL display a bank-rate comparison for SBI, HDFC, ICICI, Axis, Kotak, and PNB.
3. WHEN a user requests a stamp-duty and registration estimate, THE EMI_Calculator SHALL compute the estimate using the configured state-wise rate per assumption A6.
4. WHEN a user saves a calculation to a deal, THE EMI_Calculator SHALL store the calculation as JSON in the Deal metadata without creating a new Prisma model.
5. WHERE sharing is requested, THE EMI_Calculator SHALL produce a shareable link and a WhatsApp share action.
6. IF down payment is greater than or equal to property value, THEN THE EMI_Calculator SHALL display a validation error and SHALL NOT compute an EMI.

### Requirement 11: Duplicate Lead Detection (Phase 2 / Module 8)

**User Story:** As a sales agent, I want duplicate leads detected on creation, so that contacts are not duplicated and attribution stays clean.

#### Acceptance Criteria

1. WHEN a lead is created, THE Lead_Service SHALL identify potential duplicates as any existing Contact matching the new lead by exact normalized phone number, OR exact case-insensitive email address, OR full name with a Levenshtein distance of less than 3, and SHALL return the result within 2 seconds.
2. WHEN potential duplicates are found, THE Realzentic UI SHALL display a warning modal listing each matched Contact with a confidence score expressed as an integer from 0 to 100, and SHALL present a "Merge" action and a "Create New" action.
3. WHEN a user chooses to merge contacts, THE Lead_Service SHALL combine the records field-by-field according to the user's per-field selections and SHALL retain all leads, calls, payments, and appointments linked to every merged Contact.
4. IF a merge operation fails to complete, THEN THE Lead_Service SHALL roll back all changes so that the source and target Contacts remain in their pre-merge state, and SHALL return an error response indicating the merge did not complete.
5. WHEN a lead is identified as a potential duplicate, THE Realzentic UI SHALL display a duplicate badge on that lead.
6. WHEN a deduplication report is requested, THE Lead_Service SHALL return the set of detected duplicate groups, where each group contains 2 or more Contacts matched by the criteria in criterion 1, and SHALL return an empty set when no duplicate groups exist.
7. IF a phone number being created already exists on a Contact, THEN THE Lead_Service SHALL link the new lead to the existing Contact instead of creating a new Contact, preserving the unique phone constraint.

### Requirement 12: Site Visit 2.0 (Phase 3 / Module 9)

**User Story:** As a field agent, I want OTP-verified, geo-checked site visits with structured feedback, so that visits are authentic and capture buyer intent.

#### Acceptance Criteria

1. THE Field_Visit_Service SHALL extend the existing FieldVisit model with project reference, unit ID list, geo check-in latitude/longitude/time, OTP code, OTP-verified flag, buyer rating (1–5), structured feedback (liked, disliked, concerns), follow-up action, and visit duration, without creating a duplicate visit model.
2. WHEN a site visit check-in is requested, THE Field_Visit_Service SHALL generate an OTP and send it to the buyer via WhatsApp or SMS.
3. IF the entered OTP does not match the generated OTP, THEN THE Field_Visit_Service SHALL reject the check-in and return an error.
4. IF the agent geo-location is more than 500 meters from the project location, THEN THE Field_Visit_Service SHALL reject the geo check-in and return an error.
5. WHEN a site visit is completed with feedback, THE Field_Visit_Service SHALL create a follow-up or deal according to the selected follow-up action.
6. WHEN visit analytics are requested, THE Field_Visit_Service SHALL return visit counts, average buyer rating, and average visit duration.

### Requirement 13: Team Leaderboard & Gamification (Phase 3 / Module 10)

**User Story:** As a sales manager, I want a leaderboard with scores and badges, so that I can motivate and rank agents.

#### Acceptance Criteria

1. THE Gamification_Service SHALL persist AgentScore records linking a Staff to a period (YYYY-MM) with a metrics object.
2. THE Gamification_Service SHALL persist Badge records with name, description, icon, criteria, and tier, and AgentBadge records linking a Staff to a Badge with earned date and period.
3. WHEN a user opens the leaderboard, THE Realzentic UI SHALL display a ranked table for the selected metric and period, an agent scorecard, and a badges panel.
4. WHEN an agent meets a badge's criteria for a period, THE Gamification_Service SHALL award the corresponding AgentBadge exactly once per period.
5. WHERE leaderboard visibility is restricted by an admin setting, THE Realzentic UI SHALL display the leaderboard only to permitted roles per assumption A10.
6. WHEN the dashboard is loaded, THE Realzentic UI SHALL display a "Top Performers" widget.

### Requirement 14: Unified Contact Timeline (Phase 3 / Module 11)

**User Story:** As a sales agent, I want a single chronological timeline of all contact interactions, so that I have full context in one place.

#### Acceptance Criteria

1. WHEN a contact timeline is requested, THE Timeline_Service SHALL aggregate calls, WhatsApp messages, emails, site visits, payments, documents, deal stage changes, and notes for that contact.
2. THE Timeline_Service SHALL return timeline entries sorted in reverse chronological order.
3. WHEN a timeline is displayed, THE Realzentic UI SHALL render each entry with an icon, badge, description, timestamp, and performed-by value.
4. WHEN a user filters the timeline by entry type, THE Realzentic UI SHALL display only entries of the selected type.
5. WHEN a timeline contains more entries than one page, THE Timeline_Service SHALL paginate results to support infinite scroll.

### Requirement 15: Property Portal Integration (Phase 3 / Module 12)

**User Story:** As a marketing admin, I want leads from external property portals ingested automatically, so that no inquiry is missed and sources are tracked.

#### Acceptance Criteria

1. THE Portal_Integration_Service SHALL persist PortalConfig records with portal name, enabled flag, API key, webhook URL, last-sync timestamp, and auto-assign Staff reference.
2. THE Portal_Integration_Service SHALL persist PortalLead records with portal config reference, lead reference, portal lead ID, portal name, inquiry date, property name, buyer message, raw payload, synced-at, and deduplicated flag.
3. WHEN a portal webhook is received, THE Portal_Integration_Service SHALL deduplicate against existing contacts, create a Contact and Lead when no duplicate exists, auto-assign per PortalConfig, and notify the assignee.
4. WHERE a PortalConfig enabled flag is false, THE Portal_Integration_Service SHALL ignore inbound webhooks for that portal.
5. THE Portal_Integration_Service SHALL record the source attribution (99acres, MagicBricks, Housing, or NoBroker) on each created Lead per assumption A7.
6. IF a received webhook payload fails validation, THEN THE Portal_Integration_Service SHALL reject the payload and return an error without creating records.

### Requirement 16: AI Property Matching (Phase 4 / Module 13)

**User Story:** As a sales agent, I want AI-ranked property matches for a buyer's preferences, so that I can recommend the best available units.

#### Acceptance Criteria

1. WHEN buyer preferences (budget range, location or project, BHK, facing, floor, carpet area, and amenities) are submitted, THE AI_Matching_Service SHALL produce a ranked list of available units with a match percentage for each.
2. THE AI_Matching_Service SHALL consider only units with status Available when matching.
3. WHEN a new matching unit is added to inventory, THE AI_Matching_Service SHALL notify agents linked to buyers whose preferences match.
4. WHEN a user opens the leads page, THE Realzentic UI SHALL provide an "AI Match" action and a matched-properties panel with a WhatsApp send action.
5. WHEN a user opens a deal, THE Realzentic UI SHALL display AI-suggested units for that deal.

### Requirement 17: AI Deal Predictor (Phase 4 / Module 14)

**User Story:** As a sales manager, I want an AI deal probability score with automated actions, so that I can prioritize hot deals and rescue at-risk ones.

#### Acceptance Criteria

1. WHEN a Deal score is computed, THE AI_Deal_Predictor SHALL apply the weighted factors site visits (×15), response time (×10), KYC uploaded (×20), budget ratio (×10), days since engagement (×15 with time-based decay), source quality (×10), cost sheet viewed (×10), and token paid (×10), producing an integer value bounded from 0 to 100 inclusive, where any computed result below 0 is set to 0 and any result above 100 is set to 100.
2. WHEN a token payment exists on a Deal, THE AI_Deal_Predictor SHALL set the Deal score to a value between 90 and 100 inclusive, overriding the weighted-factor result.
3. WHEN a Deal score is computed, THE AI_Deal_Predictor SHALL store the integer value on the Deal AI score field together with the computation timestamp.
4. IF a computed Deal score is greater than 80, THEN THE AI_Deal_Predictor SHALL mark the deal as a Hot Deal.
5. WHEN a deal is marked as a Hot Deal, THE AI_Deal_Predictor SHALL send a notification to the assigned manager within 60 seconds of the marking.
6. IF a Deal score is less than 30 AND the deal has had no logged activity (no call, message, site visit, document upload, or status change) for 7 consecutive days, THEN THE AI_Deal_Predictor SHALL mark the deal At Risk and trigger an auto-nurture action within 60 seconds of the marking.
7. THE AI_Deal_Predictor SHALL recalculate all Deal scores once per calendar day during a scheduled run that completes within 60 minutes of its start time.
8. IF a scheduled recalculation run fails to complete or encounters an error for one or more deals, THEN THE AI_Deal_Predictor SHALL retain the last successfully computed score for each affected deal and record an error indication identifying the failed run.
9. WHEN a user opens the deals page, THE Realzentic UI SHALL display a probability badge showing the current Deal score (0 to 100) for each deal.
10. WHEN a user opens the deals page, THE Realzentic UI SHALL allow sorting and filtering of deals by Deal score and SHALL display an "At Risk" panel listing all deals currently marked At Risk.

### Requirement 18: Buyer Self-Service Portal (Phase 5 / Module 15)

**User Story:** As a buyer, I want a self-service portal to view my bookings, pay, download documents, and track possession, so that I can manage my purchase independently.

#### Acceptance Criteria

1. THE Buyer_Portal SHALL persist BuyerSession records with contact reference, phone, OTP (6 digits), OTP expiry, verified flag, session token, and created-at.
2. WHEN a buyer requests login, THE Buyer_Portal SHALL send a 6-digit OTP to the buyer phone via WhatsApp within 30 seconds, falling back to SMS if WhatsApp delivery fails, per assumption A4, and SHALL expire the OTP 5 minutes (300 seconds) after generation.
3. IF a submitted OTP is expired or does not match, THEN THE Buyer_Portal SHALL reject the login and return an error.
4. IF 5 consecutive OTP attempts fail for a phone, THEN THE Buyer_Portal SHALL block further login attempts for that phone for 15 minutes.
5. WHILE a buyer session is verified and within its 24-hour token lifetime, THE Buyer_Portal SHALL display only that buyer's bookings, payment tracker, and documents.
6. IF a request attempts to access another buyer's bookings, payments, or documents, THEN THE Buyer_Portal SHALL deny the request and return an authorization error.
7. IF a buyer session token is expired, THEN THE Buyer_Portal SHALL require re-authentication before granting access.
8. THE Buyer_Portal SHALL persist ConstructionUpdate records (project, title, description, photos, date, milestone percentage 0–100, category) and SHALL display them as a timeline.
9. THE Buyer_Portal SHALL persist SupportTicket records (contact, booking, subject 1–200 characters, description 1–5000 characters, category, status, priority, assigned-to, resolved-at, resolution notes) and SHALL allow a buyer to create and track tickets; IF a required ticket field is missing, THEN THE Buyer_Portal SHALL reject creation and return an error.
10. THE Buyer_Portal SHALL persist PossessionChecklist records (booking, items, inspection date, inspector, buyer-signed flag, signature URL, handover date, keys-handed flag) and SHALL allow a buyer to view the checklist, raise snags, and sign off.
11. WHERE online payment is enabled per assumption A5, THE Buyer_Portal SHALL provide a "Pay Now" action; otherwise it SHALL display manual UPI/bank payment instructions.

### Requirement 19: Referral Program Engine (Phase 5 / Module 16)

**User Story:** As a marketing admin, I want a referral program with tracking and payouts, so that existing buyers bring qualified referrals.

#### Acceptance Criteria

1. THE Referral_Service SHALL persist ReferralProgram records with name, reward type (Cash, Discount, or Gift), reward value, active flag, terms, valid-from, and valid-until.
2. THE Referral_Service SHALL persist Referral records linking a referrer contact, a referred contact, a program, and an optional deal with status, reward amount, reward-paid flag, and paid date.
3. WHEN a referred contact's deal reaches a won stage, THE Referral_Service SHALL mark the referral eligible and compute the reward amount from the program reward value.
4. WHEN a referral reward is paid, THE Referral_Service SHALL set the reward-paid flag and paid date.
5. WHEN a user opens the referrals page, THE Realzentic UI SHALL display programs, allow create and edit, show referral tracking, and provide a shareable referral link.
6. WHILE a buyer session is verified, THE Buyer_Portal SHALL display a "Refer a Friend" section linked to an active ReferralProgram.
7. IF a referral is created where referrer and referred contact are the same, THEN THE Referral_Service SHALL reject the referral and return an error.

### Requirement 20: Data Integrity, Schema, and Build Correctness (Non-Functional, All Phases)

**User Story:** As the product owner, I want the system to be correct with zero UI, backend, and database errors, so that the platform works reliably end-to-end.

#### Acceptance Criteria

1. WHEN new Prisma models are added, THE Realzentic schema SHALL reuse existing models (Contact, Lead, Staff, FieldVisit, DailyPayment, Appointment, Walkin, Notification) and SHALL NOT duplicate them.
2. WHEN Schema_Sync is executed, THE Realzentic schema SHALL apply successfully via `npx prisma db push` with no errors.
3. WHEN the Build_Pipeline is executed, THE Realzentic application SHALL complete `npm run build` with zero errors across all pages.
4. WHEN a record is created or updated, THE responsible service SHALL validate all required fields and reject invalid input with a descriptive error before any database write.
5. WHERE two units could be assigned to the same booking, THE Booking_Engine SHALL prevent double-booking by enforcing unit-status transitions within a single database transaction.
6. WHEN a write affects multiple related records (booking, unit status, milestones), THE responsible service SHALL perform the writes in a single transaction so that partial updates do not persist.
7. WHEN a status-changing or financial action is performed, THE responsible service SHALL record an audit entry capturing who performed the action and when.
8. THE Realzentic application SHALL preserve referential integrity such that every foreign-key reference resolves to an existing record.

### Requirement 21: Authentication and Access Control for New Portals (Non-Functional)

**User Story:** As a security-conscious admin, I want the new buyer and channel-partner portals to be access-controlled, so that data is not exposed to unauthorized users.

#### Acceptance Criteria

1. IF an unauthenticated request reaches a protected Channel_Portal or Buyer_Portal route, THEN THE responsible portal SHALL deny access and redirect to the corresponding login.
2. WHILE a portal session is active, THE responsible portal SHALL scope all queries to the authenticated principal so that one partner or buyer cannot read another's data.
3. WHEN an OTP is generated for the Buyer_Portal, THE Buyer_Portal SHALL expire the OTP after the configured validity window.
4. THE internal Realzentic dashboard authentication SHALL remain unchanged and SHALL govern access to all `app/(dashboard)/` routes.
