import { listQuests, myProgress, startQuest, completeQuest } from './quests.js';
import { getSession } from './auth.js';
import { supabase } from './supabase.js';
import { esc, toast } from './ui.js';
import { t, getLang } from './i18n.js';
import { icon } from './icons.js';

// ── GPS Utility ───────────────────────────────────────────
/**
 * Haversine formula — distance in metres between two lat/lng points
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// รัศมีตรวจจับ GPS: 5 กิโลเมตร (5,000 เมตร) จากหมุดสถานที่
const GPS_RADIUS_M = 5000;

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject('อุปกรณ์ของคุณไม่รองรับ GPS'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => {
        const msgs = {
          1: 'คุณปฏิเสธการเข้าถึงตำแหน่ง กรุณาเปิดและอนุญาตการเข้าถึง GPS ในเบราว์เซอร์',
          2: 'ไม่สามารถระบุตำแหน่ง GPS ได้ กรุณาเปิดตำแหน่งบนอุปกรณ์ของคุณ',
          3: 'ใช้เวลาระบุตำแหน่งนานเกินไป กรุณาลองใหม่อีกครั้ง'
        };
        reject(msgs[err.code] || 'เกิดข้อผิดพลาดในการระบุตำแหน่ง GPS');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

// Canvas compressor for photo check-ins
async function fileToOptimizedDataUrl(file, maxWidth = 1280, quality = 0.85) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl || !dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(ev.target.result);
      img.src = ev.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

const $ = id => document.getElementById(id);

// ── ดึงข้อมูลเควสท์และรูปภาพจาก Supabase เท่านั้น (ลบฮาร์ดโค้ดทั้งหมดออกแล้ว) ──
export function getQuestLandmark(q) {
  const firstPlace = q.quest_places?.[0]?.places;
  
  // 1. ดึงรูปเควสท์โดยตรงจาก image_url ในตาราง quests ของ Supabase
  // 2. ถ้าไม่มี ให้ดึงรูปจากตาราง place_images ของสถานที่นั้นใน Supabase
  const placePhoto = firstPlace?.cover_image || (firstPlace?.place_images || [])[0]?.url || '';
  const photo = q.image_url || placePhoto || '';

  const lat = firstPlace?.lat != null ? Number(firstPlace.lat) : 13.7563;
  const lng = firstPlace?.lng != null ? Number(firstPlace.lng) : 100.5018;

  return {
    photo: photo,
    name: firstPlace?.name || q.title || 'สถานที่ภารกิจ',
    target: q.instructions || q.description || firstPlace?.summary || 'ถ่ายรูปเช็คอิน ณ จุดแลนด์มาร์กสำคัญ',
    hint: q.instructions || q.description || 'ถ่ายรูปเช็คอินเพื่อยืนยันภารกิจท่องเที่ยว',
    lat,
    lng
  };
}

// ── Check-In Storage ──────────────────────────────────────
const CHECKIN_STORAGE_KEY = 'tc_photo_checkins';
function getSavedCheckins() {
  try {
    const raw = localStorage.getItem(CHECKIN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveCheckin(questId, data) {
  try {
    const all = getSavedCheckins();
    all[questId] = data;
    localStorage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Failed to save checkin to localStorage:', e);
  }
}

// ── i18n labels ──────────────────────────────────────────
const DIFF_LABEL = () => ({
  easy:   `${icon('check-circle', 13)} ${t('diff_easy') || 'ง่าย'}`,
  medium: `${icon('flame', 13)} ${t('diff_medium') || 'ปานกลาง'}`,
  hard:   `${icon('trophy', 13)} ${t('diff_hard') || 'ท้าทาย'}`,
});

// ── State ─────────────────────────────────────────────────
let quests = [], progress = new Map(), current = null;
let activeTab = 'all', searchTerm = '';
let activeCapturedFile = null;  // File object selected by user
let activeCapturedPhoto = null; // Data URL for preview
let lastGpsResult = null;        // Cache GPS verification result for current modal

// ── GPS Verification UI ───────────────────────────────────
function renderGpsPanel(state, opts = {}) {
  const panel = document.getElementById('qd-gps-panel');
  if (!panel) return;

  const radiusKm = (GPS_RADIUS_M / 1000).toFixed(0);
  const configs = {
    idle: {
      cls: 'gps-idle',
      icon: '📡',
      title: 'ตรวจสอบพิกัด GPS',
      body: `กติกา: ต้องอยู่ในรัศมี <strong>${radiusKm} กิโลเมตร</strong> จากหมุดสถานที่ <br><small>กดปุ่มด้านล่างเพื่อตรวจจับตำแหน่งปัจจุบันของคุณ</small>`,
      btn: `<button id="gps-verify-btn" class="gps-btn gps-btn-primary" type="button">📡 ตรวจสอบตำแหน่งของฉัน</button>`
    },
    checking: {
      cls: 'gps-checking',
      icon: '<span class="gps-spin">🔄</span>',
      title: 'กำลังตรวจสอบตำแหน่ง GPS...',
      body: 'กรุณารอสักครู่ กำลังรับพิกัดความแม่นยำสูงจากอุปกรณ์',
      btn: ''
    },
    verified: {
      cls: 'gps-ok',
      icon: '✅',
      title: 'พิกัด GPS ถูกต้อง!',
      body: `คุณอยู่ห่างจากสถานที่ <strong>${opts.dist >= 1000 ? (opts.dist / 1000).toFixed(2) + ' กม.' : Math.round(opts.dist || 0) + ' ม.'}</strong> (อยู่ในรัศมี ${radiusKm} กม.) 🎉<br>
             <small>ความแม่นยำ GPS: ±${Math.round(opts.accuracy || 0)} ม. · 📍 ${(opts.lat||0).toFixed(5)}, ${(opts.lng||0).toFixed(5)}</small>`,
      btn: ''
    },
    too_far: {
      cls: 'gps-far',
      icon: '⚠️',
      title: 'คุณอยู่นอกรัศมี 5 กิโลเมตร!',
      body: `ระยะห่างจากหมุดสถานที่: <strong>${(opts.dist / 1000).toFixed(2)} กิโลเมตร</strong> (ต้องไม่เกิน ${radiusKm} กม.)<br>
             <small style="color:#DC2626;font-weight:700;">ระบบไม่อนุญาตให้ส่งเช็คอินหากอยู่ห่างเกิน 5 กิโลเมตร กรุณาเดินทางไปยังสถานที่</small>`,
      btn: `<button id="gps-verify-btn" class="gps-btn gps-btn-primary" type="button">🔁 ตรวจสอบตำแหน่งใหม่</button>
            <a href="/navigate.html?lat=${opts.targetLat}&lng=${opts.targetLng}&name=${encodeURIComponent(opts.targetName||'')}" class="gps-btn gps-btn-nav">🧭 นำทางไปที่นี่</a>`
    },
    denied: {
      cls: 'gps-denied',
      icon: '🚫',
      title: 'ไม่สามารถเข้าถึงตำแหน่ง GPS ได้',
      body: `${opts.err || 'เกิดข้อผิดพลาดในการระบุตำแหน่ง'}<br>
             <small style="color:#DC2626;font-weight:700;">จำเป็นต้องเปิด GPS เพื่อยืนยันว่าคุณอยู่ในรัศมี 5 กิโลเมตรจากสถานที่</small>`,
      btn: `<button id="gps-verify-btn" class="gps-btn gps-btn-primary" type="button">🔁 ลองอีกครั้ง</button>`
    }
  };

  const cfg = configs[state] || configs.idle;
  panel.className = `qd-gps-panel ${cfg.cls}`;
  panel.innerHTML = `
    <div class="gps-panel-header">
      <span class="gps-panel-icon">${cfg.icon}</span>
      <strong class="gps-panel-title">${cfg.title}</strong>
    </div>
    <div class="gps-panel-body">${cfg.body}</div>
    ${cfg.btn ? `<div class="gps-panel-actions">${cfg.btn}</div>` : ''}
  `;

  panel.querySelector('#gps-verify-btn')?.addEventListener('click', () => runGpsVerify(opts.targetLat, opts.targetLng, opts.targetName));
}

async function runGpsVerify(targetLat, targetLng, targetName) {
  renderGpsPanel('checking', { targetLat, targetLng, targetName });
  try {
    const pos = await getCurrentPosition();
    const dist = haversineDistance(pos.lat, pos.lng, targetLat, targetLng);
    if (dist <= GPS_RADIUS_M) {
      lastGpsResult = { state: 'verified', dist, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
      renderGpsPanel('verified', { dist, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, targetLat, targetLng, targetName });
    } else {
      lastGpsResult = { state: 'too_far', dist };
      renderGpsPanel('too_far', { dist, targetLat, targetLng, targetName });
    }
  } catch (err) {
    lastGpsResult = { state: 'denied', err };
    renderGpsPanel('denied', { err, targetLat, targetLng, targetName });
  }
}

function diffClass(d) {
  return { easy: 'diff-easy', medium: 'diff-medium', hard: 'diff-hard' }[d] || 'diff-easy';
}

function questStatus(id) {
  const p = progress.get(id);
  if (!p) return 'not_started';
  if (typeof p === 'object') return p.status || 'not_started';
  return p;
}

function filteredQuests() {
  const diff = $('f-diff')?.value || '';
  const place = $('f-place')?.value || '';
  const term = searchTerm.trim().toLowerCase();

  return quests.filter(q => {
    const st = questStatus(q.id);
    if (activeTab === 'active' && st !== 'in_progress') return false;
    if (activeTab === 'completed' && st !== 'completed') return false;
    if (diff && q.difficulty !== diff) return false;
    if (place && !q.quest_places.some(x => x.place_id === place)) return false;
    if (term && !q.title.toLowerCase().includes(term) &&
        !q.quest_places.some(x => (x.places?.name || '').toLowerCase().includes(term))) return false;
    return true;
  });
}

// ── Filters population ───────────────────────────────────
function fillFilters() {
  const DL = DIFF_LABEL();
  const places = new Map();
  quests.forEach(q => q.quest_places.forEach(p => places.set(p.place_id, p.places?.name)));
  
  const fType = $('f-type');
  if (fType) {
    fType.innerHTML = `<option value="">📸 ทุกเควสท์ (ถ่ายรูปเช็คอิน)</option>`;
  }

  const fPlace = $('f-place');
  if (fPlace) {
    fPlace.innerHTML = `<option value="">ทุกสถานที่</option>` +
      [...places].map(([id, n]) => `<option value="${esc(id)}">${esc(n || id)}</option>`).join('');
  }
}

// ── Render cards ──────────────────────────────────────────
function render() {
  const list = filteredQuests();
  updateTabCounts();
  const DL = DIFF_LABEL();

  if (!list.length) {
    $('list').innerHTML = `
      <div class="quest-empty">
        <span class="quest-empty-icon">📸</span>
        <h3>${activeTab === 'completed' ? 'ยังไม่มีเควสท์เช็คอินที่สำเร็จ' : activeTab === 'active' ? 'ยังไม่มีเควสท์ที่กำลังทำ' : 'ไม่มีเควสท์ที่ตรงกับการค้นหา'}</h3>
        <p>${activeTab === 'completed' ? 'เริ่มออกเดินทางและถ่ายรูปเช็คอินเลย!' : activeTab === 'active' ? 'กดปุ่ม "ถ่ายรูปเช็คอิน" บนการ์ดเพื่อเริ่ม' : 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง'}</p>
      </div>`;
    $('status').textContent = '';
    return;
  }

  $('list').innerHTML = list.map(q => {
    const st = questStatus(q.id);
    const landmark = getQuestLandmark(q);
    const rewardTxt = `🪙 ${Number(q.reward_tokens)} โทเคน${q.reward_character_id ? ' + ตัวละครพิเศษ 🎭' : ''}`;

    let btnTxt, btnClass;
    if (st === 'completed') {
      btnTxt = `${icon('check-circle', 16)} ดูรูปเช็คอิน`;
      btnClass = 'btn-secondary';
    } else if (st === 'in_progress') {
      btnTxt = `${icon('camera', 16)} ถ่ายรูปเช็คอินต่อ`;
      btnClass = '';
    } else {
      btnTxt = `${icon('camera', 16)} เริ่มเช็คอิน`;
      btnClass = '';
    }

    const thumbHtml = landmark.photo
      ? `<img src="${esc(landmark.photo)}" alt="${esc(landmark.name)}" loading="lazy">`
      : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#064E3B,#0F172A);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#6EE7B7;gap:0.35rem;">
           <span style="font-size:2.4rem;">📸</span>
           <span style="font-size:0.75rem;font-weight:700;">รูปภาพจาก Supabase</span>
         </div>`;

    return `
    <article class="quest-card${st === 'completed' ? ' is-completed' : ''}" id="q-${esc(q.id)}">
      <div class="quest-card-thumb">
        ${thumbHtml}
        <span class="quest-photo-tag">📸 ถ่ายรูปเช็คอิน</span>
        <span class="quest-diff-tag badge-diff-${esc(q.difficulty)}">${DL[q.difficulty] || esc(q.difficulty)}</span>
      </div>
      <div class="quest-card-bar ${diffClass(q.difficulty)}"></div>
      <div class="quest-card-body">
        <div class="badges">
          <span class="badge">${icon('camera', 13)} Photo Check-in</span>
          ${st === 'completed' ? `<span class="badge badge-ok">${icon('check', 13)} เช็คอินสำเร็จ</span>` :
            st === 'in_progress' ? `<span class="badge badge-warn">${icon('flame', 13)} กำลังทำภารกิจ</span>` : ''}
        </div>
        <h2 class="quest-card-title">${esc(q.title)}</h2>
        <p class="quest-card-places">${icon('pin', 14)} ${esc(landmark.name)}</p>
        <p class="quest-card-desc">${icon('compass', 14)} <strong>จุดเป้าหมาย:</strong> ${esc(landmark.target)}</p>
        <div class="quest-card-reward">
          <span class="quest-reward-icon">${icon('gift', 16)}</span>
          <span>${rewardTxt}</span>
        </div>
      </div>
      <div class="quest-card-footer">
        <button class="btn ${btnClass}" data-id="${esc(q.id)}" type="button" style="width:100%;justify-content:center;">${btnTxt}</button>
      </div>
    </article>`;
  }).join('');

  const total = list.length;
  $('status').textContent = `พบ ${total} เควสท์ถ่ายรูปเช็คอิน`;
}

// ── Update hero stats & tab counts ───────────────────────
function updateHeroStats() {
  $('hero-stat-total').textContent = `${quests.length} เควสท์`;
  const done = [...progress.values()].filter(v => (typeof v === 'object' ? v.status : v) === 'completed').length;
  const active = [...progress.values()].filter(v => (typeof v === 'object' ? v.status : v) === 'in_progress').length;
  $('hero-stat-tokens').textContent = done > 0 ? `${done} สำเร็จแล้ว` : 'สะสมโทเคน';
  $('hero-stat-chars').textContent = active > 0 ? `${active} กำลังทำ` : 'ตัวละครสะสม';
}

function updateTabCounts() {
  const all = quests.length;
  const active = quests.filter(q => questStatus(q.id) === 'in_progress').length;
  const done = quests.filter(q => questStatus(q.id) === 'completed').length;

  const addCount = (tabId, n) => {
    const tab = $(tabId);
    if (!tab) return;
    let span = tab.querySelector('.tab-count');
    if (!span) { span = document.createElement('span'); span.className = 'tab-count'; tab.appendChild(span); }
    span.textContent = n;
    span.hidden = !n;
  };
  addCount('tab-all', all);
  addCount('tab-active', active);
  addCount('tab-done', done);
}

// ── Open Photo Check-In Modal ─────────────────────────────
// ── Open Photo Check-In Modal ─────────────────────────────
async function openQuest(id) {
  current = quests.find(q => q.id === id);
  if (!current) return;

  const session = await getSession();
  if (!session) {
    location.href = `/login.html?next=${encodeURIComponent('/quests.html#' + id)}`;
    return;
  }

  const landmark = getQuestLandmark(current);
  const st = questStatus(id);
  const done = st === 'completed';
  const savedCheckins = getSavedCheckins();
  const savedCheckin = savedCheckins[id];
  const userRec = typeof progress.get(id) === 'object' ? progress.get(id) : null;
  activeCapturedFile = null;
  activeCapturedPhoto = null;
  lastGpsResult = null;

  // Header & Info
  $('qd-badges').innerHTML = `
    <span class="badge">${icon('camera', 13)} ถ่ายรูปเช็คอิน</span>
    <span class="badge badge-diff-${esc(current.difficulty)}">${DIFF_LABEL()[current.difficulty] || esc(current.difficulty)}</span>
    ${done ? `<span class="badge badge-ok">${icon('check', 13)} สำเร็จแล้ว</span>` : ''}
  `;
  $('qd-title').textContent = current.title;
  $('qd-desc').textContent = current.description || landmark.hint;
  $('qd-reward').innerHTML = `${icon('gift', 16)} รางวัล: ${icon('coin', 15)} +${Number(current.reward_tokens)} โทเคน`;
  $('qd-instr').textContent = '';
  $('qd-msg').hidden = true;

  const form = $('qd-form');
  $('qd-submit').hidden = done;
  $('qd-submit').disabled = false;
  $('qd-submit').innerHTML = `${icon('camera', 16)} ยืนยันเช็คอิน &amp; รับ ${current.reward_tokens} โทเคน`;
  $('qd-close').innerHTML = `${icon('close', 14)} ปิด`;

  // Start quest tracking if not yet started
  if (!progress.has(id)) {
    progress.set(id, { status: 'in_progress' });
    render();
  }

  if (done) {
    // Show completed showcase with user's uploaded check-in photo
    const checkinPhoto = userRec?.photo_url || savedCheckin?.photoUrl || landmark.photo;
    const checkinCaption = userRec?.caption || savedCheckin?.caption;
    const completedDate = userRec?.completed_at ? new Date(userRec.completed_at).toLocaleDateString('th-TH') : savedCheckin?.checkedInAt ? new Date(savedCheckin.checkedInAt).toLocaleDateString('th-TH') : 'เช็คอินสำเร็จ';
    const gpsDist = userRec?.gps_dist ?? savedCheckin?.gps?.dist;

    const bannerHtml = landmark.photo
      ? `<img src="${esc(landmark.photo)}" alt="${esc(landmark.name)}">`
      : `<div style="width:100%;height:140px;background:linear-gradient(135deg,#064E3B,#0F172A);display:flex;align-items:center;justify-content:center;color:#6EE7B7;"><span style="font-size:3rem;">📸</span></div>`;

    form.innerHTML = `
      <div class="qd-target-banner">
        ${bannerHtml}
        <div class="qd-target-overlay">
          <span class="qd-target-badge">🏁 จุดเช็คอินเป้าหมาย</span>
          <h3 class="qd-target-name">${esc(landmark.name)}</h3>
        </div>
      </div>

      <div style="text-align:center;padding:1.25rem;background:#F0FDF4;border-radius:16px;border:1.5px solid #BBF7D0;margin-bottom:1rem;">
        <div style="font-size:2.8rem;margin-bottom:.35rem;">🎉</div>
        <h3 style="color:#065F46;margin:0 0 .35rem;font-weight:800;">คุณพิชิตเควสท์เช็คอินสำเร็จแล้ว!</h3>
        <p style="color:#166534;font-size:.875rem;margin:0 0 1rem;">ได้รับรางวัล 🪙 +${current.reward_tokens} โทเคน เรียบร้อยแล้ว</p>
        
        <div class="qd-preview-wrap" style="max-width:380px;margin:0 auto 1rem;display:block;">
          <img src="${esc(checkinPhoto)}" class="qd-preview-img" alt="Check-in Photo" style="width:100%;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
          <div class="qd-preview-stamp">
            <span>📍 ${esc(landmark.name)}</span>
            <span>📅 ${esc(completedDate)}</span>
          </div>
        </div>

        ${checkinCaption ? `<p style="font-style:italic;color:#374151;font-size:.9rem;background:#fff;padding:.65rem 1rem;border-radius:10px;border:1px solid #E5E7EB;margin:0 0 0.75rem;">"${esc(checkinCaption)}"</p>` : ''}

        ${gpsDist != null ? `
        <div class="qd-gps-verified-badge" style="display:inline-flex;gap:0.5rem;align-items:center;background:#DCFCE7;color:#166534;padding:0.4rem 0.8rem;border-radius:20px;font-size:0.8rem;font-weight:700;">
          <span>📡 ยืนยัน GPS แล้ว (ห่างจากหมุด ${gpsDist >= 1000 ? (gpsDist / 1000).toFixed(2) + ' กม.' : Math.round(gpsDist) + ' ม.'})</span>
        </div>` : `<div class="qd-gps-verified-badge" style="display:inline-flex;background:#DCFCE7;color:#166534;padding:0.4rem 0.8rem;border-radius:20px;font-size:0.8rem;font-weight:700;"><span>✅ ยืนยันข้อมูลใน Supabase เรียบร้อย</span></div>`}
      </div>

      <div class="qd-nav-row">
        <div><strong>🧭 นำทางไปเยี่ยมชมอีกครั้ง:</strong> ${esc(landmark.name)}</div>
        <a href="/navigate.html?lat=${landmark.lat}&lng=${landmark.lng}&name=${encodeURIComponent(landmark.name)}&id=${encodeURIComponent(current.id)}"
           class="qd-nav-link">
          🧭 นำทาง GPS
        </a>
      </div>
    `;
    $('quest-dialog').showModal();
    return;
  }

  // Not done: Render Photo Check-In form with 5km GPS verification
  const bannerHtml = landmark.photo
    ? `<img src="${esc(landmark.photo)}" alt="${esc(landmark.name)}">`
    : `<div style="width:100%;height:140px;background:linear-gradient(135deg,#064E3B,#0F172A);display:flex;align-items:center;justify-content:center;color:#6EE7B7;"><span style="font-size:3rem;">📸</span></div>`;

  form.innerHTML = `
    <!-- Landmark Target Photo Banner -->
    <div class="qd-target-banner">
      ${bannerHtml}
      <div class="qd-target-overlay">
        <span class="qd-target-badge">🎯 จุดแลนด์มาร์กเป้าหมาย</span>
        <h3 class="qd-target-name">${esc(landmark.name)}</h3>
      </div>
    </div>

    <!-- GPS Verification Panel (5km rule) -->
    <div id="qd-gps-panel" class="qd-gps-panel gps-idle"></div>

    <!-- GPS Navigation Shortcut -->
    <div class="qd-nav-row">
      <div>
        <strong>📍 พิกัดหมุดเป้าหมาย:</strong> ${esc(landmark.name)}
      </div>
      <a href="/navigate.html?lat=${landmark.lat}&lng=${landmark.lng}&name=${encodeURIComponent(landmark.name)}&id=${encodeURIComponent(current.id)}"
         class="qd-nav-link">
        🧭 นำทาง GPS ไปยังที่นี่
      </a>
    </div>

    <!-- Guide Box -->
    <div class="qd-guide-box">
      <div class="qd-guide-icon">📸</div>
      <div class="qd-guide-text">
        <strong>คำแนะนำในการถ่ายรูปเช็คอิน:</strong>
        ${esc(landmark.hint)}
      </div>
    </div>

    <!-- Camera / File Dropzone -->
    <div class="qd-upload-section">
      <input type="file" id="qd-photo-file" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none;">
      
      <div class="qd-dropzone" id="qd-dropzone" role="button" tabindex="0">
        <div class="qd-dropzone-icon">📷</div>
        <div class="qd-dropzone-title">แตะที่นี่เพื่อถ่ายรูป หรือเลือกรูปภาพจากเครื่อง *</div>
        <div class="qd-dropzone-sub">รองรับภาพถ่ายจากกล้องมือถือและคอมพิวเตอร์ (JPG, PNG, WEBP)</div>
      </div>

      <div class="qd-preview-wrap" id="qd-preview-wrap" style="display:none;">
        <img src="" id="qd-preview-img" class="qd-preview-img" alt="ภาพถ่ายเช็คอิน">
        <div class="qd-preview-stamp">
          <span>📍 ${esc(landmark.name)}</span>
          <span id="qd-preview-date"></span>
        </div>
        <button type="button" class="qd-preview-retake" id="qd-retake-btn">🔄 ถ่ายใหม่ / เปลี่ยนรูป</button>
      </div>
    </div>

    <!-- Caption / Travel Note -->
    <div class="qd-caption-wrap">
      <label for="qd-caption">💭 บันทึกความประทับใจ หรือข้อความเช็คอิน (ไม่บังคับ):</label>
      <textarea id="qd-caption" class="qd-caption-input" placeholder="แชร์ความรู้สึก หรือเล่าบรรยากาศ ณ ตอนนี้..."></textarea>
    </div>
  `;

  $('quest-dialog').showModal();

  // Initialize GPS panel
  renderGpsPanel('idle', { targetLat: landmark.lat, targetLng: landmark.lng, targetName: landmark.name });

  // Wire photo dropzone & file input
  const fileInput = $('qd-photo-file');
  const dropzone = $('qd-dropzone');
  const previewWrap = $('qd-preview-wrap');
  const previewImg = $('qd-preview-img');
  const previewDate = $('qd-preview-date');
  const retakeBtn = $('qd-retake-btn');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

  fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;

    activeCapturedFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      activeCapturedPhoto = ev.target.result;
      previewImg.src = activeCapturedPhoto;
      previewDate.textContent = `📅 ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
      dropzone.style.display = 'none';
      previewWrap.style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  retakeBtn.addEventListener('click', () => {
    activeCapturedFile = null;
    activeCapturedPhoto = null;
    fileInput.value = '';
    previewWrap.style.display = 'none';
    dropzone.style.display = 'flex';
  });
}

// ── Submit Check-In Handler (ตรวจ GPS ในรัศมี 5km + อัปรูปขึ้น Supabase) ──────────
$('qd-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!current) return;

  const msg = $('qd-msg');
  const landmark = getQuestLandmark(current);
  const caption = $('qd-caption')?.value.trim() || 'เช็คอินสำเร็จ ณ จุดแลนด์มาร์ก!';

  // 1. ตรวจสอบว่าผู้ใช้ได้เลือกรูปภาพหรือยัง
  if (!activeCapturedFile && !activeCapturedPhoto) {
    msg.hidden = false;
    msg.className = 'alert alert-error';
    msg.textContent = 'กรุณาถ่ายรูปหรือเลือกรูปภาพก่อนกดยืนยันการเช็คอินครับ 📷';
    return;
  }

  // 2. ตรวจสอบพิกัด GPS ว่าตรงกับสถานที่ในรัศมี 5 กิโลเมตรหรือไม่
  $('qd-submit').disabled = true;
  $('qd-submit').textContent = '📡 กำลังตรวจสอบพิกัด GPS...';
  msg.hidden = true;

  const targetLat = landmark.lat;
  const targetLng = landmark.lng;
  let userPos = null;
  let dist = 0;

  if (targetLat && targetLng) {
    try {
      userPos = await getCurrentPosition();
      dist = haversineDistance(userPos.lat, userPos.lng, targetLat, targetLng);
    } catch (gpsErr) {
      msg.hidden = false;
      msg.className = 'alert alert-error';
      msg.innerHTML = `⚠️ <strong>ไม่สามารถตรวจสอบพิกัด GPS ได้</strong><br>${esc(gpsErr)}<br><small style="color:#DC2626;font-weight:700;">กรุณาเปิด GPS และอนุญาตการเข้าถึงตำแหน่ง เพื่อยืนยันว่าคุณอยู่ในรัศมี 5 กิโลเมตรจากสถานที่ครับ</small>`;
      $('qd-submit').disabled = false;
      $('qd-submit').textContent = `📸 ยืนยันการเช็คอิน & รับ ${current.reward_tokens} โทเคน`;
      renderGpsPanel('denied', { err: gpsErr, targetLat, targetLng, targetName: landmark.name });
      return;
    }

    if (dist > GPS_RADIUS_M) {
      const distKm = (dist / 1000).toFixed(2);
      msg.hidden = false;
      msg.className = 'alert alert-error';
      msg.innerHTML = `❌ <strong>คุณอยู่นอกพื้นที่เช็คอิน!</strong><br>ตำแหน่งของคุณอยู่ห่างจาก <strong>${esc(landmark.name)}</strong> ประมาณ <strong>${distKm} กิโลเมตร</strong><br><small style="color:#DC2626;font-weight:700;">ระบบกำหนดให้ต้องอยู่ในรัศมีไม่เกิน 5 กิโลเมตรจากหมุดสถานที่เท่านั้น</small>`;
      $('qd-submit').disabled = false;
      $('qd-submit').textContent = `📸 ยืนยันการเช็คอิน & รับ ${current.reward_tokens} โทเคน`;
      renderGpsPanel('too_far', { dist, targetLat, targetLng, targetName: landmark.name });
      return;
    }

    lastGpsResult = {
      state: 'verified',
      dist,
      lat: userPos.lat,
      lng: userPos.lng,
      accuracy: userPos.accuracy
    };
    renderGpsPanel('verified', { dist, lat: userPos.lat, lng: userPos.lng, accuracy: userPos.accuracy, targetLat, targetLng, targetName: landmark.name });
  }

  // 3. ดำเนินการอัปโหลดรูปภาพของผู้ใช้ขึ้น Supabase Storage
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      location.href = `/login.html?next=${encodeURIComponent('/quests.html#' + current.id)}`;
      return;
    }

    $('qd-submit').textContent = '📤 กำลังอัปโหลดรูปภาพไปยัง Supabase...';
    let finalPhotoUrl = null;

    if (activeCapturedFile) {
      try {
        const cleanExt = (activeCapturedFile.name.split('.').pop() || 'webp').toLowerCase();
        const randomId = Math.random().toString(36).substring(2, 8);
        const storagePath = `submissions/${session.user.id}/${current.id}_${Date.now()}_${randomId}.${cleanExt}`;

        let { error: upErr } = await supabase.storage.from('quest-images').upload(storagePath, activeCapturedFile, {
          cacheControl: '3600',
          upsert: true
        });
        if (upErr) {
          const retry = await supabase.storage.from('place-images').upload(storagePath, activeCapturedFile, {
            cacheControl: '3600',
            upsert: true
          });
          if (!retry.error) {
            const { data: pubData } = supabase.storage.from('place-images').getPublicUrl(storagePath);
            finalPhotoUrl = pubData?.publicUrl;
          }
        } else {
          const { data: pubData } = supabase.storage.from('quest-images').getPublicUrl(storagePath);
          finalPhotoUrl = pubData?.publicUrl;
        }
      } catch (storageEx) {
        console.warn('Storage upload error:', storageEx);
      }

      if (!finalPhotoUrl) {
        finalPhotoUrl = await fileToOptimizedDataUrl(activeCapturedFile);
      }
    } else {
      finalPhotoUrl = activeCapturedPhoto;
    }

    $('qd-submit').textContent = '💾 กำลังบันทึกข้อมูลลง Supabase...';

    // 4. เรียก RPC submit_photo_checkin (security definer — จัดการ RLS, tokens, diary ให้หมด)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('submit_photo_checkin', {
      p_quest_id:  current.id,
      p_photo_url: finalPhotoUrl,
      p_caption:   caption,
      p_gps_lat:   userPos ? userPos.lat : null,
      p_gps_lng:   userPos ? userPos.lng : null,
      p_gps_dist:  dist || null,
    });

    if (rpcErr) {
      // Fallback: ลองบันทึกผ่าน direct upsert ถ้า RPC ยังไม่ได้ติดตั้ง
      console.warn('submit_photo_checkin RPC error (fallback to direct):', rpcErr);
      const uqPayload = {
        user_id: session.user.id,
        quest_id: current.id,
        status: 'completed',
        photo_url: finalPhotoUrl,
        caption: caption,
        gps_lat: userPos ? userPos.lat : null,
        gps_lng: userPos ? userPos.lng : null,
        gps_dist: dist || null,
        completed_at: new Date().toISOString()
      };
      const { error: uqErr } = await supabase.from('user_quests').upsert(uqPayload, { onConflict: 'user_id,quest_id' });
      if (uqErr) {
        console.warn('Direct upsert error:', uqErr);
        // ถ้ายังไม่มี columns ใหม่ ลอง minimal
        await supabase.from('user_quests').upsert(
          { user_id: session.user.id, quest_id: current.id, status: 'completed', completed_at: new Date().toISOString() },
          { onConflict: 'user_id,quest_id' }
        );
      }
      // token + diary fallbacks
      if (current.reward_tokens > 0) {
        await supabase.from('token_transactions').upsert(
          { user_id: session.user.id, amount: current.reward_tokens, source_type: 'quest', source_id: current.id },
          { onConflict: 'user_id,source_type,source_id' }
        ).catch(e => console.warn(e));
      }
      await supabase.from('travel_diaries').insert({
        user_id: session.user.id,
        title: `📸 เช็คอิน: ${current.title}`,
        body: `${caption}\nสถานที่: ${landmark.name}`,
        travel_date: new Date().toISOString().slice(0, 10),
        mood: 'เช็คอินสำเร็จ 🏆'
      }).catch(e => console.warn(e));
    }

    // 5. อัปเดต State ให้มีรูปที่อัปโหลดตรงกันทันที
    progress.set(current.id, {
      status: 'completed',
      photo_url: finalPhotoUrl,
      caption: caption,
      gps_lat: userPos?.lat,
      gps_lng: userPos?.lng,
      gps_dist: dist,
      completed_at: new Date().toISOString()
    });

    saveCheckin(current.id, {
      questId: current.id,
      questTitle: current.title,
      placeName: landmark.name,
      photoUrl: finalPhotoUrl,
      caption: caption,
      checkedInAt: new Date().toISOString(),
      gps: userPos ? { lat: userPos.lat, lng: userPos.lng, dist, accuracy: userPos.accuracy } : null,
      gpsStatus: 'verified'
    });

    render();
    updateHeroStats();

    const distMsg = dist >= 1000 ? (dist / 1000).toFixed(2) + ' กม.' : Math.round(dist) + ' ม.';
    msg.hidden = false;
    msg.className = 'alert-ok';
    msg.innerHTML = `🎉 <strong>ถ่ายรูปเช็คอินสำเร็จ!</strong> คุณได้รับ 🪙 +${current.reward_tokens} โทเคน <br><small>📡 พิกัดถูกต้อง (ห่าง ${distMsg}) · รูปภาพถูกบันทึกลง Supabase เรียบร้อย</small>`;
    toast(`🎉 เช็คอิน ${landmark.name} สำเร็จ! +${current.reward_tokens} โทเคน`, 'ok');

    // โหลดหน้าต่างแสดงภาพที่เพิ่งอัปโหลดสำเร็จ
    setTimeout(() => {
      openQuest(current.id);
    }, 1200);

  } catch (err) {
    console.error('Checkin submit error:', err);
    msg.hidden = false;
    msg.className = 'alert-error';
    msg.textContent = `เกิดข้อผิดพลาด: ${err.message}`;
    $('qd-submit').disabled = false;
    $('qd-submit').textContent = `📸 ยืนยันการเช็คอิน & รับ ${current.reward_tokens} โทเคน`;
  }
});

$('qd-close').addEventListener('click', () => $('quest-dialog').close());

// ── Search & Filter Listeners ─────────────────────────────
$('search').addEventListener('input', e => { searchTerm = e.target.value; render(); });
$('f-diff').addEventListener('change', render);
$('f-place').addEventListener('change', render);

document.querySelectorAll('.quest-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.quest-tab').forEach(t2 => {
      t2.classList.remove('active');
      t2.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    activeTab = tab.dataset.tab;
    render();
  });
});

$('list').addEventListener('click', e => {
  const btn = e.target.closest('[data-id]');
  if (btn) openQuest(btn.dataset.id);
});

// ── Dynamic Campaigns Loader ───────────────────────────────
async function loadQuestsCampaigns() {
  const el = $('quests-campaigns-grid');
  if (!el) return;
  try {
    const [campsRes, charsRes] = await Promise.all([
      supabase.from('campaigns').select('id, title, description, starts_at, ends_at, reward_tokens, image_url, approval_status, status').eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('characters').select('id, name, description, image_url, rarity, token_multiplier, unlock_hint, campaign_id, status, approval_status').or('status.eq.active,approval_status.eq.approved'),
    ]);

    let items = (campsRes.data || []).filter(c => c.approval_status !== 'rejected');
    try {
      const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const approvedLocals = localCamps.filter(c => c.approval_status === 'approved' || c.status === 'published');
      const existingIds = new Set(items.map(c => c.id));
      for (const lc of approvedLocals) {
        if (!existingIds.has(lc.id)) items.push(lc);
      }
    } catch (e) {}

    let chars = charsRes.data || [];
    try {
      const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
      const activeLocals = localChars.filter(c => c.approval_status === 'approved' || c.status === 'active');
      const existingIds = new Set(chars.map(c => c.id));
      for (const lc of activeLocals) {
        if (!existingIds.has(lc.id)) chars.push(lc);
      }
    } catch (e) {}

    if (!items.length) return;

    const charMap = new Map();
    for (const ch of chars) {
      if (ch.campaign_id) charMap.set(ch.campaign_id, ch);
    }

    el.innerHTML = items.map(c => {
      const isMaya = (c.title || '').includes('มายา') || (c.title || '').includes('ชายฝั่ง');
      const themeClass = isMaya ? 'campaign-maya' : 'campaign-ray';
      const rewardTheme = isMaya ? 'reward-maya' : 'reward-ray';
      const tagClass = isMaya ? 'campaign-char-badge-tag tag-maya' : 'campaign-char-badge-tag';
      const coverImg = c.image_url || (isMaya ? 'https://images.unsplash.com/photo-1548940740-204726a19be3?w=800&auto=format&fit=crop&q=80' : '/assets/img/Wat Arun (Temple of Dawn).webp');

      const ch = charMap.get(c.id);
      const charThumb = ch?.image_url || (isMaya ? '/assets/img/maya.png' : '/assets/img/ray.png');
      const charName = ch?.name || (isMaya ? 'นักสำรวจ — มายา' : 'นักสำรวจ — เรย์');
      const charRarity = ch?.rarity ? (ch.rarity.charAt(0).toUpperCase() + ch.rarity.slice(1)) : 'Epic';
      const charSub = ch?.description || (isMaya ? 'ชุดเหลือง-เขียว สหายผีใบไม้ • ×2 โทเคนเควสท์ริมน้ำ' : 'ชุดน้ำเงิน-ขาว สหายนกเพนกวิน • ×2 โทเคนเควสท์ใหม่');
      const condText = ch?.unlock_hint || (isMaya ? 'เช็คอินริมน้ำ/ท่าเรือ/ตลาดน้ำครบ 4 แห่ง' : 'เช็คอินสถานที่ร่วมรายการครบ 5 แห่ง');
      const mult = ch?.token_multiplier || 2.0;
      const multText = ch ? `ได้รับโทเคน ×${mult} เท่า เมื่อทำเควสท์ในแคมเปญนี้` : 'ได้รับโทเคน ×2 เท่า จากเควสท์ในแคมเปญนี้';

      return `
        <article class="card campaign-card ${themeClass}">
          <div class="campaign-media">
            <img src="${esc(coverImg)}" alt="${esc(c.title)}" loading="lazy" onerror="this.onerror=null;this.src='${isMaya ? 'https://images.unsplash.com/photo-1548940740-204726a19be3?w=800&auto=format&fit=crop&q=80' : 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&auto=format&fit=crop&q=80'}'">
            <div class="campaign-media-overlay">
              <span class="campaign-tokens-badge"><svg class="ic" width="16" height="16" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-coin"></use></svg> +${c.reward_tokens || 100} Tokens</span>
              <span class="${tagClass}"><svg class="ic" width="14" height="14" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-gift"></use></svg> แจกตัวละครฟรี</span>
            </div>
          </div>
          <div class="campaign-body">
            <div class="campaign-header">
              <span class="badge badge-campaign">Special Campaign</span>
              <span class="campaign-deadline"><svg class="ic" width="14" height="14" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-calendar"></use></svg> เหลืออีก 90 วัน</span>
            </div>
            <h3 class="card-title">${esc(c.title)}</h3>
            <p class="card-summary">${esc(c.description || '')}</p>

            <div class="campaign-reward-box ${rewardTheme}">
              <img class="campaign-char-thumb" src="${esc(charThumb)}" alt="${esc(charName)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/img/ray.png'">
              <div class="campaign-reward-info">
                <div class="campaign-reward-title">
                  <span>${esc(charName)}</span>
                  <span class="badge-epic">${esc(charRarity)}</span>
                </div>
                <div class="campaign-reward-subtitle">${esc(charSub)}</div>
              </div>
            </div>

            <ul class="campaign-features-list">
              <li>
                <svg class="ic" width="16" height="16" style="color:var(--color-emerald);" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-check-circle"></use></svg>
                <span>เงื่อนไข: <strong>${esc(condText)}</strong></span>
              </li>
              <li>
                <svg class="ic" width="16" height="16" style="color:var(--color-gold);" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-star"></use></svg>
                <span>บัฟพิเศษ: <strong>${esc(multText)}</strong></span>
              </li>
            </ul>

            <div class="campaign-cta-row">
              <span class="campaign-status-note">✨ รับได้จากแคมเปญเท่านั้น</span>
              <a class="btn btn-small" href="#filters">ดูเควสท์ที่ร่วมรายการ ↓</a>
            </div>
          </div>
        </article>
      `;
    }).join('');
  } catch (e) {
    console.warn('loadQuestsCampaigns notice:', e);
  }
}

// ── Initialize Page ───────────────────────────────────────
async function init() {
  $('status').textContent = 'กำลังโหลดเควสท์...';
  try {
    loadQuestsCampaigns();
    const [qs, pr] = await Promise.all([listQuests(), myProgress()]);
    quests = qs;
    progress = pr;

    // ผสานข้อมูล local check-ins โดยไม่ทับข้อมูลรูปภาพจาก Supabase
    const saved = getSavedCheckins();
    for (const [qid, sVal] of Object.entries(saved)) {
      if (!progress.has(qid)) {
        progress.set(qid, {
          status: 'completed',
          photo_url: sVal.photoUrl,
          caption: sVal.caption,
          completed_at: sVal.checkedInAt
        });
      } else {
        const existing = progress.get(qid);
        if (typeof existing === 'object' && !existing.photo_url && sVal.photoUrl) {
          existing.photo_url = sVal.photoUrl;
        }
      }
    }

    fillFilters();
    updateHeroStats();
    render();

    // Direct hash deep link
    const hashId = location.hash.replace(/^#/, '');
    if (hashId && quests.some(q => q.id === hashId)) {
      openQuest(hashId);
    }
  } catch (e) {
    console.error('Failed to load quests:', e);
    $('status').textContent = 'ไม่สามารถโหลดเควสท์ได้ กรุณาลองใหม่อีกครั้ง';
  }
}

init();
