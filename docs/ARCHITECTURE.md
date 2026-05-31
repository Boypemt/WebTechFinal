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

**Why this split?** A schema change touches only the Repository. A business-rule change touches only the Service. They never collide.

## Database Schema

See [diagrams/erd.png](diagrams/erd.png).

Four tables: `users`, `workshops`, `orders`, `order_items`. Every FK uses `ON DELETE RESTRICT` on `order_items.workshop_id` so historical bookings cannot be silently broken when a workshop is removed.

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

- **bcrypt** with cost factor 10 — cost factor in `.env` so we can raise it as hardware improves.
- **JWT** signed with `process.env.JWT_SECRET`, `expiresIn: '24h'` — the secret never appears in source code.
- **Parameterized queries** everywhere — `?` placeholders, no string concatenation. Prevents SQL injection.
- **Body size limit** of 10KB — `express.json({ limit: '10kb' })` prevents memory-exhaustion attacks.
- **Generic error response** in production — clients never see stack traces.
- **Server-side re-pricing** in checkout — the Gatekeeper Pattern. The client's `total` is recalculated against `workshops.price_current` before any insert.

## Environment Variables — Zero-Config

All secrets and environment-dependent values are in `.env` (gitignored). The project boots only after `JWT_SECRET` is present — `server/index.js` fail-fasts with a helpful error otherwise.

## What's NOT yet documented (placeholders)

- API reference → see [API.md](API.md) *(Day 12)*
- Sequence Diagrams for the 3 main flows → `diagrams/seq-*.png` *(Day 12)*
- Race-condition demo recording → `diagrams/concurrency-demo.mp4` *(Day 9)*
