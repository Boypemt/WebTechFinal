// =================================================================
// public/js/ui.js
// Owner: Farsai (UX Engineer)
// Commit: feat(ui): add category tabs, debounce search, toast, cart bump
//
// ไฟล์นี้รับผิดชอบ UI interaction ทั้งหมดที่ไม่ใช่ data fetching
// Arm's catalog.js จะ import { loadCatalog } แล้วส่งมาให้ ui.js
// เรียกใช้เมื่อ user กด category หรือพิมพ์ใน search
//
// exports:
//   initCategoryTabs(loadCatalog)  — สร้าง filter buttons + wire events
//   initSearchDebounce(loadCatalog) — wire search input + 300ms debounce
//   showToast(message)              — toast notification
//   bumpCartBadge()                 — animate #cart-count badge
// =================================================================

// ─── Debounce utility ──────────────────────────────────────────────
/**
 * WHY DEBOUNCE?
 * ถ้า user พิมพ์ "sourdough" เร็วๆ จะเกิด 'input' event 9 ครั้ง
 * ถ้าแต่ละครั้ง call API → 9 requests ซึ่งเป็น race condition
 * (response ที่ 3 อาจมาทีหลัง response ที่ 7 ทำให้ผลผิด)
 *
 * Debounce แก้ด้วยการ "reset timer ทุกครั้งที่ fn ถูกเรียก"
 * fn จริงจะทำงานก็ต่อเมื่อ user หยุดพิมพ์ครบ `delay` ms
 *
 * @param {Function} fn     ฟังก์ชันที่ต้องการ debounce
 * @param {number}   delay  ms ที่ต้องรอหลังการเรียกครั้งสุดท้าย
 * @returns {Function}      wrapped function
 *
 * ตัวอย่าง:
 *   const debouncedSearch = debounce(search, 300);
 *   input.addEventListener('input', debouncedSearch);
 *   // user พิมพ์ "hi" เร็วๆ → timer reset 2 ครั้ง → search("hi") เรียกครั้งเดียว
 */
export function debounce(fn, delay) {
    let timerId;

    return function (...args) {
        // ยกเลิก timer เก่าทุกครั้งที่ถูกเรียก
        clearTimeout(timerId);

        // ตั้ง timer ใหม่ — ถ้าไม่มีการเรียกซ้ำใน `delay` ms
        // fn จริงจะทำงาน
        timerId = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}


// ─── Category tab data ─────────────────────────────────────────────
/*
   WHY HARDCODE CATEGORIES ใน JS?
   Workshop categories มาจาก seed.js ที่กำหนดไว้ตายตัว 4 หมวด
   ถ้า fetch categories จาก API จะต้องรอ request แยก และทำให้
   tabs render ช้าก่อน workshops โหลด ไม่คุ้มค่า

   ถ้าอนาคตมี category ใหม่ แค่เพิ่มใน array นี้
*/
const CATEGORIES = [
    { label: 'All',     value: undefined,   color: '#4b5563', dot: '#9ca3af' },
    { label: 'Tech',    value: 'Tech',       color: '#2563eb', dot: '#2563eb' },
    { label: 'Cooking', value: 'Cooking',    color: '#f97316', dot: '#f97316' },
    { label: 'Music',   value: 'Music',      color: '#16a34a', dot: '#16a34a' },
    { label: 'Art',     value: 'Art',        color: '#a855f7', dot: '#a855f7' },
];


// ─── initCategoryTabs ──────────────────────────────────────────────
/**
 * สร้าง category filter buttons ใน #category-tabs แบบ dynamic
 * แล้ว wire click event ผ่าน event delegation (1 listener บน container)
 *
 * WHY EVENT DELEGATION?
 * แทนที่จะ addEventListener บนแต่ละปุ่ม (5 listeners)
 * เราเพิ่ม listener แค่ 1 ตัวบน parent #category-tabs
 * แล้วใช้ e.target.closest('.category-tab') เพื่อหาว่า click ที่ปุ่มไหน
 *
 * ข้อดี:
 * - ถ้า categories เปลี่ยนแปลง (re-render) listeners ยังทำงานได้
 * - ประหยัด memory — 1 listener แทน N listeners
 *
 * @param {Function} loadCatalog  Arm's function จาก catalog.js
 */
export function initCategoryTabs(loadCatalog) {
    const container = document.getElementById('category-tabs');
    if (!container) return;

    // ── Render tabs ──────────────────────────────────────────────
    container.innerHTML = CATEGORIES.map((cat) => `
        <button
            class="category-tab${cat.value === undefined ? ' category-tab--active' : ''}"
            data-category="${cat.value ?? ''}"
            style="--tab-color: ${cat.color}"
            aria-pressed="${cat.value === undefined ? 'true' : 'false'}"
        >
            <span class="category-tab__dot" style="background:${cat.dot}"></span>
            ${cat.label}
        </button>
    `).join('');

    /*
       WHY data-category="" สำหรับ "All"?
       Arm's loadCatalog() รับ category เป็น string หรือ undefined
       เราเก็บเป็น empty string แล้วแปลงใน handler ด้านล่าง
       เพื่อให้ HTML attribute ไม่มี undefined เป็น string literal
    */

    let currentCategory = undefined;  // track state เพื่อ prevent double-load

    // ── Event delegation ─────────────────────────────────────────
    container.addEventListener('click', (e) => {
        const tab = e.target.closest('.category-tab');
        if (!tab) return;  // click นอก tab — ignore

        // อ่าน category จาก data attribute
        const rawValue = tab.dataset.category;
        const category = rawValue === '' ? undefined : rawValue;

        // prevent re-loading ถ้า click tab เดิม
        if (category === currentCategory) return;
        currentCategory = category;

        // update active state — ลบจากทุก tab แล้วเพิ่มให้แค่อันที่ click
        container.querySelectorAll('.category-tab').forEach((t) => {
            const isActive = t === tab;
            t.classList.toggle('category-tab--active', isActive);
            t.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        // ── Mobile: scroll selected tab into view ────────────────
        // WHY scrollIntoView?
        // บน mobile #category-tabs scroll แนวนอน (overflow-x: auto)
        // tab ที่เลือกอาจอยู่นอก viewport เช่น กด "Art" ขณะที่ scroll
        // อยู่ซ้ายสุด — scrollIntoView เลื่อนให้เห็น tab ที่เลือกเสมอ
        // behavior: 'smooth' ทำให้รู้สึก native ไม่กระตุก
        // block: 'nearest' ป้องกัน page scroll แนวตั้ง (scroll แค่ tabs)
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

        // เรียก Arm's loadCatalog ด้วย category ที่เลือก
        loadCatalog(category);
    });

    // ── Keyboard arrow navigation ────────────────────────────────
    /*
       WHY ARROW KEY NAV?
       WCAG 4.1.2 กำหนดว่า widget ที่มีหลาย option ควรใช้ arrow keys
       ตาม "roving tabindex" pattern:
         → หรือ ↓ : ไป tab ถัดไป
         ← หรือ ↑ : ไป tab ก่อนหน้า
         Home      : ไป tab แรก
         End       : ไป tab สุดท้าย

       WHY keydown ไม่ใช่ keyup?
       keydown fires ซ้ำๆ เมื่อ hold key — ทำให้ navigation ลื่น
       keyup fires ครั้งเดียวตอนปล่อย — รู้สึก laggy
    */
    container.addEventListener('keydown', (e) => {
        const tabs = [...container.querySelectorAll('.category-tab')];
        const current = document.activeElement;
        const idx = tabs.indexOf(current);
        if (idx === -1) return; // focus ไม่ได้อยู่บน tab

        let next = -1;

        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            // วนกลับมาอันแรกถ้าถึงอันสุดท้าย
            next = (idx + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            // วนไปอันสุดท้ายถ้าอยู่อันแรก
            next = (idx - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
            next = 0;
        } else if (e.key === 'End') {
            next = tabs.length - 1;
        } else {
            return; // key อื่นไม่ต้อง handle
        }

        e.preventDefault(); // ป้องกัน page scroll เมื่อกด Arrow/Home/End
        tabs[next].focus();
        tabs[next].click(); // trigger click handler ที่มีอยู่แล้ว
    });
}


// ─── initSearchDebounce ────────────────────────────────────────────
/**
 * Wire #search-input → debounce 300ms → loadCatalog()
 *
 * Logic flow:
 *   user พิมพ์ → input event → debounce timer reset
 *   → หยุดพิมพ์ 300ms → loadCatalog(query) ถูกเรียก
 *
 * NOTE: search ใช้ 'input' event ไม่ใช่ 'keyup'
 * เพราะ 'input' fires ทั้งตอนพิมพ์, paste, และ clear (X button)
 * 'keyup' พลาด กรณี paste และ clear
 *
 * @param {Function} loadCatalog  Arm's function จาก catalog.js
 */
export function initSearchDebounce(loadCatalog) {
    const input = document.getElementById('search-input');
    if (!input) return;

    /*
       WHY 300ms?
       - 100ms: เร็วเกิน — ยังพิมพ์ไม่ทัน API call แล้ว
       - 300ms: sweet spot ตาม UX research — user รู้สึก responsive
                แต่ไม่ส่ง request ทุก keystroke
       - 500ms: ช้าไป — รู้สึก lag
    */
    const handleInput = debounce((e) => {
        const query = e.target.value.trim();

        /*
           ถ้า search ว่าง → โหลด catalog ปกติ (ไม่ filter)
           ถ้ามี query → ส่งไปให้ loadCatalog กรอง
           (ในโปรเจคนี้ Arm filter ที่ URL query string หรือ client-side
            ขึ้นอยู่กับ implementation ของ catalog.js)
        */
        loadCatalog(undefined, query || undefined);
    }, 300);

    input.addEventListener('input', handleInput);

    // clear button บน mobile (type="search" มี X button built-in)
    input.addEventListener('search', () => {
        if (input.value === '') loadCatalog(undefined);
    });
}


// ─── showToast ─────────────────────────────────────────────────────
/**
 * แสดง toast notification ที่มุมล่างขวา
 *
 * WHY NOT ALERT() หรือ BOOTSTRAP TOAST?
 * alert() block thread — user ทำอะไรไม่ได้ระหว่างรอ click OK
 * Bootstrap Toast ต้องการ markup ใน HTML ล่วงหน้า
 * เราสร้าง element แบบ programmatic แล้วลบทิ้ง → clean กว่า
 *
 * @param {string} message   ข้อความใน toast
 * @param {number} [duration=2500]  ms ก่อนหายไป
 */
export function showToast(message, duration = 2500) {
    // สร้าง element ใหม่ทุกครั้ง เพื่อรองรับการเรียกซ้ำกัน
    const toast = document.createElement('div');
    toast.className = 'toast-cart';
    toast.textContent = message;
    toast.setAttribute('role', 'status');       // screen reader announce
    toast.setAttribute('aria-live', 'polite');

    document.body.appendChild(toast);

    // force reflow — ให้ browser "เห็น" element ก่อน add class
    // ไม่งั้น transition จะไม่ทำงานเพราะ element เพิ่งสร้าง
    toast.getBoundingClientRect();
    toast.classList.add('toast-cart--show');

    // ลบ class เพื่อ trigger fade out
    setTimeout(() => {
        toast.classList.remove('toast-cart--show');

        // รอ transition เสร็จแล้วค่อยลบออกจาก DOM
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}


// ─── bumpCartBadge ─────────────────────────────────────────────────
/**
 * Animate cart count badge เมื่อมีของเพิ่มลง cart
 *
 * WHY REMOVE/RE-ADD CLASS?
 * ถ้า user click "Book Seat" 2 ครั้งเร็วๆ class .bump
 * อาจยังอยู่จากครั้งแรก ทำให้ animation ไม่ trigger ซ้ำ
 * วิธีแก้คือ remove → force reflow → add ใหม่
 */
export function bumpCartBadge() {
    const badge = document.getElementById('cart-count');
    if (!badge) return;

    badge.classList.remove('bump');
    badge.getBoundingClientRect();  // force reflow
    badge.classList.add('bump');

    // ลบ class หลัง animation เสร็จ (150ms ตาม CSS transition)
    setTimeout(() => badge.classList.remove('bump'), 300);
}