# Code Review Preparation

> Personal study reference for Boypemt (Lead Architect) ahead of the final-project code review for Course 960121.
> Read this once before the review. Skim it during the 5-minute warm-up.

---

## 1. The 30-second elevator pitch (memorize)

> "Skill-Share Workshop booking platform. Three-person team. We picked **Niche #4** — capacity-based `409 Conflict` — and **Bonus Challenge A** — `BEGIN IMMEDIATE TRANSACTION` to close the TOCTOU race window. The niche twist and the bonus are the same code pattern, so the +3 bonus came from one focused change.
>
> Stack: Node.js + Express backend with SQLite, bcrypt + JWT auth, vanilla-JS frontend. The backend uses a strict 4-layer split — Route → Controller → Service → Repository — so a schema change can never break a business rule and vice versa. All secrets in `.env`, fail-fast on missing JWT_SECRET, Helmet + login rate limiter for production readiness."

---

## 2. What you built (Lead Architect contributions)

| Layer | Files you own | What it does |
|---|---|---|
| **Schema** | `server/db/schema.sql` | 4 normalized tables with FK + CHECK constraints that block over-booking at the DB level |
| **Connection** | `server/db/index.js` | SQLite + Promise wrappers (`allAsync`, `getAsync`, `runAsync`), `PRAGMA foreign_keys = ON` |
| **Seed** | `server/db/seed.js` | 12 workshops + 3 bcrypt-hashed test users, idempotent re-runs |
| **API endpoints** | `server/routes/*` + `server/controllers/*` | `/api/workshops`, `/api/workshops/:id`, `/api/register`, `/api/login`, `/api/checkout` |
| **Business logic** | `server/services/*` | Re-pricing (Gatekeeper), capacity check, bcrypt, JWT, PCI-DSS card masking |
| **Repository** | `server/repositories/*` | All SQL — parameterized queries only, raw rows in/out |
| **Security middleware** | `server/middleware/*` | Optional auth, Helmet, login rate limiter, request IDs |
| **Bonus A** | 15-line change in `checkoutService.js` | `BEGIN IMMEDIATE TRANSACTION` + `ROLLBACK` on throw |
| **Config** | `.env`, `.env.example`, fail-fast in `server/index.js` | Zero-Config startup, no hardcoded secrets |
| **Documentation** | `docs/ARCHITECTURE.md`, `API.md`, `TESTING.md`, `AUDIT-FINDINGS.md`, `AUDIT-RED-TEAM.md`, `FINAL-AUDIT.md`, `GIT-COLLABORATION.md` | The "why" doc, the contract, the test plan, three audit reports |
| **Diagrams** | `docs/diagrams/erd.jpg`, `components.jpg` | Hand-drawn ERD + Component Diagram with microservice cut line |

### What your teammates built (acknowledge this honestly)

- **P3 (UX Engineer)** — `public/index.html`, `public/login.html`, `public/register.html`, `public/checkout.html`, `public/css/` — all HTML/CSS, workshop card design, capacity badges, "Book Seat" UX
- **P2 (Integration Engineer)** — `public/js/api.js`, `auth.js`, `cart.js`, `catalog.js`, `login.js`, `checkout.js` — all `fetch()` calls, 409 toast handler, JWT in localStorage, cart persistence

---

## 3. Pre-review tab setup (5 minutes before)

Open these in this exact order:

1. **GitHub repo** — `https://github.com/Boypemt/WebTechFinal` on `main`, clean
2. **VS Code** with two files visible:
   - `server/services/checkoutService.js` (transaction is at lines ~25-50)
   - `docs/ARCHITECTURE.md` (the "why" doc)
3. **SQLite Viewer** on `store.db` → `orders` tab (PCI-DSS evidence: `card_last4 = "4242"`)
4. **Browser** at `http://127.0.0.1:5500/public/` with the catalog loaded
5. **Two extra browser tabs** with the race-condition fetch pre-pasted in DevTools Console — **don't run it until asked**
6. **Terminal** showing `git log --oneline -20` — Conventional Commits history

### Demo state to warm up first

```bash
npm install
npm run dev
```

In SQLite Viewer, set workshop `id=5` to `current_bookings = 11`, `max_capacity = 12` so there's exactly 1 seat left — the race demo is now armed.

---

## 4. The 5-question review script

### Q1 — "Tell me about your project."

Use the elevator pitch from section 1. **30 seconds**, no more.

### Q2 — "Walk me through the architecture."

Open `ARCHITECTURE.md`. Point at the Layered Architecture section.

> "Route maps URL to handler. Controller does HTTP — parses input, validates, sends response. Service has business rules — bcrypt, JWT, the capacity check, server-side re-pricing. Repository has all the SQL with `?` placeholders. The point of the split: a schema change touches only the Repository; a business-rule change touches only the Service; they never collide."

### Q3 — "Show me the bonus." (The highlight reel)

1. Switch to the two browser tabs with the pre-loaded race fetch
2. Press Enter in both tabs at the same instant
3. Show one tab returning **201**, the other returning **409**
4. Switch to SQLite Viewer, refresh — show `current_bookings = 12`, never `13`
5. Deliver this sentence verbatim:

> **"`BEGIN IMMEDIATE` acquires a RESERVED lock right away, so the second transaction blocks until the first commits. When it unblocks, its SELECT sees the post-COMMIT state, fails the capacity check, and ROLLBACKs into a 409. The fix is fifteen lines in `checkoutService.js`."**

### Q4 — The "Why?" questions (random order — see Section 5)

### Q5 — "What would you do differently with more time?"

A real, specific answer wins points. Pick **one** (NOT all):

- "Extract the Booking service into its own process with its own DB — the Component Diagram cut line is already drawn."
- "Add an integration test harness with two real processes to simulate the race condition — right now my race test is manual."
- "Move the frontend `BASE_URL` into a build-time config instead of a hardcoded localhost — fine for class, not fine for production."
- "Replace the simulated microservice call in checkout with a real circuit breaker so a Catalog outage can't cascade into Booking."

---

## 5. The 10 flashcard questions and answers

Practice each in 15-20 seconds, plain English.

| # | Question | Model answer |
|---|---|---|
| 1 | Why parameterized queries? | "To prevent SQL injection. If we concatenated user input into the query string, an attacker could type `' OR '1'='1` into the email field and bypass the password check entirely." |
| 2 | Why `BEGIN IMMEDIATE` instead of `BEGIN DEFERRED`? | "`BEGIN IMMEDIATE` acquires a RESERVED write lock the moment it runs. `DEFERRED` waits until the first actual write — by then the SELECT has already returned stale data and the race window is still open." |
| 3 | Why server-side re-pricing in checkout? | "The Gatekeeper Pattern — never trust the client. If we used the price from the cart payload, an attacker could modify the JSON to set price to one cent before submitting." |
| 4 | Why the same 401 message for wrong-email and wrong-password? | "To prevent user enumeration. If wrong-email returned a different message, an attacker could probe the user table and learn who's registered without ever needing a valid password." |
| 5 | Why `card_last4` instead of the full card number? | "PCI-DSS. Storing the full PAN means we'd need to be PCI-compliant. Last 4 is enough to show the user which card they paid with — anything more is liability." |
| 6 | Why a Repository layer instead of SQL in the Service? | "Separation of concerns. The Repository owns all SQL. The Service owns business rules. If we switch from SQLite to PostgreSQL, only the Repository changes — the Service is untouched." |
| 7 | Why `.env` instead of constants in source? | "Secrets in source get etched into Git history forever — even deleting them later doesn't help. `.env` is gitignored, so the secret never enters the repo. Switching from SQLite to a cloud DB later means changing one config line, not code." |
| 8 | Why fail-fast on missing `JWT_SECRET`? | "A default value would silently sign every token with a known string — every JWT would be forgeable. Failing at boot with a clear error means the bug surfaces in development, not production." |
| 9 | Why the 10KB body size limit? | "Without it, an attacker can POST a 1GB JSON payload to `/api/checkout` and exhaust the Node process's memory. 10KB is more than enough for a real cart." |
| 10 | Why `ON DELETE RESTRICT` on `order_items.workshop_id`? | "It prevents deleting a workshop that appears in historical orders. Order history must remain accurate for accounting — if the workshop row vanishes, the order line item points at nothing." |

---

## 6. Three things NOT to do during the review

1. **Don't say "Claude wrote this."** Say **"I designed X with AI assistance"** or **"I prompted the AI to generate X following my Component Diagram."** That matches what Session 10 calls **"GenAI Prompt Engineering"** — graders expect and reward AI use, but only when you can defend the architectural decisions yourself.

2. **Don't take credit for the frontend** if you didn't write it. If asked "who built the cart UI?" — answer **"P2 wrote `js/cart.js` and `js/checkout.js`; I built the `/api/checkout` endpoint they call into."** Owning your boundaries shows professional teamwork.

3. **Don't apologize for missing features.** The grader doesn't have your original roadmap. Anything you didn't build doesn't exist as far as they're concerned. Confidence about what's there beats hedging about what isn't.

---

## 7. Rubric coverage cheat sheet

Quick reference: when a grader mentions a rubric category, point them at the evidence.

| Category | Where to point | Score-3 "why" answer |
|---|---|---|
| 1. Version Control | `git log --oneline -20` | Conventional Commits, branch-per-feature, PRs with descriptions |
| 2. Data Flow | `public/index.html` + `public/js/catalog.js` | UI rendered from `GET /api/workshops`, zero hardcoded content |
| 3. Interaction (EDA + debounce) | `public/js/catalog.js` (P3/P2 territory) | Event delegation on `#catalog`, 300ms debounce on search |
| 4. State (SSOT + Continuity) | `public/js/cart.js` + `public/js/auth.js` | One `cart[]` in localStorage; hydration on page load |
| 5. Auth Architecture | `server/services/authService.js` | bcrypt cost 10 + stateless JWT 24h expiry, `.env`-driven |
| 6. Gatekeeper Pattern | `server/services/checkoutService.js` | Server re-prices from `price_current`, never trusts client total |
| 7. Relational Integrity | `server/db/schema.sql` + ERD photo | 4 normalized tables, FK constraints, `ON DELETE RESTRICT` |
| 8. SQL Safety | Every `*Repository.js` file | Every query uses `?` placeholders, zero string concatenation |
| 9. Controller-Route-Service | `server/` folder structure | 4-layer separation, each layer has one responsibility |
| 10. Zero-Config + `.env` | `.env.example`, `server/index.js` | Fail-fast on missing `JWT_SECRET`, no hardcoded secrets |

### Bonus A (+3 pts) — Stock-Check Concurrency

- **Where:** `server/services/checkoutService.js`, the `BEGIN IMMEDIATE TRANSACTION` block
- **Proof:** `docs/screenshots/race-fix-day7.png` (two tabs: 1 × 201, 1 × 409)
- **Before/after:** `docs/screenshots/race-bug-day6.png` shows the original race (both 201, `current_bookings = 13`)
- **Why it works:** the model answer for flashcard #2

---

## 8. Final pre-review checklist (5 min before)

- [ ] `git status` on `main` reports "working tree clean"
- [ ] `npm install && npm run dev` boots cleanly (no errors)
- [ ] `http://127.0.0.1:5500/public/` shows 12 workshops
- [ ] Login as `alice@example.com / Password123!` — confirm 200 + JWT
- [ ] Workshop id=5 set to `current_bookings = 11`, `max_capacity = 12` (race demo armed)
- [ ] Two browser tabs with race fetch pre-loaded — Enter ready
- [ ] SQLite Viewer on `orders` table — `card_last4 = "4242"` visible
- [ ] All 10 flashcards rehearsed once
- [ ] Three deep breaths

---

You have **8 working days of solid evidence** behind you, **+3 bonus points banked**, and a clean repo. Walk in like it.
