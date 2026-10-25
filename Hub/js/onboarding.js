// onboarding.js — New Player Walkthrough & Interactive Tutorial Carousel
// Provides a step-by-step visual onboarding guide with illustrations, rich explanations, and controls

const STORAGE_KEY = 'tc_tutorial_seen';

// Vector SVG Illustrations for each step
const STEP_GRAPHICS = [
  // Step 1: Explore & GPS Navigation
  `<svg viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="200" rx="16" fill="#F0FDF4"/>
    <!-- Map grid paths -->
    <path d="M40 150 L120 70 L200 120 L280 40" stroke="#86EFAC" stroke-width="4" stroke-linecap="round" stroke-dasharray="6 6"/>
    <path d="M60 40 L160 160 L240 80" stroke="#BBF7D0" stroke-width="3" stroke-linecap="round"/>
    <!-- Road ribbon -->
    <path d="M20 160 C 100 130, 160 170, 300 80" stroke="#10B981" stroke-width="12" stroke-linecap="round" opacity="0.3"/>
    <path d="M20 160 C 100 130, 160 170, 300 80" stroke="#059669" stroke-width="8" stroke-linecap="round"/>
    <path d="M20 160 C 100 130, 160 170, 300 80" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="8 8" stroke-linecap="round"/>
    <!-- Compass Rose -->
    <circle cx="70" cy="65" r="28" fill="#FFFFFF" filter="drop-shadow(0 4px 8px rgba(0,0,0,0.06))"/>
    <polygon points="70,45 76,65 70,60" fill="#EF4444"/>
    <polygon points="70,85 76,65 70,60" fill="#94A3B8"/>
    <polygon points="70,45 64,65 70,60" fill="#DC2626"/>
    <polygon points="70,85 64,65 70,60" fill="#64748B"/>
    <circle cx="70" cy="65" r="4" fill="#0F172A"/>
    <!-- Landmark Pin (Wat Arun silhouette) -->
    <g transform="translate(195, 45)" filter="drop-shadow(0 8px 16px rgba(5,150,105,0.3))">
      <circle cx="25" cy="25" r="25" fill="#10B981"/>
      <path d="M25 50 L18 35 C15 30 35 30 32 35 Z" fill="#10B981"/>
      <circle cx="25" cy="22" r="16" fill="#FFFFFF"/>
      <text x="25" y="28" font-size="18" text-anchor="middle">📍</text>
    </g>
    <!-- GPS Navigation Pulse Tag -->
    <g transform="translate(180, 130)">
      <rect width="115" height="34" rx="17" fill="#0F172A" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.15))"/>
      <circle cx="18" cy="17" r="7" fill="#10B981"/>
      <circle cx="18" cy="17" r="11" stroke="#10B981" stroke-width="1.5" opacity="0.6"/>
      <text x="36" y="22" fill="#FFFFFF" font-size="12" font-weight="bold" font-family="sans-serif">🧭 นำทาง GPS</text>
    </g>
  </svg>`,

  // Step 2: Quests & Missions
  `<svg viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="200" rx="16" fill="#EFF6FF"/>
    <!-- Quest Scroll Card -->
    <rect x="50" y="30" width="220" height="145" rx="14" fill="#FFFFFF" filter="drop-shadow(0 8px 20px rgba(37,99,235,0.12))"/>
    <!-- Header banner -->
    <rect x="50" y="30" width="220" height="42" rx="14" fill="#2563EB"/>
    <text x="70" y="56" fill="#FFFFFF" font-size="15" font-weight="bold" font-family="sans-serif">🎯 ภารกิจถ่ายรูปเช็คอิน</text>
    <!-- Difficulty stars -->
    <rect x="200" y="42" width="60" height="20" rx="10" fill="#1D4ED8"/>
    <text x="230" y="56" fill="#FDE047" font-size="11" font-weight="bold" text-anchor="middle">★★★ ง่าย</text>
    <!-- Quest lines -->
    <rect x="70" y="88" width="120" height="10" rx="5" fill="#E2E8F0"/>
    <rect x="70" y="106" width="160" height="8" rx="4" fill="#F1F5F9"/>
    <rect x="70" y="120" width="140" height="8" rx="4" fill="#F1F5F9"/>
    <!-- Token Reward Badge -->
    <g transform="translate(170, 138)">
      <rect width="90" height="28" rx="14" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.5"/>
      <text x="45" y="18" fill="#B45309" font-size="12" font-weight="bold" font-family="sans-serif" text-anchor="middle">🪙 +75 Tokens</text>
    </g>
    <!-- Floating camera pin -->
    <circle cx="270" cy="50" r="26" fill="#10B981" filter="drop-shadow(0 6px 14px rgba(16,185,129,0.35))"/>
    <text x="270" y="58" font-size="22" text-anchor="middle">📸</text>
  </svg>`,

  // Step 3: Smart GPS & Camera Check-in
  `<svg viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="200" rx="16" fill="#FEFCE8"/>
    <!-- Radar radar rings -->
    <circle cx="160" cy="100" r="85" stroke="#FDE047" stroke-width="1" stroke-dasharray="4 4"/>
    <circle cx="160" cy="100" r="60" stroke="#FACC15" stroke-width="1.5" stroke-dasharray="6 6"/>
    <circle cx="160" cy="100" r="35" fill="#FEF08A" opacity="0.4"/>
    <!-- Smartphone Viewfinder -->
    <rect x="110" y="25" width="100" height="150" rx="16" fill="#1E293B" filter="drop-shadow(0 12px 24px rgba(0,0,0,0.18))"/>
    <rect x="116" y="35" width="88" height="130" rx="10" fill="#0F172A"/>
    <!-- Camera Viewfinder bracket -->
    <path d="M126 50 L126 42 L134 42" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M194 50 L194 42 L186 42" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M126 130 L126 138 L134 138" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M194 130 L194 138 L186 138" stroke="#10B981" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Target icon in center -->
    <circle cx="160" cy="90" r="18" fill="none" stroke="#10B981" stroke-width="2"/>
    <text x="160" y="96" font-size="16" text-anchor="middle">⛩️</text>
    <!-- Verified Green Check pill -->
    <rect x="122" y="142" width="76" height="18" rx="9" fill="#10B981"/>
    <text x="160" y="155" fill="#FFFFFF" font-size="9" font-weight="bold" font-family="sans-serif" text-anchor="middle">✓ ในรัศมี 35m</text>
    <!-- Distance Meter Floater -->
    <g transform="translate(20, 75)" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.1))">
      <rect width="80" height="48" rx="10" fill="#FFFFFF"/>
      <text x="40" y="20" fill="#64748B" font-size="10" font-weight="bold" text-anchor="middle">ระยะห่าง</text>
      <text x="40" y="38" fill="#059669" font-size="15" font-weight="bold" text-anchor="middle">35 ม.</text>
    </g>
  </svg>`,

  // Step 4: Earn Tokens & Level Up
  `<svg viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="200" rx="16" fill="#FFFBEB"/>
    <!-- Glowing background sunburst -->
    <circle cx="160" cy="95" r="75" fill="#FEF3C7" opacity="0.6"/>
    <!-- Golden TC Token (Front) -->
    <circle cx="135" cy="95" r="38" fill="#F59E0B" filter="drop-shadow(0 8px 16px rgba(245,158,11,0.35))"/>
    <circle cx="135" cy="95" r="32" fill="#FBBF24"/>
    <circle cx="135" cy="95" r="28" fill="none" stroke="#D97706" stroke-width="2" stroke-dasharray="4 2"/>
    <text x="135" y="104" fill="#92400E" font-size="24" font-weight="bold" font-family="sans-serif" text-anchor="middle">TC</text>
    <!-- Golden TC Token (Offset) -->
    <circle cx="185" cy="85" r="28" fill="#F59E0B" filter="drop-shadow(0 6px 12px rgba(245,158,11,0.25))"/>
    <circle cx="185" cy="85" r="23" fill="#FDE047"/>
    <text x="185" y="92" fill="#92400E" font-size="16" font-weight="bold" font-family="sans-serif" text-anchor="middle">🪙</text>
    <!-- Character unlock badge -->
    <g transform="translate(60, 142)">
      <rect width="200" height="34" rx="17" fill="#FFFFFF" stroke="#FDE68A" stroke-width="2" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.06))"/>
      <text x="80" y="21" fill="#78350F" font-size="12" font-weight="bold" font-family="sans-serif">🔓 ปลดล็อก Tuk-Tuk Pal!</text>
      <circle cx="20" cy="17" r="12" fill="#FEF3C7"/>
      <text x="20" y="22" font-size="14" text-anchor="middle">🛺</text>
    </g>
    <!-- Sparkles -->
    <polygon points="70,40 73,48 81,51 73,54 70,62 67,54 59,51 67,48" fill="#F59E0B"/>
    <polygon points="250,55 252,60 258,62 252,64 250,70 248,64 242,62 248,60" fill="#FBBF24"/>
  </svg>`,

  // Step 5: Travel Journal & Diary
  `<svg viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="320" height="200" rx="16" fill="#FAF5FF"/>
    <!-- Journal Book open -->
    <g transform="translate(50, 30)" filter="drop-shadow(0 10px 20px rgba(126,34,206,0.12))">
      <!-- Left Page -->
      <path d="M10 15 C 40 10, 80 12, 110 15 L 110 145 C 80 142, 40 140, 10 145 Z" fill="#FFFFFF"/>
      <!-- Right Page -->
      <path d="M110 15 C 140 12, 180 10, 210 15 L 210 145 C 180 140, 140 142, 110 145 Z" fill="#F8FAFC"/>
      <!-- Center binding spine -->
      <line x1="110" y1="12" x2="110" y2="148" stroke="#CBD5E1" stroke-width="3"/>
      <!-- Left page photo polaroid -->
      <rect x="25" y="30" width="65" height="75" rx="6" fill="#F1F5F9" stroke="#E2E8F0" stroke-width="1.5" transform="rotate(-6 55 65)"/>
      <rect x="30" y="35" width="55" height="50" rx="3" fill="#6EE7B7" transform="rotate(-6 55 65)"/>
      <text x="50" y="70" font-size="20" text-anchor="middle" transform="rotate(-6 55 65)">🏯</text>
      <!-- Right page diary text lines -->
      <rect x="125" y="35" width="70" height="7" rx="3.5" fill="#E2E8F0"/>
      <rect x="125" y="50" width="60" height="6" rx="3" fill="#F1F5F9"/>
      <rect x="125" y="62" width="65" height="6" rx="3" fill="#F1F5F9"/>
      <rect x="125" y="74" width="50" height="6" rx="3" fill="#F1F5F9"/>
      <!-- Passport Stamp -->
      <circle cx="165" cy="115" r="22" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="3 3"/>
      <text x="165" y="112" fill="#7C3AED" font-size="9" font-weight="bold" font-family="sans-serif" text-anchor="middle">BANGKOK</text>
      <text x="165" y="124" fill="#7C3AED" font-size="8" font-family="sans-serif" text-anchor="middle">PASSED ✓</text>
    </g>
    <!-- Floating Pencil / Stamp badge -->
    <circle cx="265" cy="45" r="22" fill="#9333EA" filter="drop-shadow(0 4px 10px rgba(147,51,234,0.3))"/>
    <text x="265" y="53" font-size="18" text-anchor="middle">📖</text>
  </svg>`
];

// Tutorial Step Content
const TUTORIAL_STEPS = [
  {
    badge: 'ขั้นตอนที่ 1 : ค้นหา & นำทาง',
    title: 'สำรวจที่เที่ยวทั่วไทย พร้อมนำทาง GPS 🧭',
    desc: 'เลือกดูสถานที่ท่องเที่ยวยอดนิยมในกรุงเทพฯ และทั่วประเทศ ดูภาพถ่าย จุดเด่น ข้อมูลเวลาเปิด-ปิด และกดปุ่ม "🧭 นำทาง GPS" เพื่อรับเส้นทางเดินรถและคำนวณระยะทางได้ทันที',
    tip: '💡 เคล็ดลับ: แตะปักหมุดบนแผนที่ Interactive เพื่อดูระยะห่างและเปิดเส้นทางนำทาง',
  },
  {
    badge: 'ขั้นตอนที่ 2 : ภารกิจท้าทาย',
    title: 'รับเควสท์ & ภารกิจถ่ายรูปเช็คอิน 🎯',
    desc: 'เปลี่ยนการท่องเที่ยวธรรมดาให้เป็นการผจญภัยสุดตื่นเต้น! มีทั้งเควสท์ถ่ายรูปเช็คอินตามจุดแลนด์มาร์ค, เควสท์สำรวจวัฒนธรรม, และตอบคำถามประวัติศาสตร์ แต่ละเควสท์มีระดับความยากและรางวัลโทเคนต่างกัน',
    tip: '💡 เคล็ดลับ: เลือกเควสท์ระดับง่าย (Easy) เพื่อเก็บสะสมโทเคนเริ่มต้นอย่างรวดเร็ว',
  },
  {
    badge: 'ขั้นตอนที่ 3 : เช็คอินสถานที่จริง',
    title: 'ตรวจจับพิกัด GPS อัตโนมัติ & ถ่ายภาพ 📸',
    desc: 'เมื่อเดินทางไปยังสถานที่จริง กดปุ่ม "📡 ตรวจสอบพิกัด GPS" ระบบจะคำนวณระยะห่างผ่านดาวเทียม หากอยู่ในรัศมีที่กำหนด (เช่น ภายใน 100 เมตร) ให้ถ่ายภาพมุมมองตามเบาะแสเพื่อผ่านภารกิจทันที!',
    tip: '💡 เคล็ดลับ: เปิดใช้งาน Location (GPS) บนสมาร์ทโฟนหรือเบราว์เซอร์เพื่อความแม่นยำสูงสุด',
  },
  {
    badge: 'ขั้นตอนที่ 4 : สะสมโทเคน & ไต่อันดับ',
    title: 'รับเหรียญ TC Tokens & ปลดล็อกตัวละคร 🪙',
    desc: 'ทุกเควสท์ที่ทำสำเร็จจะได้รับเหรียญ TC Tokens นำไปสะสมเพื่อไต่อันดับบนตาราง Leaderboard และปลดล็อกเพื่อนคู่หูร่วมเดินทางสุดน่ารัก เช่น Tuk-Tuk Pal, Little Yak, และ Kinnaree Star',
    tip: '💡 เคล็ดลับ: เช็คอินให้ครบหลายๆ หมวดหมู่เพื่อปลดล็อกตราสัญลักษณ์พิเศษ (Achievements)',
  },
  {
    badge: 'ขั้นตอนที่ 5 : ไดอารี่การเดินทาง',
    title: 'บันทึกความทรงจำใน Travel Journal 📖',
    desc: 'เก็บภาพถ่าย ความประทับใจ และเรื่องราวในแต่ละวันไว้ในสมุดบันทึกส่วนตัว ย้อนดูเส้นทางความทรงจำบนปฏิทินท่องเที่ยว และแบ่งปันเรื่องราวของคุณกับเพื่อนๆ ได้ทุกเวลา',
    tip: '💡 เคล็ดลับ: คุณสามารถกดปุ่ม "📖 บันทึกไดอารี่" ได้ทันทีหลังจากเช็คอินสถานที่นั้นๆ',
  }
];

let currentStep = 0;
let modalEl = null;

export function initOnboarding() {
  // Inject stylesheet if not already added
  if (!document.getElementById('onboarding-css')) {
    const link = document.createElement('link');
    link.id = 'onboarding-css';
    link.rel = 'stylesheet';
    link.href = '/css/components/onboarding.css?v=2';
    document.head.appendChild(link);
  }

  // Remove floating button if present
  document.getElementById('btn-onboarding-fab')?.remove();

  // Create Modal Structure
  createModalStructure();

  // Check if first-time user: automatically trigger onboarding!
  const hasSeen = localStorage.getItem(STORAGE_KEY);
  if (!hasSeen) {
    // Delay slightly for smooth page entry
    setTimeout(() => {
      openOnboardingModal();
    }, 800);
  }
}

function createFloatingTrigger() {
  // Removed as requested: do not show bottom-right floating trigger
  document.getElementById('btn-onboarding-fab')?.remove();
}

function createModalStructure() {
  if (document.getElementById('onboarding-dialog')) return;

  const dlg = document.createElement('dialog');
  dlg.id = 'onboarding-dialog';
  dlg.className = 'onboarding-modal';
  dlg.setAttribute('aria-labelledby', 'ob-step-title');

  dlg.innerHTML = `
    <!-- Top Step Bar -->
    <div class="ob-header">
      <span class="ob-step-label" id="ob-step-label">
        <span style="font-size:1.1rem;">🚀</span> คำแนะนำผู้เล่นใหม่
      </span>
      <button type="button" class="ob-skip-btn" id="ob-btn-skip">ข้ามคำแนะนำ ✕</button>
    </div>
    <div class="ob-progress-track">
      <div class="ob-progress-fill" id="ob-progress-fill" style="width:20%"></div>
    </div>

    <!-- Carousel Body -->
    <div class="ob-body">
      <div class="ob-slides-viewport" id="ob-slides-container">
        ${TUTORIAL_STEPS.map((step, idx) => `
          <div class="ob-slide ${idx === 0 ? 'active' : ''}" data-step="${idx}">
            <div class="ob-slide-graphic">
              ${STEP_GRAPHICS[idx]}
            </div>
            <span class="ob-badge-tag">${step.badge}</span>
            <h2 class="ob-title" id="ob-step-title">${step.title}</h2>
            <p class="ob-desc">${step.desc}</p>
            <div class="ob-tip-pill">${step.tip}</div>
          </div>
        `).join('')}
      </div>

      <!-- Navigation & Dots -->
      <div class="ob-footer">
        <div class="ob-dots" id="ob-dots-container">
          ${TUTORIAL_STEPS.map((_, i) => `
            <button type="button" class="ob-dot ${i === 0 ? 'active' : ''}" data-dot="${i}" aria-label="ไปที่ขั้นตอนที่ ${i + 1}"></button>
          `).join('')}
        </div>
        <div class="ob-actions">
          <button type="button" class="ob-btn ob-btn-prev" id="ob-btn-prev" disabled>⬅ ก่อนหน้า</button>
          <button type="button" class="ob-btn ob-btn-next" id="ob-btn-next">ถัดไป ➔</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dlg);
  modalEl = dlg;

  // Wire controls
  dlg.querySelector('#ob-btn-skip').addEventListener('click', closeOnboardingModal);
  dlg.querySelector('#ob-btn-prev').addEventListener('click', prevStep);
  dlg.querySelector('#ob-btn-next').addEventListener('click', nextStep);

  dlg.querySelectorAll('.ob-dot').forEach(dot => {
    dot.addEventListener('click', () => goToStep(parseInt(dot.dataset.dot, 10)));
  });

  // Keyboard navigation
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') nextStep();
    else if (e.key === 'ArrowLeft') prevStep();
    else if (e.key === 'Escape') closeOnboardingModal();
  });
}

export function openOnboardingModal(stepIndex = 0) {
  if (!modalEl) createModalStructure();
  goToStep(stepIndex);
  modalEl.showModal();
}

export function closeOnboardingModal() {
  if (!modalEl) return;
  modalEl.close();
  localStorage.setItem(STORAGE_KEY, 'true');
}

function goToStep(index) {
  currentStep = Math.max(0, Math.min(index, TUTORIAL_STEPS.length - 1));
  const total = TUTORIAL_STEPS.length;

  // Update Slides
  const slides = modalEl.querySelectorAll('.ob-slide');
  slides.forEach((s, idx) => {
    if (idx === currentStep) s.classList.add('active');
    else s.classList.remove('active');
  });

  // Update Dots
  const dots = modalEl.querySelectorAll('.ob-dot');
  dots.forEach((d, idx) => {
    if (idx === currentStep) d.classList.add('active');
    else d.classList.remove('active');
  });

  // Update Progress fill
  const progressPct = ((currentStep + 1) / total) * 100;
  const fill = modalEl.querySelector('#ob-progress-fill');
  if (fill) fill.style.width = `${progressPct}%`;

  // Update Header step label
  const stepLabel = modalEl.querySelector('#ob-step-label');
  if (stepLabel) {
    stepLabel.innerHTML = `<span>🚀</span> ขั้นตอนที่ ${currentStep + 1} จาก ${total}`;
  }

  // Update Action Buttons
  const prevBtn = modalEl.querySelector('#ob-btn-prev');
  const nextBtn = modalEl.querySelector('#ob-btn-next');

  if (prevBtn) {
    prevBtn.disabled = (currentStep === 0);
  }

  if (nextBtn) {
    if (currentStep === total - 1) {
      nextBtn.className = 'ob-btn ob-btn-start';
      nextBtn.innerHTML = '🚀 เริ่มออกเดินทางเลย!';
    } else {
      nextBtn.className = 'ob-btn ob-btn-next';
      nextBtn.innerHTML = 'ถัดไป ➔';
    }
  }
}

function nextStep() {
  if (currentStep < TUTORIAL_STEPS.length - 1) {
    goToStep(currentStep + 1);
  } else {
    // Finished tutorial!
    closeOnboardingModal();
  }
}

function prevStep() {
  if (currentStep > 0) {
    goToStep(currentStep - 1);
  }
}
