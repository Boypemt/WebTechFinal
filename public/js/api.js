// ===================================================================
// public/js/api.js — Centralised API client
//
// ALL fetch() calls go through request() so that:
//   • the Authorization header is attached automatically when a token exists
//   • HTTP errors are normalised into throwable Error objects with .status
//     and .data so callers can inspect status codes (e.g. 409 Conflict)
//   • the BASE_URL is in one place — changing environments requires no
//     changes in any page-level script
//
// Exported functions cover every endpoint the frontend needs.
// ===================================================================

const BASE_URL = 'http://localhost:3000/api';

// ── Core helper ─────────────────────────────────────────────────────

/**
 * Thin wrapper around fetch() that handles JSON serialisation,
 * JWT injection, and error normalisation.
 *
 * @param {string} path    API path, e.g. '/workshops'
 * @param {RequestInit} [options={}]  Standard fetch init object
 * @returns {Promise<any>} Parsed JSON body on success
 * @throws {Error & { status: number, data: object }} on any non-2xx response
 */
async function request(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    // Attach JWT from auth.js when one is stored (transparent to callers).
    const token = localStorage.getItem('jwt_token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    const data     = await response.json();

    if (!response.ok) {
        // Normalise into a throwable so catch blocks can branch on status.
        // err.data preserves the full server payload (e.g. workshop_id on 409).
        const err    = new Error(data.error || `HTTP ${response.status}`);
        err.status   = response.status;
        err.data     = data;
        throw err;
    }

    return data;
}

// ── Workshop endpoints ───────────────────────────────────────────────

/**
 * GET /api/workshops[?category=…]
 * @param {string} [category]  Optional category filter
 * @returns {Promise<{ success: boolean, count: number, data: Workshop[] }>}
 */
export function getWorkshops(category) {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return request(`/workshops${qs}`);
}

/**
 * GET /api/workshops/:id
 * @param {number} id
 * @returns {Promise<{ success: boolean, data: Workshop }>}
 */
export function getWorkshop(id) {
    return request(`/workshops/${id}`);
}

// ── Auth endpoints ───────────────────────────────────────────────────

/**
 * POST /api/register
 * @param {{ email: string, password: string, first_name: string }} body
 * @returns {Promise<{ success: boolean, token: string, user: object }>}
 */
export function postRegister({ email, password, first_name }) {
    return request('/register', {
        method: 'POST',
        body:   JSON.stringify({ email, password, first_name }),
    });
}

/**
 * POST /api/login
 * @param {{ email: string, password: string }} body
 * @returns {Promise<{ success: boolean, token: string, user: object }>}
 */
export function postLogin({ email, password }) {
    return request('/login', {
        method: 'POST',
        body:   JSON.stringify({ email, password }),
    });
}

// ── Checkout endpoint ────────────────────────────────────────────────

/**
 * POST /api/checkout  (JWT required — request() injects it automatically)
 *
 * @param {{ email: string, card_last4: string, items: CheckoutItem[] }} body
 * @returns {Promise<{ success: boolean, order_id: string }>}
 * @throws on 409 — err.data.workshop_id identifies the full workshop
 *
 * @typedef {{ workshop_id: number, quantity: number, unit_price: number }} CheckoutItem
 */
// C-1 fix: renamed card_last4 → card to match checkoutController's expected field name
export function postCheckout({ email, card, items }) {
    return request('/checkout', {
        method: 'POST',
        body:   JSON.stringify({ email, card, items }),
    });
}