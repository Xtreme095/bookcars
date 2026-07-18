# Launch Checklist

Status of the remaining work between the current branch and a live platform.
Code work is done (Phases 0–6 + post-review fixes); everything below is either
an owner action, an infrastructure step, or a business/legal prerequisite.

## Owner actions (noted 2026-07-18)

- [ ] **Run the backend test suite** — planned on the laptop with Claude Code.
  Requires a local MongoDB (`backend/.env` → `BC_DB_URI`), then `npm test` in
  `backend/`. This is the first real execution of the whole suite (the remote
  session had no database); expect a possible small fixup pass.
- [ ] **Review the branch / merge to main** — deferred by owner.
- [ ] **Replace placeholder content** — ToS, About and Pricing pages are
  upstream BookCars boilerplate in all four languages. Have a Croatian lawyer
  review the rental agreement and payout statement wording
  (`backend/src/utils/agreementHelper.ts`, `statementHelper.ts`).
- [ ] **Proofread Croatian translations** — all hr strings were machine-written;
  a native speaker should review frontend, admin, mobile and backend email
  strings.

## Deferred to a later pass (noted 2026-07-18)

- [ ] **Staging end-to-end rehearsal** — full lifecycle on a staging server:
  host applies → admin approves → host lists a car → admin approves → renter
  uploads documents → admin approves → renter books and pays (Stripe test
  mode) → agreement PDF arrives by email → close the month → generate payouts
  → download the SEPA CSV → **import it into the actual bank portal** (banks
  are strict about pain formats — test this before go-live).
- [ ] **Live payment wiring** — Stripe/PayPal production accounts, live API
  keys, webhook endpoints pointed at the production API.

## Deployment steps

- [ ] Server + MongoDB (docker-compose files are in the repo root)
- [ ] Set env vars from `backend/.env.example`: `BC_CDN_HOST_DOCUMENTS`,
  `BC_CDN_TEMP_HOST_DOCUMENTS`, `BC_CDN_STATEMENTS`, `BC_CDN_AGREEMENTS`,
  `BC_PLATFORM_NAME/OIB/ADDRESS/CITY/ZIP/IBAN/EMAIL` (real company data —
  printed on statements and agreements), `BC_VERIFICATION_PROVIDER=manual`
- [ ] Run `backend/scripts/migrate-p2p.ts` once after deploying
- [ ] Create the private document directories **and add them to backups**
  (identity documents, agreements and statements exist nowhere else)
- [ ] Seed Croatia as a country + pickup locations in the admin panel
- [ ] SMTP provider with SPF/DKIM so notification emails reach inboxes
- [ ] Create the admin account (self-signup is disabled)
- [ ] Mobile app: set `BC_API_HOST`, build with Expo/EAS, store accounts

## Business / legal gate (owner)

- [ ] Rent-a-car operator registration (the platform is the legal operator and
  lessor on every rental agreement)
- [ ] Insurance arrangement for host vehicles (casco/liability — the platform
  rents them out, so the coverage model must be agreed with hosts' insurers or
  a fleet policy)
- [ ] The actual platform ↔ host lease contract (the app stores a contract
  number per host; the contract document itself is drafted offline)
- [ ] Invoicing / fiscalization (fiskalizacija) — the app does not issue
  invoices; agree the invoicing + PDV handling with an accountant (manual
  invoicing is acceptable to start, but decide it explicitly)
- [ ] Privacy policy incl. retention period for identity documents

## Decisions recorded

- **Pay-later replaced by pay-at-host** (2026-07-18): host cars offer "pay at
  the host's location at pickup" (web + mobile) alongside online payment.
  Money flow: the host collects the amount on the platform's behalf at
  handover; the admin marks the booking Paid once settled, which creates the
  ledger entry, and the host's share is then included in the monthly payout.
  Net settlement (host keeps the share, remits the commission) would need a
  ledger extension — revisit if cash handling becomes painful.
- **Monthly payout run stays manual** (2026-07-18): admin generates payouts
  per month from the Payouts dashboard. Can be automated with a cron later.
- **Mobile is renter-complete** (2026-07-18): verification upload, host-car
  booking and pay-at-host all work in the mobile app; the host portal and
  admin panel remain web-only.

## Open product question

- **Host public visibility** — hosts currently appear like suppliers (name +
  avatar) in search results and filters. Decide whether host cars should
  instead appear under the platform brand only.
