import { listPlaces, getPlaceIndicators } from './places.js';
import { createMap, setMarkers } from './maps.js';
import { esc, debounce, stateEmpty } from './ui.js';
import { requireAuth } from './auth.js';
import { initAIPlannerModal } from './ai-planner-modal.js';

const $ = id => document.getElementById(id);
const state = { map: null, markers: [] };
let options = {}, indicators = { quests: new Set(), campaigns: new Set() };

const CAT_TH = {
  1: 'วัด & ศาสนสถาน (Temple)',
  2: 'พิพิธภัณฑ์ & วัฒนธรรม (Museum)',
  3: 'สวนสาธารณะ & ธรรมชาติ (Park)',
  4: 'ตลาด & ช้อปปิ้ง (Market)',
  5: 'แลนด์มาร์ก & จุดเช็คอิน (Landmark)'
};



function renderList(places) {
  const catMap = new Map((options?.categories || []).map(c => [c.id, CAT_TH[c.id] || c.name]));
  const provMap = new Map((options?.provinces || []).map(p => [p.id, p.name_th || p.name_en]));
  const distMap = new Map((options?.districts || []).map(d => [d.id, d.name_th || d.name_en]));

  $('list').innerHTML = places.map(p => {
    const catName = p.category_th || catMap.get(p.category_id) || 'สถานที่ท่องเที่ยว';
    const distName = distMap.get(p.district_id) || p.districts?.name_th || p.districts?.name_en || '';
    const provName = provMap.get(p.province_id) || p.provinces?.name_th || p.provinces?.name_en || 'กรุงเทพมหานคร';
    const locName = [distName, provName].filter(Boolean).join(', ');
    const title = p.name_display || p.name;
    const summary = p.summary_display || p.summary || '';
    const cover = p.cover_image_display || p.place_images?.[0]?.url || 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400&auto=format&fit=crop&q=80';
    const highlights = (p.highlights_display || []).slice(0, 3);

    return `
    <li data-id="${esc(p.id)}" style="display:flex;gap:14px;align-items:flex-start;">
      <div style="flex-shrink:0;width:95px;height:95px;border-radius:10px;overflow:hidden;background:#E2E8F0;">
        <img src="${esc(cover)}" alt="${esc(title)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
      </div>
      <div style="flex:1;min-width:0;">
        <h2 style="font-size:1.15rem;margin:0 0 4px;line-height:1.3;">
          <a href="/place.html?id=${encodeURIComponent(p.id)}" style="color:#0F172A;text-decoration:none;">${esc(title)}</a>
        </h2>
        <div class="badges" style="margin-bottom:6px;">
          <span class="badge badge-muted">${esc(catName)}</span>
          <span class="badge badge-muted">📍 ${esc(locName)}</span>
          ${indicators.quests.has(p.id) ? '<span class="badge" style="background:#DCFCE7;color:#166534;">🎯 มีเควสท์</span>' : ''}
          ${indicators.campaigns.has(p.id) ? '<span class="badge" style="background:#FEF3C7;color:#92400E;">🏆 แคมเปญ</span>' : ''}
        </div>
        <p class="meta" style="color:#475569;font-size:0.86rem;line-height:1.5;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
          ${esc(summary)}
        </p>
        ${highlights.length ? `
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
            ${highlights.map(h => `<span style="font-size:0.75rem;background:#F1F5F9;color:#334155;padding:2px 8px;border-radius:4px;border:1px solid #E2E8F0;">${esc(h.icon)} ${esc(h.title)}</span>`).join('')}
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;align-items:center;">
          <a href="/place.html?id=${encodeURIComponent(p.id)}" class="btn btn-secondary" style="font-size:0.82rem;padding:5px 12px;text-decoration:none;">📖 รายละเอียด</a>
          <a href="/navigate.html?lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(title)}&id=${encodeURIComponent(p.id)}" class="btn" style="font-size:0.82rem;padding:5px 12px;background:linear-gradient(135deg,#00A86B,#007A4D);color:#fff;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">🧭 นำทาง GPS</a>
        </div>
      </div>
    </li>`;
  }).join('');
}

function select(p) {
  document.querySelectorAll('#list li').forEach(li => {
    if (li.dataset.id === p.id) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
  });
  document.querySelector(`#list li[data-id="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  state.map?.panTo({ lat: p.lat, lng: p.lng });
}

async function refresh() {
  $('status').textContent = 'Loading…';
  try {
    const places = await listPlaces({ search: $('search').value });
    renderList(places);
    $('status').textContent = places.length ? `${places.length} destination(s)` : '';
    if (!places.length) $('list').innerHTML = stateEmpty('No published destinations match your search.');
    if (state.map) setMarkers(state.map, state, places, select);
  } catch (e) {
    console.error('refresh error:', e?.message || e);
    $('list').innerHTML = '';
    $('status').textContent = `Could not load destinations: ${e?.message || e?.error_description || JSON.stringify(e)}`;
  }
}

async function init() {
  const session = await requireAuth();
  if (!session) return;

  try {
    indicators = await getPlaceIndicators();
  } catch (e) { console.error(e); }

  // Search input & clear button
  const searchInput = $('search');
  const clearBtn = $('search-clear-btn');
  searchInput.addEventListener('input', () => {
    if (clearBtn) clearBtn.hidden = !searchInput.value;
    debounce(refresh, 300)();
  });
  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden = true;
    searchInput.focus();
    refresh();
  });

  $('filters').addEventListener('submit', e => e.preventDefault());

  window.addEventListener('gmaps_error', ev => {
    $('map-error').hidden = false;
    $('map-error').textContent = `${ev.detail.message} The list below still works.`;
  });
  try {
    state.map = await createMap($('map'));
    window.__exploreMap = state.map;
  } catch (e) {
    $('map-error').hidden = false;
    $('map-error').textContent = `${e.message} The list below still works.`;
  }

  // Check URL params for initial search
  const params = new URLSearchParams(location.search);
  const searchParam = params.get('search') || params.get('q');
  if (searchParam) {
    searchInput.value = decodeURIComponent(searchParam);
    if (clearBtn) clearBtn.hidden = false;
  }

  refresh();
  initAIPlannerModal();
}
init();
