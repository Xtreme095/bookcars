# 🚗 BookCars Croatian Car Rental Aggregator - Development Roadmap

**Version:** 1.0
**Last Updated:** 2024-12-24
**Target Market:** Croatia (Croatian language, EUR currency)
**Business Model:** Multi-supplier aggregator with commission-based revenue

---

## 📊 OVERVIEW

This roadmap outlines the development of BookCars from a standard car rental platform into a comprehensive Croatian car rental aggregator that includes standard vehicles and cargo transportation (vans, trucks).

**Timeline:** 6 months from start
**Primary Currency:** EUR (Croatia uses Euro since 2023)
**Primary Language:** Croatian (with EN, FR, ES support)

---

## ✅ IMPLEMENTATION STATUS

### Phase 1: Foundation (Months 1-2)
- [🟡] **1.1 Commission Management System** - P0 CRITICAL (80% - Backend complete, UI pending)
- [ ] **1.2 Cargo Vehicle Support** - P0 CRITICAL
- [ ] **1.3 EUR Currency Implementation** - P0 CRITICAL
- [ ] **1.4 Supplier Self-Registration Portal** - P1 HIGH

### Phase 2: User Experience (Months 3-4)
- [ ] **2.1 Review & Rating System** - P1 HIGH
- [ ] **2.2 Dynamic Pricing Engine** - P1 HIGH
- [ ] **2.3 Advanced Search & Filters** - P1 HIGH
- [ ] **2.4 Mobile App Enhancement** - P2 MEDIUM

### Phase 3: Growth & Optimization (Months 5-6)
- [ ] **3.1 Marketing & SEO** - P1 HIGH
- [ ] **3.2 Analytics Dashboard** - P2 MEDIUM
- [ ] **3.3 Performance Optimization** - P2 MEDIUM
- [ ] **3.4 Croatian Localization Polish** - P1 HIGH

### Phase 4: Launch & Scale (Month 6+)
- [ ] **4.1 Beta Testing** - P0 CRITICAL
- [ ] **4.2 Supplier Onboarding** - P0 CRITICAL
- [ ] **4.3 Go-to-Market** - P0 CRITICAL
- [ ] **4.4 Post-Launch Support** - P1 HIGH

---

## 📁 DOCUMENTATION STRUCTURE

Detailed documentation for each phase can be found in:
- `/docs/phase1/` - Foundation features
- `/docs/phase2/` - User experience features
- `/docs/phase3/` - Growth & optimization
- `/docs/phase4/` - Launch & scale

Each feature has its own detailed documentation file tracking:
- Implementation steps
- Database changes
- API endpoints
- Frontend components
- Testing requirements
- Completion status

---

## 🎯 PHASE 1: FOUNDATION

**Goal:** Build critical infrastructure for monetization and market differentiation

### 1.1 Commission Management System ⭐ CRITICAL
**Status:** 🟡 In Progress (80% complete)
**Priority:** P0
**Duration:** 2-3 weeks
**Dependencies:** None
**Backend:** ✅ Complete
**Admin UI:** 🔴 Not Started
**Testing:** 🔴 Not Started

**Purpose:** Platform revenue tracking and supplier payouts

**Key Features:**
- Commission calculation per booking
- Tiered commission rates (Basic 15%, Silver 12%, Gold 10%)
- Supplier revenue dashboard
- Admin payout management
- Croatian PDV (VAT 25%) handling
- Invoice generation
- Payment tracking (bank transfers)

**Documentation:** [docs/phase1/1.1-commission-management.md](docs/phase1/1.1-commission-management.md)

---

### 1.2 Cargo Vehicle Support ⭐ CRITICAL
**Status:** 🔴 Not Started
**Priority:** P0
**Duration:** 2 weeks
**Dependencies:** None

**Purpose:** Market differentiation - support vans, trucks, Fiat Ducato

**Key Features:**
- Cargo vehicle types (van small/medium/large, pickup, box truck, refrigerated)
- Volume (m³) and capacity (kg) specs
- Loading dimensions
- Special features (tail lift, refrigerated, partition)
- Driver included option
- Cargo insurance
- Dedicated cargo search filters

**Popular Models to Support:**
- Fiat Ducato (L1H1, L2H2, L3H2, L4H3)
- Mercedes Sprinter
- VW Transporter
- Box trucks
- Refrigerated vans

**Documentation:** [docs/phase1/1.2-cargo-vehicle-support.md](docs/phase1/1.2-cargo-vehicle-support.md)

---

### 1.3 EUR Currency Implementation ⭐ CRITICAL
**Status:** 🔴 Not Started
**Priority:** P0
**Duration:** 3 days
**Dependencies:** None

**Purpose:** Croatia uses EUR since 2023, not HRK

**Key Changes:**
- Default currency: EUR
- Currency formatting: Croatian locale (hr-HR)
- Stripe/PayPal: EUR
- All prices in EUR
- VAT rate: 25% (Croatian PDV)
- Remove HRK references

**Documentation:** [docs/phase1/1.3-eur-currency.md](docs/phase1/1.3-eur-currency.md)

---

### 1.4 Supplier Self-Registration Portal
**Status:** 🔴 Not Started
**Priority:** P1
**Duration:** 2 weeks
**Dependencies:** Commission system

**Purpose:** Scale supplier acquisition without manual work

**Key Features:**
- Public "Become a Partner" landing page
- Multi-step registration wizard
- Document upload (OIB certificate, company registration, ID, bank statement)
- OIB validation (Croatian tax ID)
- Admin approval workflow
- Automated account creation
- Email notifications
- Tiered pricing presentation

**Documentation:** [docs/phase1/1.4-supplier-registration.md](docs/phase1/1.4-supplier-registration.md)

---

## 📝 CHANGE LOG

### 2024-12-24 (Update 2)
- ✅ Commission Management System backend 80% complete
- ✅ Created all database models and controllers
- ✅ Integrated commission creation with booking flow
- ✅ Implemented automatic tier upgrades
- ✅ Ready for Admin UI development

### 2024-12-24 (Update 1)
- Initial roadmap created
- Phase 1 planning complete
- Detailed documentation for all Phase 1 features created
- Started implementation

---

## 🔗 RELATED DOCUMENTS

- [Technical Architecture](docs/ARCHITECTURE.md) *(to be created)*
- [Database Schema](docs/DATABASE_SCHEMA.md) *(to be created)*
- [API Documentation](docs/API.md) *(to be created)*
- [Croatian Translation Guide](docs/CROATIAN_TRANSLATION.md) *(to be created)*

---

## 📞 NOTES

**Critical Reminders:**
- Croatia uses EUR, not HRK (since January 1, 2023)
- Croatian VAT (PDV) is 25%
- OIB is 11-digit Croatian tax ID
- IBAN format for Croatian banks: HR + 19 digits
- All dates in Croatian format: DD.MM.YYYY

**Market Insights:**
- Focus on cargo vehicles is key differentiator
- Fiat Ducato extremely popular in Croatia
- Moving services (selidbe) is major use case
- Construction industry needs cargo vehicle rentals
- Tourism season: May-September (peak pricing)
