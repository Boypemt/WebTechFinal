// =================================================================
// public/js/register-ui.js
// Owner: Farsai (UX Engineer)
// Commit: feat(pages): password strength indicator for register page
//
// WHY แยกออกจาก register.js?
// register.js ของ Arm จัดการ submit + error + redirect
// ถ้า Farsai เพิ่มใน register.js จะ conflict ตอน merge
// แยกไฟล์ = แยก ownership ชัดเจน
// =================================================================

/**
 * Password strength indicator
 *
 * แสดง hint ใต้ช่อง password แบบ real-time
 * ตรวจ 3 เงื่อนไขที่ตรงกับ PASSWORD_RE ของ Arm:
 *   /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
 *
 * WHY ตรวจ client-side ด้วยทั้งที่ server ก็ validate อยู่แล้ว?
 * Server validation คือ "ประตูกั้น" — บอกว่าผ่านหรือไม่ผ่านหลัง submit
 * Client-side indicator คือ "แผนที่" — บอก user ว่าต้องทำอะไรเพิ่ม
 * ทั้งสองมีหน้าที่ต่างกัน ไม่ซ้ำกัน
 */
function initPasswordStrength() {
    const input = document.getElementById('password');
    if (!input) return;

    // สร้าง indicator element และ inject ใต้ input
    // WHY สร้างใน JS ไม่ใช่ hardcode ใน HTML?
    // register-ui.js รับผิดชอบ feature นี้ทั้งหมด
    // ถ้า remove ไฟล์นี้ HTML ก็สะอาด ไม่มี element ค้างอยู่
    const bar = document.createElement('div');
    bar.id = 'password-strength';
    bar.setAttribute('aria-live', 'polite'); // screen reader announce เมื่อเปลี่ยน
    bar.setAttribute('aria-atomic', 'true');
    input.closest('.mb-3')?.appendChild(bar);

    // inject styles สำหรับ indicator
    // WHY ใส่ใน JS ไม่ใช่ main.css?
    // feature นี้ belong กับ register-ui.js ทั้งหมด
    // main.css ควรมีแค่ styles ที่หลายหน้าใช้ร่วมกัน
    const style = document.createElement('style');
    style.textContent = `
        #password-strength {
            margin-top: 6px;
            font-size: 0.78rem;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .pwd-rule {
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--clr-gray-400, #9ca3af);
            transition: color 150ms ease;
        }
        .pwd-rule.pass {
            color: var(--clr-success, #16a34a);
        }
        .pwd-rule__dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: currentColor;
            flex-shrink: 0;
            transition: background 150ms ease;
        }
    `;
    document.head.appendChild(style);

    // rules ตรงกับ PASSWORD_RE ของ Arm ทุกข้อ
    const RULES = [
        { id: 'len',    label: 'At least 8 characters', test: (v) => v.length >= 8 },
        { id: 'digit',  label: 'One digit (0–9)',        test: (v) => /\d/.test(v) },
        { id: 'symbol', label: 'One symbol (!@#…)',      test: (v) => /[^A-Za-z0-9]/.test(v) },
    ];

    // render rule rows ครั้งแรก (ทุก rule ยัง fail)
    bar.innerHTML = RULES.map((r) => `
        <span class="pwd-rule" id="pwd-rule-${r.id}">
            <span class="pwd-rule__dot"></span>
            ${r.label}
        </span>
    `).join('');

    // อัปเดต state แบบ real-time ทุกครั้งที่พิมพ์
    input.addEventListener('input', () => {
        const val = input.value;
        RULES.forEach((r) => {
            const el = document.getElementById(`pwd-rule-${r.id}`);
            if (!el) return;
            // toggle .pass class — CSS จัดการสีเอง ไม่ต้อง JS เซ็ต color
            el.classList.toggle('pass', r.test(val));
        });
    });

    // ซ่อน indicator เมื่อ input ว่าง (ก่อนที่ user จะเริ่มพิมพ์)
    input.addEventListener('focus', () => { bar.hidden = false; });
    input.addEventListener('blur',  () => {
        if (!input.value) bar.hidden = true;
    });

    bar.hidden = true; // ซ่อน default
}

// ─── Boot ──────────────────────────────────────────────────────────
initPasswordStrength();