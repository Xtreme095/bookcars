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

## Revenue share & payouts *(planned — Phase 3)*

- Per completed booking, a ledger entry (repaired `CommissionTransaction`) records
  gross amount, platform fee and host share; commission resolution:
  `host.commissionPct ?? Setting.platformCommissionPct`.
- Monthly `Payout` per host: gross, fee, share, guaranteed-minimum top-up,
  `amount = max(share, guaranteedMonthlyMinimum)`, statement PDF (HR/EN),
  admin dashboard with mark-as-paid and SEPA-compatible CSV export
  (`IBAN;amount;reference;name`).

## Rental agreements *(planned — Phase 4)*

- PDF generated on booking confirmation (pdfkit, HR/EN templates), stored with the
  booking, downloadable by admin and renter; platform named as lessor.

## Renter verification *(planned — Phase 5)*

- License front/back + ID upload, `User.verification` status, manual admin review
  queue, checkout gate; provider interface so a KYC vendor can be plugged in later.

## i18n

- Backend emails: en/fr/es/hr (recipient's stored language).
- Frontend and mobile: Croatian (`hr`) is registered and selectable; all frontend
  lang files carry hr blocks; date-fns/MUI locales wired for hr.
- Admin: new host pages ship en/fr/es/hr; the full admin Croatian backfill is
  scheduled for Phase 6 (until then `hr` is not selectable in the admin panel).
