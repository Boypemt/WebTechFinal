# Pre-Deployment Audit — Skill-Share Workshop Platform

Reviewed by: Senior DevOps (automated audit pass)
Branch: `chore/boypemt-audit-pass-1`
Files reviewed: all files under `server/`

---

## Summary Table

| # | Category | Status | Notes |
|---|---|---|---|
| 1 | Version Control | PASS | Conventional Commits + branch rules documented in CLAUDE.md; CLAUDE.md gitignored |
| 2 | Data Flow | PASS | Route → Controller → Service → Repository → DB strictly maintained; no cross-layer shortcuts |
| 3 | Interaction | PASS | Consistent `{ success, data/count }` envelope on all happy paths; `{ success, error, field }` on all errors |
| 4 | State | PASS | Stateless JWT; no express-session; guest checkout supported via `user_id = null` |
| 5 | Auth Security | PASS | bcrypt cost ≥ 10; JWT from env; verifyToken returns null (no throws logged); identical 401 body prevents user enumeration |
| 6 | API Gatekeeper Pattern | **FAIL** | Re-pricing from DB is correct; capacity check is NOT in a transaction — TOCTOU window remains (see #1 in Action Plan) |
| 7 | SQL Relational Integrity | PASS | All FKs declared; `ON DELETE RESTRICT` on `order_items.workshop_id`; CHECK constraints on capacity, price, rating |
| 8 | SQL Safety | PASS | Every SQL statement in all three repositories uses `?` placeholders — no string concatenation found |
| 9 | Controller-Route-Service separation | PASS | Controllers never import repositories; services never import express; routes contain only `router.METHOD()` |
| 10 | Zero-Config | PASS | dotenv loaded first in `index.js`; fail-fast on `JWT_SECRET`; `.env.example` committed; no secrets in source |

---

## Explicit Verification Checklist

| Check | Result | Location |
|---|---|---|
| `express.json({ limit: '10kb' })` present | ✅ | `server/app.js:13` |
| All SQL uses `?` placeholders | ✅ | `workshopRepository.js`, `userRepository.js`, `orderRepository.js` — all clean |
| `JWT_SECRET` from `process.env` | ✅ | `server/services/authService.js` — `signToken` and `verifyToken` |
| `JWT_EXPIRES` from `process.env` | ✅ | `authService.js` — `expiresIn: process.env.JWT_EXPIRES \|\| '24h'` |
| `BCRYPT_ROUNDS` from `process.env` | ✅ | `authService.js` — `parseInt(process.env.BCRYPT_ROUNDS, 10) \|\| 10` |
| Global error handler logs internally, returns generic 500 | ✅ | `server/app.js:52-55` — `console.error` + `{ success: false, error: 'Internal server error' }` |
| Every async controller in try/catch calling `next(err)` | ✅ | `workshopController.js`, `authController.js`, `checkoutController.js` — all three |
| bcrypt cost factor ≥ 10 | ✅ | Default is 10; env can raise it, never lower |
| CORS whitelist from `process.env.CORS_ORIGINS` | ✅ | `server/app.js:16-19` |
| No hardcoded URLs or magic numbers in `services/` | ⚠️ | `workshopService.js` — `50` (max category length) is an inline literal; LOW impact |
| **Helmet** (security headers) | ❌ | **MISSING** — no `helmet` import anywhere in `app.js` |
| **Rate limiting on `/api/login`** | ❌ | **MISSING** — no `express-rate-limit` or equivalent |
| **Request ID + structured logging** | ❌ | **MISSING** — only `console.error` in error handler; no correlation IDs |

---

## Recommended Action Plan

### CRITICAL

**C-1 — TOCTOU race in `server/services/checkoutService.js`**

The capacity check (`findWorkshopForCheckout` SELECT) and the booking increment (`incrementBookings` UPDATE) are separate statements with no transaction wrapping them. Two concurrent requests can both pass the check against the same stale `current_bookings` value.

The schema's `CHECK (current_bookings <= max_capacity)` provides a last-resort database guard — the second UPDATE will raise a SQLite constraint error — but by that point `insertOrder` has already executed (order record created, PCI card reference stored) and the error surfaces as an unhandled 500 rather than a clean 409. This leaves the database in a split state: a paid order with no corresponding seat increment.

**Fix:** wrap everything from the capacity-check loop through `incrementBookings` in a single `BEGIN IMMEDIATE TRANSACTION` / `COMMIT` / `ROLLBACK`.

```js
// server/services/checkoutService.js — top of file
const db = require('../db');

// inside placeOrder, after card_last4:
await db.runAsync('BEGIN IMMEDIATE TRANSACTION');
try {
    // ... per-item loop + insertOrder + insertOrderItem + incrementBookings ...
    await db.runAsync('COMMIT');
    return { order_id, total, items: builtItems, placed_at };
} catch (err) {
    await db.runAsync('ROLLBACK');
    throw err;
}
```

`BEGIN IMMEDIATE` (not `BEGIN DEFERRED`) acquires the reserved lock at transaction open, forcing any concurrent checkout to block until the first either commits or rolls back.

---

### HIGH

**H-1 — No Helmet (missing HTTP security headers)**

Without `helmet`, responses lack `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and others. Any of these can be exploited in a browser-facing app.

**Fix:**
```bash
npm install helmet
```
```js
// server/app.js — immediately after const app = express();
const helmet = require('helmet');
app.use(helmet());
```

---

**H-2 — No rate limiting on `POST /api/login`**

The login endpoint has no brute-force protection. An attacker can attempt unlimited password guesses against any known email address.

**Fix:**
```bash
npm install express-rate-limit
```
```js
// server/routes/auth.js
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many login attempts, please try again later' },
});
router.post('/', loginLimiter, login);
```

---

### MEDIUM

**M-1 — No request ID or structured logging**

`console.error('[ERROR]', err.stack)` produces unstructured output with no correlation ID. In production, a single 500 from two simultaneous users is impossible to trace back to a specific request.

**Fix:** add `express-request-id` (or a one-liner UUID middleware) and pass `req.id` into a structured logger (e.g. `pino`). At minimum:
```js
// server/app.js — before routes
app.use((req, _res, next) => { req.id = crypto.randomUUID(); next(); });
// global error handler:
console.error({ requestId: req.id, error: err.message, stack: err.stack });
```

---

### LOW

**L-1 — Inline magic number in `server/services/workshopService.js`**

The category max-length limit (`50`) is an inline literal in the validation condition. If the schema or UI ever changes this limit, it must be hunted down manually.

**Fix:** extract to a named constant at module scope:
```js
const MAX_CATEGORY_LENGTH = 50;
```
