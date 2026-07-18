# P2P Model — Data Model & Flows

This document describes the peer-to-peer (Turo-style) extensions to BookCars for the
Croatian market. The operating company is the legal rental operator (merchant of
record); private car owners ("hosts") lease their vehicles to the platform and receive
a revenue share.

Implementation status by phase is tracked in [`docs/p2p/PLAN.md`](p2p/PLAN.md).
This document describes what is **implemented**; sections for later phases are marked
*(planned)*.

---

## Roles

| Role | Data representation | App |
|---|---|---|
| Renter | `User` with `type: 'user'` | frontend + mobile |
| **Host** | `User` with `type: 'user'` **and a `host` subdocument** | frontend (host portal) |
| Supplier (legacy) | `User` with `type: 'supplier'` | admin panel |
| Admin | `User` with `type: 'admin'` | admin panel |

Hosts deliberately stay `user`-type accounts:

- the frontend (where the host portal lives) only signs in `user`-type accounts;
- admin-origin API access is granted to `admin`/`supplier` tokens — self-registered
  hosts must never receive it;
- `Car.supplier`, `Booking.supplier` and the commission ledger reference plain `User`
  ids, so an approved host can own cars without any change to the booking machinery.

Existing suppliers are untouched by the P2P extension.

## Host data model (Phase 1 — implemented)

`User.host` subdocument (absence = the user never applied):

```
host: {
  status: 'pending' | 'approved' | 'rejected' | 'suspended'   // indexed
  appliedAt: Date

  // personal / legal
  address, city, postalCode: string
  countryCode: string        // ISO 3166-1 alpha-2, default 'HR'
  oib: string                // Croatian tax number, 11 digits, ISO 7064 MOD 11,10 checksum

  // payouts
  iban: string               // validated (mod-97)
  swiftBic?: string
  bankAccountHolder: string

  // revenue share (used by the ledger in Phase 3)
  commissionPct?: number             // per-host override; unset -> Setting.platformCommissionPct
  guaranteedMonthlyMinimum?: number  // EUR; if monthly revenue share < minimum, payout = minimum
  contractNumber?: string            // internal lease-contract reference

  // identity documents (filenames; see storage below)
  idDocFront, idDocBack: string

  // review trail
  reviewedBy?: ObjectId -> User
  reviewedAt?: Date
  rejectionReason?: string
  suspendedAt?: Date
  notes?: string             // admin-only
}
```

`Setting.platformCommissionPct` (default **35**) is the global platform commission
applied when a host has no override. Editable in the admin Settings page.

### Document storage

Identity documents are **not** served from the public CDN. They are stored in
`BC_CDN_HOST_DOCUMENTS` (default `/var/www/private/bookcars/host-documents`), outside
the statically-served CDN root, and streamed through an authenticated endpoint that
only the owner or an admin can call. Uploads follow the standard BookCars
temp-then-move pattern (`BC_CDN_TEMP_HOST_DOCUMENTS` → moved on application submit).

## Host onboarding flow (Phase 1 — implemented)

```
renter (user account)
  └─ /become-a-host (public landing)
       └─ /host — 3-step wizard (strict: signed-in only)
            1. personal data (address, city, postal code, OIB — checksum-validated)
            2. payouts (IBAN mod-97, SWIFT/BIC, account holder)
            3. ID document front/back upload + host-terms consent
            └─ POST /api/apply-to-host   → host.status = 'pending'
                 ├─ email to applicant (their language: en/fr/es/hr)
                 └─ in-app notification + email to admin → /host?u=<id>

admin (admin panel)
  └─ /hosts — queue (status filter, default Pending; search; pagination)
       └─ /host?u=<id> — review page
            ├─ view data + stream ID documents
            ├─ set commission override / guaranteed minimum / contract number / notes
            ├─ approve  → host.status = 'approved'   (+ email/notification to host)
            ├─ reject   → host.status = 'rejected' + reason (host may edit & resubmit)
            ├─ suspend  → host.status = 'suspended' (from approved)
            └─ reactivate → 'approved'
```

State machine: `pending → approved | rejected`; `rejected → pending` (re-apply);
`approved ⇄ suspended`. Applications can be edited while `pending`. Admin-managed
contract fields survive re-application.

### API endpoints (Phase 1)

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/apply-to-host` | token (self) | create / re-submit application |
| `GET /api/host-application` | token (self) | own host profile |
| `POST /api/create-host-document/:type` | token | temp upload (`idFront`/`idBack`) |
| `POST /api/delete-temp-host-document/:type/:file` | token | temp cleanup |
| `GET /api/host-document/:userId/:type` | owner or admin | stream identity document |
| `POST /api/hosts/:page/:size` | admin | paginated host list (status filter, keyword) |
| `GET /api/host/:id` | admin | host detail |
| `POST /api/review-host/:id` | admin | approve / reject / suspend / reactivate |

Admin-only endpoints use the `authJwt.authAdmin` middleware; self-scoped endpoints
derive the user from the token, never from a client-supplied id.

## Vehicle listing by hosts (Phase 2 — implemented)

### Car data model extensions

```
Car {
  ...existing BookCars fields...
  status: 'draft' | 'pendingReview' | 'active' | 'rejected' | 'suspended'
                              // indexed; default 'active' so classic supplier cars are untouched.
                              // `available` is kept in sync with status for host cars, so every
                              // existing search pipeline keeps working unchanged.
  hostCar: boolean            // true when listed by a host through the portal
  make, carModel: string      // structured identity (name = "<make> <carModel> <year>")
  year: number
  minRentalDays?, maxRentalDays?: number   // enforced in search AND checkout
  registrationDocument?: string            // prometna dozvola — PRIVATE storage, streamed to owner/admin
  images?: string[]           // extra photos beyond the main `image` (for review/detail)
  rejectionReason?: string
}

CarUnavailability { car -> Car, from, to, reason? }   // host-blocked date ranges
```

Existing cars are migrated by `backend/scripts/migrate-p2p.ts` (idempotent:
`available -> active`, `!available -> suspended`, `hostCar=false`).

### Vehicle lifecycle

```
host creates draft ──edit──> draft ──submit (requires photo + prometna dozvola)──> pendingReview
pendingReview ──admin approve──> active (available=true, searchable)
pendingReview ──admin reject + reason──> rejected ──host fixes & resubmits──> pendingReview
active ⇄ suspended (admin; also cascaded when the host is suspended —
                    host reactivation does NOT auto-relist cars)
```

Host-car platform defaults: free cancellation, no per-car insurance upsells
(amendments/theft protection/CDW/full insurance/additional driver unavailable),
`blockOnPay=true`, minimum driver age from platform config.

### Availability & booking guards

Search (`getFrontendSuppliers` / `getFrontendCars`) excludes cars whose
`CarUnavailability` periods overlap the requested rental window and cars whose
`minRentalDays`/`maxRentalDays` don't fit the requested duration. Checkout
re-validates server-side: car `available`, min/max days, unavailability overlap,
plus a hard double-booking check for host cars (paid/reserved/deposit overlap).

### API endpoints (Phase 2)

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/create-host-car` | approved host | create draft |
| `PUT /api/update-host-car` | approved host (own car) | edit |
| `POST /api/submit-host-car/:id` | approved host (own car) | draft/rejected → pendingReview (+ admin notification) |
| `POST /api/delete-host-car/:id` | approved host (own car) | delete (only without bookings) |
| `GET /api/host-car/:id`, `POST /api/host-cars/:page/:size` | host (own) | detail / list |
| `POST /api/create-host-car-image`, `POST /api/delete-temp-host-car-image/:image` | approved host | photo temp uploads |
| `GET /api/car-registration-document/:carId` | owner or admin | stream prometna dozvola |
| `POST /api/create-car-unavailability`, `POST /api/delete-car-unavailability/:id`, `GET /api/car-unavailabilities/:carId` | owner or admin | availability calendar |
| `POST /api/admin-host-cars/:page/:size` | admin | review queue (status filter) |
| `POST /api/review-host-car/:id` | admin | approve / reject-with-reason / suspend / reactivate (+ host notification) |

### UI

- **Frontend host portal**: `/host/cars` (vehicle list with status chips and
  rejection reasons), `/host/car` (create/edit form — specs, plate, locations,
  pricing, min/max days, main photo + gallery, prometna dozvola upload — plus
  the availability calendar with blocked periods on saved cars).
- **Admin**: `/host-cars` review queue (defaults to Pending review; status
  filter, search, photo/registration viewing, approve/reject/suspend inline).

### Search integration

Supplier list endpoints include approved hosts (`type: 'supplier'` OR
`host.status: 'approved'`; the admin variant also includes suspended hosts so
their cars remain manageable). The car search pipelines already join owners by
id, so active host cars flow through search, checkout and booking machinery
without further changes.

## Revenue share & payouts (Phase 3 — implemented)

### Ledger

Every completed payment creates exactly one ledger entry (`CommissionTransaction`,
unique per booking) recording gross amount, platform fee and host share:

- **Commission resolution:** `host.commissionPct` (per-host override, set by the
  admin on the host review page) → legacy per-supplier `commissionPercentage`
  (classic suppliers) → `Setting.platformCommissionPct` (global default 35, editable
  in admin Settings).
- **Creation points:** Stripe payment-intent checkout, Stripe session confirmation,
  PayPal capture, and admin marking a pay-later booking Paid/PaidInFull
  (update/updateStatus transitions). Idempotent — re-firing never duplicates.
- **Cancellation:** transitions into Cancelled/Void set the entry to `voided`
  unless it was already paid out (paid entries stay; refunds are a manual admin
  process). Re-paying restores a voided entry.
- Entries carry `hostCar` (revenue share applies) and a `payout` reference once
  settled.

### Checkout hardening

The backend recomputes the booking price from the database car (including
date-based/seasonal prices, tiered day pricing and options) and rejects
client-sent prices outside tolerance — required once third parties are paid
a share of the price.

### Monthly payouts

`Payout` — one per host per month (unique `{host, year, month}`):

```
{ host, year, month, entries[], bookingsCount,
  grossTotal, commissionTotal, shareTotal,
  guaranteedMinimum,                       // snapshot of host.guaranteedMonthlyMinimum
  amount = max(shareTotal, guaranteedMinimum),
  currency: 'EUR', status: pending | paid,
  paidAt, reference, statementFile }
```

`POST /api/generate-payouts/:year/:month` (admin) builds payouts for every host
with ledger entries in the month **and** every approved host with a guaranteed
monthly minimum — a host with zero bookings still receives the contractual
minimum. Regeneration is idempotent while pending and never touches paid payouts.
`POST /api/mark-payout-paid/:id` settles the payout and its ledger entries.

### Statements & SEPA export

- Statement PDFs are generated per payout in the host's language (Croatian or
  English) with bundled DejaVu Sans (č ć đ š ž render correctly), showing the
  booking list, gross/commission/share totals, the guaranteed minimum and the
  top-up line. Stored privately (`BC_CDN_STATEMENTS`), streamed to the owning
  host or an admin only.
- `GET /api/payouts-sepa/:year/:month` (admin) exports pending payouts as a
  SEPA-compatible CSV for bank upload: `IBAN;Amount;Reference;Name`
  (semicolon-delimited, UTF-8, CRLF).
- Payment reference: `<contractNumber>-<YYYYMM>` (fallback: host id suffix).

### UI

- **Admin `/payouts`**: month/year picker, generate button, per-host rows
  (bookings, gross, commission, share, minimum, amount, status), statement
  download, mark-as-paid dialog with bank reference, SEPA CSV export.
- **Frontend `/host/earnings`**: the host's monthly payout cards with totals,
  minimum top-up visibility, statement downloads; linked from the vehicle portal.

### Platform identity

`BC_PLATFORM_NAME/OIB/ADDRESS/CITY/ZIP/IBAN/EMAIL` env vars (centralized in
`env.config.ts`) identify the operating company on statements — and later on
rental agreements (Phase 4).

## Rental agreements (Phase 4 — implemented)

- `Booking.agreement { file, language, generatedAt }`; PDFs stored privately
  (`BC_CDN_AGREEMENTS`) and streamed via `GET /api/booking-agreement/:id`
  (admin, renter, or booking supplier). `POST /api/regenerate-agreement/:id`
  (admin) rebuilds it.
- Generated automatically on every confirmation path — checkout (pay-later and
  paid), Stripe session confirmation, PayPal capture, and admin status
  transitions into paid/paidInFull/deposit/reserved; regenerated when an admin
  edits a confirmed booking so the PDF always matches the booking.
- Croatian or English template by the renter's stored language (DejaVu Sans for
  diacritics): the **platform is the lessor** (hosts lease vehicles to the
  platform and are not a party to the renter agreement), renter data and
  additional driver, vehicle identity and plate, rental period with localized
  location names and timezone, price/deposit/options, payment state, standard
  terms, signature blocks.
- Attached to the booking confirmation email alongside the supplier contract.
- Download buttons: frontend Booking page (renter) and admin Update Booking
  (download + regenerate).

## Renter verification *(planned — Phase 5)*

- License front/back + ID upload, `User.verification` status, manual admin review
  queue, checkout gate; provider interface so a KYC vendor can be plugged in later.

## i18n

- Backend emails: en/fr/es/hr (recipient's stored language).
- Frontend and mobile: Croatian (`hr`) is registered and selectable; all frontend
  lang files carry hr blocks; date-fns/MUI locales wired for hr.
- Admin: new host pages ship en/fr/es/hr; the full admin Croatian backfill is
  scheduled for Phase 6 (until then `hr` is not selectable in the admin panel).
