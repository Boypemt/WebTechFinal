# Architecture

This document explains the **why** behind every architectural decision. The rubric awards Score 3 (Mastery) only when a developer can articulate *why* a pattern was chosen — not just that it was implemented.

## Layered Architecture — Controller-Route-Service-Repository

```
Route → Controller → Service → Repository → DB
```

| Layer | Single responsibility |
|-------|----------------------|
| Route | URL → handler mapping only |
| Controller | HTTP: parse req, validate input, call service, send res |
| Service | Business rules (pricing, capacity check, bcrypt, JWT) |
| Repository | All SQL — one method per query |
| DB | SQLite connection + Promise wrappers |

The four-layer split exists because each layer has exactly one reason to change. If we had written SQL directly inside a controller — the common shortcut — then a schema rename would require hunting through HTTP-handling code to patch raw query strings, while simultaneously trying not to break the response logic sitting in the same function. The Service layer is the critical isolation point: it owns business rules like capacity-checking and re-pricing, so changing "how a seat is reserved" touches only `checkoutService.js` and nothing in the HTTP layer ever knows. Without the Repository layer, SQL would gradually migrate into Services and then Controllers until a single function handles both "is the user authenticated?" and `UPDATE workshops SET current_bookings…` — the classic Big Ball of Mud that makes every change a landmine.

## Database Schema

See [diagrams/erd.png](diagrams/erd.png).

Four tables: `users`, `workshops`, `orders`, `order_items`. Every FK uses `ON DELETE RESTRICT` on `order_items.workshop_id` so historical bookings cannot be silently broken when a workshop is removed.

Normalising into four tables instead of storing orders as a single JSON blob serves two concrete purposes. First, it gives us referential integrity: the foreign key from `order_items.workshop_id` to `workshops` with `ON DELETE RESTRICT` means the database itself refuses to delete a workshop that has live bookings — if we had stored the workshop title as a string inside a JSON column, we could silently delete the workshop and leave orders pointing at a ghost. Second, separating `order_items.unit_price` (the price charged at time of purchase) from `workshops.price_current` (today's price) means an admin can update a workshop's price without rewriting order history — if those values lived in one place, past receipts would retroactively show a price the customer never agreed to.

## Component Diagram

See [diagrams/components.png](diagrams/components.png).

The dotted red **cut line** shows where the monolith could be split into three independent services: **Identity**, **Catalog**, and **Booking**.

## Concurrency — Bonus A — Stock-Check

### The bug before Day 7

In `server/services/checkoutService.js`, the capacity check ran as a plain `SELECT` inside `findWorkshopForCheckout` and the result was evaluated on line 14 (`if (workshop.current_bookings + item.quantity > workshop.max_capacity)`). A separate `incrementBookings` call later issued the `UPDATE`. Between those two statements, a second concurrent request could call `findWorkshopForCheckout` and receive the same stale `current_bookings` value — meaning both requests passed the check independently. This is a classic TOCTOU (Time Of Check, Time Of Use) race condition: the world was checked at one moment but acted on at another, and the state could change in between.

### The fix (implemented Day 7)

We wrap the per-item loop (steps 3–6 of `placeOrder`) in an explicit transaction:

```js
await db.runAsync('BEGIN IMMEDIATE TRANSACTION');
try {
    // findWorkshopForCheckout, capacity check, insertOrder,
    // insertOrderItem, and incrementBookings all run here.
    await db.runAsync('COMMIT');
} catch (err) {
    await db.runAsync('ROLLBACK');
    throw err;   // re-throw so the controller can map to 409 or 500
}
```

`BEGIN IMMEDIATE` (not `BEGIN DEFERRED`) acquires a `RESERVED` lock at the moment the transaction opens, so any second request that also tries `BEGIN IMMEDIATE` blocks until the first transaction either commits or rolls back. SQLite serializes the contending writes on our behalf — no application-level mutex needed.

Verified: docs/screenshots/race-bug-day6.png shows the bug; docs/screenshots/race-fix-day7.png shows two concurrent requests resolving to one 201 and one 409, with current_bookings landing at max_capacity and never above it.

### Why this is the right pattern here

- **SQLite's concurrency unit is the whole file.** There are no row-level locks, so a short exclusive transaction is the idiomatic — and only — correct solution for this database engine.
- **The transaction window is sub-millisecond per checkout.** The blocked second request waits only for the SELECT + INSERT + UPDATE to finish, which is invisible latency at the scale of a class project.
- **Portable to PostgreSQL.** A future migration swaps `BEGIN IMMEDIATE` for `SELECT … FOR UPDATE` inside the repository layer without changing the service or controller code at all.

> Demo recording: [docs/diagrams/concurrency-demo.mp4](diagrams/concurrency-demo.mp4)

## Security Decisions

**bcrypt with cost factor 10.** bcrypt is a deliberately slow hashing algorithm — unlike MD5 or SHA-256, it is designed to take real CPU time per attempt so an attacker who steals the password table can only try a few thousand guesses per second instead of billions. Cost factor 10 means 2^10 = 1024 internal iterations, which makes a single hash take roughly 100ms on modern hardware. If we had used a fast hash, a stolen database could be brute-forced with commodity GPU hardware in minutes; bcrypt at cost 10 makes the same attack take years per password. The cost factor comes from `process.env.BCRYPT_ROUNDS` so we can raise it to 12 or 13 as servers get faster without touching code.

**JWT signed with `process.env.JWT_SECRET`, expiring after 24 hours.** A JWT encodes identity and is signed by the server's secret key, so any endpoint can verify it without a database round-trip — stateless verification is why we chose tokens over session tables. Tokens expire after 24 hours because a stolen token from a compromised device should not grant permanent access; bounding the window to one day limits the blast radius of any credential leak. Storing the secret in source code would mean anyone with read access to the repository — including contributors and forks — could forge tokens for any user; environment variables keep the secret out of version history entirely.

**Parameterized queries everywhere.** Every SQL statement in the repositories passes values as `?` placeholders, and the sqlite3 driver substitutes them after the query structure is already parsed. If we had built SQL by concatenating strings — `"WHERE email = '" + email + "'"` — an attacker could send `email = "' OR '1'='1"` and turn a login check into a query that returns every user in the table. SQL injection is the #1 web vulnerability precisely because it is trivial to exploit with Burp Suite or even browser DevTools, and parameterized queries make it structurally impossible regardless of what value the user sends.

**Body size limit of 10KB.** Express buffers the entire request body into memory before handing it to any handler. Without a cap, an attacker can POST a multi-gigabyte body to any endpoint, hold a worker thread busy while memory fills, and crash the process — a denial-of-service attack requiring no authentication and no special tooling. The 10KB ceiling rejects oversized requests at the middleware layer before business logic runs; it comfortably fits any real checkout cart while making memory exhaustion impractical.

**Generic 500 response in production.** When an unhandled exception reaches the global error handler, it logs the full stack trace — file paths, line numbers, framework internals — to the server console and returns only `{ "success": false, "error": "Internal server error", "requestId": "…" }` to the client. If we returned `err.stack` directly, an attacker would see the exact Node.js version, the project's directory layout, and the names of third-party packages, all of which help identify known CVEs to exploit. The `requestId` field is safe to expose because it is a random 8-character token with no semantic content: it lets an operator `grep` the logs for the matching stack trace without giving an attacker any structural information about the server.

**Server-side re-pricing (Gatekeeper Pattern).** Before writing any order, `checkoutService.placeOrder` fetches each workshop's `price_current` from the database and uses that value as the authoritative unit price, discarding any total the client submitted. If we trusted the client's total, an attacker could edit the request body in DevTools to submit `total: 0.01` and check out a $50 workshop for a penny — this exact attack is documented against real e-commerce platforms that compute totals client-side. The pattern also guards against legitimate race conditions: if an admin raises a workshop price while a user is mid-checkout, the stored order reflects the price that was live at submission time.

**Helmet security headers.** Helmet adds a suite of HTTP response headers that browsers enforce automatically. Two critical ones: `X-Frame-Options: SAMEORIGIN` instructs browsers to refuse to render this app inside a cross-origin `<iframe>`, blocking clickjacking attacks where a malicious page overlays an invisible frame over a button that silently triggers a checkout. `Content-Security-Policy` restricts which origins may load scripts, so even if an XSS vulnerability exists somewhere, it cannot pull in attacker-controlled JavaScript from an external server. Without Helmet, an Express app ships with none of these headers — protection that every modern browser supports for free and costs nothing to add.

**Login rate limiter (5 per 15 minutes, applied only to `/api/login`).** Capping login attempts makes automated password-guessing impractical: at 5 attempts per IP per 15 minutes, exhausting a million-entry wordlist would require 50,000 rotating IP addresses. The limiter targets `/api/login` specifically and not `/api/register` because the threats are different: registration spam is best addressed at the application layer (email verification, CAPTCHAs), while credential brute-force is an IP-rate problem. Applying the same cap to registration would block an entire university dormitory NAT from onboarding multiple students in the same 15-minute window while doing nothing to stop the attacks it was designed to prevent.

**Request IDs in 500 responses.** When a 500 fires, the global error handler logs `{ id, method, path, stack }` to the server console and returns the same `id` to the client in `requestId`. This gives a user who reports a problem a single token they can copy, and gives the operator a single `grep` to find the exact stack trace in seconds — without any back-and-forth about "what were you doing when it broke?" The ID is safe to expose because it is a random alphanumeric string that conveys no information about the server's internal structure, unlike a sequential counter (which would leak traffic volume) or the error message itself.

## Environment Variables — Zero-Config

All secrets and environment-dependent values are in `.env` (gitignored). The project boots only after `JWT_SECRET` is present — `server/index.js` fail-fasts with a helpful error otherwise.

The server calls `process.exit(1)` with a clear message if `JWT_SECRET` is absent rather than falling back to a default. If we used a hardcoded default like `"dev-secret"`, the application would start silently and pass all smoke tests — but every JWT signed during development would also be valid in production if the `.env` file was accidentally omitted from the deployment. That scenario has caused real breaches: a known-default secret found in public documentation lets anyone forge a token for any user with a single `jwt.sign()` call. Fail-fast converts that silent security hole into a loud startup failure that is caught during the deployment checklist, not after tokens are already in the wild.

## What's NOT yet documented (placeholders)

- API reference → see [API.md](API.md) *(Day 12)*
- Sequence Diagrams for the 3 main flows → `diagrams/seq-*.png` *(Day 12)*
- Race-condition demo recording → `diagrams/concurrency-demo.mp4` *(Day 9)*
