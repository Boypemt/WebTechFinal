# Manual Test Plan — Skill-Share Workshop API

Base URL: `http://localhost:3000`

---

## GET /api/workshops

| Scenario | Method + Path | Body / Headers | Expected status | Key response fields |
|---|---|---|---|---|
| All workshops | `GET /api/workshops` | — | 200 | `success:true`, `count:12`, `data` array |
| Filter by category | `GET /api/workshops?category=Cooking` | — | 200 | every item has `category:"Cooking"` |
| Category case-insensitive | `GET /api/workshops?category=cooking` | — | 200 | same result as above |
| category too long (51+ chars) | `GET /api/workshops?category=aaaa…` (51 chars) | — | 400 | `success:false`, `field:"category"` |

---

## GET /api/workshops/:id

| Scenario | Method + Path | Body / Headers | Expected status | Key response fields |
|---|---|---|---|---|
| Valid workshop | `GET /api/workshops/1` | — | 200 | `success:true`, `data.id:1` |
| Non-integer id | `GET /api/workshops/abc` | — | 400 | `success:false`, `error:"Invalid workshop id"` |
| id not in DB | `GET /api/workshops/99999` | — | 404 | `success:false`, `error:"Workshop not found"` |

---

## POST /api/register

| Scenario | Method + Path | Body / Headers | Expected status | Key response fields |
|---|---|---|---|---|
| Happy path | `POST /api/register` | `{"email":"new@test.com","password":"Pass1!word","first_name":"Ada"}` | 201 | `success:true`, `token` (JWT string), `user.id`, `user.email`, `user.first_name` |
| Missing email | `POST /api/register` | `{"password":"Pass1!word","first_name":"Ada"}` | 400 | `success:false`, `field:"email"` |
| Malformed email | `POST /api/register` | `{"email":"notanemail","password":"Pass1!word","first_name":"Ada"}` | 400 | `success:false`, `field:"email"` |
| Password too short | `POST /api/register` | `{"email":"x@x.com","password":"Ab1!","first_name":"Ada"}` | 400 | `success:false`, `field:"password"` |
| Password no digit | `POST /api/register` | `{"email":"x@x.com","password":"Password!","first_name":"Ada"}` | 400 | `success:false`, `field:"password"` |
| Password no symbol | `POST /api/register` | `{"email":"x@x.com","password":"Password1","first_name":"Ada"}` | 400 | `success:false`, `field:"password"` |
| first_name empty | `POST /api/register` | `{"email":"x@x.com","password":"Pass1!word","first_name":""}` | 400 | `success:false`, `field:"first_name"` |
| first_name 51 chars | `POST /api/register` | first_name = "a"×51 | 400 | `success:false`, `field:"first_name"` |
| Duplicate email | `POST /api/register` | same email as a previously registered user | 409 | `success:false`, `error:"Email already registered"` |

---

## POST /api/login

| Scenario | Method + Path | Body / Headers | Expected status | Key response fields |
|---|---|---|---|---|
| Happy path | `POST /api/login` | `{"email":"ada@test.com","password":"Pass1!word"}` | 200 | `success:true`, `token` (JWT), `user.id`, `user.first_name` |
| Missing email | `POST /api/login` | `{"password":"Pass1!word"}` | 400 | `success:false`, `error:"Email and password are required"` |
| Missing password | `POST /api/login` | `{"email":"ada@test.com"}` | 400 | `success:false`, `error:"Email and password are required"` |
| Wrong email (user enumeration) | `POST /api/login` | `{"email":"nobody@x.com","password":"Pass1!word"}` | 401 | `error:"Invalid email or password"` |
| Wrong password (user enumeration) | `POST /api/login` | `{"email":"ada@test.com","password":"WrongPass1!"}` | 401 | **same** `error:"Invalid email or password"` — body must be identical to wrong-email case |

---

## POST /api/checkout

| Scenario | Method + Path | Body / Headers | Expected status | Key response fields |
|---|---|---|---|---|
| Happy path (guest) | `POST /api/checkout` | `{"items":[{"id":1,"quantity":1}],"email":"g@x.com","card":"4242424242424242"}` | 201 | `success:true`, `data.order_id` starts with `"ORD-"`, `data.total`, `data.placed_at` |
| Happy path (logged-in) | `POST /api/checkout` | same body + `Authorization: Bearer <token>` | 201 | same as above; order linked to user |
| items missing | `POST /api/checkout` | `{"email":"g@x.com","card":"4242424242424242"}` | 400 | `success:false`, `field:"items"` |
| items empty array | `POST /api/checkout` | `{"items":[],"email":"g@x.com","card":"4242424242424242"}` | 400 | `success:false`, `field:"items"` |
| item quantity = 0 | `POST /api/checkout` | `{"items":[{"id":1,"quantity":0}],"email":"g@x.com","card":"4242424242424242"}` | 400 | `success:false`, `field:"items"` |
| item id not integer | `POST /api/checkout` | `{"items":[{"id":"one","quantity":1}],"email":"g@x.com","card":"4242424242424242"}` | 400 | `success:false`, `field:"items"` |
| Missing email | `POST /api/checkout` | `{"items":[{"id":1,"quantity":1}],"card":"4242424242424242"}` | 400 | `success:false`, `field:"email"` |
| Malformed email | `POST /api/checkout` | email = `"notanemail"` | 400 | `success:false`, `field:"email"` |
| Card not 16 digits | `POST /api/checkout` | card = `"1234"` | 400 | `success:false`, `field:"card"` |
| Card contains letters | `POST /api/checkout` | card = `"424242424242424X"` | 400 | `success:false`, `field:"card"` |
| Unknown workshop | `POST /api/checkout` | `{"items":[{"id":99999,"quantity":1}],"email":"g@x.com","card":"4242424242424242"}` | 404 | `success:false`, `error:"Workshop not found"`, `workshopId:99999` |
| **Workshop full (id=3)** | `POST /api/checkout` | `{"items":[{"id":3,"quantity":1}],"email":"g@x.com","card":"4242424242424242"}` | **409** | `success:false`, `error:"Workshop full"`, `workshopId:3` |

---

## Race Condition Demo (Bonus A — implemented Day 7)

1. Stop your dev server. Open `store.db` in SQLite Viewer.
   Edit workshop `id=5` (Thai Curry Night): set `current_bookings = 11`,
   `max_capacity = 12` (exactly 1 seat left).

2. Restart `npm run dev`.

3. Open two browser tabs with DevTools Console side by side.
   In **each** tab paste — do **not** press Enter yet:
   ```js
   fetch('/api/checkout', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       items: [{ id: 5, quantity: 1 }],
       email: 'race@example.com',
       card:  '4242424242424242'
     })
   }).then(r => r.json()).then(console.log)
   ```

4. Press Enter in both tabs as close to the same instant as possible.

5. **Expected (with Bonus A in place):** one tab returns `201`, the other
   returns `409` with body `{ success: false, error: 'Workshop full', workshopId: 5 }`.
   SQLite shows `current_bookings = 12` — the max_capacity is respected, never exceeded.
   The original buggy behaviour was captured before the fix in
   `docs/screenshots/race-bug-day6.png`. The fix is captured in
   `docs/screenshots/race-fix-day7.png`.
