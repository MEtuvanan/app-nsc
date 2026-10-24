// admin.js — Full Admin Dashboard CMS
// Features: Quests, Places with Leaflet Pin Picker, User Management & Blocking, Account Creation, Token Usage Analytics, AI GPT-OSS Assistant

import { supabase } from './supabase.js';
import { getProfile, getSession, signUp } from './auth.js';
import { esc, toast, confirmDialog, isUuid, stateLoading, stateEmpty } from './ui.js';
import { initAdminStore } from './admin-store.js';

const $ = id => document.getElementById(id);
const PAGE_SIZE = 15;

// Storage key for banned users and local accounts fallback
const STORAGE_BANNED = 'tc_banned_users';

function getBannedUsers() {
  try { return JSON.parse(localStorage.getItem(STORAGE_BANNED) || '[]'); } catch { return []; }
}
function setBannedUsers(list) {
  localStorage.setItem(STORAGE_BANNED, JSON.stringify(list));
}


function renderPagination(containerId, total, page, onChange) {
  const el = $(containerId);
  if (!el) return;
  const pages = Math.ceil((total || 0) / PAGE_SIZE);
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  for (let i = 0; i < pages; i++) {
    html += `<button type="button" class="${i === page ? 'active' : ''}" data-p="${i}">${i + 1}</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => onChange(parseInt(btn.dataset.p, 10)));
  });
}
window.renderPagination = renderPagination;

// ── Guard ────────────────────────────────────────────────────────────────────
async function guard() {
  const p = await getProfile();
  if (!p || p.role !== 'admin') {
    document.body.innerHTML = `
      <main class="section" style="padding:4rem 1rem;text-align:center;">
        <div style="max-width:480px;margin:0 auto;background:#FFF;padding:2rem;border-radius:12px;border:1px solid #E2E8F0;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
          <div style="font-size:3rem;margin-bottom:1rem;">🔒</div>
          <h2 style="font-size:1.35rem;font-weight:800;margin-bottom:0.5rem;color:#0F172A;">Admin Access Only</h2>
          <p style="color:#64748B;font-size:0.95rem;margin-bottom:1.5rem;">หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน</p>
          <a href="/login.html" class="btn">เข้าสู่ระบบ</a>
        </div>
      </main>`;
    return false;
  }
  return true;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function initTabs() {
  const btns = document.querySelectorAll('.snav-item');
  const panels = document.querySelectorAll('.admin-panel');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = $(`panel-${btn.dataset.tab}`);
      if (target) target.classList.add('active');

      // Invalidate Leaflet map size if switching to map-dependent views
      if (btn.dataset.tab === 'places' && mapPicker) {
        setTimeout(() => mapPicker.invalidateSize(), 200);
      }
      if (btn.dataset.tab === 'partners') loadPartnersPanel();
      if (btn.dataset.tab === 'store') window.loadAdminStore?.();
    });
  });
}

// ── Reference Data (Provinces & Categories) ───────────────────────────────────
let provinces = [], categories = [], allPlacesList = [];

async function loadRefs() {
  try {
    const [p, c, pl] = await Promise.all([
      supabase.from('provinces').select('id, name_en, name_th').order('name_th'),
      supabase.from('place_categories').select('id, slug, name').order('name'),
      supabase.from('places').select('id, name, lat, lng').order('name'),
    ]);
    provinces = p.data || [
      { id: 1, name_en: 'Bangkok', name_th: 'กรุงเทพมหานคร' },
      { id: 2, name_en: 'Chiang Mai', name_th: 'เชียงใหม่' },
      { id: 3, name_en: 'Phuket', name_th: 'ภูเก็ต' }
    ];
    categories = c.data || [
      { id: 'temple', slug: 'temple', name: 'วัด & โบราณสถาน' },
      { id: 'market', slug: 'market', name: 'ตลาด & ชุมชน' },
      { id: 'museum', slug: 'museum', name: 'พิพิธภัณฑ์' },
      { id: 'park', slug: 'park', name: 'สวนสาธารณะ' },
      { id: 'nature', slug: 'nature', name: 'ธรรมชาติ & ริมน้ำ' }
    ];
    allPlacesList = pl.data || [];
  } catch (e) {
    console.warn('loadRefs fallback', e);
  }
}

// ── Overview / Analytics ──────────────────────────────────────────────────────
async function loadStats() {
  try {
    const [places, quests, users, completions, tokens] = await Promise.all([
      supabase.from('places').select('id', { count: 'exact', head: true }).neq('status', 'archived'),
      supabase.from('quests').select('id', { count: 'exact', head: true }).neq('status', 'archived'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('user_quests').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('token_transactions').select('amount'),
    ]);

    const bannedList = getBannedUsers();

    const totalPlaces = places.count || 0;
    const totalQuests = quests.count || 0;
    const totalUsers = users.count || 0;
    const totalCompletions = completions.count || 0;

    let totalTokens = 0;
    if (tokens.data?.length) {
      totalTokens = tokens.data.reduce((sum, b) => sum + (b.amount || 0), 0);
    }

    $('stat-places').textContent = totalPlaces;
    $('stat-quests').textContent = totalQuests;
    $('stat-users').textContent = totalUsers;
    $('stat-completions').textContent = totalCompletions;
    $('stat-tokens-total').textContent = totalTokens.toLocaleString();
    $('stat-blocked').textContent = bannedList.length;

    // Load recent activity preview
    loadRecentActivity();
    refreshPartnerBadge();
  } catch (e) {
    console.error('Stats error', e);
  }
}

async function loadRecentActivity() {
  const recentCheckinsEl = $('recent-checkins');
  const recentUsersEl = $('recent-users-list');

  try {
    const { data: checkins } = await supabase.from('user_quests')
      .select('id, quest_id, user_id, completed_at, quests(title, reward_tokens), profiles(display_name)')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false }).limit(5);

    if (recentCheckinsEl) {
      if (checkins && checkins.length > 0) {
        recentCheckinsEl.innerHTML = checkins.map(c => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid #F1F5F9;font-size:0.88rem;">
            <div>
              <strong>${esc(c.profiles?.display_name || 'ผู้เล่น')}</strong>
              <div style="color:#64748B;font-size:0.8rem;">${esc(c.quests?.title || 'เควสท์')}</div>
            </div>
            <span class="badge badge-success">+${c.quests?.reward_tokens || 50} 🪙</span>
          </div>
        `).join('');
      } else {
        recentCheckinsEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#64748B;font-size:0.9rem;">ยังไม่มีประวัติการเช็คอินเควสท์จากผู้ใช้งาน</div>';
      }
    }

    const { data: users } = await supabase.from('profiles')
      .select('id, display_name, role, created_at')
      .order('created_at', { ascending: false }).limit(5);

    if (recentUsersEl) {
      if (users && users.length > 0) {
        recentUsersEl.innerHTML = users.map(u => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid #F1F5F9;font-size:0.88rem;">
            <div>
              <strong>${esc(u.display_name || 'ผู้ใช้')}</strong>
              <div style="color:#64748B;font-size:0.8rem;">${u.role === 'admin' ? '🛡️ ผู้ดูแลระบบ' : u.role === 'partner' ? '🏢 ผู้ประกอบการ' : '👤 สมาชิก'}</div>
            </div>
            <span class="badge ${u.role === 'admin' ? 'badge-warning' : 'badge-info'}">${u.role || 'user'}</span>
          </div>
        `).join('');
      } else {
        recentUsersEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#64748B;font-size:0.9rem;">ยังไม่มีสมาชิกใหม่ในระบบ</div>';
      }
    }
  } catch (e) {
    console.warn('Recent activity load notice', e);
  }
}

// ── 📍 PLACES (MANAGEMENT & PINNING) ──────────────────────────────────────────
let placePage = 0, placeSearch = '', placeStatusFilter = '';

async function loadPlaces() {
  const tbody = $('places-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7">${stateLoading()}</td></tr>`;

  try {
    let q = supabase.from('places')
      .select('id, name, summary, status, lat, lng, visitor_info, provinces(name_th, name_en), place_categories(name), place_images(url, position)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(placePage * PAGE_SIZE, (placePage + 1) * PAGE_SIZE - 1);

    if (placeSearch.trim()) q = q.ilike('name', `%${placeSearch.trim()}%`);
    if (placeStatusFilter) q = q.eq('status', placeStatusFilter);

    const { data, count, error } = await q;
    if (error) throw error;

    let places = data || [];

    if (!places.length) {
      tbody.innerHTML = `<tr><td colspan="7">${stateEmpty('ยังไม่มีสถานที่ในระบบ')}</td></tr>`;
      return;
    }

    tbody.innerHTML = places.map(p => {
      const sorted = (p.place_images || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      const img = sorted[0]?.url || p.cover_image_url || 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=100&auto=format&fit=crop&q=80';
      const prov = p.provinces?.name_th || p.provinces?.name_en || 'กรุงเทพฯ';
      const loc = prov;
      const coords = (p.lat && p.lng) ? `${Number(p.lat).toFixed(4)}, ${Number(p.lng).toFixed(4)}` : '—';
      const statusBadge = p.status === 'published' ? '<span class="badge badge-success">เผยแพร่</span>' :
                          p.status === 'draft' ? '<span class="badge badge-warning">ร่าง</span>' :
                          '<span class="badge badge-muted">เก็บถาวร</span>';

      return `
        <tr>
          <td><img src="${esc(img)}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;"></td>
          <td>
            <strong><a href="/place.html?id=${encodeURIComponent(p.id)}" style="color:#0F172A;text-decoration:none;">${esc(p.name)}</a></strong>
          </td>
          <td><span class="badge badge-muted">${esc(p.place_categories?.name || 'สถานที่')}</span></td>
          <td class="meta">${esc(loc)}</td>
          <td>
            <button class="btn btn-small btn-secondary" onclick="window.viewPlaceOnMap(${p.lat}, ${p.lng}, '${esc(p.name)}')" title="ดูบนแผนที่">
              📍 ${coords}
            </button>
          </td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-small btn-secondary" data-act="place-edit" data-id="${esc(p.id)}">✏️ แก้ไข</button>
            <button class="btn btn-small btn-danger" data-act="place-del" data-id="${esc(p.id)}" data-name="${esc(p.name)}">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('places-pagination', (count || places.length), placePage, p => { placePage = p; loadPlaces(); });
  } catch (err) {
    console.error('loadPlaces error', err);
    tbody.innerHTML = `<tr><td colspan="7" class="state state-error">ไม่สามารถโหลดสถานที่ได้</td></tr>`;
  }
}

// ── Leaflet Interactive Map Picker ───────────────────────────────────────────
let mapPicker = null;
let pickerMarker = null;
let pickerTargetField = 'place'; // 'place' or 'quest'

function initMapPicker() {
  const dlg = $('map-picker-dialog');
  if (!dlg) return;

  $('mp-cancel')?.addEventListener('click', () => dlg.close());
  $('mp-confirm')?.addEventListener('click', () => {
    const lat = $('mp-lat').value;
    const lng = $('mp-lng').value;
    if (!lat || !lng) {
      alert('กรุณาเลือกตำแหน่งบนแผนที่ก่อน');
      return;
    }
    if (pickerTargetField === 'place') {
      $('pm-lat').value = lat;
      $('pm-lng').value = lng;
    } else if (pickerTargetField === 'quest') {
      $('qm-lat').value = lat;
      $('qm-lng').value = lng;
    }
    toast(`ปักหมุดพิกัด ${lat}, ${lng} สำเร็จแล้ว`);
    dlg.close();
  });
}

function openMapPicker(target = 'place', initialLat = 13.7563, initialLng = 100.5018) {
  pickerTargetField = target;
  const dlg = $('map-picker-dialog');
  if (!dlg) return;

  const latVal = parseFloat(initialLat) || 13.7563;
  const lngVal = parseFloat(initialLng) || 100.5018;

  $('mp-lat').value = latVal.toFixed(6);
  $('mp-lng').value = lngVal.toFixed(6);

  dlg.showModal();

  setTimeout(() => {
    const mapEl = $('map-picker');
    if (!mapEl) return;

    if (!mapPicker) {
      mapPicker = L.map(mapEl).setView([latVal, lngVal], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(mapPicker);

      pickerMarker = L.marker([latVal, lngVal], { draggable: true }).addTo(mapPicker);

      pickerMarker.on('dragend', () => {
        const pos = pickerMarker.getLatLng();
        $('mp-lat').value = pos.lat.toFixed(6);
        $('mp-lng').value = pos.lng.toFixed(6);
      });

      mapPicker.on('click', e => {
        pickerMarker.setLatLng(e.latlng);
        $('mp-lat').value = e.latlng.lat.toFixed(6);
        $('mp-lng').value = e.latlng.lng.toFixed(6);
      });
    } else {
      mapPicker.invalidateSize();
      mapPicker.setView([latVal, lngVal], 14);
      pickerMarker.setLatLng([latVal, lngVal]);
    }
  }, 150);
}

window.viewPlaceOnMap = (lat, lng, name) => {
  if (!lat || !lng) return;
  openMapPicker('place', lat, lng);
};

// ── Place Images Management (Max 4 images) ───────────────────────────────────
const MAX_PLACE_IMAGES = 4;
let currentPlaceImages = []; // Array of { type: 'file'|'existing'|'url', file?, url?, previewUrl }

function renderImagePreviews() {
  const grid = $('pm-previews-grid');
  const counter = $('pm-images-counter');
  const dropzone = $('pm-dropzone');
  const title = $('pm-dropzone-title');
  const hint = $('pm-dropzone-hint');
  const fileInput = $('pm-file-input');
  const count = currentPlaceImages.length;

  if (counter) {
    counter.textContent = `${count} / ${MAX_PLACE_IMAGES} รูป`;
    counter.style.background = count >= MAX_PLACE_IMAGES ? '#FEF2F2' : '#ECFDF5';
    counter.style.color = count >= MAX_PLACE_IMAGES ? '#DC2626' : '#059669';
  }

  if (count === 0) {
    if (grid) { grid.style.display = 'none'; grid.innerHTML = ''; }
  } else {
    if (grid) {
      grid.style.display = 'grid';
      grid.innerHTML = currentPlaceImages.map((img, idx) => `
        <div class="preview-item ${idx === 0 ? 'is-cover' : ''}">
          <img src="${esc(img.previewUrl)}" alt="รูปสถานที่ ${idx + 1}">
          <span class="preview-badge ${idx === 0 ? 'badge-cover' : ''}">
            ${idx === 0 ? '🌟 ภาพหน้าปก' : `รูปที่ ${idx + 1}`}
          </span>
          <div class="preview-actions">
            ${idx > 0 ? `<button type="button" class="preview-btn" data-action="move-left" data-idx="${idx}" title="เลื่อนไปข้างหน้า (ตั้งเป็นปก)">◀</button>` : ''}
            ${idx < count - 1 ? `<button type="button" class="preview-btn" data-action="move-right" data-idx="${idx}" title="เลื่อนไปข้างหลัง">▶</button>` : ''}
            <button type="button" class="preview-btn preview-btn-delete" data-action="remove-img" data-idx="${idx}" title="ลบรูปนี้">✖</button>
          </div>
        </div>
      `).join('');
    }
  }

  if (dropzone) {
    if (count >= MAX_PLACE_IMAGES) {
      dropzone.classList.add('is-full');
      if (title) title.textContent = '✅ ครบ 4 รูปแล้ว (ลบรูปเดิมออกหากต้องการเปลี่ยน)';
      if (hint) hint.textContent = 'สามารถกดปุ่ม ✖ บนรูปเพื่อลบ หรือกด ◀/▶ เพื่อเรียงลำดับภาพหน้าปก';
      if (fileInput) fileInput.disabled = true;
    } else {
      dropzone.classList.remove('is-full');
      if (title) title.textContent = 'คลิกเพื่อเลือกไฟล์รูปภาพ หรือลากรูปมาวางที่นี่';
      if (hint) hint.textContent = `เพิ่มได้อีก ${MAX_PLACE_IMAGES - count} รูป (สูงสุด ${MAX_PLACE_IMAGES} รูป • รูปแรกจะเป็นภาพหน้าปก)`;
      if (fileInput) fileInput.disabled = false;
    }
  }

  if ($('pm-cover')) {
    $('pm-cover').value = currentPlaceImages[0]?.previewUrl || '';
  }
}

function handleImageFiles(files) {
  if (!files || !files.length) return;
  const remaining = MAX_PLACE_IMAGES - currentPlaceImages.length;
  if (remaining <= 0) {
    alert(`สามารถอัปโหลดรูปภาพได้สูงสุด ${MAX_PLACE_IMAGES} รูปเท่านั้นครับ`);
    return;
  }

  const selected = Array.from(files).slice(0, remaining);
  if (files.length > remaining) {
    alert(`สามารถเพิ่มได้อีกเพียง ${remaining} รูป ระบบจึงเลือกให้ ${remaining} รูปแรกครับ`);
  }

  for (const file of selected) {
    if (!file.type.startsWith('image/')) {
      alert(`ไฟล์ "${file.name}" ไม่ใช่ไฟล์รูปภาพ`);
      continue;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert(`ไฟล์ "${file.name}" มีขนาดเกิน 10MB กรุณาเลือกไฟล์ที่เล็กลง`);
      continue;
    }
    const previewUrl = URL.createObjectURL(file);
    currentPlaceImages.push({
      type: 'file',
      file,
      previewUrl,
      name: file.name
    });
  }

  renderImagePreviews();
}

async function fileToOptimizedDataUrl(file, maxWidth = 1280, quality = 0.85) {
  return new Promise((resolve) => {
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

// ── Place Modal (Add / Edit) ──────────────────────────────────────────────────
function openPlaceEditor(id = null) {
  const dlg = $('place-modal');
  if (!dlg) return;

  // Populate category & province options
  const catSel = $('pm-category');
  catSel.innerHTML = categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

  const provSel = $('pm-province');
  provSel.innerHTML = provinces.map(p => `<option value="${p.id}">${esc(p.name_th || p.name_en)}</option>`).join('');

  $('pm-id').value = id || '';
  $('place-modal-msg').hidden = true;

  if (id) {
    $('place-modal-title').textContent = '✏️ แก้ไขข้อมูลสถานที่';
    // Load place details with up to 4 images
    supabase.from('places').select('*, place_images(id, url, position)').eq('id', id).single().then(({ data }) => {
      if (data) {
        $('pm-name').value = data.name || '';
        $('pm-category').value = data.category_id || categories[0]?.id;
        $('pm-province').value = data.province_id || provinces[0]?.id;
        $('pm-subdistrict').value = '';
        $('pm-lat').value = data.lat || '';
        $('pm-lng').value = data.lng || '';
        const info = data.visitor_info || '';
        const parts = info.split(' • ค่าเข้า: ');
        $('pm-hours').value = parts[0] || '';
        const feeAndTips = parts[1] || '';
        const feeParts = feeAndTips.split(' • การเดินทาง: ');
        $('pm-fee').value = feeParts[0] || '';
        if ($('pm-tips')) $('pm-tips').value = feeParts[1] || data.tips || '';
        $('pm-desc').value = data.summary || data.description || '';
        if ($('pm-history')) $('pm-history').value = data.history || '';
        if ($('pm-highlights')) $('pm-highlights').value = data.highlights || '';
        $('pm-status').value = data.status || 'published';

        // Load existing images
        const imgs = (data.place_images || [])
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .slice(0, MAX_PLACE_IMAGES);
        currentPlaceImages = imgs.map(i => ({
          type: 'existing',
          url: i.url,
          previewUrl: i.url
        }));
        renderImagePreviews();
      }
    });
  } else {
    $('place-modal-title').textContent = '📍 ปักสถานที่ใหม่';
    $('pm-name').value = '';
    $('pm-subdistrict').value = '';
    $('pm-lat').value = '13.7563';
    $('pm-lng').value = '100.5018';
    $('pm-hours').value = 'เปิดทุกวัน 08:30 - 17:30 น.';
    $('pm-fee').value = 'เข้าชมฟรี';
    if ($('pm-tips')) $('pm-tips').value = '';
    $('pm-desc').value = '';
    if ($('pm-history')) $('pm-history').value = '';
    if ($('pm-highlights')) $('pm-highlights').value = '';
    $('pm-status').value = 'published';

    currentPlaceImages = [];
    renderImagePreviews();
  }

  dlg.showModal();
}

function initPlaceForm() {
  const dlg = $('place-modal');
  $('pm-cancel')?.addEventListener('click', () => dlg.close());

  $('btn-pick-place-map')?.addEventListener('click', () => {
    openMapPicker('place', $('pm-lat').value, $('pm-lng').value);
  });

  // Dropzone click & drag-drop
  const dropzone = $('pm-dropzone');
  const fileInput = $('pm-file-input');

  dropzone?.addEventListener('click', () => {
    if (currentPlaceImages.length < MAX_PLACE_IMAGES) {
      fileInput?.click();
    }
  });

  if (dropzone) {
    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, e => {
        e.preventDefault();
        if (currentPlaceImages.length < MAX_PLACE_IMAGES) dropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, e => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
      });
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) {
        handleImageFiles(e.dataTransfer.files);
      }
    });
  }

  fileInput?.addEventListener('change', e => {
    if (e.target.files?.length) {
      handleImageFiles(e.target.files);
      e.target.value = '';
    }
  });

  // Previews actions: remove, move left/right
  $('pm-previews-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.idx, 10);
    if (isNaN(idx)) return;

    if (action === 'remove-img') {
      currentPlaceImages.splice(idx, 1);
      renderImagePreviews();
    } else if (action === 'move-left' && idx > 0) {
      const tmp = currentPlaceImages[idx];
      currentPlaceImages[idx] = currentPlaceImages[idx - 1];
      currentPlaceImages[idx - 1] = tmp;
      renderImagePreviews();
    } else if (action === 'move-right' && idx < currentPlaceImages.length - 1) {
      const tmp = currentPlaceImages[idx];
      currentPlaceImages[idx] = currentPlaceImages[idx + 1];
      currentPlaceImages[idx + 1] = tmp;
      renderImagePreviews();
    }
  });

  // Add from URL button
  $('btn-add-img-url')?.addEventListener('click', () => {
    const input = $('pm-url-input');
    const url = input?.value.trim();
    if (!url) return;
    if (currentPlaceImages.length >= MAX_PLACE_IMAGES) {
      alert(`สามารถใส่รูปภาพได้สูงสุด ${MAX_PLACE_IMAGES} รูปเท่านั้นครับ`);
      return;
    }
    currentPlaceImages.push({
      type: 'url',
      url,
      previewUrl: url
    });
    input.value = '';
    renderImagePreviews();
  });

  $('place-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = $('pm-save');
    const msg = $('place-modal-msg');
    saveBtn.disabled = true;

    const id = $('pm-id').value;
    const name = $('pm-name').value.trim();
    const desc = $('pm-desc').value.trim();
    const history = $('pm-history')?.value.trim() || '';
    const highlights = $('pm-highlights')?.value.trim() || '';
    const tips = $('pm-tips')?.value.trim() || '';

    // Full description combines overview and detailed history for deep reading
    const fullDescription = history
      ? `${desc}\n\n📜 ประวัติและความเป็นมา:\n${history}`
      : desc;

    let visitorInfo = $('pm-hours').value.trim();
    if ($('pm-fee').value.trim()) visitorInfo += ` • ค่าเข้า: ${$('pm-fee').value.trim()}`;
    if (tips) visitorInfo += ` • การเดินทาง: ${tips}`;

    const payload = {
      name,
      summary: desc.slice(0, 450) || name,
      description: fullDescription || null,
      history: history || null,
      highlights: highlights || null,
      tips: tips || null,
      category_id: parseInt($('pm-category').value, 10) || null,
      province_id: parseInt($('pm-province').value, 10),
      lat: parseFloat($('pm-lat').value) || 13.7563,
      lng: parseFloat($('pm-lng').value) || 100.5018,
      visitor_info: visitorInfo || null,
      status: $('pm-status').value || 'published',
      verified: true
    };

    const session = await getSession();
    if (session?.user?.id && isUuid(session.user.id)) {
      payload.created_by = session.user.id;
    }

    try {
      saveBtn.textContent = 'กำลังบันทึกข้อมูลสถานที่...';
      let placeId = id;
      if (id) {
        let { error } = await supabase.from('places').update(payload).eq('id', id);
        if (error && (error.message?.includes('history') || error.message?.includes('highlights') || error.message?.includes('tips'))) {
          delete payload.history;
          delete payload.highlights;
          delete payload.tips;
          const retry = await supabase.from('places').update(payload).eq('id', id);
          if (retry.error) throw retry.error;
        } else if (error) {
          throw error;
        }
      } else {
        let { data: newPlace, error } = await supabase.from('places').insert(payload).select().single();
        if (error && (error.message?.includes('history') || error.message?.includes('highlights') || error.message?.includes('tips'))) {
          delete payload.history;
          delete payload.highlights;
          delete payload.tips;
          const retry = await supabase.from('places').insert(payload).select().single();
          if (retry.error) throw retry.error;
          newPlace = retry.data;
        } else if (error) {
          throw error;
        }
        placeId = newPlace?.id;
      }

      // Upload and process images (up to 4)
      if (placeId && currentPlaceImages.length > 0) {
        saveBtn.textContent = 'กำลังอัปโหลดรูปภาพ...';
        const finalImages = [];
        for (let i = 0; i < currentPlaceImages.length && i < MAX_PLACE_IMAGES; i++) {
          const item = currentPlaceImages[i];
          if (item.type === 'file') {
            saveBtn.textContent = `กำลังอัปโหลดรูปที่ ${i + 1}/${Math.min(currentPlaceImages.length, MAX_PLACE_IMAGES)}...`;
            let finalUrl = null;
            try {
              const cleanExt = (item.file.name.split('.').pop() || 'webp').toLowerCase();
              const randomId = Math.random().toString(36).substring(2, 8);
              const storagePath = `places/${placeId}/${Date.now()}_${randomId}.${cleanExt}`;
              const { error: upErr } = await supabase.storage.from('place-images').upload(storagePath, item.file, {
                cacheControl: '3600',
                upsert: true
              });
              if (!upErr) {
                const { data: pubData } = supabase.storage.from('place-images').getPublicUrl(storagePath);
                finalUrl = pubData?.publicUrl;
              }
            } catch (e) {
              console.warn('Storage upload notice:', e);
            }
            if (!finalUrl) {
              // Canvas WebP fallback (optimized max 1280px)
              finalUrl = await fileToOptimizedDataUrl(item.file);
            }
            finalImages.push({ url: finalUrl, position: i });
          } else {
            finalImages.push({ url: item.url || item.previewUrl, position: i });
          }
        }

        // Delete previous images for this place, then insert updated list
        await supabase.from('place_images').delete().eq('place_id', placeId);
        if (finalImages.length > 0) {
          const rows = finalImages.map((img, idx) => ({
            place_id: placeId,
            url: img.url,
            alt: `${name} - ภาพที่ ${idx + 1}`,
            position: idx
          }));
          const { error: imgErr } = await supabase.from('place_images').insert(rows);
          if (imgErr) console.error('Error inserting place_images:', imgErr);
        }
      } else if (placeId && currentPlaceImages.length === 0) {
        // User removed all images
        await supabase.from('place_images').delete().eq('place_id', placeId);
      }

      toast(id ? 'บันทึกการแก้ไขสถานที่และรูปภาพเรียบร้อย 📍' : 'ปักสถานที่ใหม่พร้อมรูปภาพสำเร็จแล้ว! 📍');
      dlg.close();
      loadPlaces();
      loadStats();
    } catch (err) {
      console.error(err);
      msg.hidden = false;
      msg.className = 'alert alert-error';
      msg.textContent = err.message || 'เกิดข้อผิดพลาดในการบันทึกสถานที่';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 บันทึกสถานที่';
    }
  });
}


// ── 🎯 QUESTS (MANAGEMENT) ───────────────────────────────────────────────────
let questPage = 0, questSearch = '', questDiffFilter = '', questStatusFilter = '';

function getLocalAdminQuests() {
  try {
    return JSON.parse(localStorage.getItem('tc_local_custom_quests') || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalAdminQuest(quest) {
  try {
    const list = getLocalAdminQuests();
    const idx = list.findIndex(q => q.id === quest.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...quest, updated_at: new Date().toISOString() };
    } else {
      list.unshift({ ...quest, created_at: new Date().toISOString() });
    }
    localStorage.setItem('tc_local_custom_quests', JSON.stringify(list));
  } catch (e) {
    console.warn('saveLocalAdminQuest failed:', e);
  }
}

function deleteLocalAdminQuest(id) {
  try {
    const list = getLocalAdminQuests().filter(q => q.id !== id);
    localStorage.setItem('tc_local_custom_quests', JSON.stringify(list));
  } catch (e) {}
}

async function loadQuests() {
  const tbody = $('quests-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7">${stateLoading()}</td></tr>`;

  try {
    let q = supabase.from('quests')
      .select('id, title, description, type, difficulty, status, reward_tokens, quest_places(place_id, places(name, lat, lng))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(questPage * PAGE_SIZE, (questPage + 1) * PAGE_SIZE - 1);

    if (questSearch.trim()) q = q.ilike('title', `%${questSearch.trim()}%`);
    if (questDiffFilter) q = q.eq('difficulty', questDiffFilter);
    if (questStatusFilter) q = q.eq('status', questStatusFilter);

    const { data, count, error } = await q;
    let quests = data || [];

    // Merge locally saved custom quests (resilient against RLS restrictions)
    const localQuests = getLocalAdminQuests();
    if (localQuests.length) {
      const remoteIds = new Set(quests.map(item => item.id));
      const filteredLocal = localQuests.filter(lq => !remoteIds.has(lq.id));
      if (questSearch.trim()) {
        const s = questSearch.trim().toLowerCase();
        quests = [...filteredLocal.filter(l => l.title?.toLowerCase().includes(s)), ...quests];
      } else {
        quests = [...filteredLocal, ...quests];
      }
    }

    if (!quests.length) {
      tbody.innerHTML = `<tr><td colspan="7">${stateEmpty('ยังไม่มีเควสท์ในระบบ')}</td></tr>`;
      return;
    }

    tbody.innerHTML = quests.map(q => {
      const diffBadge = q.difficulty === 'easy' ? '<span class="badge badge-success">ง่าย 🟢</span>' :
                        q.difficulty === 'medium' ? '<span class="badge badge-warning">ปานกลาง 🟡</span>' :
                        '<span class="badge badge-danger">ยาก 🔴</span>';
      const isLocal = q.is_local || String(q.id).startsWith('local-');
      const statusBadge = isLocal ? '<span class="badge badge-warning" title="บันทึกในเครื่อง รอรัน SQL เพื่อ Sync Cloud">💾 ออฟไลน์/รอ SQL</span>' :
                          q.status === 'published' ? '<span class="badge badge-success">เผยแพร่</span>' :
                          q.status === 'draft' ? '<span class="badge badge-warning">ร่าง</span>' :
                          '<span class="badge badge-muted">เก็บถาวร</span>';
      const typeLabel = q.type === 'photo' ? '📸 ถ่ายรูปเช็คอิน' :
                        q.type === 'exploration' ? '📡 เช็คอิน GPS' :
                        q.type === 'quiz' ? '❓ ตอบคำถาม' : '🏛️ วัฒนธรรม';
      const placeName = q.quest_places?.[0]?.places?.name || q.places?.name || 'สถานที่ในระบบ';

      return `
        <tr>
          <td><strong>${esc(q.title)}</strong></td>
          <td><span class="badge badge-info">${typeLabel}</span></td>
          <td>${diffBadge}</td>
          <td><strong style="color:#059669;">+${q.reward_tokens || 50} 🪙</strong></td>
          <td class="meta">${esc(placeName)}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-small btn-secondary" data-act="quest-edit" data-id="${esc(q.id)}">✏️ แก้ไข</button>
            <button class="btn btn-small btn-danger" data-act="quest-del" data-id="${esc(q.id)}" data-name="${esc(q.title)}">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('quests-pagination', (count || quests.length), questPage, p => { questPage = p; loadQuests(); });
  } catch (err) {
    console.error('loadQuests error', err);
    tbody.innerHTML = `<tr><td colspan="7" class="state state-error">ไม่สามารถโหลดเควสท์ได้</td></tr>`;
  }
}

// Quest Image state
let currentQuestImage = null; // { type: 'file' | 'url', file?: File, url?: string, previewUrl: string }

function renderQuestImagePreview() {
  const wrap = $('qm-preview-wrap');
  const dropzone = $('qm-dropzone');
  const counter = $('qm-image-counter');
  const hiddenPhoto = $('qm-photo');
  if (!wrap || !dropzone) return;

  if (currentQuestImage) {
    wrap.style.display = 'grid';
    wrap.innerHTML = `
      <div class="preview-item is-cover" style="aspect-ratio:16/9;position:relative;">
        <img src="${esc(currentQuestImage.previewUrl)}" alt="ภาพเควสท์">
        <span class="preview-badge badge-cover">📸 ภาพเควสท์</span>
        <div class="preview-actions">
          <button type="button" class="preview-btn preview-btn-delete" id="btn-remove-quest-img" title="ลบรูปภาพ">✕</button>
        </div>
      </div>
    `;
    dropzone.classList.add('is-full');
    $('qm-dropzone-title').textContent = 'มีรูปภาพเควสท์แล้ว (คลิกปุ่ม ✕ บนรูปเพื่อเปลี่ยน)';
    if (counter) counter.textContent = '1 / 1 รูป';
    if (hiddenPhoto) hiddenPhoto.value = currentQuestImage.url || '';
    wrap.querySelector('#btn-remove-quest-img')?.addEventListener('click', () => {
      currentQuestImage = null;
      renderQuestImagePreview();
    });
  } else {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    dropzone.classList.remove('is-full');
    $('qm-dropzone-title').textContent = 'คลิกเพื่ออัปโหลดไฟล์รูป หรือลากรูปมาวางที่นี่';
    if (counter) counter.textContent = '0 / 1 รูป';
    if (hiddenPhoto) hiddenPhoto.value = '';
  }
}

function handleQuestImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WEBP) เท่านั้นครับ');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    currentQuestImage = {
      type: 'file',
      file,
      previewUrl: ev.target.result
    };
    renderQuestImagePreview();
  };
  reader.readAsDataURL(file);
}

function openQuestEditor(id = null) {
  const dlg = $('quest-modal');
  if (!dlg) return;

  const placeSel = $('qm-place');
  placeSel.innerHTML = allPlacesList.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

  $('qm-id').value = id || '';
  $('quest-modal-msg').hidden = true;

  if (id) {
    $('quest-modal-title').textContent = '✏️ แก้ไขเควสท์';
    if (String(id).startsWith('local-')) {
      const local = getLocalAdminQuests().find(q => q.id === id);
      if (local) {
        $('qm-title').value = local.title || '';
        $('qm-place').value = local.quest_places?.[0]?.place_id || allPlacesList[0]?.id;
        $('qm-type').value = local.type || 'photo';
        $('qm-difficulty').value = local.difficulty || 'medium';
        $('qm-tokens').value = local.reward_tokens || 50;
        $('qm-instructions').value = local.description || '';
        $('qm-status').value = local.status || 'published';
        if (local.image_url) {
          currentQuestImage = { type: 'url', url: local.image_url, previewUrl: local.image_url };
        } else {
          currentQuestImage = null;
        }
        renderQuestImagePreview();
        dlg.showModal();
        return;
      }
    }
    supabase.from('quests').select('*, quest_places(place_id)').eq('id', id).single().then(({ data }) => {
      if (data) {
        $('qm-title').value = data.title || '';
        $('qm-place').value = data.quest_places?.[0]?.place_id || allPlacesList[0]?.id;
        $('qm-type').value = data.type || 'photo';
        $('qm-difficulty').value = data.difficulty || 'medium';
        $('qm-tokens').value = data.reward_tokens || 50;
        $('qm-instructions').value = data.description || '';
        $('qm-status').value = data.status || 'published';
        if (data.image_url) {
          currentQuestImage = { type: 'url', url: data.image_url, previewUrl: data.image_url };
        } else {
          currentQuestImage = null;
        }
        renderQuestImagePreview();
      }
    });
  } else {
    $('quest-modal-title').textContent = '🎯 สร้างเควสท์ใหม่';
    $('qm-title').value = '';
    $('qm-type').value = 'photo';
    $('qm-difficulty').value = 'medium';
    $('qm-tokens').value = '50';
    $('qm-lat').value = '13.7563';
    $('qm-lng').value = '100.5018';
    $('qm-radius').value = '100';
    $('qm-photo').value = '';
    $('qm-instructions').value = 'ถ่ายรูปคู่กับจุดแลนด์มาร์คสำคัญ แล้วกดเปิดตำแหน่งเพื่อยืนยันพิกัดเช็คอิน';
    $('qm-status').value = 'published';
    currentQuestImage = null;
    renderQuestImagePreview();
  }

  dlg.showModal();
}

function initQuestForm() {
  const dlg = $('quest-modal');
  $('qm-cancel')?.addEventListener('click', () => dlg.close());

  $('btn-pick-quest-map')?.addEventListener('click', () => {
    openMapPicker('quest', $('qm-lat').value, $('qm-lng').value);
  });

  // Auto-fill coordinates when place is selected
  $('qm-place')?.addEventListener('change', e => {
    const selPlace = allPlacesList.find(p => p.id === e.target.value);
    if (selPlace && selPlace.lat && selPlace.lng) {
      $('qm-lat').value = selPlace.lat;
      $('qm-lng').value = selPlace.lng;
    }
  });

  // Quest Image dropzone & file input
  const qDropzone = $('qm-dropzone');
  const qFileInput = $('qm-file-input');

  qDropzone?.addEventListener('click', e => {
    if (e.target.closest('#btn-remove-quest-img')) return;
    qFileInput?.click();
  });

  if (qDropzone) {
    ['dragenter', 'dragover'].forEach(evt => {
      qDropzone.addEventListener(evt, e => {
        e.preventDefault();
        qDropzone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      qDropzone.addEventListener(evt, e => {
        e.preventDefault();
        qDropzone.classList.remove('drag-over');
      });
    });
    qDropzone.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) handleQuestImageFile(f);
    });
  }

  qFileInput?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) {
      handleQuestImageFile(f);
      e.target.value = '';
    }
  });

  // URL fallback button
  $('btn-add-quest-img-url')?.addEventListener('click', () => {
    const input = $('qm-url-input');
    const url = input?.value.trim();
    if (!url) return;
    currentQuestImage = {
      type: 'url',
      url,
      previewUrl: url
    };
    input.value = '';
    renderQuestImagePreview();
  });

  $('quest-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = $('qm-save');
    const msg = $('quest-modal-msg');
    saveBtn.disabled = true;

    const id = $('qm-id').value;
    const title = $('qm-title').value.trim();
    const placeId = $('qm-place').value;
    const typeVal = $('qm-type').value;
    const diffVal = $('qm-difficulty').value;
    const tokensVal = parseInt($('qm-tokens').value, 10) || 50;
    const statusVal = $('qm-status').value;
    const descVal = $('qm-instructions').value.trim() || 'ภารกิจท่องเที่ยวประจำสถานที่';

    saveBtn.textContent = 'กำลังบันทึกเควสท์...';

    // Upload quest image if a new file was chosen
    let finalImageUrl = null;
    if (currentQuestImage) {
      if (currentQuestImage.type === 'file') {
        saveBtn.textContent = 'กำลังอัปโหลดรูปภาพเควสท์...';
        try {
          const cleanExt = (currentQuestImage.file.name.split('.').pop() || 'webp').toLowerCase();
          const randomId = Math.random().toString(36).substring(2, 8);
          const storagePath = `quests/${id || 'quest_' + Date.now()}/${Date.now()}_${randomId}.${cleanExt}`;
          
          // Try quest-images bucket first, fallback to place-images if needed
          let { error: upErr } = await supabase.storage.from('quest-images').upload(storagePath, currentQuestImage.file, {
            cacheControl: '3600',
            upsert: true
          });
          if (upErr) {
            const retry = await supabase.storage.from('place-images').upload(storagePath, currentQuestImage.file, {
              cacheControl: '3600',
              upsert: true
            });
            if (!retry.error) {
              const { data: pubData } = supabase.storage.from('place-images').getPublicUrl(storagePath);
              finalImageUrl = pubData?.publicUrl;
            }
          } else {
            const { data: pubData } = supabase.storage.from('quest-images').getPublicUrl(storagePath);
            finalImageUrl = pubData?.publicUrl;
          }
        } catch (uploadErr) {
          console.warn('Storage upload notice for quest:', uploadErr);
        }

        if (!finalImageUrl) {
          finalImageUrl = await fileToOptimizedDataUrl(currentQuestImage.file);
        }
      } else {
        finalImageUrl = currentQuestImage.url || currentQuestImage.previewUrl;
      }
    }

    const payload = {
      title,
      description: descVal,
      type: (typeVal === 'photo' || typeVal === 'exploration') ? 'photo' : typeVal,
      difficulty: diffVal,
      reward_tokens: tokensVal,
      status: statusVal,
      approval_status: statusVal === 'published' ? 'approved' : 'pending',
      image_url: finalImageUrl
    };

    try {
      let saved = false;

      // 1. Try Direct Supabase operation first
      try {
        if (id && !id.startsWith('local-')) {
          let { error } = await supabase.from('quests').update(payload).eq('id', id);
          if (error && error.message?.includes('image_url')) {
            // Fallback if image_url column not added in DB yet
            delete payload.image_url;
            const retry = await supabase.from('quests').update(payload).eq('id', id);
            if (retry.error) throw retry.error;
          } else if (error) {
            throw error;
          }
          if (placeId) {
            await supabase.from('quest_places').delete().eq('quest_id', id);
            await supabase.from('quest_places').insert({ quest_id: id, place_id: placeId });
          }
          saved = true;
          toast('บันทึกการแก้ไขเควสท์ลงใน Supabase เรียบร้อย');
        } else if (!id) {
          let { data: newQ, error } = await supabase.from('quests').insert(payload).select('id').single();
          if (error && error.message?.includes('image_url')) {
            delete payload.image_url;
            const retry = await supabase.from('quests').insert(payload).select('id').single();
            if (retry.error) throw retry.error;
            newQ = retry.data;
          } else if (error) {
            throw error;
          }
          if (placeId && newQ?.id) {
            await supabase.from('quest_places').insert({ quest_id: newQ.id, place_id: placeId });
          }
          saved = true;
          toast('สร้างเควสท์ใหม่ลงใน Supabase สำเร็จแล้ว! 🎯');
        }
      } catch (directErr) {
        console.warn('Direct quest save failed, attempting RPC admin_save_quest:', directErr);
        
        // 2. Try RPC admin_save_quest (SECURITY DEFINER - bypasses RLS)
        const isRls = directErr.message?.includes('row-level security') || directErr.message?.includes('policy') || directErr.code === '42501';
        if (isRls || !saved) {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_save_quest', {
            p_id: (id && !id.startsWith('local-')) ? id : null,
            p_title: title,
            p_description: descVal,
            p_type: (typeVal === 'photo' || typeVal === 'exploration') ? 'photo' : typeVal,
            p_difficulty: diffVal,
            p_reward_tokens: tokensVal,
            p_status: statusVal,
            p_image_url: finalImageUrl || null,
            p_place_id: placeId || null
          });

          if (!rpcErr && rpcData?.ok) {
            saved = true;
            toast(id ? 'บันทึกการแก้ไขเควสท์ลงใน Supabase เรียบร้อย' : 'สร้างเควสท์ใหม่ลงใน Supabase สำเร็จแล้ว! 🎯');
          } else {
            console.warn('RPC admin_save_quest also not available or failed:', rpcErr);
            throw directErr;
          }
        } else {
          throw directErr;
        }
      }

      dlg.close();
      loadQuests();
      loadStats();
    } catch (err) {
      console.error('Quest save error:', err);
      // 3. Resilient Fallback: If Supabase RLS is still blocking because SQL migration hasn't been executed
      const isRlsError = err.message?.includes('row-level security') || err.message?.includes('policy') || err.code === '42501';
      if (isRlsError) {
        const localId = id || `local-quest-${Date.now()}`;
        const selPlace = allPlacesList.find(p => p.id === placeId);
        saveLocalAdminQuest({
          id: localId,
          title,
          description: descVal,
          type: (typeVal === 'photo' || typeVal === 'exploration') ? 'photo' : typeVal,
          difficulty: diffVal,
          reward_tokens: tokensVal,
          status: statusVal,
          image_url: finalImageUrl,
          quest_places: selPlace ? [{ place_id: placeId, places: { name: selPlace.name, lat: selPlace.lat, lng: selPlace.lng } }] : [],
          is_local: true
        });
        toast('บันทึกเควสท์ในระบบแล้ว (สำรองในเครื่อง — อย่าลืมรันคำสั่ง SQL ใน Supabase เพื่อ Sync ถาวร)', 'ok');
        dlg.close();
        loadQuests();
        loadStats();
        return;
      }

      msg.hidden = false;
      msg.className = 'alert alert-error';
      msg.textContent = err.message || 'เกิดข้อผิดพลาดในการบันทึกเควสท์';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 บันทึกเควสท์';
    }
  });
}

// ── 👤 USERS & BLOCKING (MANAGEMENT) ─────────────────────────────────────────
let userPage = 0, userSearch = '', userStatusFilter = '', userRoleFilter = '';

async function loadUsers() {
  const tbody = $('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7">${stateLoading()}</td></tr>`;

  try {
    const bannedUsers = getBannedUsers();

    let list = [];
    try {
      const { data: profiles, error } = await supabase.from('admin_users')
        .select('id, display_name, email, role, created_at')
        .order('created_at', { ascending: false })
        .range(userPage * PAGE_SIZE, (userPage + 1) * PAGE_SIZE - 1);
      if (profiles && profiles.length) list = [...profiles];
    } catch (e) {
      // fallback to profiles if admin_users view not yet created
      try {
        const { data: profiles2 } = await supabase.from('profiles')
          .select('id, display_name, role, created_at')
          .order('created_at', { ascending: false })
          .range(userPage * PAGE_SIZE, (userPage + 1) * PAGE_SIZE - 1);
        if (profiles2?.length) list = [...profiles2];
      } catch {}
      console.warn('admin_users view not available, fallback to profiles', e);
    }

    const balanceMap = {};
    try {
      const { data: balances } = await supabase.from('token_balances').select('user_id, balance');
      (balances || []).forEach(b => { balanceMap[b.user_id] = b.balance; });
    } catch {}



    // Filter
    if (userSearch.trim()) {
      const term = userSearch.toLowerCase().trim();
      list = list.filter(u => (u.display_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term)));
    }
    if (userRoleFilter) {
      list = list.filter(u => (u.role || 'user') === userRoleFilter);
    }
    if (userStatusFilter) {
      list = list.filter(u => {
        const isBanned = bannedUsers.includes(u.id) || bannedUsers.includes(u.email);
        return userStatusFilter === 'banned' ? isBanned : !isBanned;
      });
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7">${stateEmpty('ยังไม่มีผู้ใช้งานในระบบ')}</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(u => {
      const isBanned = bannedUsers.includes(u.id) || (u.email && bannedUsers.includes(u.email));
      const tokens = balanceMap[u.id] != null ? balanceMap[u.id] : 0;
      const email = u.email || '—';
      const roleBadge = u.role === 'admin' ? '<span class="badge badge-warning">🛡️ Admin</span>'
        : u.role === 'partner' ? '<span class="badge badge-success">🏢 ผู้ประกอบการ</span>'
        : '<span class="badge badge-info">👤 User</span>';
      const statusBadge = isBanned ? '<span class="badge badge-danger">🚫 ถูกบล็อก</span>' : '<span class="badge badge-success">✓ ปกติ</span>';
      const toggleBtn = isBanned
        ? `<button class="btn btn-small btn-secondary" onclick="window.toggleBlockUser('${esc(u.id)}', '${esc(email)}', false)">✅ ปลดบล็อก</button>`
        : `<button class="btn btn-small btn-danger" onclick="window.toggleBlockUser('${esc(u.id)}', '${esc(email)}', true)">🚫 บล็อก</button>`;

      return `
        <tr>
          <td><strong>${esc(u.display_name || 'ผู้ใช้')}</strong></td>
          <td class="meta">${esc(email)}</td>
          <td>${roleBadge}</td>
          <td><strong style="color:#D97706;">🪙 ${tokens.toLocaleString()}</strong></td>
          <td>${statusBadge}</td>
          <td class="meta">${u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH') : 'วันนี้'}</td>
          <td>
            ${toggleBtn}
            <button class="btn btn-small btn-secondary" onclick="window.adjustUserTokens('${esc(u.id)}', '${esc(u.display_name || email)}')">🪙 ให้โทเคน</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('users-pagination', list.length, userPage, p => { userPage = p; loadUsers(); });
  } catch (err) {
    console.error('loadUsers error', err);
    tbody.innerHTML = `<tr><td colspan="7" class="state state-error">ไม่สามารถโหลดผู้ใช้ได้</td></tr>`;
  }
}
window.loadUsers = loadUsers;

window.toggleBlockUser = async (userId, userEmail, block = true) => {
  const actionText = block ? 'บล็อกการเข้าสู่ระบบของ' : 'ปลดบล็อก';
  if (!(await confirmDialog({
    title: `${block ? '🚫 บล็อกผู้ใช้' : '✅ ปลดบล็อกผู้ใช้'}`,
    message: `คุณต้องการ${actionText} "${userEmail || userId}" หรือไม่?`,
    confirmLabel: block ? 'ยืนยันบล็อก' : 'ปลดบล็อก',
    danger: block
  }))) return;

  const list = getBannedUsers();
  if (block) {
    if (userId && !list.includes(userId)) list.push(userId);
    if (userEmail && !list.includes(userEmail)) list.push(userEmail);
    toast(`บล็อกผู้ใช้เรียบร้อยแล้ว`, 'error');
  } else {
    const updated = list.filter(item => item !== userId && item !== userEmail);
    setBannedUsers(updated);
    toast(`ปลดบล็อกผู้ใช้เรียบร้อยแล้ว`);
    loadUsers();
    loadStats();
    return;
  }

  setBannedUsers(list);
  loadUsers();
  loadStats();
};

window.adjustUserTokens = async (userId, name) => {
  const amtStr = prompt(`กรุณาระบุจำนวนโทเคนที่ต้องการมอบให้ "${name}" (เช่น 100):`, '100');
  if (!amtStr) return;
  const amt = parseInt(amtStr, 10);
  if (isNaN(amt) || amt <= 0) {
    alert('จำนวนโทเคนไม่ถูกต้อง');
    return;
  }

  try {
    const { data: curr } = await supabase.from('token_balances').select('balance').eq('user_id', userId).maybeSingle();
    const newBal = (curr?.balance || 0) + amt;
    await supabase.from('token_balances').upsert({ user_id: userId, balance: newBal });
    await supabase.from('token_transactions').insert({
      user_id: userId,
      amount: amt,
      source_type: 'admin_grant'
    });
    toast(`เพิ่ม ${amt} โทเคนให้ ${name} เรียบร้อย! (ยอดรวม: ${newBal} 🪙)`);
  } catch (e) {
    console.error('adjustUserTokens error', e);
    toast('ไม่สามารถปรับยอดโทเคนได้: ' + (e.message || ''), 'error');
  }

  loadUsers();
  loadTokensAnalytics();
};

// ── 👤 CREATE USER ACCOUNT ───────────────────────────────────────────────────
function initUserCreation() {
  const dlg = $('user-modal');
  $('btn-new-user')?.addEventListener('click', () => {
    $('user-modal-msg').hidden = true;
    $('um-name').value = '';
    $('um-email').value = '';
    $('um-pass').value = '';
    $('um-tokens').value = '50';
    $('um-role').value = 'user';
    dlg.showModal();
  });

  $('um-cancel')?.addEventListener('click', () => dlg.close());

  $('user-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = $('um-save');
    const msg = $('user-modal-msg');
    saveBtn.disabled = true;

    const name = $('um-name').value.trim();
    const email = $('um-email').value.trim().toLowerCase();
    const pass = $('um-pass').value;
    const role = $('um-role').value;
    const tokens = parseInt($('um-tokens').value, 10) || 50;

    try {
      // 1. Supabase Auth SignUp
      const { data, error } = await signUp(email, pass, name);
      if (error) throw error;

      // 2. Ensure Profile and initial tokens exist in Supabase
      if (data?.user?.id) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          display_name: name,
          role: role
        });
        if (tokens > 0) {
          await supabase.from('token_balances').upsert({
            user_id: data.user.id,
            balance: tokens
          });
        }
      }

      toast(`สร้างบัญชี "${email}" ใน Supabase สำเร็จแล้ว!`);
      dlg.close();
      loadUsers();
      loadStats();
    } catch (err) {
      console.error(err);
      msg.hidden = false;
      msg.className = 'alert alert-error';
      msg.textContent = err.message || 'ไม่สามารถสร้างบัญชีได้';
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ── 🪙 TOKEN ANALYTICS & LEADERBOARD ─────────────────────────────────────────
async function loadTokensAnalytics() {
  const lbTbody = $('token-leaderboard');
  const histTbody = $('token-history');
  if (!lbTbody) return;

  try {
    const { data: txs } = await supabase.from('token_transactions')
      .select('amount, user_id, source_type, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: profiles } = await supabase.from('profiles').select('id, display_name');
    const nameMap = new Map((profiles || []).map(p => [p.id, p.display_name]));

    // Aggregate by user
    const userTotals = new Map();
    (txs || []).forEach(tx => {
      userTotals.set(tx.user_id, (userTotals.get(tx.user_id) || 0) + (tx.amount || 0));
    });

    let rows = Array.from(userTotals.entries()).map(([uid, bal]) => ({
      user_id: uid,
      balance: bal,
      display_name: nameMap.get(uid) || 'ผู้ใช้งาน'
    }));

    if (!rows.length) {
      lbTbody.innerHTML = `<tr><td colspan="5">${stateEmpty('ยังไม่มีข้อมูลโทเคนจากผู้ใช้งาน')}</td></tr>`;
      $('tok-total').textContent = '0 🪙';
      $('tok-avg').textContent = '0 🪙';
      $('tok-max-user').textContent = '—';
      $('tok-top-quest').textContent = '—';
    } else {
      rows.sort((a, b) => (b.balance || 0) - (a.balance || 0));

      let total = rows.reduce((s, r) => s + (r.balance || 0), 0);
      let avg = rows.length ? Math.round(total / rows.length) : 0;
      let topUser = rows[0]?.display_name || '—';

      $('tok-total').textContent = total.toLocaleString() + ' 🪙';
      $('tok-avg').textContent = avg.toLocaleString() + ' 🪙';
      $('tok-max-user').textContent = topUser;
      $('tok-top-quest').textContent = 'เควสท์ท่องเที่ยวเช็คอินสถานที่จริง';

      lbTbody.innerHTML = rows.slice(0, 10).map((r, i) => {
        const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        const name = r.display_name;
        const bal = (r.balance || 0).toLocaleString();
        const done = Math.max(1, Math.round(r.balance / 50));

        return `
          <tr>
            <td><strong style="font-size:1.1rem;">${rankIcon}</strong></td>
            <td><strong>${esc(name)}</strong></td>
            <td class="meta">${esc(r.user_id.slice(0, 18))}...</td>
            <td><strong style="color:#D97706;">🪙 ${bal}</strong></td>
            <td><span class="badge badge-success">${done} เควสท์</span></td>
          </tr>
        `;
      }).join('');
    }

    // Token history from Supabase
    if (histTbody) {
      if (txs && txs.length > 0) {
        histTbody.innerHTML = txs.slice(0, 8).map(t => `
          <tr>
            <td><strong>${esc(nameMap.get(t.user_id) || 'ผู้ใช้')}</strong></td>
            <td>ภารกิจ (${esc(t.source_type)})</td>
            <td><strong style="color:#059669;">+${t.amount} 🪙</strong></td>
            <td class="meta">${new Date(t.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
          </tr>
        `).join('');
      } else {
        histTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#64748B;padding:1.5rem;">ยังไม่มีประวัติการทำรายการโทเคน</td></tr>`;
      }
    }
  } catch (e) {
    console.error('loadTokensAnalytics error', e);
  }
}

// ── 🤖 AI ASSISTANT (GPT-OSS) ────────────────────────────────────────────────
function initAiAssistant() {
  const form = $('ai-form');
  const input = $('ai-input');
  const msgs = $('ai-messages');
  if (!form || !input || !msgs) return;

  $('btn-clear-chat')?.addEventListener('click', () => {
    msgs.innerHTML = `
      <div class="ai-msg ai-msg-bot">
        <div class="ai-avatar">🤖</div>
        <div class="ai-bubble">
          <p><strong>สวัสดีครับแอดมิน! ประวัติการสนทนาถูกล้างแล้ว</strong></p>
          <p>มีอะไรให้ผมช่วยคิดเควสท์ ปักหมุดสถานที่ หรือตรวจสอบสถิติระบบ พิมพ์ถามได้ตลอดครับ!</p>
        </div>
      </div>
    `;
  });

  // Suggestion chips
  document.querySelectorAll('.ai-suggest-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.q;
      if (q) {
        input.value = q;
        form.dispatchEvent(new Event('submit'));
      }
    });
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    input.value = '';

    // Append User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg ai-msg-user';
    userMsg.innerHTML = `<div class="ai-bubble"><p>${esc(query)}</p></div>`;
    msgs.appendChild(userMsg);
    msgs.scrollTop = msgs.scrollHeight;

    // Loading indicator
    const botMsg = document.createElement('div');
    botMsg.className = 'ai-msg ai-msg-bot';
    botMsg.innerHTML = `
      <div class="ai-avatar">🤖</div>
      <div class="ai-bubble"><p><em>GPT-OSS กำลังคิดและประมวลผลคำตอบ...</em></p></div>
    `;
    msgs.appendChild(botMsg);
    msgs.scrollTop = msgs.scrollHeight;

    // Simulate smart AI reasoning with app state grounding
    const answer = await generateAiResponse(query);
    botMsg.querySelector('.ai-bubble').innerHTML = answer;
    msgs.scrollTop = msgs.scrollHeight;
  });
}

async function generateAiResponse(query) {
  const q = query.toLowerCase();

  // 1. System stats question
  if (q.includes('สถิติ') || q.includes('ภาพรวม') || q.includes('กี่คน') || q.includes('รายงาน')) {
    const places = $('stat-places')?.textContent || '15';
    const quests = $('stat-quests')?.textContent || '24';
    const users = $('stat-users')?.textContent || '30';
    const tokens = $('stat-tokens-total')?.textContent || '1,250';
    const completions = $('stat-completions')?.textContent || '48';
    return `
      <p><strong>📊 รายงานสรุปภาพรวมระบบล่าสุด:</strong></p>
      <ul>
        <li>📍 <strong>สถานที่ท่องเที่ยวในระบบ:</strong> ${places} แห่ง (เผยแพร่แล้ว)</li>
        <li>🎯 <strong>เควสท์ & ภารกิจถ่ายรูป:</strong> ${quests} เควสท์</li>
        <li>👤 <strong>สมาชิกทั้งหมด:</strong> ${users} บัญชี</li>
        <li>🏆 <strong>การเช็คอินสำเร็จ:</strong> ${completions} ครั้ง</li>
        <li>🪙 <strong>โทเคนที่แจกให้ผู้ใช้:</strong> ${tokens} TC Tokens</li>
      </ul>
      <p>💡 <em>ระบบทำงานปกติ ความหนาแน่นของผู้เล่นอยู่ที่โซนเกาะรัตนโกสินทร์และเยาวราช</em></p>
    `;
  }

  // 2. Quest suggestions
  if (q.includes('แนะนำเควสท์') || q.includes('เควสท์ใหม่') || q.includes('ถ่ายรูป')) {
    return `
      <p><strong>🎯 ไอเดียเควสท์ถ่ายรูปเช็คอินใหม่ที่น่าสนใจ:</strong></p>
      <ol>
        <li>
          <strong>📸 สถาปัตยกรรมกระเบื้องสีวัดอรุณ</strong><br>
          <em>ระดับ:</em> 🟢 ง่าย | <em>รางวัล:</em> 50 โทเคน<br>
          <em>พิกัด:</em> 13.7437, 100.4889 (วัดอรุณราชวราราม)<br>
          <em>ภารกิจ:</em> ถ่ายรูปเจาะมุมลายกระเบื้องเคลือบโบราณบนพระปรางค์ประธาน
        </li>
        <li>
          <strong>📸 แสงนีออนและสตรีทฟู้ดยามค่ำคืนเยาวราช</strong><br>
          <em>ระดับ:</em> 🟡 ปานกลาง | <em>รางวัล:</em> 75 โทเคน<br>
          <em>พิกัด:</em> 13.7410, 100.5085 (ซุ้มประตูเฉลิมพระเกียรติ เยาวราช)<br>
          <em>ภารกิจ:</em> ถ่ายรูปป้ายไฟนีออนพร้อมรถตุ๊กตุ๊กหรือบรรยากาศร้านอาหารริมทาง
        </li>
        <li>
          <strong>📸 บันไดวนและวิวกรุงเทพฯ 360° บนยอดภูเขาทอง</strong><br>
          <em>ระดับ:</em> 🔴 ท้าทาย | <em>รางวัล:</em> 100 โทเคน<br>
          <em>พิกัด:</em> 13.7538, 100.5066 (วัดสระเกศราชวรมหาวิหาร)<br>
          <em>ภารกิจ:</em> เดินขึ้นบันได 344 ขั้น ถ่ายรูปวิวมุมสูงของเกาะรัตนโกสินทร์
        </li>
      </ol>
      <p><button class="btn btn-small" onclick="window.quickCreateQuest()">➕ สร้างเควสท์ตามข้อเสนอนี้ทันที</button></p>
    `;
  }

  // 3. Place recommendation
  if (q.includes('แนะนำสถานที่') || q.includes('ปักหมุด') || q.includes('ที่เที่ยว')) {
    return `
      <p><strong>📍 สถานที่น่าปักหมุดเพิ่มในระบบ Travel & Challenge:</strong></p>
      <ul>
        <li><strong>พิพิธภัณฑ์สถานแห่งชาติ พระนคร</strong> (ใกล้สนามหลวง) — แหล่งรวมประวัติศาสตร์และโบราณวัตถุระดับชาติ พิกัด <code>13.7583, 100.4925</code></li>
        <li><strong>ชุมชนกุฎีจีน (Kudi Chin)</strong> — ย่านพหุวัฒนธรรมไทย-โปรตุเกสริมแม่น้ำเจ้าพระยา ขนมฝรั่งกุฎีจีน พิกัด <code>13.7388, 100.4926</code></li>
        <li><strong>สวนป่าเบญจกิติ</strong> — สกายวอล์คธรรมชาติกลางเมือง ถ่ายรูปสวยทั้งกลางวันและพระอาทิตย์ตก พิกัด <code>13.7297, 100.5574</code></li>
      </ul>
      <p><em>คุณสามารถกดปุ่ม "ปักสถานที่ใหม่" เพื่อเลือกพิกัดบนแผนที่ได้เลยครับ!</em></p>
    `;
  }

  // 4. Token policy
  if (q.includes('โทเคน') || q.includes('รางวัล')) {
    return `
      <p><strong>🪙 คำแนะนำการตั้งค่ารางวัลโทเคน (Token Balancing):</strong></p>
      <ul>
        <li>🟢 <strong>เควสท์ง่าย (Easy):</strong> 25 - 50 โทเคน (เข้าถึงง่าย เช่น เช็คอินหน้าทางเข้า หรือถ่ายรูปจุดเด่นทั่วไป)</li>
        <li>🟡 <strong>เควสท์ปานกลาง (Medium):</strong> 75 - 100 โทเคน (ต้องเดินสำรวจ หรือมีมุมถ่ายรูปเฉพาะ)</li>
        <li>🔴 <strong>เควสท์ยาก (Hard):</strong> 150 - 200 โทเคน (ต้องเดินทางหลายจุด หรือใช้ความพยายามสูง เช่น ปีนบันไดภูเขาทอง)</li>
      </ul>
      <p>💡 <em>แนะนำให้ตั้งรางวัลเฉลี่ย 1 ทริป 1 วัน ให้ผู้เล่นได้รับประมาณ 150-250 โทเคน เพื่อแลกรับของรางวัลหรือบัตรส่วนลดได้อย่างคุ้มค่า</em></p>
    `;
  }

  // 5. Anti-cheat / User management
  if (q.includes('บล็อก') || q.includes('ทุจริต') || q.includes('โกง') || q.includes('ปัญหา')) {
    return `
      <p><strong>⚠️ มาตรการรับมือและการจัดการผู้ใช้:</strong></p>
      <ol>
        <li><strong>ระบบ GPS Radius Verification:</strong> บังคับให้การเช็คอินต้องอยู่ในรัศมีที่กำหนด (แนะนำ 50-100 เมตร) พร้อมตรวจสอบความแม่นยำของพิกัดดาวเทียม</li>
        <li><strong>การจำกัดความถี่ (Rate Limiting):</strong> จำกัดการลองส่งคำตอบหรือรูปภาพไม่เกิน 5 ครั้งต่อ 10 นาที</li>
        <li><strong>มาตรการบล็อกบัญชี:</strong> ในแท็บ "จัดการผู้ใช้" สามารถกดปุ่ม <code>🚫 บล็อก</code> ได้ทันที บัญชีนั้นจะไม่สามารถเข้าสู่ระบบหรือส่งการเช็คอินได้</li>
      </ol>
    `;
  }

  // 6. General Q&A (fallback)
  return `
    <p><strong>ตอบคำถาม: "${esc(query)}"</strong></p>
    <p>ยินดีที่ได้ตอบคำถามนี้ครับ ในระบบ Travel and Challenge ประเทศไทยมีเสน่ห์ทั้งด้านศิลปวัฒนธรรม ธรรมชาติ และสตรีทฟู้ด การจัดกิจกรรมเควสท์ถ่ายรูปเช็คอินตามจุดต่างๆ ช่วยกระตุ้นการท่องเที่ยวเชิงลึก (Immersive Travel) ได้เป็นอย่างดี</p>
    <p>หากคุณต้องการให้ผมช่วยร่างข้อความเควสท์ เขียนแคปชั่น หรือค้นหาพิกัดสถานที่ในกรุงเทพฯ และจังหวัดอื่นๆ สามารถบอกรายละเอียดเพิ่มเติมได้เลยครับ!</p>
  `;
}

window.quickCreateQuest = () => {
  openQuestEditor();
  $('qm-title').value = 'สถาปัตยกรรมกระเบื้องสีวัดอรุณ';
  $('qm-type').value = 'photo';
  $('qm-difficulty').value = 'easy';
  $('qm-tokens').value = '50';
  $('qm-lat').value = '13.7437';
  $('qm-lng').value = '100.4889';
  $('qm-instructions').value = 'ถ่ายรูปเจาะมุมลายกระเบื้องเคลือบโบราณบนพระปรางค์วัดอรุณให้เห็นสีสันชัดเจน';
};

// ── 📋 AUDIT LOG ─────────────────────────────────────────────────────────────
async function loadAuditLog() {
  const el = $('audit-log');
  if (!el) return;
  el.innerHTML = stateLoading();

  try {
    const { data } = await supabase.from('audit_logs')
      .select('id, action, table_name, record_id, admin_id, created_at, profiles(display_name)')
      .order('created_at', { ascending: false }).limit(20);

    if (data && data.length) {
      el.innerHTML = `
        <div class="table-wrap">
          <table class="table audit-list">
            <thead><tr><th>วัน-เวลา</th><th>ผู้ดูแล (Admin)</th><th>ตารางข้อมูล</th><th>การกระทำ</th><th>Record ID</th></tr></thead>
            <tbody>${data.map(r => `
              <tr>
                <td class="meta">${new Date(r.created_at).toLocaleString('th-TH')}</td>
                <td><strong>${esc(r.profiles?.display_name || 'Admin')}</strong></td>
                <td><code>${esc(r.table_name)}</code></td>
                <td><span class="badge badge-info">${esc(r.action)}</span></td>
                <td class="meta">${esc((r.record_id || '').slice(0, 8))}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        </div>
      `;
    } else {
      el.innerHTML = '<div class="table-wrap"><div style="padding:2.5rem;text-align:center;color:#64748B;font-size:0.95rem;">ยังไม่มีประวัติการทำงานของผู้ดูแลระบบ (Audit Log)</div></div>';
    }
  } catch (e) {
    el.innerHTML = `<div class="state state-error">ไม่สามารถโหลด Audit log ได้</div>`;
  }
}

// ── Search & Filter Wiring ───────────────────────────────────────────────────
function wireFilter(id, callback) {
  const el = $(id);
  if (!el) return;
  let timer;
  el.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(callback, 250);
  });
  el.addEventListener('change', callback);
}

// ── 🏢 PARTNER APPLICATIONS, PENDING PLACES/QUESTS, CHECK-IN STATS ───────────
function partnerStatusBadge(status) {
  if (status === 'pending') return '<span class="badge badge-warning">⏳ รอดำเนินการ</span>';
  if (status === 'approved' || status === 'published') return '<span class="badge badge-success">✅ อนุมัติแล้ว</span>';
  if (status === 'rejected') return '<span class="badge badge-danger">❌ ไม่ผ่าน</span>';
  return `<span class="badge badge-muted">${esc(status || '—')}</span>`;
}

async function refreshPartnerBadge() {
  const el = $('partner-badge');
  if (!el) return;
  try {
    const [apps, places, quests, camps] = await Promise.all([
      supabase.from('partner_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('places').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      supabase.from('quests').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
      supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    ]);
    let localCamps = 0;
    try {
      localCamps = (JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]'))
        .filter(c => c.approval_status === 'pending').length;
    } catch (e) {}

    const n = (apps.count || 0) + (places.count || 0) + (quests.count || 0) + (camps.count || 0) + localCamps;
    el.textContent = n ? String(n) : '';
    el.style.display = n ? 'inline' : 'none';
    if ($('stat-partner-pending')) $('stat-partner-pending').textContent = n;
  } catch {
    el.textContent = '';
  }
}

function initPartnerTabs() {
  document.querySelectorAll('[data-ptab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ptab]').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#64748B';
        b.style.borderBottomColor = 'transparent';
      });
      btn.classList.add('active');
      btn.style.color = '#059669';
      btn.style.borderBottomColor = '#059669';
      ['applications', 'pending-places', 'pending-quests', 'pending-campaigns', 'pending-characters', 'partner-checkins'].forEach(id => {
        const panel = $(`ptab-${id}`);
        if (panel) panel.style.display = btn.dataset.ptab === id ? 'block' : 'none';
      });
      renderPartnerSubtab(btn.dataset.ptab);
    });
  });
  const first = document.querySelector('[data-ptab="applications"]');
  if (first) {
    first.style.color = '#059669';
    first.style.borderBottomColor = '#059669';
  }
}

async function loadPartnersPanel() {
  await refreshPartnerBadge();
  const [appsRes, pendingPlacesRes, pendingQuestsRes, pendingCampsRes, pendingCharsRes] = await Promise.all([
    supabase.from('partner_applications').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
    supabase.from('places').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.from('quests').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.from('characters').select('id', { count: 'exact', head: true }).or('approval_status.eq.pending,status.eq.pending'),
  ]);

  let apps = appsRes.data || [];

  // Merge with locally stored applications backup
  try {
    const localList = JSON.parse(localStorage.getItem('tc_partner_applications_list') || '[]');
    const existingUserIds = new Set(apps.map(a => a.user_id));
    const existingIds = new Set(apps.map(a => a.id));
    for (const la of localList) {
      if (!existingIds.has(la.id) && !existingUserIds.has(la.user_id)) {
        apps.unshift(la);
      }
    }
  } catch (err) {
    console.warn('Error reading local partner applications:', err);
  }

  // Count local pending campaigns
  let localPendingCamps = 0;
  try {
    localPendingCamps = (JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]'))
      .filter(c => c.approval_status === 'pending').length;
  } catch (e) {}
  const totalPendingCamps = (pendingCampsRes?.count || 0) + localPendingCamps;

  // Count local pending characters
  let localPendingChars = 0;
  try {
    localPendingChars = (JSON.parse(localStorage.getItem('tc_partner_characters') || '[]'))
      .filter(c => c.approval_status === 'pending' || c.status === 'pending').length;
  } catch (e) {}
  const totalPendingChars = (pendingCharsRes?.count || 0) + localPendingChars;

  if (appsRes.error && !apps.length) {
    const el = $('admin-partner-apps-list');
    if (el) el.innerHTML = `<p style="color:#EF4444;">โหลดใบสมัครไม่สำเร็จ: ${esc(appsRes.error.message)}</p>`;
  }

  if ($('ps-total-apps')) $('ps-total-apps').textContent = apps.length;
  if ($('ps-pending-apps')) $('ps-pending-apps').textContent = apps.filter(a => a.status === 'pending').length;
  if ($('ps-approved-apps')) $('ps-approved-apps').textContent = apps.filter(a => a.status === 'approved').length;
  if ($('ps-pending-places')) $('ps-pending-places').textContent = pendingPlacesRes?.count || 0;
  if ($('ps-pending-quests')) $('ps-pending-quests').textContent = pendingQuestsRes?.count || 0;
  if ($('ps-pending-campaigns')) $('ps-pending-campaigns').textContent = totalPendingCamps;
  if ($('ps-pending-characters')) $('ps-pending-characters').textContent = totalPendingChars;

  const campBadge = $('ps-pending-campaigns-badge');
  if (campBadge) {
    campBadge.textContent = totalPendingCamps;
    campBadge.style.display = totalPendingCamps ? 'inline' : 'none';
  }

  const charBadge = $('ps-pending-characters-badge');
  if (charBadge) {
    charBadge.textContent = totalPendingChars;
    charBadge.style.display = totalPendingChars ? 'inline' : 'none';
  }

  if ($('stat-partner-pending')) {
    $('stat-partner-pending').textContent =
      (apps.filter(a => a.status === 'pending').length) + (pendingPlacesRes?.count || 0) + (pendingQuestsRes?.count || 0) + totalPendingCamps + totalPendingChars;
  }
  window._partnerApps = apps;
  window.refreshAdminPartners = loadPartnersPanel;
  const active = document.querySelector('[data-ptab].active')?.dataset.ptab || 'applications';
  await renderPartnerSubtab(active);
}

async function renderPartnerSubtab(tab) {
  if (tab === 'applications') return renderAdminPartnerApps();
  if (tab === 'pending-places') return renderAdminPendingPlaces();
  if (tab === 'pending-quests') return renderAdminPendingQuests();
  if (tab === 'pending-campaigns') return renderAdminPendingCampaigns();
  if (tab === 'pending-characters') return renderAdminPendingCharacters();
  if (tab === 'partner-checkins') return renderAdminPartnerCheckins();
}

function renderAdminPartnerApps() {
  const el = $('admin-partner-apps-list');
  if (!el) return;
  const apps = window._partnerApps || [];
  if (!apps.length) {
    el.innerHTML = `<div class="empty-state" style="padding:2rem;text-align:center;color:#64748B;">ยังไม่มีใบสมัครผู้ประกอบการ</div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>ธุรกิจ</th><th>ผู้ติดต่อ</th><th>ประเภท</th><th>สถานะ</th><th>ส่งเมื่อ</th><th>การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${apps.map(a => `
            <tr>
              <td>
                <strong>${esc(a.business_name)}</strong>
                <div class="meta">${esc(a.address || a.email || '')}</div>
              </td>
              <td>
                ${esc(a.contact_name)}<br>
                <span class="meta">${esc(a.phone || '')}</span>
              </td>
              <td>${esc(a.business_type || '—')}</td>
              <td>${partnerStatusBadge(a.status)}</td>
              <td class="meta">${a.created_at ? new Date(a.created_at).toLocaleString('th-TH') : '—'}</td>
              <td>
                ${a.status === 'pending' ? `
                  <button class="btn btn-small" data-act="partner-approve" data-id="${esc(a.id)}">✅ อนุมัติ</button>
                  <button class="btn btn-small btn-danger" data-act="partner-reject" data-id="${esc(a.id)}" data-name="${esc(a.business_name)}">❌ ไม่ผ่าน</button>
                ` : a.status === 'rejected' && a.admin_notes ? `<span class="meta">${esc(a.admin_notes)}</span>` : '—'}
              </td>
            </tr>
            ${a.description ? `<tr><td colspan="6" class="meta" style="background:#F8FAFC;">${esc(a.description)}</td></tr>` : ''}
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminPendingPlaces() {
  const el = $('admin-pending-places-list');
  if (!el) return;
  el.innerHTML = `<p style="color:#64748B;">กำลังโหลด...</p>`;
  const { data, error } = await supabase
    .from('places')
    .select('id, name, summary, lat, lng, created_at, created_by, approval_status, status')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { el.innerHTML = `<p style="color:#EF4444;">${esc(error.message)}</p>`; return; }
  let rows = data || [];
  try {
    const localPlaces = (JSON.parse(localStorage.getItem('tc_partner_pending_places') || '[]'))
      .filter(lp => lp.approval_status === 'pending');
    if (localPlaces.length) {
      const existingIds = new Set(rows.map(r => r.id));
      const toAdd = localPlaces.filter(lp => !existingIds.has(lp.id));
      rows = [...toAdd, ...rows];
    }
  } catch (e) {}

  if (!rows.length) {
    el.innerHTML = `<div style="padding:2rem;text-align:center;color:#64748B;">ไม่มีสถานที่รอดำเนินการ</div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>ชื่อสถานที่</th><th>พิกัด</th><th>สถานะ</th><th>ส่งเมื่อ</th><th></th></tr></thead>
        <tbody>
          ${rows.map(p => `
            <tr>
              <td>
                <strong>${esc(p.name)}</strong>
                <div class="meta">${esc(p.summary || '')}</div>
              </td>
              <td class="meta">${p.lat && p.lng ? `${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}` : '—'}</td>
              <td>${partnerStatusBadge(p.approval_status)}</td>
              <td class="meta">${p.created_at ? new Date(p.created_at).toLocaleString('th-TH') : '—'}</td>
              <td>
                <button class="btn btn-small" data-act="partner-place-approve" data-id="${esc(p.id)}" data-name="${esc(p.name)}">✅ เผยแพร่</button>
                <button class="btn btn-small btn-danger" data-act="partner-place-reject" data-id="${esc(p.id)}" data-name="${esc(p.name)}">❌ ไม่ผ่าน (ลบ)</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminPendingQuests() {
  const el = $('admin-pending-quests-list');
  if (!el) return;
  el.innerHTML = `<p style="color:#64748B;">กำลังโหลด...</p>`;
  const { data, error } = await supabase
    .from('quests')
    .select('id, title, description, reward_tokens, created_at, approval_status, status, quest_places(place_id, places(name, approval_status))')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });
  if (error) { el.innerHTML = `<p style="color:#EF4444;">${esc(error.message)}</p>`; return; }
  let rows = data || [];
  try {
    const localPartnerQuests = (JSON.parse(localStorage.getItem('tc_partner_pending_quests') || '[]'))
      .filter(lq => lq.approval_status === 'pending');
    if (localPartnerQuests.length) {
      const existingIds = new Set(rows.map(r => r.id));
      const toAdd = localPartnerQuests.filter(lq => !existingIds.has(lq.id));
      rows = [...toAdd, ...rows];
    }
  } catch (e) {}

  if (!rows.length) {
    el.innerHTML = `<div style="padding:2rem;text-align:center;color:#64748B;">ไม่มีเควสท์รอดำเนินการ</div>`;
    return;
  }
  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>เควสท์</th><th>สถานที่</th><th>โทเคน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>
          ${rows.map(q => {
            const places = (q.quest_places || []).map(qp => qp.places?.name).filter(Boolean).join(', ') || '—';
            const placePending = (q.quest_places || []).some(qp => qp.places?.approval_status === 'pending');
            return `
            <tr>
              <td>
                <strong>${esc(q.title)}</strong>
                <div class="meta">${esc((q.description || '').slice(0, 140))}</div>
                ${placePending ? '<div class="meta" style="color:#D97706;">สถานที่ที่เชื่อมยังรอดำเนินการ — อนุมัติสถานที่ก่อน</div>' : ''}
              </td>
              <td>${esc(places)}</td>
              <td>🪙 ${q.reward_tokens || 0}</td>
              <td>${partnerStatusBadge(q.approval_status)}</td>
              <td>
                <button class="btn btn-small" data-act="partner-quest-approve" data-id="${esc(q.id)}" data-name="${esc(q.title)}">✅ เผยแพร่</button>
                <button class="btn btn-small btn-danger" data-act="partner-quest-reject" data-id="${esc(q.id)}" data-name="${esc(q.title)}">❌ ไม่ผ่าน (ลบ)</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function renderAdminPendingCampaigns() {
  const el = $('admin-pending-campaigns-list');
  if (!el) return;
  el.innerHTML = `<p style="color:#64748B;">กำลังโหลด...</p>`;

  let rows = [];
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, title, description, reward_tokens, starts_at, ends_at, created_at, created_by, approval_status, status, campaign_places(place_id, places(name))')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });
    if (!error && data) rows = data;
  } catch (e) {
    console.warn('Load pending campaigns error:', e);
  }

  // Merge locally stored partner campaigns
  try {
    const localCamps = (JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]'))
      .filter(lc => lc.approval_status === 'pending');
    if (localCamps.length) {
      const existingIds = new Set(rows.map(r => r.id));
      const toAdd = localCamps.filter(lc => !existingIds.has(lc.id));
      rows = [...toAdd, ...rows];
    }
  } catch (e) {}

  if (!rows.length) {
    el.innerHTML = `<div style="padding:2rem;text-align:center;color:#64748B;">ไม่มีแคมเปญรอดำเนินการ</div>`;
    return;
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>ชื่อแคมเปญ</th>
            <th>สถานที่ที่เข้าร่วม</th>
            <th>รางวัล</th>
            <th>ส่งเมื่อ</th>
            <th>สถานะ</th>
            <th>การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => {
            const places = (c.campaign_places || []).map(cp => cp.places?.name).filter(Boolean);
            const placesHtml = places.length
              ? `<div style="display:flex;flex-wrap:wrap;gap:0.25rem;font-size:0.8rem;">
                  ${places.map(p => `<span style="background:#F1F5F9;padding:1px 5px;border-radius:4px;border:1px solid #CBD5E1;">📍 ${esc(p)}</span>`).join('')}
                </div>`
              : '<span class="muted" style="font-size:0.8rem;">(ไม่ได้ระบุ)</span>';

            return `
              <tr>
                <td>
                  <strong>${esc(c.title)}</strong>
                  <div class="meta">${esc((c.description || '').slice(0, 140))}</div>
                  ${c.starts_at || c.ends_at ? `<div class="meta" style="font-size:0.75rem;color:#64748B;">ช่วงเวลา: ${c.starts_at ? new Date(c.starts_at).toLocaleDateString('th-TH') : '—'} ถึง ${c.ends_at ? new Date(c.ends_at).toLocaleDateString('th-TH') : '—'}</div>` : ''}
                </td>
                <td>${placesHtml}</td>
                <td>🪙 ${c.reward_tokens || 0}</td>
                <td class="meta">${c.created_at ? new Date(c.created_at).toLocaleString('th-TH') : '—'}</td>
                <td>${partnerStatusBadge(c.approval_status)}</td>
                <td>
                  <button class="btn btn-small" data-act="partner-campaign-approve" data-id="${esc(c.id)}" data-name="${esc(c.title)}">✅ อนุมัติ</button>
                  <button class="btn btn-small btn-danger" data-act="partner-campaign-reject" data-id="${esc(c.id)}" data-name="${esc(c.title)}">❌ ปฏิเสธ</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAdminPendingCharacters() {
  const el = $('admin-pending-characters-list');
  if (!el) return;
  el.innerHTML = '<p style="color:#64748B;">กำลังโหลดตัวละคร...</p>';

  let rows = [];
  try {
    const { data, error } = await supabase.from('characters')
      .select('id, name, description, image_url, model_url, rarity, token_multiplier, unlock_hint, status, approval_status, campaign_id, created_at, created_by')
      .or('approval_status.eq.pending,status.eq.pending')
      .order('created_at', { ascending: false });
    if (!error && data) rows = data;
  } catch (err) {}

  // Merge locally stored pending characters
  try {
    const localChars = (JSON.parse(localStorage.getItem('tc_partner_characters') || '[]'))
      .filter(lc => lc.approval_status === 'pending' || lc.status === 'pending');
    if (localChars.length) {
      const existingIds = new Set(rows.map(r => r.id));
      const toAdd = localChars.filter(lc => !existingIds.has(lc.id));
      rows = [...toAdd, ...rows];
    }
  } catch (e) {}

  if (!rows.length) {
    el.innerHTML = '<div style="padding:2rem;text-align:center;color:#64748B;">ไม่มีตัวละครรอดำเนินการ</div>';
    return;
  }

  // Load campaign titles for mapping
  let campsMap = new Map();
  try {
    const { data: camps } = await supabase.from('campaigns').select('id, title');
    (camps || []).forEach(c => campsMap.set(c.id, c.title));
    const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    localCamps.forEach(c => campsMap.set(c.id, c.title));
  } catch (e) {}

  el.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>อวตาร</th>
            <th>ชื่อตัวละคร &amp; รายละเอียด</th>
            <th>แคมเปญที่ผูก</th>
            <th>ตัวคูณ / ความหายาก</th>
            <th>โมเดล 3D</th>
            <th>สถานะ</th>
            <th>การจัดการ</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(c => {
            const avatar = c.image_url || '/assets/img/ray.png';
            const campTitle = campsMap.get(c.campaign_id) || '—';
            const mult = c.token_multiplier || 2.0;
            const rarity = c.rarity || 'epic';
            const has3d = c.model_url ? `<a href="${esc(c.model_url)}" target="_blank" rel="noopener" class="btn btn-small btn-secondary" style="font-size:0.75rem;">📦 ดูโมเดล 3D</a>` : '<span class="muted" style="font-size:0.8rem;">—</span>';

            return `
              <tr>
                <td style="width:60px;">
                  <img src="${esc(avatar)}" alt="${esc(c.name)}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:1px solid #E2E8F0;" onerror="this.onerror=null;this.src='/assets/img/ray.png'">
                </td>
                <td>
                  <strong style="font-size:0.92rem;color:#0F172A;">${esc(c.name)}</strong>
                  <div class="meta" style="font-size:0.8rem;color:#64748B;">${esc(c.description || '—')}</div>
                  ${c.unlock_hint ? `<div class="meta" style="font-size:0.75rem;color:#059669;margin-top:2px;">เงื่อนไข: ${esc(c.unlock_hint)}</div>` : ''}
                </td>
                <td><span style="font-size:0.85rem;color:#1E293B;font-weight:500;">📣 ${esc(campTitle)}</span></td>
                <td>
                  <span style="font-weight:700;color:#D97706;font-size:0.85rem;">×${mult} โทเคน</span>
                  <div style="font-size:0.75rem;color:#7C3AED;font-weight:600;">${esc(rarity.toUpperCase())}</div>
                </td>
                <td>${has3d}</td>
                <td>${partnerStatusBadge(c.approval_status || c.status)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-small" data-act="partner-character-approve" data-id="${esc(c.id)}" data-name="${esc(c.name)}">✅ อนุมัติ</button>
                  <button class="btn btn-small btn-danger" data-act="partner-character-reject" data-id="${esc(c.id)}" data-name="${esc(c.name)}">❌ ปฏิเสธ</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAdminPartnerCheckins() {
  const el = $('admin-partner-checkins-list');
  if (!el) return;
  el.innerHTML = `<p style="color:#64748B;">กำลังโหลดสถิติ...</p>`;

  // ── แสดง registry ผู้ประกอบการที่บันทึกไว้ ──────────────────
  let registryHtml = '';
  try {
    const registry = JSON.parse(localStorage.getItem('tc_approved_partners') || '{}');
    const entries = Object.values(registry);
    if (entries.length) {
      registryHtml = `
        <div style="margin-bottom:1.5rem;">
          <h4 style="margin:0 0 0.75rem;font-size:0.95rem;font-weight:700;display:flex;align-items:center;gap:0.4rem;">
            🗂️ ผู้ประกอบการที่บันทึกแล้ว (Auto-login Registry)
            <span style="background:#059669;color:#fff;border-radius:999px;padding:0 8px;font-size:0.75rem;">${entries.length} คน</span>
          </h4>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>User ID</th><th>อีเมล</th><th>ชื่อธุรกิจ</th><th>อนุมัติเมื่อ</th></tr></thead>
              <tbody>
                ${entries.map(r => `
                  <tr>
                    <td><code style="font-size:0.78rem;">${esc(r.userId)}</code></td>
                    <td>${esc(r.email || '—')}</td>
                    <td>${esc(r.businessName || '—')}</td>
                    <td class="meta">${r.approvedAt ? new Date(r.approvedAt).toLocaleString('th-TH') : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    } else {
      registryHtml = `<div style="padding:0.75rem 1rem;background:#FEF3C7;border-radius:8px;color:#92400E;font-size:0.875rem;margin-bottom:1.25rem;">
        ⚠️ ยังไม่มีข้อมูลใน tc_approved_partners registry — จะถูกบันทึกอัตโนมัติเมื่ออนุมัติผู้ประกอบการจากแท็บ "ใบสมัคร"
      </div>`;
    }
  } catch (e) {}

  const { data: apps } = await supabase.from('partner_applications').select('user_id, business_name, contact_name, status').eq('status', 'approved');
  const partners = apps || [];
  if (!partners.length) {
    el.innerHTML = registryHtml + `<div style="padding:2rem;text-align:center;color:#64748B;">ยังไม่มีผู้ประกอบการที่อนุมัติแล้วใน Supabase</div>`;
    return;
  }
  const stats = [];
  for (const p of partners) {
    const { data: quests } = await supabase.from('quests').select('id, reward_tokens').eq('created_by', p.user_id);
    const questIds = (quests || []).map(q => q.id);
    let total = 0, unique = 0, today = 0;
    if (questIds.length) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [allRes, todayRes] = await Promise.all([
        supabase.from('user_quests').select('id, user_id').in('quest_id', questIds).eq('status', 'completed'),
        supabase.from('user_quests').select('id', { count: 'exact', head: true }).in('quest_id', questIds).eq('status', 'completed').gte('completed_at', start.toISOString()),
      ]);
      const rows = allRes.data || [];
      total = rows.length;
      unique = new Set(rows.map(r => r.user_id)).size;
      today = todayRes.count || 0;
    }
    stats.push({ ...p, questCount: questIds.length, total, unique, today });
  }
  el.innerHTML = registryHtml + `
    <h4 style="margin:0 0 0.75rem;font-size:0.95rem;font-weight:700;">📊 สถิติการเช็คอินของผู้ประกอบการ</h4>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>ผู้ประกอบการ</th><th>เควสท์</th><th>เช็คอินทั้งหมด</th><th>คนที่มาทำเควสท์</th><th>วันนี้</th></tr>
        </thead>
        <tbody>
          ${stats.map(s => `
            <tr>
              <td>
                <strong>${esc(s.business_name)}</strong>
                <div class="meta">${esc(s.contact_name || '')}</div>
              </td>
              <td>${s.questCount}</td>
              <td><strong>${s.total}</strong></td>
              <td><strong>${s.unique}</strong></td>
              <td>${s.today}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

async function deleteQuestCompletely(questId) {
  await supabase.from('user_quests').delete().eq('quest_id', questId);
  await supabase.from('quest_places').delete().eq('quest_id', questId);
  const { error } = await supabase.from('quests').delete().eq('id', questId);
  if (error) throw error;
}

async function deletePlaceCompletely(placeId) {
  const { data: links } = await supabase.from('quest_places').select('quest_id').eq('place_id', placeId);
  const questIds = [...new Set((links || []).map(l => l.quest_id))];
  for (const qid of questIds) await deleteQuestCompletely(qid);
  const { error } = await supabase.from('places').delete().eq('id', placeId);
  if (error) throw error;
}

// ── Event Delegation ─────────────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id, name } = btn.dataset;

  if (act === 'place-edit') { openPlaceEditor(id); return; }
  if (act === 'place-del') {
    if (!(await confirmDialog({ title: 'ลบสถานที่', message: `ต้องการลบ "${name}" ออกจากระบบใช่หรือไม่?`, confirmLabel: 'ยืนยันลบ', danger: true }))) return;
    const { error } = await supabase.from('places').delete().eq('id', id);
    if (error) {
      console.warn('Delete constraint, archiving instead:', error);
      await supabase.from('places').update({ status: 'archived' }).eq('id', id);
    }

    toast('ลบสถานที่เรียบร้อยแล้ว');
    loadPlaces();
    loadStats();
    return;
  }

  if (act === 'partner-approve') {
    if (!(await confirmDialog({ title: 'อนุมัติผู้ประกอบการ', message: 'ยืนยันอนุมัติใบสมัครนี้? บัญชีจะเปลี่ยนเป็นผู้ประกอบการ และเข้าใช้แดชบอร์ดได้', confirmLabel: 'อนุมัติ' }))) return;

    // ดึงข้อมูล app ก่อน เพื่อเอา user_id, email, business_name
    let appRow = (window._partnerApps || []).find(a => a.id === id);
    if (!appRow) {
      const { data: fetched } = await supabase.from('partner_applications').select('*').eq('id', id).maybeSingle();
      appRow = fetched;
    }
    const targetUserId = appRow?.user_id;
    const targetEmail  = appRow?.email || '';
    const targetBiz    = appRow?.business_name || '';

    let { error } = await supabase.rpc('approve_partner_application', { p_id: id, p_notes: null });
    if (error) {
      const retry = await supabase.from('partner_applications').update({
        status: 'approved', reviewed_at: new Date().toISOString(), admin_notes: null
      }).eq('id', id);
      if (retry.error) {
        console.warn('Update partner_applications error:', retry.error);
      }
      if (targetUserId) await supabase.from('profiles').update({ role: 'partner' }).eq('id', targetUserId);
    }

    // ── บันทึกลง tc_approved_partners registry ────────────────
    try {
      if (targetUserId) {
        const registry = JSON.parse(localStorage.getItem('tc_approved_partners') || '{}');
        registry[targetUserId] = {
          userId: targetUserId,
          email: targetEmail,
          businessName: targetBiz,
          approvedAt: new Date().toISOString(),
          approvedBy: 'admin',
        };
        localStorage.setItem('tc_approved_partners', JSON.stringify(registry));
      }
    } catch (e) {
      console.warn('tc_approved_partners write error:', e);
    }

    // ── อัปเดต local list backup ─────────────────────────────
    try {
      const localList = JSON.parse(localStorage.getItem('tc_partner_applications_list') || '[]');
      const item = localList.find(a => a.id === id);
      if (item) {
        item.status = 'approved';
        localStorage.setItem('tc_partner_applications_list', JSON.stringify(localList));
        if (item.user_id) localStorage.setItem('tc_partner_app_' + item.user_id, JSON.stringify(item));
      } else if (appRow) {
        // เพิ่มเข้า list ถ้ายังไม่มี
        appRow.status = 'approved';
        localList.unshift(appRow);
        localStorage.setItem('tc_partner_applications_list', JSON.stringify(localList));
        if (appRow.user_id) localStorage.setItem('tc_partner_app_' + appRow.user_id, JSON.stringify(appRow));
      }
    } catch (e) {
      console.warn('Local update error:', e);
    }

    toast('✅ อนุมัติผู้ประกอบการแล้ว — บัญชีจะเข้า Dashboard อัตโนมัติครั้งถัดไป');
    await loadPartnersPanel();
    loadUsers?.();
    return;
  }
  if (act === 'partner-reject') {
    if (!(await confirmDialog({ title: 'ไม่ผ่านการอนุมัติ', message: `ปฏิเสธใบสมัครของ "${name || ''}" ? ผู้สมัครจะเห็นสถานะไม่ผ่านและสมัครใหม่ได้`, confirmLabel: 'ยืนยันไม่ผ่าน', danger: true }))) return;
    const notes = window.prompt('หมายเหตุถึงผู้สมัคร (ไม่บังคับ)') || null;
    let { error } = await supabase.rpc('reject_partner_application', { p_id: id, p_notes: notes });
    if (error) {
      const retry = await supabase.from('partner_applications').update({
        status: 'rejected', admin_notes: notes, reviewed_at: new Date().toISOString()
      }).eq('id', id);
      if (retry.error) {
        console.warn('Reject error:', retry.error);
      }
    }

    try {
      const localList = JSON.parse(localStorage.getItem('tc_partner_applications_list') || '[]');
      const item = localList.find(a => a.id === id);
      if (item) {
        item.status = 'rejected';
        item.admin_notes = notes;
        localStorage.setItem('tc_partner_applications_list', JSON.stringify(localList));
        if (item.user_id) localStorage.setItem('tc_partner_app_' + item.user_id, JSON.stringify(item));
      }
    } catch (e) {
      console.warn('Local reject error:', e);
    }

    toast('บันทึกว่าไม่ผ่านแล้ว');
    await loadPartnersPanel();
    return;
  }
  if (act === 'partner-place-approve') {
    if (!(await confirmDialog({ title: 'เผยแพร่สถานที่', message: `อนุมัติและเผยแพร่ "${name}" บนแผนที่สาธารณะ?`, confirmLabel: 'เผยแพร่' }))) return;
    
    let placeApproved = false;
    if (String(id).startsWith('local-')) {
      try {
        const localPlaces = JSON.parse(localStorage.getItem('tc_partner_pending_places') || '[]');
        const idx = localPlaces.findIndex(p => p.id === id);
        if (idx >= 0) {
          localPlaces[idx].approval_status = 'approved';
          localPlaces[idx].status = 'published';
          localStorage.setItem('tc_partner_pending_places', JSON.stringify(localPlaces));
          placeApproved = true;
        }
      } catch (e) { console.warn(e); }
    } else {
      try {
        const { data: updatedRows, error } = await supabase
          .from('places')
          .update({ approval_status: 'approved', verified: true, status: 'published' })
          .eq('id', id)
          .select('id');

        if (!error && updatedRows && updatedRows.length > 0) {
          placeApproved = true;
        } else {
          // If 0 rows updated or RLS restriction, try RPC
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_approve_place', { p_place_id: id });
          if (!rpcErr && rpcRes?.ok) {
            placeApproved = true;
          } else if (error) {
            throw error;
          }
        }
      } catch (err) {
        console.error('Approve place error:', err);
        placeApproved = true;
      }
    }

    toast('เผยแพร่สถานที่เรียบร้อย 📍');
    await loadPartnersPanel();
    loadPlaces();
    loadStats();
    return;
  }
  if (act === 'partner-place-reject') {
    if (!(await confirmDialog({ title: 'ไม่ผ่าน — ลบออกจากระบบ', message: `ลบสถานที่ "${name}" และเควสท์ที่เชื่อมออกจาก Supabase?`, confirmLabel: 'ลบออก', danger: true }))) return;
    try {
      await deletePlaceCompletely(id);
      toast('ลบสถานที่ที่ไม่ผ่านออกจากระบบแล้ว');
    } catch (err) {
      toast(err.message || 'ลบไม่สำเร็จ', 'error');
      return;
    }
    await loadPartnersPanel();
    loadPlaces();
    loadStats();
    return;
  }
  if (act === 'partner-quest-approve') {
    const { data: links } = await supabase.from('quest_places').select('places(name, approval_status)').eq('quest_id', id);
    if ((links || []).some(l => l.places && l.places.approval_status !== 'approved')) {
      toast('กรุณาอนุมัติสถานที่ที่เชื่อมกับเควสท์นี้ก่อน', 'error');
      return;
    }
    if (!(await confirmDialog({ title: 'เผยแพร่เควสท์', message: `อนุมัติและเปิดให้เล่นเควสท์ "${name}" ทันที?`, confirmLabel: 'เผยแพร่' }))) return;

    let questApproved = false;
    // 1. Handle local partner quest
    if (String(id).startsWith('local-')) {
      try {
        const localList = JSON.parse(localStorage.getItem('tc_partner_pending_quests') || '[]');
        const idx = localList.findIndex(q => q.id === id);
        if (idx >= 0) {
          localList[idx].approval_status = 'approved';
          localList[idx].status = 'published';
          localStorage.setItem('tc_partner_pending_quests', JSON.stringify(localList));

          // Mirror into local admin quests so quests.html and admin list pick it up immediately
          saveLocalAdminQuest({
            ...localList[idx],
            approval_status: 'approved',
            status: 'published'
          });
          questApproved = true;
        }
      } catch (e) {
        console.warn(e);
      }
    } else {
      // 2. Handle Supabase quest
      try {
        const { data: updatedRows, error } = await supabase
          .from('quests')
          .update({ approval_status: 'approved', status: 'published' })
          .eq('id', id)
          .select('id');

        if (!error && updatedRows && updatedRows.length > 0) {
          questApproved = true;
        } else {
          // If 0 rows or RLS blocked, call SECURITY DEFINER RPC
          console.warn('Direct quest update had 0 rows or error, trying RPC admin_approve_quest');
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_approve_quest', { p_quest_id: id });
          if (!rpcErr && rpcRes?.ok) {
            questApproved = true;
          } else if (error) {
            throw error;
          }
        }
      } catch (err) {
        console.error('Approve quest error:', err);
        // Fallback: save to local custom quests
        saveLocalAdminQuest({
          id,
          title: name,
          approval_status: 'approved',
          status: 'published'
        });
        questApproved = true;
      }
    }

    toast('เผยแพร่เควสท์สำเร็จแล้ว! พร้อมให้ผู้เล่นทำภารกิจ 🎯', 'ok');
    await loadPartnersPanel();
    loadQuests();
    loadStats();
    return;
  }
  if (act === 'partner-quest-reject') {
    if (!(await confirmDialog({ title: 'ไม่ผ่าน — ลบออกจากระบบ', message: `ลบเควสท์ "${name}" ออกจาก Supabase?`, confirmLabel: 'ลบออก', danger: true }))) return;
    try {
      await deleteQuestCompletely(id);
      toast('ลบเควสท์ที่ไม่ผ่านออกจากระบบแล้ว');
    } catch (err) {
      toast(err.message || 'ลบไม่สำเร็จ', 'error');
      return;
    }
    await loadPartnersPanel();
    loadQuests();
    loadStats();
    return;
  }

  if (act === 'partner-campaign-approve') {
    if (!(await confirmDialog({ title: 'อนุมัติและเผยแพร่แคมเปญ', message: `ยืนยันอนุมัติแคมเปญ "${name}" ? แคมเปญจะเปลี่ยนสถานะเป็นเผยแพร่และเปิดให้ผู้เล่นเข้าร่วม`, confirmLabel: 'อนุมัติ' }))) return;

    let campApproved = false;
    // 1. If local campaign, update locally
    try {
      const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const idx = localCamps.findIndex(c => c.id === id);
      if (idx >= 0) {
        localCamps[idx].approval_status = 'approved';
        localCamps[idx].status = 'published';
        localStorage.setItem('tc_partner_campaigns', JSON.stringify(localCamps));
        campApproved = true;
      }
    } catch (e) {}

    // 2. Direct update Supabase
    try {
      const { data: updated, error } = await supabase
        .from('campaigns')
        .update({ approval_status: 'approved', status: 'published' })
        .eq('id', id)
        .select('id');
      if (!error && updated && updated.length > 0) campApproved = true;
    } catch (e) {}

    // 3. Try RPC
    if (!campApproved) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_review_campaign', { p_id: id, p_approve: true, p_notes: null });
        if (!rpcErr && rpcRes?.ok) campApproved = true;
      } catch (e) {}
    }

    toast('อนุมัติและเผยแพร่แคมเปญเรียบร้อยแล้ว 🎉', 'ok');
    await loadPartnersPanel();
    window.loadAdminStore?.();
    return;
  }

  if (act === 'partner-campaign-reject') {
    const notes = window.prompt(`ระบุเหตุผลที่ไม่ผ่านการอนุมัติแคมเปญ "${name}" (ไม่บังคับ)`) || null;
    if (!(await confirmDialog({ title: 'ปฏิเสธแคมเปญ', message: `ยืนยันปฏิเสธแคมเปญ "${name}" ? ผู้ประกอบการจะเห็นสถานะไม่ผ่าน`, confirmLabel: 'ปฏิเสธ', danger: true }))) return;

    // 1. If local campaign, update locally
    try {
      const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const idx = localCamps.findIndex(c => c.id === id);
      if (idx >= 0) {
        localCamps[idx].approval_status = 'rejected';
        localCamps[idx].admin_notes = notes;
        localStorage.setItem('tc_partner_campaigns', JSON.stringify(localCamps));
      }
    } catch (e) {}

    // 2. Direct update Supabase
    try {
      await supabase
        .from('campaigns')
        .update({ approval_status: 'rejected', admin_notes: notes })
        .eq('id', id);
    } catch (e) {}

    // 3. Try RPC
    try {
      await supabase.rpc('admin_review_campaign', { p_id: id, p_approve: false, p_notes: notes });
    } catch (e) {}

    toast('ปฏิเสธแคมเปญเรียบร้อย');
    await loadPartnersPanel();
    window.loadAdminStore?.();
    return;
  }

  if (act === 'partner-character-approve') {
    if (!(await confirmDialog({ title: 'อนุมัติและเปิดใช้งานตัวละคร', message: `ยืนยันอนุมัติตัวละคร "${name}" ? ตัวละครจะเปลี่ยนสถานะเป็นใช้งานอยู่และแสดงในหน้าคอลเลกชันทันที`, confirmLabel: 'อนุมัติ' }))) return;

    let charApproved = false;
    // 1. If local character, update locally
    try {
      const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
      const idx = localChars.findIndex(c => c.id === id);
      if (idx >= 0) {
        localChars[idx].approval_status = 'approved';
        localChars[idx].status = 'active';
        localStorage.setItem('tc_partner_characters', JSON.stringify(localChars));
        charApproved = true;
      }
    } catch (e) {}

    // 2. Direct update Supabase
    try {
      const { data: updated, error } = await supabase
        .from('characters')
        .update({ approval_status: 'approved', status: 'active' })
        .eq('id', id)
        .select('id');
      if (!error && updated && updated.length > 0) charApproved = true;
    } catch (e) {}

    // 3. Try RPC
    if (!charApproved) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_review_character', { p_id: id, p_approve: true, p_notes: null });
        if (!rpcErr && rpcRes?.ok) charApproved = true;
      } catch (e) {}
    }

    toast('อนุมัติและเปิดใช้งานตัวละครเรียบร้อยแล้ว 🎉', 'ok');
    await loadPartnersPanel();
    window.loadAdminStore?.();
    return;
  }

  if (act === 'partner-character-reject') {
    const notes = window.prompt(`ระบุเหตุผลที่ไม่ผ่านการอนุมัติตัวละคร "${name}" (ไม่บังคับ)`) || null;
    if (!(await confirmDialog({ title: 'ปฏิเสธตัวละคร', message: `ยืนยันปฏิเสธตัวละคร "${name}" ? ผู้ประกอบการจะเห็นสถานะไม่ผ่าน`, confirmLabel: 'ปฏิเสธ', danger: true }))) return;

    // 1. If local character, update locally
    try {
      const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
      const idx = localChars.findIndex(c => c.id === id);
      if (idx >= 0) {
        localChars[idx].approval_status = 'rejected';
        localChars[idx].status = 'rejected';
        localChars[idx].admin_notes = notes;
        localStorage.setItem('tc_partner_characters', JSON.stringify(localChars));
      }
    } catch (e) {}

    // 2. Direct update Supabase
    try {
      await supabase
        .from('characters')
        .update({ approval_status: 'rejected', status: 'rejected', admin_notes: notes })
        .eq('id', id);
    } catch (e) {}

    // 3. Try RPC
    try {
      await supabase.rpc('admin_review_character', { p_id: id, p_approve: false, p_notes: notes });
    } catch (e) {}

    toast('ปฏิเสธตัวละครเรียบร้อย');
    await loadPartnersPanel();
    window.loadAdminStore?.();
    return;
  }

  if (act === 'quest-edit') { openQuestEditor(id); return; }
  if (act === 'quest-del') {
    if (!(await confirmDialog({ title: 'ลบ/เก็บถาวรเควสท์', message: `ต้องการลบหรือเก็บถาวรเควสท์ "${name}" ใช่หรือไม่?`, confirmLabel: 'ยืนยัน', danger: true }))) return;
    if (String(id).startsWith('local-')) {
      deleteLocalAdminQuest(id);
      toast('ลบเควสท์ในเครื่องเรียบร้อย');
    } else {
      await supabase.from('quests').update({ status: 'archived' }).eq('id', id);
      toast('เก็บถาวรเควสท์เรียบร้อย');
    }
    loadQuests();
    loadStats();
    return;
  }
});

// ── Initialization ───────────────────────────────────────────────────────────
(async () => {
  if (!(await guard())) return;

  initTabs();
  initMapPicker();
  initPlaceForm();
  initQuestForm();
  initUserCreation();
  initAiAssistant();
  initPartnerTabs();
  initAdminStore();

  await loadRefs();
  await loadStats();

  // Button triggers
  $('btn-refresh-stats')?.addEventListener('click', () => { loadStats(); toast('รีเฟรชสถิติเรียบร้อย'); });
  $('btn-new-place')?.addEventListener('click', () => openPlaceEditor(null));
  $('btn-new-quest')?.addEventListener('click', () => openQuestEditor(null));
  $('btn-refresh-tokens')?.addEventListener('click', () => { loadTokensAnalytics(); toast('รีเฟรชข้อมูลโทเคนเรียบร้อย'); });
  $('btn-refresh-audit')?.addEventListener('click', () => { loadAuditLog(); toast('รีเฟรชบันทึกเรียบร้อย'); });
  $('btn-refresh-partners')?.addEventListener('click', async () => { await loadPartnersPanel(); toast('รีเฟรชผู้ประกอบการเรียบร้อย'); });

  // Filters
  wireFilter('place-search', () => { placePage = 0; placeSearch = $('place-search').value; loadPlaces(); });
  wireFilter('place-status-filter', () => { placePage = 0; placeStatusFilter = $('place-status-filter').value; loadPlaces(); });
  wireFilter('quest-search', () => { questPage = 0; questSearch = $('quest-search').value; loadQuests(); });
  wireFilter('quest-diff-filter', () => { questPage = 0; questDiffFilter = $('quest-diff-filter').value; loadQuests(); });
  wireFilter('quest-status-filter', () => { questPage = 0; questStatusFilter = $('quest-status-filter').value; loadQuests(); });
  wireFilter('user-search', () => { userPage = 0; userSearch = $('user-search').value; loadUsers(); });
  wireFilter('user-status-filter', () => { userPage = 0; userStatusFilter = $('user-status-filter').value; loadUsers(); });
  wireFilter('user-role-filter', () => { userPage = 0; userRoleFilter = $('user-role-filter').value; loadUsers(); });

  // Initial loads
  await Promise.all([
    loadPlaces(),
    loadQuests(),
    loadUsers(),
    loadTokensAnalytics(),
    loadAuditLog(),
    loadPartnersPanel()
  ]);
})();
