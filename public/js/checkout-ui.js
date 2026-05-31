// =================================================================
// public/js/checkout-ui.js
// Owner: Farsai (UX Engineer)
// Commit: feat(pages): card number formatter, masking, empty-cart state
//
// WHY แยกไฟล์นี้ออกจาก checkout.js ของ Arm?
// checkout.js มี handleCheckoutSubmit, hydrateSummary, 409 handler
// ทั้งหมดนั้นเป็น Arm's territory — ถ้า Farsai แก้ใน checkout.js
// จะเกิด merge conflict ทุก sprint
//
// แทนที่จะเขียนทับ เราเพิ่ม event listeners แยกบน element เดิม
// DOM เป็น shared interface ระหว่าง Arm และ Farsai
// =================================================================

// ─── Card number formatter ─────────────────────────────────────────
/**
 * Auto-format card input เป็น "1234 5678 9012 3456" ขณะพิมพ์
 *
 * WHY FORMAT ขณะพิมพ์?
 * User จำเลข 16 หลักติดกันยากมาก "4242424242424242"
 * การแบ่งกลุ่ม 4 ตัวช่วย visual scanning และลด error
 *
 * WHY ไม่ใช้ input type="number"?
 * type="number" บน mobile แสดง numpad แต่ไม่รองรับ spaces
 * และบน desktop จะมีลูกศรขึ้น/ลงที่น่ารำคาญ
 * ใช้ type="text" + inputmode="numeric" แทน (มีใน checkout.html แล้ว)
 *
 * Logic:
 *   1. strip ทุกอย่างที่ไม่ใช่ตัวเลข
 *   2. จำกัดที่ 16 หลัก
 *   3. แบ่งกลุ่ม 4 ตัวด้วย space
 *   4. เซ็ตค่ากลับ
 */
function initCardFormatter() {
    const input = document.getElementById('card_number');
    if (!input) return;

    input.addEventListener('input', (e) => {
        // เก็บ cursor position ก่อน เพื่อ restore หลัง reformat
        const cursorPos = e.target.selectionStart;
        const prevLen   = e.target.value.length;

        // strip non-digits → limit 16 → split กลุ่ม 4
        const digits    = e.target.value.replace(/\D/g, '').slice(0, 16);
        const formatted = digits.match(/.{1,4}/g)?.join(' ') ?? '';

        e.target.value = formatted;

        // restore cursor: ถ้า formatted ยาวขึ้น (เพิ่ม space) ให้ขยับไปด้วย
        const diff = formatted.length - prevLen;
        e.target.setSelectionRange(cursorPos + diff, cursorPos + diff);
    });

    // ─── Masking on blur ──────────────────────────────────────────
    /**
     * เมื่อ user ออกจาก field แสดง "•••• •••• •••• 3456"
     *
     * WHY MASK?
     * PCI-DSS กำหนดว่าห้ามแสดงเลขบัตรเต็ม — masking ป้องกัน
     * shoulder surfing (คนมองหน้าจอ)
     *
     * เก็บค่าจริงใน dataset.realValue เพื่อให้ Arm's checkout.js
     * อ่านค่าได้ตอน submit ผ่าน input.dataset.realValue
     * (หรือ Arm อ่านผ่าน .replace(/\D/g,'') ก็ยังได้เพราะ • ถูก strip)
     */
    input.addEventListener('blur', () => {
        const digits = input.value.replace(/\D/g, '');
        if (digits.length < 4) return; // ยังพิมพ์ไม่ครบ ไม่ mask

        // เก็บค่าจริงไว้ก่อน
        input.dataset.realValue = digits;

        // แสดง masked version
        const last4   = digits.slice(-4);
        input.value   = `•••• •••• •••• ${last4}`;
        input.dataset.masked = 'true';
    });

    // ─── Unmask on focus ─────────────────────────────────────────
    // เมื่อ user กลับมา focus ให้เห็นเลขจริงเพื่อแก้ได้
    input.addEventListener('focus', () => {
        if (input.dataset.masked !== 'true') return;

        const digits    = input.dataset.realValue ?? '';
        input.value     = digits.match(/.{1,4}/g)?.join(' ') ?? '';
        input.dataset.masked = 'false';

        // เลือก text ทั้งหมดเพื่อให้ user พิมพ์ทับได้เลย
        setTimeout(() => input.select(), 0);
    });
}

// ─── Empty cart state ──────────────────────────────────────────────
/**
 * ถ้า cart ว่าง ให้แสดง empty-state ที่ styled แทน plain text
 *
 * WHY ทำใน Farsai's file ไม่ใช่ checkout.js?
 * hydrateSummary() ของ Arm แสดง text ธรรมดาอยู่แล้ว
 * Farsai แค่ enhance ด้วย CSS class หลัง Arm render เสร็จ
 * ใช้ MutationObserver เพื่อรอให้ hydrateSummary() inject HTML ก่อน
 */
function initEmptyCartStyle() {
    const tbody = document.getElementById('summary-items');
    if (!tbody) return;

    const observer = new MutationObserver(() => {
        const emptyRow = tbody.querySelector('td[colspan="3"]');
        if (emptyRow) {
            // Arm inject plain empty message — Farsai เพิ่ม class
            emptyRow.closest('tr')?.classList.add('empty-cart-row');
        }
    });

    observer.observe(tbody, { childList: true });
}

// ─── Boot ──────────────────────────────────────────────────────────
// ทำงานเฉพาะ checkout page — getElementById จะ return null บนหน้าอื่น
// ทุก init function ตรวจ null ก่อนทำงาน ปลอดภัยถ้าโหลดผิดหน้า
initCardFormatter();
initEmptyCartStyle();