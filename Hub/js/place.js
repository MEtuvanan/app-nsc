import { getPlace } from './places.js';
import { createMap, setMarkers } from './maps.js';
import { listQuestsForPlace } from './quests.js';
import { supabase } from './supabase.js';
import { esc, isUuid } from './ui.js';
import { requireAuth } from './auth.js';

const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');

async function init() {
  const session = await requireAuth();
  if (!session) return;
  if (!isUuid(id)) { $('status').textContent = 'ลิงก์สถานที่ท่องเที่ยวไม่ถูกต้อง'; return; }
  
  let p;
  try {
    p = await getPlace(id);
  } catch (e) {
    console.error(e);
    $('status').textContent = 'ไม่สามารถโหลดข้อมูลสถานที่นี้ได้ กรุณาลองใหม่อีกครั้ง';
    return;
  }
  if (!p) {
    $('status').textContent = 'ไม่พบสถานที่ท่องเที่ยวที่ระบุ';
    return;
  }

  const nameTh = p.name_display || p.name;
  const nameEn = p.name_en_display || p.name;

  document.title = `${nameTh} — Travel and Challenge`;
  $('status').hidden = true;
  $('place').hidden = false;

  // Title & Headers
  $('name').textContent = nameTh;
  const nameEnEl = $('name-en');
  if (nameEnEl) {
    nameEnEl.textContent = nameEn !== nameTh ? nameEn : (p.name || '');
  }

  // Badges
  const badgesEl = $('place-badges');
  if (badgesEl) {
    const cat = p.category_th || p.place_categories?.name || 'สถานที่ท่องเที่ยว';
    const dist = p.districts?.name_en || '';
    const prov = p.provinces?.name_en || 'กรุงเทพฯ';
    const loc = [dist, prov].filter(Boolean).join(', ');
    badgesEl.innerHTML = `
      <span class="badge badge-muted" style="font-size:0.85rem;padding:0.35rem 0.75rem;">🏷️ ${esc(cat)}</span>
      <span class="badge badge-muted" style="font-size:0.85rem;padding:0.35rem 0.75rem;">📍 ${esc(loc)}</span>
      ${p.verified ? '<span class="badge" style="background:#DCFCE7;color:#166534;font-size:0.85rem;padding:0.35rem 0.75rem;">✓ ตรวจสอบแล้ว</span>' : ''}
    `;
  }

  // Gallery Photos
  const galleryEl = $('gallery');
  const photos = (p.gallery_display && p.gallery_display.length) ? p.gallery_display :
                 (p.place_images?.length ? p.place_images.map(i => i.url) : [p.cover_image_display || 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800']);

  galleryEl.innerHTML = photos.map(url => `
    <img src="${esc(url)}" alt="${esc(nameTh)}" loading="lazy">
  `).join('');

  // Highlights Section
  const highlights = p.highlights_display || [];
  const hlContainer = $('highlights-container');
  const hlGrid = $('highlights-grid');
  if (hlContainer && hlGrid) {
    if (highlights.length) {
      hlContainer.hidden = false;
      hlGrid.innerHTML = highlights.map(h => `
        <div class="highlight-card">
          <div class="highlight-icon">${h.icon}</div>
          <h3 class="highlight-title">${esc(h.title)}</h3>
          <p class="highlight-desc">${esc(h.desc)}</p>
        </div>
      `).join('');
    } else {
      hlContainer.hidden = true;
    }
  }

  // About Narrative
  $('description').textContent = p.description_display || p.description || p.summary || 'ไม่มีคำอธิบายเพิ่มเติมสำหรับสถานที่นี้';

  // Visitor Information List
  const visitorList = $('visitor-list');
  if (visitorList) {
    const items = [
      { icon: '⏰', label: 'เวลาเปิด-ปิดทำการ', val: p.opening_hours_display || p.opening_hours || 'เปิดทุกวัน (โปรดตรวจสอบก่อนเดินทาง)' },
      { icon: '🎟️', label: 'อัตราค่าเข้าชม', val: p.entry_fee_display || p.entry_fee || 'เข้าชมฟรี' },
      { icon: '👗', label: 'ข้อควรปฏิบัติ & ระเบียบการแต่งกาย', val: p.visitor_info_display || p.visitor_info || 'แต่งกายสุภาพตามกาลเทศะ' },
      { icon: '🌅', label: 'ช่วงเวลาที่แนะนำในการท่องเที่ยว', val: p.best_time_display || 'ช่วงเช้าตรู่ หรือช่วงบ่ายแก่ๆ แดดร่มลมตก' },
    ];

    visitorList.innerHTML = items.map(it => `
      <div class="visitor-item">
        <div class="visitor-item-icon">${it.icon}</div>
        <div>
          <div class="visitor-item-label">${esc(it.label)}</div>
          <div class="visitor-item-val">${esc(it.val)}</div>
        </div>
      </div>
    `).join('');
  }

  // Coordinates & Public Transportation
  $('coords').textContent = `พิกัด GPS: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const transBox = $('transportation-box');
  const transText = $('transportation-text');
  if (transBox && transText && p.transportation_display) {
    transBox.hidden = false;
    transText.textContent = p.transportation_display;
  }

  // Action Buttons
  $('btn-write-journal').href = `/journal.html?place_id=${encodeURIComponent(p.id)}`;
  $('btn-trip').href = `/planner.html?place_id=${encodeURIComponent(p.id)}`;
  const btnNav = $('btn-nav');
  if (btnNav) {
    btnNav.href = `/navigate.html?lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(nameTh)}&id=${encodeURIComponent(p.id)}`;
  }

  // Quests Here
  try {
    const qs = await listQuestsForPlace(p.id);
    const questsList = $('quests');
    if (qs.length) {
      questsList.innerHTML = qs.map(q => {
        const diffBadge = q.difficulty === 'easy' ? '🟢 ง่าย' : q.difficulty === 'medium' ? '🟡 ปานกลาง' : '🔴 ยาก';
        return `
          <li>
            <a href="/quests.html#${encodeURIComponent(q.id)}" class="place-quest-item">
              <div>
                <strong>${esc(q.title)}</strong>
                <div style="font-size:0.8rem;color:#64748B;margin-top:2px;">ระดับ: ${diffBadge}</div>
              </div>
              <span class="badge" style="background:#FEF3C7;color:#92400E;font-size:0.85rem;font-weight:700;">+${Number(q.reward_tokens || 50)} 🪙</span>
            </a>
          </li>
        `;
      }).join('');
    } else {
      questsList.innerHTML = '<li style="color:#64748B;font-size:0.9rem;padding:0.5rem 0;">ยังไม่มีเควสท์สำหรับสถานที่นี้</li>';
    }
  } catch (e) {
    console.error(e);
    $('quests').innerHTML = '<li style="color:#EF4444;">ไม่สามารถโหลดเควสท์ได้</li>';
  }

  // Campaigns
  try {
    let cs = [];
    const { data, error } = await supabase.from('campaign_places')
      .select('campaigns(id, title, description, reward_tokens, image_url, status, approval_status)').eq('place_id', p.id);
    if (!error && data) {
      cs = data.map(r => r.campaigns).filter(Boolean).filter(c => c.approval_status !== 'rejected');
    }

    // Merge local approved campaigns for this place
    try {
      const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const matched = localCamps.filter(lc => {
        if (lc.approval_status === 'rejected') return false;
        return (lc.campaign_places || []).some(cp => cp.place_id === p.id);
      });
      const existingIds = new Set(cs.map(c => c.id));
      for (const mc of matched) {
        if (!existingIds.has(mc.id)) cs.push(mc);
      }
    } catch (e) {}

    const campSec = $('campaigns-section');
    if (cs.length) {
      if (campSec) campSec.hidden = false;
      $('campaigns').innerHTML = cs.map(c => `
        <li class="place-quest-item" style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1rem;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:0.5rem;">
          <div>
            <div style="font-weight:700;color:#0F172A;font-size:0.95rem;display:flex;align-items:center;gap:0.35rem;">
              <span>🏆 ${esc(c.title)}</span>
              ${c.reward_tokens ? `<span style="font-size:0.75rem;background:#FEF3C7;color:#D97706;padding:2px 7px;border-radius:9999px;font-weight:700;">+${c.reward_tokens} โทเคน</span>` : ''}
            </div>
            ${c.description ? `<p style="font-size:0.82rem;color:#64748B;margin:0.25rem 0 0;">${esc(c.description.slice(0, 100))}</p>` : ''}
          </div>
          <a class="btn btn-small" href="/quests.html" style="white-space:nowrap;font-size:0.8rem;">ทำเควสท์ →</a>
        </li>
      `).join('');
    } else {
      if (campSec) campSec.hidden = true;
    }
  } catch (e) {
    console.error(e);
    if ($('campaigns-section')) $('campaigns-section').hidden = true;
  }

  // Leaflet / Google Map
  try {
    const map = await createMap($('map'));
    setMarkers(map, {}, [p], () => {});
  } catch (e) {
    $('map-error').hidden = false;
    $('map-error').textContent = e.message;
  }
}

init();
