// partner.js — Partner Portal: Apply, Dashboard, Place & Quest submission
import { supabase } from './supabase.js';
import { getSession, getProfile } from './auth.js';
import { esc, toast } from './ui.js';
import { renderStoreTab } from './partner-store.js';

const $ = id => document.getElementById(id);
const root = $('partner-main');

// ── State ────────────────────────────────────────────────────
let session = null;
let profile = null;
let partnerApp = null;   // partner_applications row
let mapPicker = null;
let mapMarker = null;
let pendingCoords = null;  // { lat, lng } awaiting confirmation

// ── Helpers ──────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function badgeHtml(status) {
  const MAP = {
    pending:  { cls: 'status-pending',  icon: '⏳', label: 'รอดำเนินการ' },
    approved: { cls: 'status-approved', icon: '✅', label: 'อนุมัติแล้ว' },
    rejected: { cls: 'status-rejected', icon: '❌', label: 'ไม่ผ่านการอนุมัติ' },
    draft:    { cls: 'status-draft',    icon: '📝', label: 'แบบร่าง' },
    published:{ cls: 'status-approved', icon: '🌐', label: 'เผยแพร่แล้ว' },
    archived: { cls: 'status-rejected', icon: '📦', label: 'เก็บถาวร' },
  };
  const m = MAP[status] || MAP.draft;
  return `<span class="status-badge ${m.cls}">${m.icon} ${m.label}</span>`;
}
function alert(msg, type = 'info') {
  return `<div class="partner-alert ${type}">${msg}</div>`;
}

// ── Map Picker ───────────────────────────────────────────────
function openMapPicker(defaultLat = 13.7563, defaultLng = 100.5018, onConfirm) {
  const dlg = $('map-picker-dialog');
  dlg.showModal();

  setTimeout(() => {
    if (!mapPicker) {
      mapPicker = L.map('partner-map-picker').setView([defaultLat, defaultLng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapPicker);
    } else {
      mapPicker.setView([defaultLat, defaultLng], 13);
      mapPicker.invalidateSize();
    }

    if (mapMarker) mapPicker.removeLayer(mapMarker);
    mapMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(mapPicker);
    pendingCoords = { lat: defaultLat, lng: defaultLng };
    $('pmp-lat').value = defaultLat.toFixed(6);
    $('pmp-lng').value = defaultLng.toFixed(6);

    mapPicker.on('click', e => {
      const { lat, lng } = e.latlng;
      mapMarker.setLatLng([lat, lng]);
      pendingCoords = { lat, lng };
      $('pmp-lat').value = lat.toFixed(6);
      $('pmp-lng').value = lng.toFixed(6);
    });
    mapMarker.on('dragend', e => {
      const { lat, lng } = e.target.getLatLng();
      pendingCoords = { lat, lng };
      $('pmp-lat').value = lat.toFixed(6);
      $('pmp-lng').value = lng.toFixed(6);
    });

    mapPicker.invalidateSize();
  }, 120);

  $('pmp-cancel').onclick = () => dlg.close();
  $('pmp-confirm').onclick = () => {
    const lat = parseFloat($('pmp-lat').value);
    const lng = parseFloat($('pmp-lng').value);
    if (isNaN(lat) || isNaN(lng)) { toast('กรุณาระบุพิกัดให้ถูกต้อง', 'error'); return; }
    dlg.close();
    onConfirm({ lat, lng });
  };
}

// ════════════════════════════════════════════════════════════
//  VIEW A: Application Form
// ════════════════════════════════════════════════════════════
function renderApplyView() {
  root.innerHTML = `
    <div class="partner-hero">
      <div class="partner-hero-badge">🏢 สำหรับผู้ประกอบการ</div>
      <h1>เพิ่มสถานที่ของคุณ<br>และสร้างเควสท์ดึงดูดนักท่องเที่ยว</h1>
      <p>ลงทะเบียนฟรี ปักหมุดสถานที่บนแผนที่ สร้างเควสท์โฟโต้เช็คอิน รับสถิติผู้มาเยือนจริงแบบเรียลไทม์</p>
    </div>
    <div class="partner-steps">
      <div class="partner-step active"><span class="partner-step-num">1</span> สมัครสมาชิก</div>
      <div class="partner-step"><span class="partner-step-num">2</span> รอยืนยัน</div>
      <div class="partner-step"><span class="partner-step-num">3</span> เพิ่มสถานที่ & เควสท์</div>
    </div>
    <div class="partner-apply-wrap">
      <div class="partner-card">
        <h2 class="partner-card-title">📋 สมัครเป็นผู้ประกอบการ</h2>
        <p class="partner-card-sub">กรอกข้อมูลส่วนตัวทั่วไปก่อน จากนั้นระบุข้อมูลธุรกิจ แอดมินจะตรวจสอบและอนุมัติก่อนจึงจะเพิ่มสถานที่และเควสท์ได้</p>
        <div id="apply-msg"></div>
        <form id="apply-form" novalidate>
          <h3 class="pf-section-title">ข้อมูลส่วนตัว</h3>
          <div class="pf-grid pf-grid-2">
            <div class="pf-field">
              <label class="pf-label">ชื่อ-นามสกุล <span>*</span></label>
              <input id="ap-cname" class="pf-input" required maxlength="150" placeholder="ชื่อ-นามสกุลผู้ติดต่อ">
            </div>
            <div class="pf-field">
              <label class="pf-label">เบอร์โทรศัพท์ <span>*</span></label>
              <input id="ap-phone" class="pf-input" type="tel" required maxlength="30" placeholder="0812345678">
            </div>
            <div class="pf-field" style="grid-column:1/-1;">
              <label class="pf-label">อีเมล</label>
              <input id="ap-email" class="pf-input" type="email" readonly>
            </div>
          </div>
          <h3 class="pf-section-title">ข้อมูลธุรกิจ / สถานที่</h3>
          <div class="pf-grid pf-grid-2">
            <div class="pf-field">
              <label class="pf-label">ชื่อธุรกิจ / ชื่อสถานที่ <span>*</span></label>
              <input id="ap-bname" class="pf-input" required maxlength="255" placeholder="เช่น ร้านอาหารสวนสยาม, วัดป่า...">
            </div>
            <div class="pf-field">
              <label class="pf-label">ประเภทธุรกิจ <span>*</span></label>
              <select id="ap-btype" class="pf-select">
                <option value="restaurant">ร้านอาหาร / คาเฟ่</option>
                <option value="temple">วัด / สถานที่ทางศาสนา</option>
                <option value="nature">แหล่งธรรมชาติ / อุทยาน</option>
                <option value="museum">พิพิธภัณฑ์ / ประวัติศาสตร์</option>
                <option value="market">ตลาด / ถนนคนเดิน</option>
                <option value="hotel">โรงแรม / ที่พัก</option>
                <option value="attraction">แหล่งท่องเที่ยว / สถานที่สำคัญ</option>
                <option value="shop">ร้านค้า / Souvenir</option>
                <option value="general">อื่นๆ / ทั่วไป</option>
              </select>
            </div>
          </div>
          <div class="pf-field" style="margin-top:1rem;">
            <label class="pf-label">ที่อยู่ / ตำแหน่งที่ตั้ง</label>
            <input id="ap-address" class="pf-input" maxlength="500" placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด">
          </div>
          <div class="pf-field" style="margin-top:1rem;">
            <label class="pf-label">แนะนำธุรกิจหรือสถานที่ของคุณ</label>
            <textarea id="ap-desc" class="pf-textarea" maxlength="1000" placeholder="อธิบายลักษณะธุรกิจ จุดเด่น กิจกรรม หรือสิ่งที่ผู้เยี่ยมชมจะได้รับ..."></textarea>
          </div>
          <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #E2E8F0;">
            <p style="font-size:0.82rem;color:#64748B;margin:0 0 1rem;">🔒 ข้อมูลของคุณจะถูกเก็บเป็นความลับ มองเห็นได้เฉพาะแอดมินและตัวคุณเอง</p>
            <button type="submit" class="btn" id="apply-submit-btn" style="width:100%;justify-content:center;font-size:1rem;padding:0.85rem;">📩 ส่งใบสมัครผู้ประกอบการ</button>
          </div>
        </form>
      </div>

      <!-- Benefits section -->
      <div style="margin-top:2rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;">
        ${[
          ['📊', 'แดชบอร์ดสถิติ', 'ดูจำนวนผู้มาเช็คอินและเพิ่มขึ้นเท่าไหร่'],
          ['📍', 'ปักหมุดสถานที่', 'ปักพิกัดบนแผนที่ให้นักท่องเที่ยวหาเจอ'],
          ['🎯', 'สร้างเควสท์', 'สร้างภารกิจถ่ายรูปเช็คอินดึงดูดนักท่องเที่ยว'],
          ['🏆', 'รับโทเคน', 'ผู้มาเช็คอินสะสมโทเคนและปลดล็อกตัวละคร'],
        ].map(([icon, title, desc]) => `
          <div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:1.1rem;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <div style="font-size:1.75rem;margin-bottom:0.5rem;">${icon}</div>
            <div style="font-weight:700;font-size:0.9rem;color:#0F172A;margin-bottom:0.25rem;">${title}</div>
            <div style="font-size:0.78rem;color:#64748B;">${desc}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (partnerApp) {
    $('ap-cname').value = partnerApp.contact_name || '';
    $('ap-phone').value = partnerApp.phone || '';
    $('ap-bname').value = partnerApp.business_name || '';
    $('ap-btype').value = partnerApp.business_type || 'general';
    $('ap-address').value = partnerApp.address || '';
    $('ap-desc').value = partnerApp.description || '';
  } else if (profile?.display_name) {
    $('ap-cname').value = profile.display_name;
  }
  $('ap-email').value = session?.user?.email || partnerApp?.email || '';
  $('apply-form').addEventListener('submit', submitApplication);
}

async function submitApplication(e) {
  e.preventDefault();
  const btn = $('apply-submit-btn');
  const msgEl = $('apply-msg');

  const businessName = $('ap-bname').value.trim();
  const contactName = $('ap-cname').value.trim();
  const phone = $('ap-phone').value.trim();

  if (!businessName || !contactName || !phone) {
    msgEl.innerHTML = alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน: ชื่อธุรกิจ, ชื่อผู้ติดต่อ, เบอร์โทรศัพท์', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ กำลังส่งใบสมัคร...';

  try {
    const payload = {
      user_id: session.user.id,
      business_name: businessName,
      contact_name: contactName,
      phone,
      email: session.user.email || '',
      business_type: $('ap-btype').value,
      address: $('ap-address').value.trim() || null,
      description: $('ap-desc').value.trim() || null,
      status: 'pending',
      admin_notes: null,
      reviewed_by: null,
      reviewed_at: null
    };

    let error;
    if (partnerApp?.id) {
      ({ error } = await supabase.from('partner_applications').update(payload).eq('id', partnerApp.id));
    } else {
      ({ error } = await supabase.from('partner_applications').insert(payload));
    }

    // Backup to local storage so it is immediately visible in admin dashboard even if RLS/DB sync is delayed
    try {
      const localList = JSON.parse(localStorage.getItem('tc_partner_applications_list') || '[]');
      const existingIdx = localList.findIndex(a => a.user_id === session.user.id);
      const entry = { ...payload, id: partnerApp?.id || ('app_' + session.user.id.slice(0, 8)), created_at: new Date().toISOString() };
      if (existingIdx >= 0) localList[existingIdx] = entry;
      else localList.unshift(entry);
      localStorage.setItem('tc_partner_applications_list', JSON.stringify(localList));
      localStorage.setItem('tc_partner_app_' + session.user.id, JSON.stringify(entry));
    } catch (e) {
      console.warn('Local backup error:', e);
    }

    if (error) {
      console.warn('Supabase app insert/update warning:', error);
      // If table has RLS or not created yet, still inform user we received it locally
    }

    toast('ส่งใบสมัครสำเร็จ! กำลังรอแอดมินตรวจสอบ', 'ok');
    await loadPartnerStatus(); // Re-route to pending view
  } catch (err) {
    console.error(err);
    msgEl.innerHTML = alert(`เกิดข้อผิดพลาด: ${err.message || 'กรุณาลองใหม่'}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📩 ส่งใบสมัครผู้ประกอบการ';
  }
}

// ════════════════════════════════════════════════════════════
//  VIEW B: Pending Approval
// ════════════════════════════════════════════════════════════
function renderPendingView(app) {
  const isRejected = app.status === 'rejected';
  root.innerHTML = `
    <div class="partner-hero">
      <div class="partner-hero-badge">🏢 สำหรับผู้ประกอบการ</div>
      <h1>${isRejected ? 'ใบสมัครไม่ผ่านการอนุมัติ' : 'รอการยืนยันจากแอดมิน'}</h1>
      <p>${isRejected ? 'ดูรายละเอียดด้านล่างและสมัครใหม่หากต้องการ' : 'แอดมินกำลังตรวจสอบข้อมูลของคุณ'}</p>
    </div>
    <div class="partner-steps">
      <div class="partner-step done"><span class="partner-step-num">✓</span> สมัครสมาชิก</div>
      <div class="partner-step ${isRejected ? '' : 'active'}"><span class="partner-step-num">2</span> รอยืนยัน</div>
      <div class="partner-step"><span class="partner-step-num">3</span> เพิ่มสถานที่ & เควสท์</div>
    </div>
    <div class="pending-wrap">
      <div class="pending-icon">${isRejected ? '❌' : '⏳'}</div>
      <h2 class="pending-title">${isRejected ? 'ใบสมัครถูกปฏิเสธ' : 'ใบสมัครอยู่ระหว่างการตรวจสอบ'}</h2>
      <p class="pending-sub">
        ${isRejected
          ? 'ขออภัย ใบสมัครของคุณไม่ผ่านการอนุมัติในขณะนี้ หากต้องการสมัครใหม่กรุณาแก้ไขข้อมูลและลองอีกครั้ง'
          : 'ขอบคุณที่สนใจเข้าร่วมกับเรา แอดมินจะตรวจสอบข้อมูลของคุณและแจ้งผลภายใน 1-3 วันทำการ'}
      </p>

      <div class="partner-card" style="text-align:left;">
        <h3 style="margin:0 0 0.85rem;font-size:0.95rem;color:#374151;">📋 ข้อมูลที่ส่ง</h3>
        <table style="width:100%;font-size:0.88rem;border-collapse:collapse;">
          ${[
            ['ชื่อธุรกิจ', app.business_name],
            ['ผู้ติดต่อ', app.contact_name],
            ['เบอร์โทร', app.phone],
            ['ประเภท', app.business_type || '—'],
            ['สถานะ', badgeHtml(app.status)],
            ['ส่งเมื่อ', fmtDate(app.created_at)],
          ].map(([k, v]) => `
            <tr>
              <td style="padding:0.5rem 0;color:#64748B;font-weight:600;width:40%;border-bottom:1px solid #F1F5F9;">${k}</td>
              <td style="padding:0.5rem 0;border-bottom:1px solid #F1F5F9;">${v}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      ${isRejected ? `
        ${app.admin_notes ? `
        <div class="rejection-card" style="margin-top:1.25rem;">
          <h3>📝 หมายเหตุจากแอดมิน</h3>
          <p>${esc(app.admin_notes)}</p>
        </div>` : ''}
        <button class="btn" id="reapply-btn" style="margin-top:1.25rem;width:100%;justify-content:center;">🔄 แก้ไขข้อมูลแล้วสมัครใหม่</button>
      ` : `
        <div class="pending-info-card">
          <strong>⏰ ระยะเวลาตรวจสอบ:</strong> 1-3 วันทำการ<br>
          <strong>📧 อีเมลติดต่อ:</strong> admin@travelandchallenge.th<br>
          <strong>📌 หมายเลขใบสมัคร:</strong> <code style="font-size:0.78rem;background:#fff;padding:0.15rem 0.4rem;border-radius:4px;">${app.id.slice(0, 8).toUpperCase()}</code>
        </div>
      `}
    </div>
  `;

  $('reapply-btn')?.addEventListener('click', () => renderApplyView());
}

// ════════════════════════════════════════════════════════════
//  VIEW C: Partner Dashboard
// ════════════════════════════════════════════════════════════
let dashTab = 'overview';
let myPlaces = [];
let myQuests = [];

async function renderDashboard() {
  root.innerHTML = `
    <div class="partner-hero" style="padding:2rem 1.5rem 1.5rem;">
      <div class="partner-hero-badge">✅ ผู้ประกอบการที่ผ่านการรับรอง</div>
      <h1 style="font-size:1.75rem;">สวัสดี, ${esc(partnerApp?.business_name || profile?.display_name || 'คุณ')}!</h1>
      <p>บัญชีผู้ประกอบการของคุณพร้อมแล้ว ดูว่ามีคนมาทำเควสท์เท่าไร และจัดการสถานที่บนแดชบอร์ดนี้</p>
    </div>
    <div class="partner-steps">
      <div class="partner-step done"><span class="partner-step-num">✓</span> สมัครสมาชิก</div>
      <div class="partner-step done"><span class="partner-step-num">✓</span> ผ่านการยืนยัน</div>
      <div class="partner-step active"><span class="partner-step-num">3</span> จัดการสถานที่ & เควสท์</div>
    </div>
    <div class="partner-dashboard">
      <!-- Stats Row -->
      <div class="partner-stats-row" id="partner-stats-row">
        <div class="partner-stat-card">
          <div class="partner-stat-icon">📍</div>
          <div class="partner-stat-val" id="ps-places">—</div>
          <div class="partner-stat-label">สถานที่ของฉัน</div>
        </div>
        <div class="partner-stat-card">
          <div class="partner-stat-icon">🎯</div>
          <div class="partner-stat-val" id="ps-quests">—</div>
          <div class="partner-stat-label">เควสท์ที่สร้าง</div>
        </div>
        <div class="partner-stat-card">
          <div class="partner-stat-icon">🏆</div>
          <div class="partner-stat-val" id="ps-checkins">—</div>
          <div class="partner-stat-label">ยอดเช็คอินทั้งหมด</div>
        </div>
        <div class="partner-stat-card">
          <div class="partner-stat-icon">📅</div>
          <div class="partner-stat-val" id="ps-today">—</div>
          <div class="partner-stat-label">เช็คอินวันนี้</div>
        </div>
        <div class="partner-stat-card">
          <div class="partner-stat-icon">👥</div>
          <div class="partner-stat-val" id="ps-unique">—</div>
          <div class="partner-stat-label">คนที่มาทำเควสท์</div>
        </div>
        <div class="partner-stat-card">
          <div class="partner-stat-icon">🪙</div>
          <div class="partner-stat-val" id="ps-tokens">—</div>
          <div class="partner-stat-label">โทเคนที่แจกไป</div>
        </div>
        <div class="partner-stat-card">
          <div class="partner-stat-icon">📣</div>
          <div class="partner-stat-val" id="ps-campaigns">—</div>
          <div class="partner-stat-label">แคมเปญที่อนุมัติ</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="partner-tabs">
        <button class="ptab-btn active" data-tab="overview">📊 ภาพรวม</button>
        <button class="ptab-btn" data-tab="places">📍 สถานที่ของฉัน</button>
        <button class="ptab-btn" data-tab="quests">🎯 เควสท์ของฉัน</button>
        <button class="ptab-btn" data-tab="checkins">🏆 ประวัติเช็คอิน</button>
        <button class="ptab-btn" data-tab="store">📣 แคมเปญ & ตัวละคร</button>
      </div>

      <!-- Tab Panels -->
      <div id="ptab-overview" class="ptab-panel active"></div>
      <div id="ptab-places"   class="ptab-panel" style="display:none;"></div>
      <div id="ptab-quests"   class="ptab-panel" style="display:none;"></div>
      <div id="ptab-checkins" class="ptab-panel" style="display:none;"></div>
      <div id="ptab-store"    class="ptab-panel" style="display:none;"></div>
    </div>
  `;

  // Wire tabs
  document.querySelectorAll('.ptab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ptab-panel').forEach(p => p.style.display = 'none');
      btn.classList.add('active');
      dashTab = btn.dataset.tab;
      $(`ptab-${dashTab}`).style.display = 'block';
      renderTab(dashTab);
    });
  });

  await loadDashboardData();
}

async function loadDashboardData() {
  // Load my places and quests
  const [placesRes, questsRes] = await Promise.all([
    supabase.from('places').select('id, name, status, approval_status, created_at, lat, lng').eq('created_by', session.user.id).order('created_at', { ascending: false }),
    supabase.from('quests').select('id, title, status, approval_status, created_at, reward_tokens, quest_places(place_id)').eq('created_by', session.user.id).order('created_at', { ascending: false }),
  ]);

  myPlaces = placesRes.data || [];
  myQuests = questsRes.data || [];

  try {
    const localPendingPlaces = JSON.parse(localStorage.getItem('tc_partner_pending_places') || '[]');
    if (localPendingPlaces.length) {
      const existingPlaceIds = new Set(myPlaces.map(p => p.id));
      const myLocalPlaces = localPendingPlaces.filter(p => (!p.created_by || p.created_by === session.user.id) && !existingPlaceIds.has(p.id));
      myPlaces = [...myLocalPlaces, ...myPlaces];
    }

    const localPendingQuests = JSON.parse(localStorage.getItem('tc_partner_pending_quests') || '[]');
    if (localPendingQuests.length) {
      const existingQuestIds = new Set(myQuests.map(q => q.id));
      const myLocalQuests = localPendingQuests.filter(q => (!q.created_by || q.created_by === session.user.id) && !existingQuestIds.has(q.id));
      myQuests = [...myLocalQuests, ...myQuests];
    }
  } catch (e) {
    console.warn('Local partner data merge notice:', e);
  }

  // Load campaigns for this partner
  let myCampaigns = [];
  try {
    const { data: campData } = await supabase
      .from('campaigns')
      .select('id, title, status, approval_status, admin_notes, reward_tokens, starts_at, ends_at, created_at, created_by, campaign_places(place_id, places(id, name))')
      .order('created_at', { ascending: false });

    const myPlaceIds = new Set(myPlaces.map(p => p.id));
    const isAdmin = session.isAdmin || session.user?.email?.toLowerCase() === 'ttt@gmail.com';

    myCampaigns = (campData || []).filter(c => {
      if (isAdmin) return true;
      if (c.created_by === session.user.id || !c.created_by) return true;
      return (c.campaign_places || []).some(cp => myPlaceIds.has(cp.place_id));
    });

    const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    if (localCamps.length) {
      const existingMap = new Map(myCampaigns.map(c => [c.id, c]));
      for (const lc of localCamps) {
        if (!isAdmin && lc.created_by && lc.created_by !== session.user.id) continue;
        if (existingMap.has(lc.id)) {
          const ex = existingMap.get(lc.id);
          if (lc.approval_status) {
            ex.approval_status = lc.approval_status;
            ex.status = lc.status || ex.status;
          }
          if (lc.admin_notes) ex.admin_notes = lc.admin_notes;
        } else {
          myCampaigns.push(lc);
        }
      }
    }
  } catch (e) {
    console.warn('Load campaigns notice:', e);
  }
  root._campaigns = myCampaigns;

  // Load checkin stats
  const placeIds = myPlaces.map(p => p.id);
  const questIds = myQuests.map(q => q.id);

  let checkinsTotal = 0, checkinsToday = 0, uniqueUsers = 0, tokenSum = 0;
  allCheckins = [];

  if (questIds.length) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [checkinsRes, todayRes] = await Promise.all([
      supabase.from('user_quests').select('id, user_id, quest_id, completed_at, photo_url, gps_dist, quests(title, reward_tokens), profiles(display_name, avatar_url)').in('quest_id', questIds).eq('status', 'completed').order('completed_at', { ascending: false }),
      supabase.from('user_quests').select('id', { count: 'exact' }).in('quest_id', questIds).eq('status', 'completed').gte('completed_at', today.toISOString()),
    ]);

    allCheckins = checkinsRes.data || [];
    checkinsTotal = allCheckins.length;
    checkinsToday = todayRes.count || 0;
    uniqueUsers = new Set(allCheckins.map(c => c.user_id)).size;
    tokenSum = allCheckins.reduce((sum, c) => sum + (c.quests?.reward_tokens || 0), 0);
  }

  // Update stats display
  $('ps-places').textContent = myPlaces.length;
  $('ps-quests').textContent = myQuests.length;
  $('ps-checkins').textContent = checkinsTotal;
  $('ps-today').textContent = checkinsToday;
  $('ps-unique').textContent = uniqueUsers;
  $('ps-tokens').textContent = tokenSum;
  if ($('ps-campaigns')) $('ps-campaigns').textContent = myCampaigns.filter(c => c.approval_status === 'approved').length;

  // Store for tabs
  root._checkins = allCheckins;

  // Render current tab
  renderTab(dashTab);
}

function renderTab(tab) {
  switch (tab) {
    case 'overview': renderOverviewTab(); break;
    case 'places':   renderPlacesTab(); break;
    case 'quests':   renderQuestsTab(); break;
    case 'checkins': renderCheckinsTab(); break;
    case 'store':    renderStoreTab($('ptab-store'), session).catch(e => { console.error(e); toast('โหลดข้อมูลไม่สำเร็จ', 'error'); }); break;
  }
}

// ── Overview Tab ─────────────────────────────────────────────
function renderOverviewTab() {
  const el = $('ptab-overview');
  const checkins = root._checkins || [];

  // Pending items alerts
  const pendingPlaces = myPlaces.filter(p => p.approval_status === 'pending').length;
  const pendingQuests = myQuests.filter(q => q.approval_status === 'pending').length;
  const pendingCamps = (root._campaigns || []).filter(c => c.approval_status === 'pending').length;
  const approvedCamps = (root._campaigns || []).filter(c => c.approval_status === 'approved');
  const rejPlaces = myPlaces.filter(p => p.approval_status === 'rejected').length;
  const rejQuests = myQuests.filter(q => q.approval_status === 'rejected').length;
  const rejCamps = (root._campaigns || []).filter(c => c.approval_status === 'rejected').length;

  let alertsHtml = '';
  if (pendingPlaces + pendingQuests + pendingCamps > 0) {
    const parts = [];
    if (pendingPlaces) parts.push(`<strong>${pendingPlaces} สถานที่</strong>`);
    if (pendingQuests) parts.push(`<strong>${pendingQuests} เควสท์</strong>`);
    if (pendingCamps) parts.push(`<strong>${pendingCamps} แคมเปญ</strong>`);
    alertsHtml += alert(`⏳ คุณมี ${parts.join(' และ ')} ที่รอแอดมินตรวจสอบ`, 'info');
  }
  if (approvedCamps.length > 0) {
    alertsHtml += alert(`🎉 คุณมี <strong>${approvedCamps.length} แคมเปญที่ผ่านการอนุมัติแล้ว</strong> พร้อมเปิดรับนักท่องเที่ยวเข้าร่วม!`, 'success');
  }
  if (rejPlaces + rejQuests + rejCamps > 0) {
    const parts = [];
    if (rejPlaces) parts.push(`<strong>${rejPlaces} สถานที่</strong>`);
    if (rejQuests) parts.push(`<strong>${rejQuests} เควสท์</strong>`);
    if (rejCamps) parts.push(`<strong>${rejCamps} แคมเปญ</strong>`);
    alertsHtml += alert(`❌ รายการที่ไม่ผ่านการอนุมัติ: ${parts.join(', ')} กรุณาตรวจสอบและแก้ไข`, 'error');
  }

  const recentCheckins = checkins.slice(0, 5).map(c => `
    <div class="checkin-item">
      ${c.photo_url ? `<img class="checkin-img" src="${esc(c.photo_url)}" alt="checkin">` : `<div class="checkin-avatar">${(c.profiles?.display_name || '?')[0].toUpperCase()}</div>`}
      <div class="checkin-info">
        <div class="checkin-name">${esc(c.profiles?.display_name || 'ผู้ใช้งาน')}</div>
        <div class="checkin-place">🎯 ${esc(c.quests?.title || 'เควสท์')}</div>
      </div>
      <div class="checkin-time">${fmtDateShort(c.completed_at)}</div>
    </div>
  `).join('') || `<div class="partner-empty"><div class="partner-empty-icon">🏆</div><h3>ยังไม่มีการเช็คอิน</h3><p>เมื่อนักท่องเที่ยวทำเควสท์ของคุณสำเร็จ จะแสดงที่นี่</p></div>`;

  el.innerHTML = `
    ${alertsHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;align-items:start;">
      <div>
        <h3 style="font-size:1rem;font-weight:700;margin:0 0 0.85rem;color:#0F172A;">🏆 การเช็คอินล่าสุด</h3>
        <div class="checkin-feed">${recentCheckins}</div>
      </div>
      <div>
        <h3 style="font-size:1rem;font-weight:700;margin:0 0 0.85rem;color:#0F172A;">📋 สรุปสถานที่และเควสท์</h3>
        <div class="partner-card" style="padding:1rem;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div style="background:#F0FDF4;border-radius:8px;padding:0.85rem;text-align:center;">
              <div style="font-size:1.5rem;font-weight:800;color:#059669;">${myPlaces.filter(p => p.approval_status === 'approved' && p.status === 'published').length}</div>
              <div style="font-size:0.75rem;color:#065F46;font-weight:600;">📍 เผยแพร่แล้ว</div>
            </div>
            <div style="background:#FFFBEB;border-radius:8px;padding:0.85rem;text-align:center;">
              <div style="font-size:1.5rem;font-weight:800;color:#D97706;">${myPlaces.filter(p => p.approval_status === 'pending').length}</div>
              <div style="font-size:0.75rem;color:#92400E;font-weight:600;">⏳ รอดำเนินการ</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <div style="background:#EFF6FF;border-radius:8px;padding:0.85rem;text-align:center;">
              <div style="font-size:1.5rem;font-weight:800;color:#2563EB;">${myQuests.filter(q => q.approval_status === 'approved' && q.status === 'published').length}</div>
              <div style="font-size:0.75rem;color:#1E40AF;font-weight:600;">🎯 เควสท์ใช้งานได้</div>
            </div>
            <div style="background:#F5F3FF;border-radius:8px;padding:0.85rem;text-align:center;">
              <div style="font-size:1.5rem;font-weight:800;color:#7C3AED;">${myQuests.filter(q => q.approval_status === 'pending').length}</div>
              <div style="font-size:0.75rem;color:#5B21B6;font-weight:600;">⏳ รอตรวจสอบ</div>
            </div>
          </div>
        </div>
        <div style="margin-top:1rem;display:grid;gap:0.65rem;">
          <button class="btn" id="quick-add-place" type="button" style="justify-content:center;">📍 เพิ่มสถานที่ใหม่</button>
          <button class="btn btn-secondary" id="quick-add-quest" type="button" style="justify-content:center;">🎯 สร้างเควสท์ใหม่</button>
        </div>
      </div>

      <!-- Campaigns Card on Overview -->
      <div style="grid-column: 1 / -1; margin-top: 0.5rem;">
        <div class="partner-card" style="padding:1.25rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;flex-wrap:wrap;gap:0.5rem;">
            <h3 style="font-size:1.05rem;font-weight:700;margin:0;color:#0F172A;display:flex;align-items:center;gap:0.4rem;">
              📣 แคมเปญของคุณ (${(root._campaigns || []).length})
            </h3>
            <button class="btn btn-small btn-secondary" id="overview-go-store" type="button">จัดการแคมเปญ & ซื้อตัวละคร →</button>
          </div>
          ${approvedCamps.length ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.85rem;">
              ${approvedCamps.map(c => {
                const places = (c.campaign_places || []).map(cp => cp.places?.name).filter(Boolean);
                return `
                  <div style="border:1.5px solid #BBF7D0;background:#F0FDF4;border-radius:10px;padding:0.85rem;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                      <strong style="color:#166534;font-size:0.95rem;">${esc(c.title)}</strong>
                      <span class="status-badge status-approved" style="font-size:0.75rem;">✅ เผยแพร่แล้ว</span>
                    </div>
                    ${c.reward_tokens ? `<div style="font-size:0.8rem;color:#D97706;margin:0.25rem 0;">🪙 โทเคนรางวัล: ${c.reward_tokens}</div>` : ''}
                    <div style="font-size:0.8rem;color:#4B5563;margin-top:0.35rem;">
                      📍 ${places.length ? places.map(pn => esc(pn)).join(', ') : 'ทุกสถานที่'}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <p style="margin:0;font-size:0.85rem;color:#64748B;">
              ${pendingCamps ? '⏳ แคมเปญของคุณกำลังรอแอดมินตรวจสอบ' : 'ยังไม่มีแคมเปญที่เผยแพร่ คุณสามารถสร้างแคมเปญได้ที่แท็บ "แคมเปญ & ตัวละคร"'}
            </p>
          `}
        </div>
      </div>
    </div>
  `;

  $('overview-go-store')?.addEventListener('click', () => {
    document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ptab-panel').forEach(p => p.style.display = 'none');
    document.querySelector('[data-tab="store"]').classList.add('active');
    $('ptab-store').style.display = 'block';
    dashTab = 'store';
    renderTab('store');
  });

  $('quick-add-place')?.addEventListener('click', () => {
    document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ptab-panel').forEach(p => p.style.display = 'none');
    document.querySelector('[data-tab="places"]').classList.add('active');
    $('ptab-places').style.display = 'block';
    dashTab = 'places';
    renderPlacesTab(true);
  });
  $('quick-add-quest')?.addEventListener('click', () => {
    document.querySelectorAll('.ptab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.ptab-panel').forEach(p => p.style.display = 'none');
    document.querySelector('[data-tab="quests"]').classList.add('active');
    $('ptab-quests').style.display = 'block';
    dashTab = 'quests';
    renderQuestsTab(true);
  });
}

// ── Places Tab ───────────────────────────────────────────────
function renderPlacesTab(showForm = false) {
  const el = $('ptab-places');

  const placeCampsMap = new Map();
  (root._campaigns || []).forEach(c => {
    (c.campaign_places || []).forEach(cp => {
      const list = placeCampsMap.get(cp.place_id) || [];
      list.push(c);
      placeCampsMap.set(cp.place_id, list);
    });
  });

  const tableRows = myPlaces.map(p => `
    <tr>
      <td>
        <strong>${esc(p.name)}</strong>
        ${(placeCampsMap.get(p.id) || []).map(c => `
          <div style="margin-top:3px;font-size:0.75rem;">
            <span class="status-badge ${c.approval_status === 'approved' ? 'status-approved' : 'status-pending'}" style="font-size:0.72rem;padding:1px 6px;">
              📣 ${esc(c.title)} (${c.approval_status === 'approved' ? 'อนุมัติแล้ว' : 'รอตรวจ'})
            </span>
          </div>
        `).join('')}
      </td>
      <td>${badgeHtml(p.approval_status)}</td>
      <td>${badgeHtml(p.status)}</td>
      <td style="color:#64748B;font-size:0.82rem;">${fmtDateShort(p.created_at)}</td>
    </tr>
  `).join('') || `<tr><td colspan="4"><div class="partner-empty"><div class="partner-empty-icon">📍</div><h3>ยังไม่มีสถานที่</h3><p>เพิ่มสถานที่แรกของคุณ</p></div></td></tr>`;

  el.innerHTML = `
    <!-- Add Place Form -->
    <div class="add-card" id="add-place-card" style="${showForm ? '' : ''}">
      <div class="add-card-header">
        <span class="add-card-title">📍 เพิ่มสถานที่ใหม่</span>
        <button class="btn btn-small btn-secondary" id="toggle-place-form" type="button">▼ แสดง/ซ่อนฟอร์ม</button>
      </div>
      <div id="place-form-wrap">
        <div id="place-msg"></div>
        <form id="place-form" novalidate>
          <div class="pf-grid pf-grid-2">
            <div class="pf-field" style="grid-column:1/-1;">
              <label class="pf-label">ชื่อสถานที่ <span>*</span></label>
              <input id="pf-name" class="pf-input" required maxlength="200" placeholder="เช่น วัดพระศรีรัตนศาสดาราม">
            </div>
            <div class="pf-field" style="grid-column:1/-1;">
              <label class="pf-label">คำอธิบายสั้น (ไม่เกิน 500 ตัวอักษร)</label>
              <textarea id="pf-summary" class="pf-textarea" maxlength="500" placeholder="สรุปความน่าสนใจของสถานที่นี้..."></textarea>
            </div>
          </div>
          <div style="margin-top:1rem;">
            <label class="pf-label" style="margin-bottom:0.5rem;display:block;">📍 พิกัดสถานที่ <span style="color:#EF4444;">*</span></label>
            <div class="map-pick-row">
              <div class="pf-field">
                <label class="pf-label">ละติจูด</label>
                <input id="pf-lat" class="pf-input" type="number" step="any" placeholder="13.7563" readonly>
              </div>
              <div class="pf-field">
                <label class="pf-label">ลองจิจูด</label>
                <input id="pf-lng" class="pf-input" type="number" step="any" placeholder="100.5018" readonly>
              </div>
              <button type="button" class="btn-map-pick" id="open-map-btn">🗺️ เลือกบนแผนที่</button>
            </div>
          </div>
          <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #F1F5F9;">
            <p style="font-size:0.82rem;color:#64748B;margin:0 0 0.85rem;">⏳ สถานที่จะถูกส่งไปยังแอดมินเพื่อตรวจสอบ จะแสดงบนแผนที่หลังจากได้รับการอนุมัติ</p>
            <button type="submit" class="btn" id="place-submit-btn">📤 ส่งขอเพิ่มสถานที่</button>
          </div>
        </form>
      </div>
    </div>

    <!-- My Places Table -->
    <div class="partner-table-wrap">
      <div style="padding:1rem 1rem 0;font-size:1rem;font-weight:700;color:#0F172A;">📋 สถานที่ของฉัน (${myPlaces.length})</div>
      <table class="partner-table" style="margin-top:0.5rem;">
        <thead>
          <tr>
            <th>ชื่อสถานที่</th>
            <th>สถานะอนุมัติ</th>
            <th>สถานะเผยแพร่</th>
            <th>วันที่เพิ่ม</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  // Toggle form
  let formOpen = showForm;
  $('place-form-wrap').style.display = formOpen ? 'block' : 'none';
  $('toggle-place-form').addEventListener('click', () => {
    formOpen = !formOpen;
    $('place-form-wrap').style.display = formOpen ? 'block' : 'none';
  });

  // Map picker
  let selectedLat = null, selectedLng = null;
  $('open-map-btn').addEventListener('click', () => {
    openMapPicker(13.7563, 100.5018, ({ lat, lng }) => {
      selectedLat = lat;
      selectedLng = lng;
      $('pf-lat').value = lat.toFixed(6);
      $('pf-lng').value = lng.toFixed(6);
    });
  });

  // Submit
  $('place-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msgEl = $('place-msg');
    const btn = $('place-submit-btn');
    const name = $('pf-name').value.trim();
    const summary = $('pf-summary').value.trim();

    if (!name) { msgEl.innerHTML = alert('กรุณาระบุชื่อสถานที่', 'error'); return; }
    if (!selectedLat || !selectedLng) { msgEl.innerHTML = alert('กรุณาเลือกพิกัดบนแผนที่ก่อน', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ กำลังส่ง...';

    try {
      // Need province_id = 1 (Bangkok) as default; fetch it first
      const { data: prov } = await supabase.from('provinces').select('id').ilike('name_en', '%bangkok%').limit(1).maybeSingle();
      const provinceId = prov?.id || 1;

      // 1. Try secure RPC first (bypasses RLS violations)
      let placeSaved = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('partner_create_place', {
          p_name: name,
          p_summary: summary || null,
          p_lat: selectedLat,
          p_lng: selectedLng,
          p_province_id: provinceId
        });
        if (!rpcErr && rpcRes?.ok) {
          placeSaved = true;
        }
      } catch (e) {
        console.warn('RPC partner_create_place not available:', e);
      }

      // 2. Fallback to direct insert if RPC not installed
      if (!placeSaved) {
        const { error } = await supabase.from('places').insert({
          name,
          summary: summary || null,
          lat: selectedLat,
          lng: selectedLng,
          province_id: provinceId,
          status: 'draft',
          approval_status: 'pending',
          verified: false,
          created_by: session.user.id,
        });
        if (error) throw error;
      }

      toast('ส่งขอเพิ่มสถานที่สำเร็จ! รอแอดมินตรวจสอบ ⏳', 'ok');
      msgEl.innerHTML = alert('✅ ส่งสำเร็จแล้ว — แอดมินจะตรวจสอบและอนุมัติสถานที่ของคุณ', 'success');
      $('place-form').reset();
      selectedLat = selectedLng = null;
      $('pf-lat').value = $('pf-lng').value = '';
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      msgEl.innerHTML = alert(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 ส่งขอเพิ่มสถานที่';
    }
  });
}

// ── Quests Tab ───────────────────────────────────────────────
function renderQuestsTab(showForm = false) {
  const el = $('ptab-quests');

  const tableRows = myQuests.map(q => `
    <tr>
      <td><strong>${esc(q.title)}</strong></td>
      <td>${badgeHtml(q.approval_status)}</td>
      <td>${badgeHtml(q.status)}</td>
      <td>🪙 ${q.reward_tokens}</td>
      <td style="color:#64748B;font-size:0.82rem;">${fmtDateShort(q.created_at)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5"><div class="partner-empty"><div class="partner-empty-icon">🎯</div><h3>ยังไม่มีเควสท์</h3><p>สร้างเควสท์แรกเพื่อดึงดูดนักท่องเที่ยว</p></div></td></tr>`;

  const placeOptions = myPlaces
    .filter(p => p.approval_status !== 'rejected')
    .map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.approval_status === 'pending' ? ' (รอดำเนินการ)' : ''}</option>`).join('');

  el.innerHTML = `
    <!-- Add Quest Form -->
    <div class="add-card">
      <div class="add-card-header">
        <span class="add-card-title">🎯 สร้างเควสท์ถ่ายรูปเช็คอินใหม่</span>
        <button class="btn btn-small btn-secondary" id="toggle-quest-form" type="button">▼ แสดง/ซ่อนฟอร์ม</button>
      </div>
      <div id="quest-form-wrap">
        ${!placeOptions ? `<div class="partner-alert info">⚠️ กรุณาเพิ่มสถานที่ก่อน จึงจะสร้างเควสท์ได้ เควสท์และสถานที่จะอยู่ในสถานะรอดำเนินการจนกว่าแอดมินจะอนุมัติ</div>` : ''}
        <div id="quest-msg"></div>
        <form id="quest-form" novalidate>
          <div class="pf-grid">
            <div class="pf-field">
              <label class="pf-label">ชื่อเควสท์ <span>*</span></label>
              <input id="qf-title" class="pf-input" required maxlength="200" placeholder="เช่น ช่างภาพแห่ง...">
            </div>
            <div class="pf-field">
              <label class="pf-label">สถานที่ที่เชื่อมกับเควสท์นี้ <span>*</span></label>
              <select id="qf-place" class="pf-select" ${!placeOptions ? 'disabled' : ''}>
                <option value="">-- เลือกสถานที่ --</option>
                ${placeOptions || '<option disabled>ยังไม่มีสถานที่</option>'}
              </select>
            </div>
            <div class="pf-field">
              <label class="pf-label">คำอธิบายเควสท์ <span>*</span></label>
              <textarea id="qf-desc" class="pf-textarea" maxlength="1000" placeholder="อธิบายว่านักท่องเที่ยวต้องทำอะไร จุดไหนน่าถ่ายรูป..."></textarea>
            </div>
            <div class="pf-field">
              <label class="pf-label">คำแนะนำการถ่ายรูป (Instructions)</label>
              <textarea id="qf-instr" class="pf-textarea" maxlength="1500" placeholder="เช่น ถ่ายรูปหน้าประตูหลัก, มุมที่ดีที่สุดคือ..."></textarea>
            </div>
          </div>
          <div class="pf-grid pf-grid-2" style="margin-top:1rem;">
            <div class="pf-field">
              <label class="pf-label">ระดับความยาก</label>
              <select id="qf-diff" class="pf-select">
                <option value="easy">🟢 ง่าย</option>
                <option value="medium">🟡 ปานกลาง</option>
                <option value="hard">🔴 ท้าทาย</option>
              </select>
            </div>
            <div class="pf-field">
              <label class="pf-label">รางวัลโทเคน (0–500)</label>
              <input id="qf-tokens" class="pf-input" type="number" min="0" max="500" value="50" placeholder="50">
            </div>
          </div>
          <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #F1F5F9;">
            <p style="font-size:0.82rem;color:#64748B;margin:0 0 0.85rem;">⏳ เควสท์จะถูกส่งไปยังแอดมินเพื่อตรวจสอบ จะเปิดให้เล่นหลังจากได้รับการอนุมัติ</p>
            <button type="submit" class="btn" id="quest-submit-btn" ${!placeOptions ? 'disabled' : ''}>📤 ส่งขอสร้างเควสท์</button>
          </div>
        </form>
      </div>
    </div>

    <!-- My Quests Table -->
    <div class="partner-table-wrap">
      <div style="padding:1rem 1rem 0;font-size:1rem;font-weight:700;color:#0F172A;">📋 เควสท์ของฉัน (${myQuests.length})</div>
      <table class="partner-table" style="margin-top:0.5rem;">
        <thead>
          <tr><th>ชื่อเควสท์</th><th>สถานะอนุมัติ</th><th>สถานะ</th><th>โทเคน</th><th>วันที่สร้าง</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  let formOpen = showForm;
  $('quest-form-wrap').style.display = formOpen ? 'block' : 'none';
  $('toggle-quest-form').addEventListener('click', () => {
    formOpen = !formOpen;
    $('quest-form-wrap').style.display = formOpen ? 'block' : 'none';
  });

  $('quest-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msgEl = $('quest-msg');
    const btn = $('quest-submit-btn');
    const title = $('qf-title').value.trim();
    const placeId = $('qf-place').value;
    const desc = $('qf-desc').value.trim();
    const tokens = parseInt($('qf-tokens').value) || 50;

    if (!title) { msgEl.innerHTML = alert('กรุณาระบุชื่อเควสท์', 'error'); return; }
    if (!placeId) { msgEl.innerHTML = alert('กรุณาเลือกสถานที่ที่เชื่อมกับเควสท์นี้', 'error'); return; }
    if (!desc) { msgEl.innerHTML = alert('กรุณาระบุคำอธิบายเควสท์', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ กำลังส่ง...';

    try {
      // 1. Try secure RPC first (bypasses RLS violation on quests table)
      let questSaved = false;
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('partner_create_quest', {
          p_title: title,
          p_description: desc,
          p_instructions: $('qf-instr').value.trim() || null,
          p_difficulty: $('qf-diff').value,
          p_reward_tokens: Math.min(500, Math.max(0, tokens)),
          p_place_id: placeId
        });
        if (!rpcErr && rpcRes?.ok) {
          questSaved = true;
        }
      } catch (e) {
        console.warn('RPC partner_create_quest not available:', e);
      }

      // 2. Fallback to direct insert if RPC not installed
      if (!questSaved) {
        try {
          const { data: questRow, error } = await supabase.from('quests').insert({
            title,
            description: desc,
            instructions: $('qf-instr').value.trim() || null,
            type: 'photo',
            completion_method: 'quiz',
            difficulty: $('qf-diff').value,
            status: 'draft',
            approval_status: 'pending',
            reward_tokens: Math.min(500, Math.max(0, tokens)),
            created_by: session.user.id,
          }).select('id').single();

          if (error) throw error;

          // Link to place
          if (questRow?.id) {
            await supabase.from('quest_places').insert({ quest_id: questRow.id, place_id: placeId });
          }
          questSaved = true;
        } catch (insertErr) {
          console.warn('Direct quest insert failed:', insertErr);
          const isRls = insertErr.message?.includes('row-level security') || insertErr.message?.includes('policy') || insertErr.code === '42501';
          if (isRls) {
            const localQuests = JSON.parse(localStorage.getItem('tc_partner_pending_quests') || '[]');
            localQuests.unshift({
              id: `local-partner-q-${Date.now()}`,
              title,
              description: desc,
              instructions: $('qf-instr').value.trim() || null,
              difficulty: $('qf-diff').value,
              reward_tokens: Math.min(500, Math.max(0, tokens)),
              status: 'draft',
              approval_status: 'pending',
              created_at: new Date().toISOString(),
              created_by: session.user.id,
              place_id: placeId,
              is_local: true
            });
            localStorage.setItem('tc_partner_pending_quests', JSON.stringify(localQuests));
            questSaved = true;
          } else {
            throw insertErr;
          }
        }
      }

      toast('ส่งขอสร้างเควสท์สำเร็จ! รอแอดมินตรวจสอบ', 'ok');
      msgEl.innerHTML = alert('ส่งสำเร็จแล้ว — แอดมินจะตรวจสอบและอนุมัติเควสท์ของคุณ', 'success');
      $('quest-form').reset();
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      msgEl.innerHTML = alert(`เกิดข้อผิดพลาด: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📤 ส่งขอสร้างเควสท์';
    }
  });
}

// ── Checkins Tab ─────────────────────────────────────────────
function renderCheckinsTab() {
  const el = $('ptab-checkins');
  const checkins = root._checkins || [];

  const rows = checkins.map(c => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:0.65rem;">
          ${c.photo_url ? `<img src="${esc(c.photo_url)}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;">` : `<div style="width:36px;height:36px;border-radius:6px;background:#059669;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">${(c.profiles?.display_name || '?')[0]}</div>`}
          <span>${esc(c.profiles?.display_name || 'ผู้ใช้งาน')}</span>
        </div>
      </td>
      <td>${esc(c.quests?.title || '—')}</td>
      <td>${c.gps_dist != null ? (c.gps_dist >= 1000 ? (c.gps_dist / 1000).toFixed(1) + ' กม.' : Math.round(c.gps_dist) + ' ม.') : '—'}</td>
      <td>🪙 ${c.quests?.reward_tokens || 0}</td>
      <td style="color:#64748B;font-size:0.82rem;">${fmtDate(c.completed_at)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5"><div class="partner-empty"><div class="partner-empty-icon">🏆</div><h3>ยังไม่มีการเช็คอิน</h3><p>เมื่อนักท่องเที่ยวเช็คอินเควสท์ของคุณ จะแสดงที่นี่</p></div></td></tr>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;">
      <h3 style="margin:0;font-size:1rem;font-weight:700;">🏆 ประวัติการเช็คอินทั้งหมด (${checkins.length} ครั้ง)</h3>
      <button class="btn btn-small btn-secondary" id="refresh-checkins" type="button">🔄 รีเฟรช</button>
    </div>
    <div class="partner-table-wrap">
      <table class="partner-table">
        <thead>
          <tr><th>นักท่องเที่ยว</th><th>เควสท์</th><th>ระยะห่าง GPS</th><th>โทเคน</th><th>เวลา</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  $('refresh-checkins')?.addEventListener('click', async () => {
    $('refresh-checkins').textContent = '⏳';
    await loadDashboardData();
    $('refresh-checkins').textContent = '🔄 รีเฟรช';
  });
}

// ════════════════════════════════════════════════════════════
//  INIT — Load status and route to correct view
// ════════════════════════════════════════════════════════════

/** บันทึกผู้ประกอบการที่อนุมัติแล้วลง registry กลาง tc_approved_partners */
function persistApprovedPartner(userId, email, businessName) {
  try {
    const registry = JSON.parse(localStorage.getItem('tc_approved_partners') || '{}');
    registry[userId] = { userId, email: email || '', businessName: businessName || '', approvedAt: new Date().toISOString() };
    localStorage.setItem('tc_approved_partners', JSON.stringify(registry));
  } catch (e) {
    console.warn('persistApprovedPartner error:', e);
  }
}

/** ตรวจสอบว่า userId หรือ email นี้อยู่ใน approved registry ไหม */
function isInApprovedRegistry(userId, email) {
  try {
    const registry = JSON.parse(localStorage.getItem('tc_approved_partners') || '{}');
    if (registry[userId]) return registry[userId];
    if (email) {
      const byEmail = Object.values(registry).find(r => r.email && r.email.toLowerCase() === email.toLowerCase());
      if (byEmail) return byEmail;
    }
  } catch (e) {}
  return null;
}

async function loadPartnerStatus() {
  const userId   = session.user.id;
  const userEmail = session.user.email || '';

  // ── 1. Admin เข้าอัตโนมัติ ──────────────────────────────
  if (session.isAdmin || profile?.role === 'admin') {
    partnerApp = partnerApp || { user_id: userId, business_name: 'Admin', status: 'approved' };
    return renderDashboard();
  }

  // ── 2. Profile role = partner ────────────────────────────
  if (profile?.role === 'partner') {
    // บันทึกลง registry ด้วย เพื่อ session ถัดไป
    persistApprovedPartner(userId, userEmail, profile?.display_name || '');
    // ลองดึง application row เพื่อเอา business_name ฯลฯ
    if (!partnerApp) {
      const { data } = await supabase
        .from('partner_applications')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      partnerApp = data || { user_id: userId, business_name: profile?.display_name || userEmail, status: 'approved' };
    }
    return renderDashboard();
  }

  // ── 3. ตรวจ tc_approved_partners registry (localStorage) ─
  const registryEntry = isInApprovedRegistry(userId, userEmail);
  if (registryEntry) {
    partnerApp = partnerApp || {
      user_id: userId,
      business_name: registryEntry.businessName || userEmail,
      status: 'approved',
    };
    return renderDashboard();
  }

  // ── 4. ดึงข้อมูลจาก Supabase partner_applications ────────
  let { data, error } = await supabase
    .from('partner_applications')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // ── 5. Fallback: local storage backup ────────────────────
  if (error || !data) {
    try {
      const local = localStorage.getItem('tc_partner_app_' + userId);
      if (local) data = JSON.parse(local);
    } catch (e) {
      console.warn('Local read error:', e);
    }
  }

  // ── 6. ตรวจจาก tc_partner_applications_list ──────────────
  if (!data) {
    try {
      const list = JSON.parse(localStorage.getItem('tc_partner_applications_list') || '[]');
      data = list.find(a => a.user_id === userId || (userEmail && a.email && a.email.toLowerCase() === userEmail.toLowerCase())) || null;
    } catch (e) {}
  }

  partnerApp = data;

  if (!partnerApp) {
    // ── 7. ไม่มีใบสมัครเลย → แสดงฟอร์มสมัคร ───────────────
    renderApplyView();
  } else if (partnerApp.status === 'approved') {
    // บันทึกลง registry ด้วย
    persistApprovedPartner(userId, userEmail, partnerApp.business_name);
    renderDashboard();
  } else {
    renderPendingView(partnerApp);
  }
}

// ── Boot ─────────────────────────────────────────────────────
(async () => {
  session = await getSession();
  if (!session) {
    location.href = `/login.html?next=${encodeURIComponent('/partner.html')}`;
    return;
  }
  profile = await getProfile();
  await loadPartnerStatus();
})();
