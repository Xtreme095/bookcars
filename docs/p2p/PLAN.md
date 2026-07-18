# P2P Conversion Plan — BookCars → Peer-to-Peer Car Sharing (Croatia)

**Status:** APPROVED — upstream sync (v8.4→v8.8-dev), Phases 0, 1 and 2 implemented
on this branch; Phases 3–6 pending. Implemented state is documented in
[`docs/p2p-model.md`](../p2p-model.md).
**Branch:** `claude/p2p-car-rental-conversion-yf2a1u`
**Date:** 2026-07-17
**Base:** BookCars 8.4.0 fork (backend API, admin panel, frontend, mobile, shared packages)

This document is the implementation plan for converting the platform from a classic
rent-a-car / aggregator into a peer-to-peer (Turo-model) marketplace for the Croatian
market. The operating company remains the legal rental operator (merchant of record);
private car owners ("hosts") lease vehicles to the platform and receive a revenue share.

Supersedes `ROADMAP.md` and `docs/phase1/…phase4/` (Dec-2024 "aggregator" roadmap),
which describe a different business model and overstate what was actually built — see §1.

---

## 1. Current-state audit (what is actually in the repo)

### 1.1 Upstream base (working)

Stock BookCars 8.4.0 monorepo conventions this plan follows throughout:

| Area | Convention |
|---|---|
| Models | `backend/src/models/*.ts`, one mongoose schema per file, `{ timestamps, strict, collection }`, document interfaces in `backend/src/config/env.config.ts` |
| API | `backend/src/config/*Routes.config.ts` (route strings) + `backend/src/routes/*Routes.ts` + `backend/src/controllers/*Controller.ts`, mounted in `app.ts` |
| Shared types | `packages/bookcars-types/index.ts` (enums + payload interfaces used by all 4 apps) |
| Uploads | multer memory → write to `CDN_TEMP_*` → `fs.rename` into `CDN_*` on entity save (avatar, car image, contracts, driver license) |
| Auth | JWT (jose/HS256) in httpOnly signed cookies (web) or `X-Access-Token` (mobile); `authJwt.verifyToken` picks cookie by request origin; frontend origin requires `type=user`, admin origin requires `type∈{admin,supplier}` |
| Client validation | zod + react-hook-form (`src/models/*Form.ts` per form) |
| i18n | `LocalizedStrings` per page/component file in `src/lang/` (frontend/admin), `i18n-js` in backend (emails) and mobile |
| Emails | nodemailer via `mailHelper`, inline HTML, locale = recipient's `user.language` |

Key existing features we build on:

- **Driver-license upload** exists end-to-end (`User.license`, `CDN_LICENSES`/`CDN_TEMP_LICENSES`,
  create/update/delete endpoints, `DriverLicense.tsx` in frontend Settings + Checkout, gated per
  supplier via `supplier.licenseRequired`). Renter verification (Phase 5) extends this pattern.
- **Booking-overlap availability**: car availability during search is computed from overlapping
  bookings (statuses paid/reserved/deposit, `car.blockOnPay`) — there is no availability calendar yet.
- **Per-booking ledger prototype**: `CommissionTransaction` model + `commissionHelper` +
  creation hook in `bookingController.checkout` (see 1.2 — partially wired, needs repair).
- **PDF deps** (`pdfkit`, `qrcode`) already in backend `package.json`; `invoiceHelper.ts` shows a
  working Croatian invoice PDF pattern (HUB-3 QR etc.).
- **Setting** is a singleton settings document with controller + admin page — the natural home for
  the global commission rate.

### 1.2 Prior fork work (Dec 2024 "aggregator" roadmap) — audit verdicts

The fork's docs (`docs/PHASE1_COMPLETE.md`, `docs/FINAL_SESSION_SUMMARY.md`) claim
"PRODUCTION READY". **Reality: `main` does not build.** Verified by running `npm ci` and
`tsc --build` on a clean checkout:

| Component | Claimed | Actual state | Decision |
|---|---|---|---|
| `backend/package-lock.json` | — | Out of sync with `package.json` (`pdfkit`, `qrcode`, `crypto-js` missing) → `npm ci` fails | **Fixed already** (committed on this branch) |
| Commission backend (`CommissionTransaction`, `commissionHelper`, `commissionController`, routes) | "100% complete, integrated" | Does not compile: routes import `authJwt` as a namespace though it's a default export (`authJwt.verifyToken` undefined → would also crash Express at startup); controller reads non-existent `supplier.address/city/zip` and `transaction.createdAt`. Runtime bugs besides: `calculateSupplierEarnings` passes a string supplier id into an aggregation `$match` (no auto-cast → always €0), `processPayout` trusts a client-sent amount. Ledger row is created **only** on the Stripe *payment-intent* path (mobile); web Stripe-session and PayPal paths create nothing. Tier logic (basic/silver/gold) belongs to the abandoned aggregator model. No admin/frontend UI calls any commission endpoint. Model not registered in `databaseHelper` init (unique index never built in production) | **Repair & repurpose** as the P2P revenue-share ledger (Phase 3) |
| Review system (`reviewController`, `reviewHelper`, `reviewRoutes`) | — | Imports `models/Review` + `models/ReviewHelpful` **which do not exist**; routes mounted in `app.ts` → build fails | **Remove** (git history preserves it; reviews are not in P2P scope) |
| Analytics (`analyticsController`, `AnalyticsSummary`, `analyticsHelper`) | — | Imports non-existent `config/app.config` → build fails; standalone reporting module, zero UI, not wired to booking flow | **Remove routes + controller** (revisit analytics after P2P launch) |
| Cargo vehicle fields on `Car` | "Backend 100%" | Schema fields exist but are absent from payload types, controllers and all UIs — dormant, unreachable | **Leave dormant** (harmless; not P2P scope) |
| EUR migration script (`migrate-currency-to-eur.ts`) | "COMPLETE, production ready" | Calls non-existent `databaseHelper.Connect/Close`, reads removed `car.price` field — broken | **Remove** (Croatia is EUR-native in config already) |
| e-Računi / invoice helpers (`eRacuniHelper`, `invoiceHelper`) | "CRITICAL, complete" | Compile except missing `@types/*`; reachable only via one manual endpoint with no UI; `createInvoiceForCommission` fully dead; HUB-3 payment QR hardcodes `HRK` (Croatia is EUR); e-Računi client targets an **unverified/speculative API contract** and is off by default | **Keep as reference**, repurpose PDF pattern for agreements/statements; e-Računi integration deferred |
| Supplier commission/tier/bank/OIB fields on `User` | — | Schema-only; no UI or payload sets them; none exposed in `bookcars-types` (clients couldn't use them anyway) | **Reuse** the useful ones (iban/swift/oib/company*), **supersede** tier fields |
| Croatian (hr) i18n | "Croatian language added" | Translations largely written but never activated: backend hr complete & wired (emails work); **all 39 frontend lang files have hr blocks** but `hr` is missing from frontend `LANGUAGES` → unselectable; mobile `hr.ts` complete & registered in i18n but missing from mobile `LANGUAGES`; **admin has zero hr strings**. Frontend `BASE_CURRENCY` still defaults to USD unless `VITE_BC_BASE_CURRENCY` is set | **Activate** (register `hr` in frontend+mobile config — Phase 1), translate admin per-phase, full sweep in Phase 6; set EUR in env examples |
| `BookingStatus.PaidInFull`, `Booking.isPayedInFull` | — | Wired into checkout/UI, works | Keep |
| Bank details page (`BankDetails` model/controller, admin page) | — | Wired and functional (single global bank account for pay-later display) | Keep (unrelated to host payouts) |

### 1.3 Pre-existing security gaps that block a self-service marketplace

These exist on `main` today (mostly upstream behavior). They are tolerable in a
closed admin-managed deployment but **not** once strangers self-register as hosts:

1. `POST /api/admin-sign-up` is unauthenticated and creates an `admin`-type account.
2. `POST /api/update-user` lets any authenticated user modify any user, including `type`
   (privilege escalation to admin) and `blacklisted`.
3. No server-side per-role authorization: all admin/supplier endpoints accept any
   admin-origin token (admin **or** supplier type); tenant scoping (which supplier's
   cars/bookings you see) is enforced only by which IDs the client sends.
4. Booking status changes / deletions have no ownership checks.
5. Blacklist check in `authJwt` is commented out (client-side only).

**Phase 1 includes a minimal authorization layer** (see §5.4) because host onboarding is
exactly the point where anonymous users start writing to the system. Fixes are scoped to
not break existing admin/supplier flows.

---

## 2. Target model

### 2.1 Roles

| Role | Representation | Signs into | Capabilities |
|---|---|---|---|
| Renter | `User` `type=user` | frontend (+ mobile) | search, book, verify identity (Phase 5) |
| **Host** | `User` `type=user` **+ `host` subdocument** (new) | frontend (host portal section) | apply, manage vehicles, see bookings & earnings for own cars |
| Supplier (legacy) | `User` `type=supplier` | admin panel | unchanged — existing fleets keep working |
| Admin | `User` `type=admin` | admin panel | everything + new queues (host applications, vehicle review, verification, payouts) |
| Platform | company data in `Setting` | — | legal operator; named as lessor on rental agreements |

**Decision D1 — hosts stay `type='user'` with a `host` subdocument, not `type='supplier'`.**
Rationale:

- `authJwt` grants every `supplier`-type token access to the **entire admin-origin API**
  (which today has no per-role guards, §1.3). Making self-registered hosts `supplier`s would
  hand them the admin API surface. Keeping them `user`-type means the admin origin rejects
  them outright — much safer with the current authorization model.
- The host portal must live in the **frontend** (requirement), and frontend sign-in only
  admits `type=user`. Hosts keep renting ability (a host can also be a renter) with zero
  auth changes.
- Existing suppliers and every supplier-scoped admin flow remain untouched.
- `Car.supplier` / `Booking.supplier` / `CommissionTransaction.supplier` are plain `User`
  refs — they can point at a host's user id without schema changes. "Extending the supplier
  concept" happens at the reference level, where it matters.

Cost of D1 (accepted): the aggregations that enumerate suppliers for search/filters
(`supplierController.getFrontendSuppliers`, `getSuppliers`, admin supplier filter) currently
`$match { type: 'supplier', avatar: { $ne: null } }` and must be extended with
`$or: [{ type: 'supplier' }, { 'host.status': 'approved' }]` (~4 aggregation pipelines, one
service parameter). Host cars then flow through search, checkout, booking and notification
machinery with **no further changes**.

### 2.2 Collections after conversion (new/changed in bold)

```
User            (+ host subdocument, + verification/documents in Phase 5)
Car             (+ status, + specs make/model/year, + registrationDocument, + minDays/maxDays, + host-facing fields)
**CarUnavailability**   (host-blocked date ranges — Phase 2)
Booking         (+ agreement subdocument — Phase 4)
CommissionTransaction   (repaired + repurposed as revenue-share ledger — Phase 3)
**Payout**      (monthly statement per host — Phase 3)
Setting         (+ platformCommissionPct, + platform legal identity for agreements)
Location, Country, Notification, Token, …   (unchanged)
```

### 2.3 Money flow (unchanged rails, new ledger)

All renter payments continue to go to the **platform's** Stripe/PayPal account (this is
already how BookCars works — suppliers never receive money in-band). Per completed booking
a ledger entry records gross / platform fee / host share (Phase 3). Monthly, per host:
statement (PDF) + payout row; guaranteed-minimum top-up applied if contractually agreed;
admin marks payouts paid and exports a SEPA-compatible CSV for the bank.

---

## 3. Phase overview

| Phase | Scope | Depends on |
|---|---|---|
| **0. Stabilize** | Make `main` build & deploy again; excise dead aggregator code; CI green | — |
| **1. Host role & onboarding** | `User.host` schema, application wizard (frontend), admin approval queue, emails/notifications, authorization layer, `hr` language registration | 0 |
| **2. Vehicle listing by hosts** | Host car CRUD (frontend portal), `Car.status` flow draft→pending_review→active→suspended, registration document + photos, availability calendar, min/max days, admin vehicle review queue, search integration | 1 |
| **3. Revenue share & payouts** | Global + per-host commission config, ledger repair (all payment paths), monthly payout statements (PDF), guaranteed minimum, admin payout dashboard, SEPA CSV export, host earnings page | 1 (2 for real data) |
| **4. Rental agreements** | HR/EN PDF generation on confirmed booking, storage, admin+renter download | 0 |
| **5. Renter verification** | License front/back + ID upload, manual admin review UI, checkout gate, pluggable provider interface | 0 |
| **6. Docs & polish** | `docs/p2p-model.md`, full `hr` i18n sweep, mobile catch-up decision, test suite pass | all |

Phases 3/4/5 are independent of each other and can be reordered. Each phase ships
migration-safe (additive schema, defaults preserve current behavior) and ends with:
backend tests for new endpoints, `npm run lint`, `tsc --build` clean in all workspaces.

### Phase 0 detail (prerequisite, ~a day)

1. Remove review module (controller, helper, routes, config, `app.ts` mounts) — it cannot
   work (models never existed, `app.config` import broken). Remove analytics module (same
   broken import, `$renter` vs `driver` aggregation bug, no UI).
2. Fix commission compile errors (default-import `authJwt`, `companyAddress/City/Zip`,
   `createdAt` in interface, ObjectId cast in `calculateSupplierEarnings`) but leave
   behavior as-is until Phase 3 repurposes it.
3. Add `@types/pdfkit`, `@types/qrcode`; fix `CheckoutPayload.paymentMethod` type gap.
4. Remove broken `migrate-currency-to-eur.ts`; register `CommissionTransaction` in
   `databaseHelper.initialize`.
5. Move Dec-2024 docs to `docs/archive/2024-aggregator/` with a README noting supersession.
6. Set `VITE_BC_BASE_CURRENCY=EUR` in frontend/admin/mobile env examples (frontend
   currently falls back to USD).
7. Verify: `tsc --build` clean, backend test suite runs, `npm ci` works (lockfile already fixed).

---

## 4. Phase 1 — Host role & self-service onboarding (detailed)

### 4.1 Schema changes

#### `User.host` subdocument (new; `backend/src/models/User.ts` + `env.config.ts` + `bookcars-types`)

```ts
// bookcars-types
export enum HostStatus {
  Pending = 'pending',      // application submitted, awaiting admin review
  Approved = 'approved',    // live host — cars may be listed
  Rejected = 'rejected',    // rejected with reason; user may edit & resubmit
  Suspended = 'suspended',  // approved host disabled by admin; cars auto-suspended
}

// mongoose (all fields inside `host`; absence of `host` = not a host)
host: {
  status: { type: String, enum: Object.values(HostStatus), index: true },
  appliedAt: Date,

  // personal / legal data (Croatian context)
  address: { type: String, trim: true },
  city: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  countryCode: { type: String, default: 'HR', lowercase: true, minlength: 2, maxlength: 2 },
  oib: { type: String, trim: true, validate: /^\d{11}$/ },   // reuses top-level pattern; see note below

  // payouts
  iban: { type: String, trim: true, uppercase: true, validate: <IBAN mod-97 check> },
  swiftBic: { type: String, trim: true, uppercase: true },
  bankAccountHolder: { type: String, trim: true },

  // revenue share (defaults applied from Setting at booking time when unset)
  commissionPct: { type: Number, min: 0, max: 100 },          // per-host override, e.g. 35
  guaranteedMonthlyMinimum: { type: Number, min: 0 },         // EUR; 0/unset = none
  contractNumber: { type: String, trim: true },               // internal lease-contract ref

  // documents (filenames in CDN_HOST_DOCUMENTS, temp-then-move pattern)
  idDocFront: String,
  idDocBack: String,

  // review trail
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  rejectionReason: { type: String, trim: true },
  suspendedAt: Date,
  notes: { type: String, trim: true },                        // admin-only free text
}
```

Notes:

- The prior fork added top-level `iban/swiftBic/bankAccountHolder/oib/company*` fields to
  `User` for the aggregator model. They are dormant (nothing writes them). We keep them
  for legacy suppliers but host data lives under `host.*` so a user's host profile is one
  self-contained, easily-guarded object (stripped from all public API responses; only the
  owner and admins ever receive it).
- The **vehicle registration document (prometna dozvola) belongs to the Car**, not the host
  (a host has one ID but N vehicles) — it arrives in Phase 2 as `Car.registrationDocument`.
  The onboarding wizard's final step points the approved host at "add your first car".
- `commissionPct` unset ⇒ global default from `Setting.platformCommissionPct` (Phase 3;
  the field exists from Phase 1 so admins can set overrides during approval).

#### `Setting` additions (Phase 1 minimal)

```ts
platformCommissionPct: { type: Number, default: 35, min: 0, max: 100 },
```

(Platform legal identity fields for agreements — name, OIB, address, court registry — come
with Phase 4.)

#### New CDN storage (env.config + app bootstrap + .env examples)

```
CDN_HOST_DOCUMENTS       /cdn/bookcars/host-documents        (ID docs; NOT publicly served — see 4.4)
CDN_TEMP_HOST_DOCUMENTS  /cdn/bookcars/temp/host-documents
```

#### `bookcars-types` additions

`HostStatus` enum; `HostProfile` interface; payloads: `ApplyToHostPayload`,
`UpdateHostApplicationPayload`, `ReviewHostApplicationPayload { status, rejectionReason?,
commissionPct?, guaranteedMonthlyMinimum?, contractNumber? }`, `GetHostsPayload`
(admin list filter). `User` interface gains optional `host?: HostProfile` (admin/self only).

### 4.2 Backend API (new `hostController` + routes, following existing conventions)

| Method & route | Auth | Purpose |
|---|---|---|
| `POST /api/apply-to-host` | frontend token | Create/replace own `host` subdoc with `status=pending` (re-apply allowed from `rejected`) |
| `GET /api/host-application` | frontend token | Own host profile (owner-scoped) |
| `PUT /api/update-host-application` | frontend token | Edit while `pending`/`rejected` |
| `POST /api/create-host-document/:type` | frontend token | Temp upload (`idFront`/`idBack`), multer, images+PDF, size-capped |
| `POST /api/delete-temp-host-document/:file` | frontend token | Cleanup |
| `GET /api/host-document/:userId/:file` | owner or admin | **Streamed** document download (not static CDN; see 4.4) |
| `POST /api/hosts/:page/:size` | admin only | Paginated host list, filter by status/keyword (approval queue = `status=pending`) |
| `GET /api/host/:id` | admin only | Full host profile for review |
| `POST /api/review-host/:id` | admin only | Approve / reject (+reason) / suspend / reactivate; sets commission override & contract fields; sends email + in-app notification in user's language |

Notifications/emails (all four backend languages en/fr/es/hr): application received (to
user), new application (to admin, reusing `notifyAdminOnNewCar`-style admin lookup),
approved / rejected / suspended (to user).

### 4.3 Authorization layer (new `backend/src/middlewares/authorize.ts`)

Minimal, additive, and applied to **new** routes (plus the two worst existing holes):

```ts
requireAdmin        // 403 unless token user type=admin
requireSelf(param)  // 403 unless :param/body id === token user id, or admin
```

- All new admin endpoints above use `requireAdmin`; own-profile endpoints derive the user
  from the **token**, never from a client-supplied id.
- Fix §1.3(1): `/api/admin-sign-up` gated behind `env.ADMIN_SIGNUP_ENABLED` (default false;
  documented for initial setup).
- Fix §1.3(2): `userController.update` — only admins may change `type`/`blacklisted`/
  `payLater`; non-admins may only update their own record (id from token).
- The broader per-supplier scoping rework (§1.3 items 3–5) is **not** attempted in Phase 1;
  hosts never receive admin-origin tokens, so the existing surface is unchanged for them.

### 4.4 Host ID documents are private

Existing CDN dirs are served statically (`/cdn/...`) — fine for car photos/avatars, wrong
for identity documents. `CDN_HOST_DOCUMENTS` is created **outside** the statically-served
root and documents are streamed through the authenticated
`GET /api/host-document/...` endpoint (owner/admin only). Filenames remain
`nanoid()`-based. (Phase 5 applies the same treatment to renter ID documents; the existing
public `CDN_LICENSES` behavior for legacy single-file licenses is unchanged until then.)

### 4.5 Frontend (renter app) — host portal entry

New pages (each with `src/lang/*.ts` strings in en/fr/es/hr):

- **`/become-a-host`** (`BecomeAHost.tsx`) — public landing: how it works, revenue split,
  requirements (docs needed), CTA → sign in/up → wizard.
- **`/host/apply`** (`HostApplication.tsx`, `<Layout strict>`) — 3-step wizard
  (MUI Stepper, zod + react-hook-form per step, matching existing form conventions):
  1. Personal & legal data (name/phone prefilled from account; address, city, postal code,
     OIB with checksum validation)
  2. Payouts (IBAN with mod-97 validation — `HR76…` format hint, SWIFT/BIC, account holder)
  3. Documents (ID front/back upload via new `HostDocument` component copying
     `DriverLicense.tsx` patterns) + consent checkbox (host terms) → submit
  Status view when already applied: pending (info), rejected (reason + edit & resubmit),
  approved (→ host dashboard), suspended (contact support).
- **Header/menu**: "Become a host" for plain users; "Host dashboard" for hosts
  (dashboard itself is a stub in Phase 1: application status + "add your first car" teaser;
  becomes real in Phase 2/3).

### 4.6 Admin panel

- **`/hosts`** (`Hosts.tsx`) — list with status filter chips (default: Pending),
  keyword search, paginated like `Users.tsx`.
- **`/host?u=<id>`** (`Host.tsx`) — application detail: personal data, IBAN/OIB, inline
  document viewer (streamed), approve / reject-with-reason / suspend / reactivate actions,
  commission override + guaranteed minimum + contract number inputs, admin notes.
- Header badge/nav entry for pending applications count.
- All calls via new `admin/src/services/HostService.ts`.

### 4.7 i18n groundwork (done in Phase 1 because first user-visible feature)

- Register `hr` in **frontend** `env.config.ts` `LANGUAGES` (label "Hrvatski", countryCode
  `hr`) — all 39 frontend lang files already contain hr blocks; this one missing registry
  entry is why Croatian is unselectable today. Same two-line activation for **mobile**
  (`hr.ts` is complete there too).
- **Admin** panel: register `hr` and add hr blocks to the admin lang files Phase 1
  touches (admin currently has zero Croatian; the full backfill of all existing admin
  strings is Phase 6).
- All new lang files (frontend + admin) ship en/fr/es/hr from the start.

### 4.8 Migration / compatibility

- Purely additive: no existing document changes shape; users without `host` behave exactly
  as before; suppliers untouched.
- No data migration needed. `databaseHelper.initialize` gains no new collections in
  Phase 1 (subdocument only); index on `host.status` created via schema.
- Seeder: none required (approval flow starts empty).

### 4.9 Tests (backend `__tests__/host.test.ts`, following `supplier.test.ts` style)

Apply → pending; duplicate apply guarded; document upload/move lifecycle; admin list
filters; approve sets fields + notification; reject + resubmit; suspend; authorization
(user cannot review, cannot read others' applications/documents; admin can).

---

## 5. Later phases — condensed design (full detail before each phase starts)

### Phase 2 — Vehicle listing by hosts
- `Car` additions: `status` enum (`draft|pending_review|active|suspended|rejected`; existing
  cars migrated `available→active / !available→suspended`; `available` becomes derived:
  kept in sync on every status transition so all existing search pipelines keep working
  unchanged), `make`, `model`, `year`, `registrationDocument` (prometna dozvola file,
  private-streamed like host docs), `minRentalDays`/`maxRentalDays`, `host-owned` implied
  by `supplier` pointing at a host user.
- `CarUnavailability` collection `{ car, from, to, reason }` + checkout/search overlap
  checks alongside existing booking-overlap logic; host calendar UI (MUI date range).
- Frontend host portal: My vehicles (list + status chips), add/edit wizard (specs, plate,
  photos → existing car-image endpoints, location, price/day, deposit, min/max days,
  availability calendar), submit-for-review action.
- Admin: vehicle review queue (pending_review), approve→active / reject-with-reason;
  suspend. Existing admin car pages gain status control; supplier-owned cars default active.
- Search integration: extend the 4 supplier aggregations with approved hosts (D1 cost);
  host cars indistinguishable from supplier cars downstream.
- New-car admin notification reuses existing `NEW_CAR_NOTIFICATION` flow.

### Phase 3 — Revenue share & payouts
- `Setting.platformCommissionPct` (from Phase 1) + admin Settings UI field.
- Ledger repair: rename semantics to P2P (gross / platformFee / hostShare), create entries
  on **all** completed-payment paths (Stripe session confirm, Stripe intent, PayPal
  capture, admin marking payLater bookings paid), idempotent per booking (unique index —
  registered in `databaseHelper`), drop tier logic, commission resolution:
  `host.commissionPct ?? Setting.platformCommissionPct`.
- Cancellation handling: entry voided when booking→cancelled before period close.
- `Payout` collection: `{ host, year, month, entries[], grossTotal, feeTotal, shareTotal,
  guaranteedMinimum, amount = max(shareTotal, guaranteedMinimum), status
  pending|approved|paid, paidAt, reference, statementFile }`.
- Statement generation (pdfkit, HR/EN): bookings list, gross, commission, net, minimum
  top-up line; monthly close endpoint + on-demand regeneration; stored in new private CDN
  dir; downloadable by host (frontend) + admin.
- Admin payout dashboard: month picker, per-host rows, mark-as-paid, **SEPA CSV export**
  (`IBAN;amount;reference;name` — bank-upload compatible, UTF-8, semicolon-delimited).
- Host portal: earnings page (per-month summary + statement downloads).
- **Server-side price recomputation at checkout** (currently the backend trusts the
  client-sent price — untenable once third parties are paid from it).

### Phase 4 — Rental agreement generation
- `Booking.agreement { file, language, generatedAt }`; generation on transition into
  paid/reserved (and payLater confirmation), template placeholders: platform legal data
  (from `Setting`), renter data, host's vehicle data (make/model/year/plate), dates,
  price breakdown, deposit, insurance options, terms; HR + EN templates
  (`backend/src/utils/agreementHelper.ts`, pdfkit, DejaVu font for č/ć/đ/š/ž).
- Private storage + streamed download endpoints; buttons in admin `UpdateBooking` and
  frontend `Booking` page; attached to confirmation email (existing contract-attachment
  pattern in `bookingController.confirm`).

### Phase 5 — Renter verification
- `User.documents { licenseFront, licenseBack, idFront, idBack }` +
  `User.verification { status: none|pending|approved|rejected, method: 'manual',
  reviewedBy, reviewedAt, rejectionReason }`; provider-pluggable:
  `verificationProviders/{index,manualProvider}.ts` interface (`submit`, `getStatus`,
  webhook stub) so a KYC vendor can replace `manualProvider` later.
- Frontend: verification section in Settings + checkout gate ("verify before first
  booking") replacing/extending the per-supplier `licenseRequired` gate for host cars.
- Admin: verification queue + document viewer + approve/reject.
- Existing single-file `User.license` kept working; migration maps it to `licenseFront`.

### Phase 6 — Docs & polish
- `docs/p2p-model.md` (data model + flows, as required).
- Full `hr` sweep: backfill Croatian across all existing **admin** lang files (frontend,
  mobile and backend are already complete once registered); add a key-set diff script so
  missing translations fail lint.
- Mobile host-feature parity decision (recommendation: mobile stays renter-only in v1 —
  the host portal is web).
- Test pass across workspaces, README update.

---

## 6. Open questions (answers change details, not the Phase 1 schema)

1. **Public visibility of hosts:** should approved hosts appear on the public "Suppliers"
   page and search filter with their personal name (Turo-style "hosted by Ivan"), or
   should host cars appear under the platform brand only? (Plan assumes: visible, first
   name + photo.)
2. **Pay-later for host cars:** disable (recommended — platform can't guarantee cash
   collection for hosts) or allow per-host?
3. **Guaranteed minimum scope:** per host (plan assumes) or per vehicle?
4. **Mobile app:** renter-only for v1 (plan assumes) or host features too?
5. **Docs required at onboarding:** ID front+back only (plan), or also proof of bank
   account ownership / selfie?

---

## 7. Suggested review order

Phase 0 and Phase 1 land as separate PRs (stabilization is reviewable on its own and
unblocks CI). Phase 1 splits into: (a) schema + types + backend + tests, (b) frontend
wizard, (c) admin queue, (d) i18n registration — reviewable independently but shipped
together behind no flag (the feature is inert until a user applies).
