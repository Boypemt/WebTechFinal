# Red-Team Findings — Checkout Flow

Scope: `server/routes/checkout.js`, `server/controllers/checkoutController.js`,
`server/services/checkoutService.js`, `server/middleware/optionalAuth.js`

Out of scope (already in place): Helmet, `express.json({ limit:'10kb' })`,
parameterised queries, BEGIN IMMEDIATE TRANSACTION, server-side re-pricing,
PCI-DSS card truncation, login rate limit, identical 401 bodies.

---

## Summary Table

| # | Attack | Severity | File : Line | One-line fix |
|---|---|---|---|---|
| 1 | Duplicate Item IDs — Capacity Check Bypass | **HIGH** | `checkoutController.js:13` / `checkoutService.js:10` | Deduplicate or reject repeated workshop IDs before processing |
| 2 | Email Attribute Manipulation (Order Hijack) | **MEDIUM** | `checkoutController.js:29–30` | When `req.user` is set, use `req.user.email`; ignore `req.body.email` |
| 3 | Unbounded Quantity — Resource Exhaustion / Logic Abuse | **MEDIUM** | `checkoutController.js:14` | Add `entry.quantity > MAX_QTY_PER_ITEM` guard (e.g. 50) |

---

## Finding 1 — Duplicate Item IDs: Capacity Check Bypass

**Severity:** HIGH

**Files:**
- `server/controllers/checkoutController.js` line 13 (no dedup on `items`)
- `server/services/checkoutService.js` lines 10–24 (capacity check and increment are in separate loops)

### How it works

The capacity check loop (lines 10–24 of `checkoutService.js`) reads
`current_bookings` for every item in the array. The `incrementBookings`
call that writes the new count runs in a *second* loop after all items
are validated. When the same workshop ID appears more than once, every
capacity check reads the same stale value because no increment has fired yet.

```
Workshop 5: max_capacity=12, current_bookings=11  (1 seat left)

Iteration 1: SELECT → current=11; 11+1 ≤ 12 → PASS, push to builtItems
Iteration 2: SELECT → current=11  (same stale read); 11+1 ≤ 12 → PASS, push again
Iteration 3: SELECT → current=11; PASS

Insert loop:
  incrementBookings(5, 1) → 12   ✓
  incrementBookings(5, 1) → 13   ✗ SQLite CHECK constraint fires → ROLLBACK → 500
  incrementBookings(5, 1) → never reached
```

The DB CHECK constraint (`current_bookings <= max_capacity`) prevents
actual over-booking, but it surfaces as an unhandled 500 (the error string
is not `WORKSHOP_FULL:*` so the controller's catch block passes it to
`next(err)` as an internal error) rather than a clean 409. The order
record (`insertOrder`) is also already written before the constraint fires,
leaving a partial record until the ROLLBACK cleans it up.

Against a workshop with larger capacity (e.g., `max_capacity=50,
current_bookings=40`), an attacker sending 9 duplicate entries passes all
9 capacity checks (each sees 40) and all 9 increments succeed, booking
9 seats while the check believed only 1 remained.

### Exploit payload

```http
POST /api/checkout
Content-Type: application/json

{
  "items": [
    { "id": 5, "quantity": 1 },
    { "id": 5, "quantity": 1 },
    { "id": 5, "quantity": 1 }
  ],
  "email": "attacker@x.com",
  "card": "4242424242424242"
}
```

### Recommended fix

Reject the request in the controller before it reaches the service:

```js
// checkoutController.js — after the items array validation loop
const workshopIds = items.map(e => e.id);
if (new Set(workshopIds).size !== workshopIds.length) {
    return res.status(400).json({
        success: false,
        error: 'Duplicate workshop IDs are not allowed',
        field: 'items',
    });
}
```

Alternatively, deduplicate by merging quantities server-side — but
rejection is cleaner and forces the client to be explicit.

---

## Finding 2 — Email Attribute Manipulation (Order Attribution Hijack)

**Severity:** MEDIUM

**File:** `server/controllers/checkoutController.js` lines 29–30

### How it works

`optionalAuth` correctly populates `req.user` from the JWT when a valid
token is present. The controller then extracts `user_id` from `req.user`
but passes `email` straight from `req.body` without checking it matches
`req.user.email`:

```js
// checkoutController.js:29-30
const user_id = req.user ? req.user.id : null;
const result = await checkoutService.placeOrder({ items, email, card, user_id });
```

`orderRepository.insertOrder` then stores `user_id = alice.id` and
`email = victim@target.com` as a pair in the `orders` table.

Consequences:
- Order confirmation emails (when the mailer is wired up) are sent to the
  victim's address for a purchase they did not make.
- Alice's order history contains the victim's email, making customer
  support lookups unreliable.
- A targeted attacker can flood a victim's inbox with legitimate-looking
  order confirmation emails by repeatedly checking out under that address
  while authenticated as a different user.

### Exploit payload

```http
POST /api/checkout
Content-Type: application/json
Authorization: Bearer <valid JWT for alice@example.com>

{
  "items": [{ "id": 1, "quantity": 1 }],
  "email": "victim@target.com",
  "card": "4242424242424242"
}
```

Result in DB: `user_id = alice.id`, `email = "victim@target.com"`.

### Recommended fix

When a JWT is present, ignore `req.body.email` entirely and use the
identity that was authenticated:

```js
// checkoutController.js — replace lines 29-30
const user_id    = req.user ? req.user.id    : null;
const orderEmail = req.user ? req.user.email : email;
const result = await checkoutService.placeOrder({
    items, email: orderEmail, card, user_id,
});
```

Guest checkout (no JWT) still uses `req.body.email` — behaviour is
unchanged for unauthenticated requests.

---

## Finding 3 — Unbounded Quantity: Resource Exhaustion / Logic Abuse

**Severity:** MEDIUM

**File:** `server/controllers/checkoutController.js` line 14

### How it works

The only quantity guard is `entry.quantity < 1`. There is no upper bound.
`Number.isInteger(999999)` is `true`, so the validator passes it straight
to the service.

Two abuse scenarios:

**A — Logic abuse against a high-capacity workshop**

If a workshop has `max_capacity = 500` and `current_bookings = 0`, the
following legitimately succeeds and books 499 seats in one request:

```http
POST /api/checkout
{
  "items": [{ "id": 2, "quantity": 499 }],
  "email": "a@b.com",
  "card": "4242424242424242"
}
```

This creates `total_price = 39.99 × 499 = $19,955.01` stored in the DB
and blocks all other users from booking that workshop.

**B — Float overflow probe**

```http
POST /api/checkout
{
  "items": [{ "id": 1, "quantity": 9007199254740992 }],
  ...
}
```

`Number.isInteger(9007199254740992)` is `true` (it is the value of
`Number.MAX_SAFE_INTEGER + 1` and is exactly representable as a float).
`unit_price × 9007199254740992` overflows to `Infinity`, which SQLite
stores as `NULL` or raises a constraint error depending on the driver —
triggering an unhandled 500.

### Exploit payload

```http
POST /api/checkout
Content-Type: application/json

{
  "items": [{ "id": 1, "quantity": 9007199254740992 }],
  "email": "probe@x.com",
  "card": "4242424242424242"
}
```

### Recommended fix

Add a per-item quantity cap in the controller validation loop:

```js
// checkoutController.js:14 — extend the existing guard
const MAX_QUANTITY = 50;
if (
    !Number.isInteger(entry.id) ||
    !Number.isInteger(entry.quantity) ||
    entry.quantity < 1 ||
    entry.quantity > MAX_QUANTITY
) {
    return res.status(400).json({
        success: false,
        error: `Each item quantity must be between 1 and ${MAX_QUANTITY}`,
        field: 'items',
    });
}
```

`MAX_QUANTITY = 50` is a reasonable ceiling for a workshop booking platform
where a single buyer is unlikely to legitimately need more than a handful
of seats.
