// ===================================================================
// public/js/checkout.js — Checkout form submission + 409 handler
//
// Key responsibility: when the server returns 409 Conflict (workshop
// is full), surface a human-readable message that names the specific
// workshop — not a generic "something went wrong" — and visually flag
// that row in the order summary so the user knows exactly what to fix.
//
// HTTP status map:
//   201 Created    → clearCart(), show confirmation, hide form
//   400 Bad Request → show validation message from err.data.error
//   409 Conflict   → name the full workshop, highlight its table row
//   401            → redirect to /login.html (shouldn't reach here
//                     because initAuthUI already redirects, but kept
//                     as a safety net)
//   other          → generic fallback message
// ===================================================================
import { postCheckout }                       from './api.js';
import { isLoggedIn, getUser, initAuthUI }    from './auth.js';
import { getCart, clearCart, removeFromCart } from './cart.js';

// ── Hydrate the order summary from the cart ──────────────────────────

function hydrateSummary() {
    const cart    = getCart();
    const tbody   = document.getElementById('summary-items');
    const totalEl = document.getElementById('summary-total');
    if (!tbody) return;

    if (cart.length === 0) {
        tbody.innerHTML = `
          <tr>
                        <td colspan="4" class="text-center text-muted py-3">
              Your cart is empty.
              <a href="/index.html">Browse workshops →</a>
            </td>
          </tr>`;
        if (totalEl) totalEl.textContent = '฿0';
        return;
    }

    let total = 0;
    tbody.innerHTML = cart
        .map((item) => {
            const lineTotal = item.price * item.quantity;
            total += lineTotal;
            return `<tr data-workshop-id="${item.id}">
              <td>${item.title}</td>
              <td class="text-center">${item.quantity}</td>
              <td class="text-end">฿${lineTotal.toLocaleString()}</td>
                            <td class="text-center">
                                <button type="button"
                                                class="btn btn-sm btn-outline-danger remove-cart-item"
                                                data-workshop-id="${item.id}">
                                    Remove
                                </button>
                            </td>
            </tr>`;
        })
        .join('');

    if (totalEl) totalEl.textContent = `฿${total.toLocaleString()}`;
}

// ── Form submission ──────────────────────────────────────────────────

async function handleCheckoutSubmit(e) {
    e.preventDefault();

    const form      = e.target;
    const submitBtn = form.querySelector('[type="submit"]');
    const errorEl   = document.getElementById('checkout-error');
    const successEl = document.getElementById('checkout-success');

    // Reset banners
    if (errorEl)   { errorEl.hidden = true;  errorEl.textContent = ''; }
    if (successEl) { successEl.hidden = true; }
    clearRowHighlights();

    // Auth guard (belt-and-suspenders — initAuthUI already redirected)
    if (!isLoggedIn()) {
        window.location.href = `/login.html?redirect=${encodeURIComponent('/checkout.html')}`;
        return;
    }

    const cart = getCart();
    if (cart.length === 0) {
        showError(errorEl, 'Your cart is empty. Add a workshop before checking out.');
        return;
    }

    // C-1 fix: server expects full 16-digit card string, not last-4 only
    const rawCard = (form.card_number?.value || '').replace(/\D/g, '');
    if (!/^\d{16}$/.test(rawCard)) {
        showError(errorEl, 'Please enter a valid card number.');
        return;
    }

    const email = getUser()?.email;
    if (!email) {
        showError(errorEl, 'Could not read your email. Please log in again.');
        return;
    }

    // C-2 fix: server validates entry.id (not entry.workshop_id); unit_price is server-side only
    const items = cart.map((item) => ({
        id:       item.id,
        quantity: item.quantity,
    }));

    // Disable to prevent double-submit
    submitBtn.disabled    = true;
    submitBtn.textContent = 'Processing…';

    try {
        const result = await postCheckout({ email, card: rawCard, items });

        // ── 201 Created ──────────────────────────────────────────────
        clearCart();
        form.hidden = true;
        if (successEl) {
            successEl.hidden = false;
            successEl.innerHTML = `
              <strong>Booking confirmed!</strong>
              Your order ID is <strong>${result.order_id}</strong>.
              We've sent a confirmation to <strong>${email}</strong>.
              <a href="/index.html" class="alert-link ms-2">Browse more workshops →</a>`;
        }

    } catch (err) {
        // ── 409 Conflict — workshop full ─────────────────────────────
        if (err.status === 409) {
            const name = err.data?.title || `workshop #${err.data?.workshop_id}`;
            showError(
                errorEl,
                `Sorry — "${name}" just sold its last seat while you were checking out. ` +
                `Please remove it from your cart and try again.`
            );
            highlightFullItem(err.data?.workshop_id);

        // ── 401 — token expired mid-session ─────────────────────────
        } else if (err.status === 401) {
            window.location.href = `/login.html?redirect=${encodeURIComponent('/checkout.html')}`;

        // ── Other errors (400 validation, 404, 500) ──────────────────
        } else {
            showError(errorEl, err.data?.error || err.message || 'Something went wrong. Please try again.');
        }

    } finally {
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Confirm Booking';
    }
}

// ── UI helpers ───────────────────────────────────────────────────────

function showError(el, message) {
    if (!el) { console.error('[checkout]', message); return; }
    el.textContent = message;
    el.hidden      = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Visually flags the row of the workshop that returned 409. */
function highlightFullItem(workshopId) {
    if (!workshopId) return;
    const row = document.querySelector(`#summary-items tr[data-workshop-id="${workshopId}"]`);
    if (row) row.classList.add('table-danger');
}

function clearRowHighlights() {
    document.querySelectorAll('#summary-items tr.table-danger')
        .forEach((row) => row.classList.remove('table-danger'));
}

document.getElementById('summary-items')?.addEventListener('click', (e) => {
    const button = e.target.closest('.remove-cart-item');
    if (!button) return;

    removeFromCart(Number(button.dataset.workshopId));
    clearRowHighlights();
    hydrateSummary();
});

// ── Boot ─────────────────────────────────────────────────────────────
// requireAuth: true → redirects to /login.html when no valid token exists.
initAuthUI({ requireAuth: true });
hydrateSummary();

document.getElementById('checkout-form')
    ?.addEventListener('submit', handleCheckoutSubmit);