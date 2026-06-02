# Final Pre-Submission Audit

Reviewer: Senior Code Review pass
Files read: all of server/, all of public/js/, 4 HTML pages, package.json, .env.example, .gitignore, README.md

---

## 1. Functional Verification

| Check | Result | Evidence |
|---|---|---|
| GET /api/health → 200 `status: ok` | **PASS** | Verified live in pre-flight run |
| GET /api/workshops → 12 rows | **PASS** | Verified live; seed has 12 workshops |
| GET /api/workshops?category=Tech → 3 rows | **PASS** | Seed contains Intro to AI, JS Bootcamp, Web Security 101 |
| GET /api/workshops/999 → 404 | **PASS** | `workshopController.js`: `if (!data) return res.status(404)` |
| POST /api/register validates email regex + password rules | **PASS** | `authController.js` EMAIL_RE + PASSWORD_RE on lines 4–5 |
| POST /api/login — identical 401 body for wrong-email vs wrong-password | **PASS** | Single `{ error: 'Invalid email or password' }` path in `authController.js` |
| POST /api/checkout → 409 `{ workshopId, error: 'Workshop full' }` | **PASS** | Verified live; controller maps `WORKSHOP_FULL:*` → 409 |
| `checkoutService.placeOrder` wrapped in `BEGIN IMMEDIATE TRANSACTION` | **FAIL** | Current file has `// TODO Day 7:…` comment; transaction code absent |
| `helmet()` registered AFTER `express.json()` BEFORE `cors()` | **PASS** | `app.js` lines 16 → 19 → 27 |
| Rate limiter on `/api/login` ONLY, not `/api/register` | **PASS** | `routes/auth.js` has `loginRateLimit`; `routes/register.js` does not |
| `public/js/api.js` BASE_URL = `http://localhost:3000/api` | **PASS** | `api.js:14` |

---

## 2. Layered Architecture Compliance

| Rule | Result | Violation |
|---|---|---|
| Routes map URL → handler only | **PASS** | — |
| Controllers parse req, validate, send res, call next(err) | **PASS** | — |
| Services contain only business rules (no req/res, no raw SQL) | **PASS** | — |
| Repositories contain only SQL (raw rows in, raw rows out) | **PASS** | — |
| `api.js` is the ONLY file calling `fetch()` | **PASS** | No other `fetch()` found in public/js/ |
| `auth.js` is the ONLY file touching `localStorage['jwt_token']` | **FAIL** | `api.js:34` — `localStorage.getItem('jwt_token')` bypasses `auth.getToken()` |
| `cart.js` is the ONLY file touching `localStorage['cart']` | **FAIL** | `auth.js:110` — `localStorage.getItem('cart')` in `initAuthUI()` bypasses `cart.getCart()` |

---

## 3. Spaghetti / Code Smell Scan

**SQL string concatenation**
None found. All repositories use `?` placeholders. ✓

**`process.env` access outside approved files**

| File | Variable | Issue |
|---|---|---|
| `server/app.js:16` | `CORS_ORIGINS` | Not in approved list (index.js, db/index.js, authService.js, loginRateLimit.js) |

Low severity — standard app config; flagged per audit spec.

**Hardcoded `http://localhost:3000` outside `api.js` / `.env.example`**
None found. ✓

**`console.log()` in production code**
None found. `console.error()` in `catalog.js:173` and `checkout.js:154` are inside catch/error-handler branches — permitted per audit spec.

**TODO / FIXME / XXX comments**

| File | Line | Comment |
|---|---|---|
| `server/services/checkoutService.js` | 33 | `// TODO Day 7: wrap this loop in BEGIN IMMEDIATE TRANSACTION…` |

**Commented-out code blocks (>3 consecutive lines)**
None found. ✓

**Unused `require` / `import` statements**
None found. All imports in server/ and public/js/ are used. ✓

**Functions over 50 lines**

| File | Function | ~Lines |
|---|---|---|
| `public/js/catalog.js` | `renderWorkshops()` | ~72 |
| `public/js/checkout.js` | `handleCheckoutSubmit()` | ~90 |
| `public/js/ui.js` | `initCategoryTabs()` | ~65 |

All are UI rendering functions; splitting would require new abstractions. LOW.

**Duplicated logic**

| Pattern | Files |
|---|---|
| `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` | `authController.js:4`, `checkoutController.js:3` |

**`catch` blocks that swallow errors silently**
All catch blocks either `console.error`, set a fallback value with documented intent (token parse, cart parse), or rethrow. None silently swallow. ✓

**`async` functions with `await` but no `try/catch`**
None found in any controller, service, or page script. ✓

**Frontend ↔ Backend API contract mismatch (CRITICAL SMELL)**

| Location | Sent | Expected by server | Effect |
|---|---|---|---|
| `api.js:113` / `checkout.js:87` | `card_last4` (4 digits) | `card` (16 digits, `/^\d{16}$/`) | Controller returns `400 { field:"card" }` — checkout always fails |
| `checkout.js:99` | `items[].workshop_id` | `items[].id` | Controller `entry.id` is `undefined` → fails `Number.isInteger` → returns `400 { field:"items" }` |

---

## 4. Submission-Readiness Checklist

| Check | Result | Notes |
|---|---|---|
| README "Setup" steps reproducible on clean clone | **PASS** | Verified in clean-env test |
| README links to ARCHITECTURE.md, API.md, TESTING.md | **PASS** | All three present in Documentation section |
| `.env` in `.gitignore` | **PASS** | `.gitignore:9` |
| `*.db` / `store.db` in `.gitignore` | **PASS** | `.gitignore:13–16` |
| `node_modules/` in `.gitignore` | **PASS** | `.gitignore:5` |
| `.env.example` documents every variable `.env` uses | **PASS** | PORT, NODE_ENV, DB_PATH, JWT_SECRET, JWT_EXPIRES, BCRYPT_ROUNDS, CORS_ORIGINS, WORKSHOP_SERVICE_URL |
| `package.json` has `start` and `dev` scripts | **PASS** | `"start"` and `"dev"` present |
| `docs/diagrams/` with `erd.jpg` and `components.jpg` | **FAIL** | Directory is empty — README links are broken |
| `docs/screenshots/` with ≥ 4 PNG files | **FAIL** | Directory does not exist — README "Visual Proof" section has 5 broken `<img>` tags |

---

## 5. Action Plan

### CRITICAL — Fix before submission

| # | Issue | File : Line | Fix |
|---|---|---|---|
| C-1 | Checkout always returns 400: frontend sends `card_last4` (4 digits), backend expects `card` (16 digits) | `public/js/api.js:112–116`, `public/js/checkout.js:86–87` | Change `checkout.js` to pass the full `rawCard` (16 digits) as `card`, and update `postCheckout` parameter to `{ email, card, items }` |
| C-2 | Checkout always returns 400: frontend sends `items[].workshop_id`, backend validates `items[].id` | `public/js/checkout.js:99–104` | Change the items map to use `id: item.id` instead of `workshop_id: item.id`; drop `unit_price` (server ignores it) |
| C-3 | `BEGIN IMMEDIATE TRANSACTION` absent in `checkoutService.placeOrder`; TODO comment still present | `server/services/checkoutService.js:33` | Wrap the capacity-check and insert loops in `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` as documented in `ARCHITECTURE.md` |
| C-4 | `docs/screenshots/` does not exist; README "Visual Proof" section has 5 broken image links | `README.md:80–93` | Take and save the 5 screenshots described in README, or remove the Visual Proof section before submission |
| C-5 | `docs/diagrams/` is empty; README and ARCHITECTURE.md link to `erd.jpg` and `components.jpg` | `README.md:102–103`, `ARCHITECTURE.md` | Add the diagram images, or remove the broken links |

### HIGH

| # | Issue | File : Line | Fix |
|---|---|---|---|
| H-1 | `api.js` reads `localStorage.getItem('jwt_token')` directly, bypassing `auth.getToken()` | `public/js/api.js:34` | Replace with `import { getToken } from './auth.js'` and call `getToken()` |
| H-2 | `auth.js` reads `localStorage.getItem('cart')` directly, bypassing `cart.getCart()` | `public/js/auth.js:110` | Replace with `import { getCart } from './cart.js'` and call `getCart()` |

### MEDIUM

| # | Issue | File | Fix |
|---|---|---|---|
| M-1 | EMAIL_RE duplicated in two controllers | `authController.js:4`, `checkoutController.js:3` | Extract to `server/utils/validators.js` and import in both |

### LOW

| # | Issue | Note |
|---|---|---|
| L-1 | `app.js` reads `process.env.CORS_ORIGINS` (outside audit's approved env-access files) | Functionally correct; cosmetic arch purity issue |
| L-2 | `renderWorkshops`, `handleCheckoutSubmit`, `initCategoryTabs` exceed 50 lines | UI rendering functions; splitting adds ceremony with little benefit |
