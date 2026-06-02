# WebTech Final — Skill-Share Workshop Platform

A full-stack workshop booking platform built as the final project for **Course 960121** (Spring 2026).

## Team

| Role | Member | Owns |
|------|--------|------|
| Lead Architect | Boypemt | Schema, transactions, JWT, `.env`, Go-Live Audit, `ARCHITECTURE.md` |
| Integration Engineer | phoo3011 | API endpoints, `fetch()` logic, 409 handling, JWT state, hydration |
| UX Engineer | farpinta | Workshop cards, capacity badges, "Book Seat" UX, debouncing, CSS |

## The Niche — Skill-Share Workshop

A marketplace for booking seats in **live online classes** (e.g., "Intro to AI", "Sourdough Bread Making", "Watercolor Basics"). Every workshop has a fixed `max_capacity`; once it's full, no more bookings.

### Architectural twist — Real-time seat reservation

During checkout, the server runs:

```
current_bookings + requested_qty <= max_capacity ?
   YES → 201 Created · increment booking count
   NO  → 409 Conflict · "Workshop full" with workshop_id
```

### Bonus Challenge (+3 pts) — A. Stock-Check Concurrency

The capacity check **and** the booking insert are wrapped in a single `BEGIN IMMEDIATE TRANSACTION` so that when two users click "Book" on the last seat at the same millisecond, only one wins and the other gets `409 Conflict` — not a corrupted overbooking.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript, Bootstrap 5.2.3 |
| Backend | Node.js, Express |
| Database | SQLite (via `sqlite3`, callback-based, Promise-wrapped) |
| Auth | bcrypt (salt rounds 10) + JWT (24h expiry) |
| Config | dotenv |

## Setup (Zero-Config)

```bash
git clone https://github.com/Boypemt/WebTechFinal.git
cd WebTechFinal
npm install
cp .env.example .env             # then fill in JWT_SECRET
node server/db/seed.js           # seed workshops + sample users
npm run dev                      # nodemon — auto-restarts on change
```

Open `http://localhost:3000/api/health` — should return `{ "success": true, "status": "ok" }`.

## Verify it works

Run these four checks on a fresh clone to confirm the server and seed data are healthy:

1. `GET http://localhost:3000/api/health` → `{ "success": true, "status": "ok" }`
2. `GET http://localhost:3000/api/workshops` → `{ "success": true, "count": 12, "data": [...] }`
3. `POST http://localhost:3000/api/login` body `{ "email": "alice@example.com", "password": "Password123!" }` → `200` with a JWT token
4. `POST http://localhost:3000/api/checkout` body `{ "items": [{ "id": 3, "quantity": 1 }], "email": "test@x.com", "card": "4242424242424242" }` → `409` with `{ "error": "Workshop full", "workshopId": 3 }` (niche-twist proof)

## Architectural Best Practices implemented

This project is the audited final form of every pattern taught in Sessions 1-10:

1. **Conventional Commits** & feature branches (`feat:`, `fix:`, `chore:`, `docs:`)
2. **Dynamic UI** rendered from `/api/workshops` — zero hard-coded content
3. **Event Delegation** on `#catalog` + **300ms debounce** on search input
4. **Single Source of Truth** — `cart[]` in `localStorage` with serialization
5. **Auth Architecture** — bcrypt hashing + stateless JWT, no plain-text passwords
6. **The Gatekeeper Pattern** — server re-validates prices and capacity before any insert
7. **Relational Integrity** — PK/FK constraints, `ON DELETE RESTRICT` on historical rows
8. **Parameterized Queries** — every SQL statement uses `?` placeholders, no concatenation
9. **Controller-Route-Service** separation, with a dedicated Repository layer for SQL
10. **Zero-Config + .env** — no secrets in source, project boots on any machine

## Visual Proof

![Bonus A — race condition fix](docs/screenshots/race-fix-day7.png)
Two simultaneous "last-seat" bookings; one 201, one 409.

![Niche twist — sold-out workshop](docs/screenshots/checkout-409.png)
Capacity check returns 409 with workshopId.

![PCI-DSS card masking](docs/screenshots/sqlite-orders-table.png)
Only card_last4 is stored; full PAN never persisted.

![Login + JWT](docs/screenshots/login-success.png)
bcrypt + JWT 24h, payload decoded at jwt.io.

![Brute-force defense](docs/screenshots/rate-limit-429.png)
/api/login rate-limited to 5 attempts per 15 min per IP.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Why each pattern was chosen
- [docs/API.md](docs/API.md) — Full endpoint reference
- [docs/TESTING.md](docs/TESTING.md) — Manual test plan (all endpoints + race demo)
- [docs/AUDIT-FINDINGS.md](docs/AUDIT-FINDINGS.md) — Pre-deployment checklist (Day 8 audit)
- [docs/AUDIT-RED-TEAM.md](docs/AUDIT-RED-TEAM.md) — Red-team findings on checkout flow
- [docs/diagrams/erd.jpg](docs/diagrams/erd.jpg) — Entity-Relationship Diagram
- [docs/diagrams/components.jpg](docs/diagrams/components.jpg) — Component Diagram

> **Bonus Challenge A (+3 pts) — Stock-Check Concurrency:**
> Implemented via `BEGIN IMMEDIATE TRANSACTION` in `server/services/checkoutService.js`.
> Verified with two-tab race test; see screenshots.

## License

Educational project — Course 960121, Spring 2026.
