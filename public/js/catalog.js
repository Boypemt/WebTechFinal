// ===================================================================
// public/js/catalog.js — Hydrates the workshop catalog from the API
//
// Arm owns: fetch data → render into DOM skeleton.
// Farsai owns: .workshop-card CSS classes, capacity badge styles,
//              debounced search (300ms), Book Seat click handler UX.
//
// Arm's renderWorkshops() produces the raw HTML structure and
// semantic class names; Farsai's CSS makes it look good.
// ===================================================================
import { getWorkshops }         from './api.js';
import { initAuthUI }           from './auth.js';
import { addToCart, getCartCount } from './cart.js';
// ── Farsai's UI utilities ---────────────────────────────────────────
import {
    initCategoryTabs,
    initSearchDebounce,
    showToast,
    bumpCartBadge,
} from './ui.js';

const KNOWN_CATEGORIES = ['tech', 'cooking', 'music', 'art'];

// ── DOM refs ─────────────────────────────────────────────────────────
const catalogEl   = document.getElementById('catalog');
const skeletonEl  = document.getElementById('catalog-skeleton');
const errorEl     = document.getElementById('catalog-error');
const cartCountEl = document.getElementById('cart-count');

// ── Skeleton builder ─────────────────────────────────────────────
// ต้องการ skeleton 6 ใบ (2 แถวบน desktop)
// ถ้า hardcode ใน HTML จะต้องแก้ 2 ที่เมื่อเปลี่ยนจำนวน
// สร้างแบบ programmatic ให้เปลี่ยนแค่ SKELETON_COUNT บรรทัดเดียว
const SKELETON_COUNT = 6;
 
function buildSkeletons() {
    if (!skeletonEl) return;
    skeletonEl.innerHTML = Array.from({ length: SKELETON_COUNT }, () => `
        <div class="col">
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton-body">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text skeleton-text--short"></div>
                    <div class="skeleton skeleton-btn"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ── Render ───────────────────────────────────────────────────────────

/**
 * Converts an array of Workshop objects (from the API) into card HTML
 * and injects it into #catalog.
*/
// Farsai เพิ่ม data-badge และ data-cat attribute
// เพื่อให้ CSS rule ใน main.css จับสีได้โดยไม่ต้องใช้ JS
//
// ก่อนหน้า (Arm เดิม):
//   <span class="workshop-badge">${w.badge}</span>
//   <span class="workshop-card__category">${w.category}</span>
//
// หลัง integrate (Farsai เพิ่ม data-* attributes):
//   <span class="workshop-badge" data-badge="${w.badge}">...</span>
//   <span class="workshop-card__category" data-cat="${w.category}">...</span>
// ทำงานได้ใน CSS ล้วนๆ โดยไม่ต้อง switch/if ใน JS
// ถ้ามี badge ใหม่ แค่เพิ่ม CSS rule เดียว ไม่ต้องแก้ JS
function renderWorkshops(workshops) {
    if (!catalogEl) return;
 
    if (workshops.length === 0) {
        catalogEl.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <p>No workshops found. Try a different category or search term.</p>
            </div>`;
        return;
    }
 
    catalogEl.innerHTML = workshops.map((w) => {
        const seatsLeft = w.maxCapacity - w.currentBookings;
        const isFull    = seatsLeft <= 0;
        const isLow     = !isFull && seatsLeft <= 5; // seats--low เพิ่มโดย Farsai
 
        // badge — เพิ่ม data-badge เพื่อให้ CSS จับสีได้
        const badgeHtml = w.badge
            ? `<span class="workshop-badge" data-badge="${w.badge}">${w.badge}</span>`
            : '';
 
        const ratingHtml = w.rating
            ? `<span class="workshop-card__rating">★ ${w.rating.toFixed(1)}</span>
               <span class="workshop-card__review-count">(${w.reviewCount})</span>`
            : '';
 
        // seats class — Farsai เพิ่ม seats--low เมื่อเหลือ ≤ 5
        const seatsClass = isFull ? 'seats--full' : isLow ? 'seats--low' : 'seats--open';
        const seatsText  = isFull
            ? 'Full'
            : isLow
                ? `⚡ ${seatsLeft} left!`        // urgent text เมื่อเหลือน้อย
                : `${seatsLeft} seat${seatsLeft !== 1 ? 's' : ''} left`;
 
        return `
            <div class="col" data-workshop-id="${w.id}">
                <article class="workshop-card h-100" aria-label="${w.title}">
                    ${badgeHtml}
                    <img class="workshop-card__img"
                         src="${w.image || '/img/placeholder.jpg'}"
                         alt="${w.title}"
                         loading="lazy" />
                    <div class="workshop-card__body">
                        <span class="workshop-card__category"
                              data-cat="${w.category}">${w.category}</span>
                        <h3 class="workshop-card__title">${w.title}</h3>
                        <p  class="workshop-card__instructor">with ${w.instructor}</p>
                        <p  class="workshop-card__desc">${w.description || ''}</p>
 
                        <div class="workshop-card__meta">
                            <span class="workshop-card__price">
                                ฿${w.price.current.toLocaleString()}
                            </span>
                            <span class="workshop-card__seats ${seatsClass}"
                                  aria-label="${isFull ? 'Workshop full' : `${seatsLeft} seats remaining`}">
                                ${seatsText}
                            </span>
                            ${ratingHtml}
                        </div>
 
                        <button class="btn-book-seat"
                                data-id="${w.id}"
                                data-title="${w.title}"
                                data-price="${w.price.current}"
                                ${isFull ? 'disabled' : ''}
                                aria-disabled="${isFull}">
                            ${isFull ? 'Workshop Full' : 'Book Seat'}
                        </button>
                    </div>
                </article>
            </div>`;
    }).join('');
}
// ── Fetch + render lifecycle ─────────────────────────────────────────
// ── loadCatalog (Arm's — Farsai ไม่แก้ logic) ───────────────────
// รับ category และ query (query เพิ่มโดย Farsai เพื่อ search)
// initSearchDebounce ใน ui.js จะเรียก loadCatalog(undefined, query)
// เมื่อ user พิมพ์ใน search — แยก concern ออกจาก category filter
export async function loadCatalog(category, query) {
    buildSkeletons();
    if (skeletonEl) skeletonEl.hidden = false;
    if (catalogEl)  catalogEl.innerHTML = '';
    if (errorEl)    errorEl.hidden = true;

    // aria-busy: true → screen reader รู้ว่ากำลังโหลด ไม่ announce content เก่า
    // WHY setAttribute ไม่ใช่ property?
    // aria-busy เป็น ARIA attribute ต้องใช้ setAttribute เพื่อให้ browser
    // ส่งต่อไปยัง accessibility tree ถูกต้อง
    if (skeletonEl) skeletonEl.setAttribute('aria-busy', 'true');
    if (catalogEl)  catalogEl.setAttribute('aria-busy', 'true');
 
    try {
        const { data } = await getWorkshops(category);
 
        // client-side search filter
        // WHY CLIENT-SIDE?
        // API /api/workshops รับแค่ ?category= ไม่มี ?search=
        // การทำ server-side search ต้องแก้ backend (Arm's territory)
        // ระหว่างที่ยังไม่มี search endpoint เราทำ filter บน data ที่ได้มา
        // ข้อเสีย: ถ้า category มี 1000 workshops จะ fetch ทั้งหมดมาก่อน
        // แต่สำหรับ project ขนาดนี้ (seed 12 workshops) ไม่เป็นปัญหา
        const normalizedQuery = query ? query.toLowerCase() : '';
        const isCategoryQuery = KNOWN_CATEGORIES.includes(normalizedQuery);
        const filtered = normalizedQuery
            ? data.filter((w) =>
                isCategoryQuery
                    ? w.category.toLowerCase() === normalizedQuery
                    : w.title.toLowerCase().includes(normalizedQuery) ||
                      w.instructor.toLowerCase().includes(normalizedQuery) ||
                      w.category.toLowerCase().includes(normalizedQuery) ||
                      (w.description || '').toLowerCase().includes(normalizedQuery)
            )
            : data;
 
        renderWorkshops(filtered);
    } catch (err) {
        console.error('[catalog] failed to load workshops', err);
        if (errorEl) {
            errorEl.textContent = 'Could not load workshops. Please try again later.';
            errorEl.hidden = false;
        }
    } finally {
        if (skeletonEl) skeletonEl.hidden = true;

         // aria-busy: false → screen reader announce content ใหม่ได้แล้ว
        if (skeletonEl) skeletonEl.setAttribute('aria-busy', 'false');
        if (catalogEl)  catalogEl.setAttribute('aria-busy', 'false');
    }
}
 
// ── Event delegation — "Book Seat" clicks ───────────────────────
// Arm's logic + Farsai เพิ่ม showToast และ bumpCartBadge
//
// WHY EVENT DELEGATION บน catalogEl แทน button แต่ละใบ?
// renderWorkshops() สร้าง DOM ใหม่ทุกครั้งที่ filter เปลี่ยน
// ถ้า addEventListener บน button โดยตรง listener จะหายไปทุกครั้ง
// ที่ innerHTML ถูก replace — ต้อง re-attach ทุกครั้ง
//
// Event delegation แก้ด้วยการฟัง event ที่ parent ซึ่งไม่เคย
// ถูก replace แล้วใช้ e.target.closest() เพื่อหา button ที่ถูก click
catalogEl?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-book-seat');
    if (!btn || btn.disabled) return;
 
    // addToCart (Arm's cart.js)
    addToCart({
        id:    Number(btn.dataset.id),
        title: btn.dataset.title,
        price: Number(btn.dataset.price),
    });
 
    // ── Farsai: visual feedback ──────────────────────────────────
    // 1. flash ปุ่มให้เป็นสีเขียวชั่วคราว (CSS class --added)
    //    WHY ไม่เปลี่ยน textContent ทันที?
    //    เพราะ textContent เปลี่ยนแล้วต้องเปลี่ยนกลับ ซึ่ง race กับ
    //    setTimeout ถ้า user click เร็วๆ หลายครั้ง
    //    ใช้ CSS class toggle แทน — browser จัดการ timing เอง
    btn.classList.add('btn-book-seat--added');
    setTimeout(() => btn.classList.remove('btn-book-seat--added'), 600);
 
    // 2. update cart count badge บน navbar
    if (cartCountEl) cartCountEl.textContent = getCartCount();
 
    // 3. animate badge (Farsai's bumpCartBadge จาก ui.js)
    bumpCartBadge();
 
    // 4. toast notification (Farsai's showToast จาก ui.js)
    showToast(`"${btn.dataset.title}" added to cart`);
});
 
// ── Keep cart badge in sync (cart:change event จาก cart.js) ─────
// กรณี user เปิดหน้าอื่นแล้วกลับมา หรือ removeFromCart ถูกเรียกที่อื่น
window.addEventListener('cart:change', ({ detail }) => {
    if (cartCountEl) cartCountEl.textContent = detail.count;
});
 

// ── Boot ─────────────────────────────────────────────────────────────
//   1. initAuthUI()             — ต้องก่อนเพื่อให้ navbar แสดง login state
//   2. initCategoryTabs(...)    — render ปุ่ม category + wire click
//   3. initSearchDebounce(...)  — wire search input + debounce
//   4. loadCatalog()            — load workshop ครั้งแรก (ไม่ filter)
//
// WHY ส่ง loadCatalog เข้า initCategoryTabs และ initSearchDebounce?
// เพื่อหลีกเลี่ยง circular import:
//   ถ้า ui.js import loadCatalog จาก catalog.js
//   และ catalog.js import initCategoryTabs จาก ui.js
//   → circular dependency → module bundler อาจ error
// แทนที่จะ import cross กัน เราใช้ dependency injection:
//   catalog.js ส่ง loadCatalog ให้ ui.js เป็น parameter
//   ui.js ไม่ต้อง import อะไรจาก catalog.js เลย

initAuthUI();
initCategoryTabs(loadCatalog);
initSearchDebounce(loadCatalog);
loadCatalog();