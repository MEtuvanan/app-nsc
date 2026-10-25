import { requireAuth } from './auth.js';
import { supabase } from './supabase.js';
import { listDiaries, saveDiary, deleteDiary, deletePhoto, signedUrls, validatePhoto } from './journal.js';
import { esc, toast, confirmDialog, stateEmpty, stateLoading, isUuid } from './ui.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const localYmd = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
};

function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ── Application State ─────────────────────────────────────
let session = null;
let places = [];
let diaries = [];
let editing = null;

// Calendar State
let view = new Date();
view.setDate(1);
let byDay = new Map();
let selectedDay = null; // 'YYYY-MM-DD' or null

// ── Calendar Functions ────────────────────────────────────
const addEventToDay = (day, kind, item) => {
  if (!byDay.has(day)) byDay.set(day, { diary: [], photo: 0, quest: [], trip: [] });
  const entry = byDay.get(day);
  if (kind === 'photo') {
    entry.photo += item;
  } else {
    entry[kind].push(item);
  }
};

async function loadMonthCalendar() {
  const y = view.getFullYear(), m = view.getMonth();
  const first = ymd(y, m, 1);
  const last = ymd(y, m, new Date(y, m + 1, 0).getDate());
  const startIso = new Date(y, m, 1).toISOString();
  const endIso = new Date(y, m + 1, 1).toISOString();

  byDay = new Map();

  const [diariesRes, questsRes, tripsRes] = await Promise.all([
    supabase.from('travel_diaries')
      .select('id, title, travel_date, diary_photos(id)')
      .gte('travel_date', first)
      .lte('travel_date', last),
    supabase.from('user_quests')
      .select('quest_id, completed_at, photo_url, quests(title, reward_tokens)')
      .eq('status', 'completed')
      .gte('completed_at', startIso)
      .lt('completed_at', endIso),
    supabase.from('trips')
      .select('id, title, start_date, total_days')
      .not('start_date', 'is', null),
  ]);

  if (diariesRes.data) {
    diariesRes.data.forEach(d => {
      addEventToDay(d.travel_date, 'diary', d);
      if (d.diary_photos?.length) {
        addEventToDay(d.travel_date, 'photo', d.diary_photos.length);
      }
    });
  }

  if (questsRes.data) {
    questsRes.data.forEach(q => {
      addEventToDay(localYmd(q.completed_at), 'quest', q);
    });
  }

  if (tripsRes.data) {
    tripsRes.data.forEach(t => {
      const s = new Date(t.start_date + 'T00:00:00');
      for (let i = 0; i < (t.total_days || 1); i++) {
        const cur = new Date(s);
        cur.setDate(s.getDate() + i);
        if (cur.getFullYear() === y && cur.getMonth() === m) {
          addEventToDay(ymd(y, m, cur.getDate()), 'trip', t);
        }
      }
    });
  }

  renderCalendar();
}

function renderCalendar() {
  const y = view.getFullYear(), m = view.getMonth();
  const monthName = view.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  $('month').textContent = monthName;

  const lead = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayStr = localYmd(new Date());

  const dows = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  let html = dows.map(d => `<div class="cal-dow" role="columnheader">${d}</div>`).join('');
  html += '<div class="cal-day blank" aria-hidden="true"></div>'.repeat(lead);

  for (let d = 1; d <= daysInMonth; d++) {
    const key = ymd(y, m, d);
    const dayData = byDay.get(key);
    const isToday = key === todayStr;
    const isSelected = key === selectedDay;

    let dotsHtml = '';
    if (dayData) {
      dotsHtml = `<span class="dots">
        ${dayData.diary?.length ? '<span class="dot d-diary" title="มีไดอารี่"></span>' : ''}
        ${dayData.photo ? '<span class="dot d-photo" title="มีรูปภาพ"></span>' : ''}
        ${dayData.quest?.length ? '<span class="dot d-quest" title="เช็คอินเควสท์"></span>' : ''}
        ${dayData.trip?.length ? '<span class="dot d-trip" title="มีทริป"></span>' : ''}
      </span>`;
    }

    html += `
      <button class="cal-day${isToday ? ' today' : ''}" 
              data-day="${key}" 
              type="button" 
              role="gridcell" 
              aria-selected="${isSelected}"
              title="${formatThaiDate(key)}">
        <span class="cal-day-num">${d}</span>
        ${dotsHtml}
      </button>
    `;
  }

  $('grid').innerHTML = html;
}

function selectDay(dateStr) {
  selectedDay = dateStr;
  renderCalendar();

  const dayData = byDay.get(dateStr);
  const card = $('selected-day-card');
  const titleEl = $('day-title');
  const summaryEl = $('day-summary-text');
  const actionsEl = $('day-actions');
  const eventsEl = $('day-events-list');

  card.classList.add('has-selection');
  titleEl.textContent = formatThaiDate(dateStr);

  const parts = [];
  if (dayData?.diary?.length) parts.push(`📔 ไดอารี่ ${dayData.diary.length} เรื่อง`);
  if (dayData?.photo) parts.push(`📷 รูป ${dayData.photo} รูป`);
  if (dayData?.quest?.length) parts.push(`🎯 เควสท์ ${dayData.quest.length} ภารกิจ`);
  if (dayData?.trip?.length) parts.push(`🧭 ทริป ${dayData.trip.length} ทริป`);

  if (parts.length) {
    summaryEl.innerHTML = `<strong>พบกิจกรรมในวันนี้:</strong> ${parts.join(' · ')}`;
  } else {
    summaryEl.textContent = 'ยังไม่มีบันทึกหรือกิจกรรมในวันนี้';
  }

  actionsEl.style.display = 'flex';

  // Events preview list inside selected day card
  let eventsHtml = '';
  if (dayData) {
    if (dayData.quest?.length) {
      eventsHtml += dayData.quest.map(q => `
        <div class="sdc-event-item">
          <span>🎯 <strong>เควสท์:</strong> ${esc(q.quests?.title || 'เช็คอิน')}</span>
          <span class="badge" style="background:#FEF3C7;color:#92400E;font-size:0.75rem;">+${q.quests?.reward_tokens || 50} 🪙</span>
        </div>
      `).join('');
    }
    if (dayData.trip?.length) {
      eventsHtml += dayData.trip.map(t => `
        <div class="sdc-event-item">
          <span>🧭 <strong>ทริป:</strong> <a href="/planner.html?trip=${encodeURIComponent(t.id)}">${esc(t.title)}</a></span>
        </div>
      `).join('');
    }
  }
  eventsEl.innerHTML = eventsHtml;

  // Show filter banner above feed
  $('filter-banner').style.display = 'flex';
  $('filter-banner-date').textContent = formatThaiDate(dateStr);

  // Refresh Journal feed filtered to this day
  refreshJournal();

  // On smaller screens, scroll gently to the journal section
  if (window.innerWidth < 992) {
    $('filter-banner').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearDayFilter() {
  selectedDay = null;
  renderCalendar();

  const card = $('selected-day-card');
  card.classList.remove('has-selection');
  $('day-title').textContent = 'เลือกวันที่บนปฏิทิน';
  $('day-summary-text').textContent = 'แตะวันที่ในปฏิทินเพื่อกรองบันทึกและดูกิจกรรมในวันนั้น';
  $('day-actions').style.display = 'none';
  $('day-events-list').innerHTML = '';

  $('filter-banner').style.display = 'none';
  refreshJournal();
}

async function changeMonth(delta) {
  view.setMonth(view.getMonth() + delta);
  try {
    await loadMonthCalendar();
  } catch (err) {
    console.error('Change month error:', err);
  }
}

// ── Journal Functions ─────────────────────────────────────
function fillPlacesDropdown() {
  const opts = places.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('f-place').innerHTML = '<option value="">ทุกสถานที่</option>' + opts;
  $('ed-p').innerHTML = opts;
}

async function refreshJournal() {
  $('list').innerHTML = stateLoading();

  try {
    const fromFilter = selectedDay || $('f-from')?.value || '';
    const toFilter = selectedDay || $('f-to')?.value || '';
    const placeFilter = $('f-place')?.value || '';

    diaries = await listDiaries({ from: fromFilter, to: toFilter, placeId: placeFilter });

    const photoPaths = diaries.flatMap(d => (d.diary_photos || []).map(p => p.storage_path));
    const urls = await signedUrls(photoPaths);

    // If a specific day is selected, also grab completed quests and trips for that day
    const dayData = selectedDay ? byDay.get(selectedDay) : null;
    let extraCardsHtml = '';

    if (dayData?.quest?.length) {
      extraCardsHtml += dayData.quest.map(q => `
        <article class="activity-card quest">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span style="font-size:1.8rem;">🎯</span>
            <div>
              <span class="badge" style="background:#FEF3C7;color:#92400E;font-size:0.75rem;margin-bottom:0.25rem;">เช็คอินเควสท์สำเร็จ 🏆</span>
              <h3 style="margin:0;font-size:1.05rem;color:#78350F;">${esc(q.quests?.title || 'เควสท์ท่องเที่ยว')}</h3>
              <p class="meta" style="margin:0.2rem 0 0;">ได้รับ 🪙 +${q.quests?.reward_tokens || 50} โทเคน</p>
            </div>
          </div>
          ${q.photo_url ? `<img src="${esc(q.photo_url)}" style="width:58px;height:58px;border-radius:8px;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,0.15);" alt="Checkin">` : ''}
        </article>
      `).join('');
    }

    if (dayData?.trip?.length) {
      extraCardsHtml += dayData.trip.map(t => `
        <article class="activity-card trip">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span style="font-size:1.8rem;">🧭</span>
            <div>
              <span class="badge" style="background:#DBEAFE;color:#1E40AF;font-size:0.75rem;margin-bottom:0.25rem;">ทริปท่องเที่ยว ✈️</span>
              <h3 style="margin:0;font-size:1.05rem;"><a href="/planner.html?trip=${encodeURIComponent(t.id)}" style="color:#1E3A8A;text-decoration:none;">${esc(t.title)}</a></h3>
              <p class="meta" style="margin:0.2rem 0 0;">กำหนดการเดินทาง ${t.total_days || 1} วัน</p>
            </div>
          </div>
          <a href="/planner.html?trip=${encodeURIComponent(t.id)}" class="btn btn-small btn-secondary">เปิดทริป</a>
        </article>
      `).join('');
    }

    if (!diaries.length && !extraCardsHtml) {
      const msg = selectedDay 
        ? `ยังไม่มีบันทึกหรือกิจกรรมในวันที่ ${formatThaiDate(selectedDay)}`
        : 'ยังไม่มีบันทึกไดอารี่การเดินทาง เริ่มต้นเขียนเรื่องราวแรกของคุณได้เลย';
      
      $('list').innerHTML = `
        <div style="text-align:center;padding:2.5rem 1.5rem;background:#fff;border:1px dashed var(--color-border);border-radius:var(--radius-large);margin-top:0.5rem;">
          <div style="font-size:2.8rem;margin-bottom:0.5rem;">📔</div>
          <h3 style="margin:0 0 0.5rem;color:var(--color-forest);">${esc(msg)}</h3>
          <p class="muted" style="margin:0 0 1.25rem;font-size:0.875rem;">บันทึกความทรงจำ รูปถ่าย และความประทับใจ เพื่อเก็บเป็นไดอารี่การเดินทางส่วนตัวของคุณ</p>
          <button class="btn" id="empty-add-btn" type="button">➕ เขียนบันทึกใหม่</button>
        </div>
      `;
      $('empty-add-btn')?.addEventListener('click', () => openEditor(null, selectedDay));
      $('status').textContent = '0 รายการ';
      return;
    }

    const diaryEntriesHtml = diaries.map(d => {
      const formattedDate = formatThaiDate(d.travel_date);
      const placeNames = (d.diary_place_links || [])
        .map(l => l.places?.name)
        .filter(Boolean)
        .join(', ');

      const photosHtml = (d.diary_photos || [])
        .sort((a, b) => a.position - b.position)
        .map(p => {
          const url = urls.get(p.storage_path);
          if (!url) return '';
          return `
            <figure>
              <img src="${esc(url)}" alt="${esc(p.caption || d.title)}" loading="lazy">
              ${p.caption ? `<figcaption title="${esc(p.caption)}">${esc(p.caption)}</figcaption>` : ''}
            </figure>
          `;
        }).join('');

      return `
        <article class="entry" data-id="${esc(d.id)}">
          <div class="entry-head">
            <div>
              <h2>${esc(d.title)}</h2>
              <div class="entry-meta">
                <span class="entry-meta-badge">📅 ${esc(formattedDate)}</span>
                ${d.mood ? `<span class="entry-meta-badge mood">💭 ${esc(d.mood)}</span>` : ''}
                ${placeNames ? `<span class="entry-meta-badge">📍 ${esc(placeNames)}</span>` : ''}
              </div>
            </div>
          </div>
          
          <div class="entry-body">${esc(d.body || '')}</div>

          ${photosHtml ? `<div class="thumbs">${photosHtml}</div>` : ''}

          <div class="entry-actions">
            <button class="btn btn-small btn-secondary" data-edit="${esc(d.id)}" type="button">✏️ แก้ไข</button>
            <button class="btn btn-small btn-danger" data-del="${esc(d.id)}" type="button">🗑️ ลบ</button>
          </div>
        </article>
      `;
    }).join('');

    $('list').innerHTML = extraCardsHtml + diaryEntriesHtml;
    $('status').textContent = `แสดง ${diaries.length} บันทึก`;

  } catch (err) {
    console.error('Failed to load journal:', err);
    $('list').innerHTML = '<div class="alert alert-error" role="alert">ไม่สามารถโหลดบันทึกไดอารี่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง</div>';
  }
}

// ── Modal Dialog Operations ───────────────────────────────
function openEditor(d, defaultDate = null) {
  editing = d || null;
  $('ed-title').textContent = d ? 'แก้ไขบันทึกไดอารี่' : 'เขียนบันทึกการเดินทางใหม่';
  $('ed-t').value = d?.title || '';
  $('ed-d').value = d?.travel_date || defaultDate || selectedDay || new Date().toISOString().slice(0, 10);
  $('ed-m').value = d?.mood || '';
  $('ed-b').value = d?.body || '';

  const linked = new Set((d?.diary_place_links || []).map(l => l.place_id));
  const pre = new URLSearchParams(location.search).get('place_id');
  if (!d && isUuid(pre)) linked.add(pre);

  [...$('ed-p').options].forEach(o => {
    o.selected = linked.has(o.value);
  });

  $('ed-f').value = '';
  $('ed-new').innerHTML = '';
  $('ed-msg').hidden = true;

  $('ed-existing').innerHTML = (d?.diary_photos || []).map(p => `
    <figure>
      <figcaption>${esc(p.caption || 'รูปถ่าย')}</figcaption>
      <button class="btn btn-small btn-danger" data-rm="${esc(p.id)}" type="button">ลบรูปนี้</button>
    </figure>
  `).join('');

  $('editor').showModal();
}

// Handle file input changes inside editor
$('ed-f').addEventListener('change', () => {
  $('ed-new').innerHTML = [...$('ed-f').files].map((f, i) => {
    const err = validatePhoto(f);
    return `
      <div class="form-field">
        <label for="cap-${i}">${esc(f.name)}${err ? ` — <span style="color:#DC2626;font-weight:700;">${esc(err)}</span>` : ' คำบรรยายรูปภาพ (Caption)'}</label>
        <input id="cap-${i}" data-cap="${i}" maxlength="300" placeholder="อธิบายภาพนี้สักนิด..." ${err ? 'disabled' : ''}>
      </div>
    `;
  }).join('');
});

// Remove existing photo
$('ed-existing').addEventListener('click', async e => {
  const b = e.target.closest('[data-rm]');
  if (!b || !editing) return;
  const photo = editing.diary_photos.find(p => p.id === b.dataset.rm);
  if (!photo) return;

  const ok = await confirmDialog({
    title: 'ยืนยันลบรูปภาพ',
    message: 'คุณต้องการลบรูปภาพนี้ออกจากบันทึกอย่างถาวรหรือไม่?',
    confirmLabel: 'ลบรูปภาพ',
    danger: true
  });
  if (!ok) return;

  try {
    await deletePhoto(photo);
    editing.diary_photos = editing.diary_photos.filter(p => p !== photo);
    b.closest('figure').remove();
    toast('ลบรูปภาพเรียบร้อย', 'ok');
    loadMonthCalendar();
  } catch (err) {
    console.error(err);
    toast('ไม่สามารถลบรูปภาพได้', 'error');
  }
});

// Save diary entry
$('ed-form').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('ed-msg');
  const title = $('ed-t').value.trim();
  const date = $('ed-d').value;

  if (!title || !date) {
    msg.hidden = false;
    msg.className = 'alert alert-error';
    msg.textContent = 'กรุณาระบุหัวข้อและวันที่เดินทางครับ';
    return;
  }

  const photos = [...$('ed-f').files].map((file, i) => ({
    file,
    caption: document.querySelector(`[data-cap="${i}"]`)?.value.trim()
  })).filter(p => !validatePhoto(p.file));

  $('ed-save').disabled = true;
  $('ed-save').textContent = 'กำลังบันทึก...';

  try {
    const { failed } = await saveDiary({
      id: editing?.id,
      userId: session.user.id,
      title,
      body: $('ed-b').value.trim(),
      travel_date: date,
      mood: $('ed-m').value.trim(),
      placeIds: [...$('ed-p').selectedOptions].map(o => o.value),
      photos,
      startPos: editing?.diary_photos?.length || 0,
    });

    $('editor').close();
    toast(failed?.length ? `บันทึกแล้ว (มีรูปไม่สำเร็จ ${failed.length} รูป)` : 'บันทึกเรื่องราวเรียบร้อยแล้ว! 🎉', 'ok');

    // Update both Calendar and Journal immediately
    await Promise.all([loadMonthCalendar(), refreshJournal()]);

  } catch (err) {
    console.error('Save diary error:', err);
    msg.hidden = false;
    msg.className = 'alert alert-error';
    msg.textContent = `เกิดข้อผิดพลาดในการบันทึก: ${err.message}`;
  } finally {
    $('ed-save').disabled = false;
    $('ed-save').textContent = '💾 บันทึกเรื่องราว';
  }
});

// Edit & Delete actions from Journal feed
$('list').addEventListener('click', async e => {
  const ed = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');

  if (ed) {
    const targetDiary = diaries.find(d => d.id === ed.dataset.edit);
    if (targetDiary) openEditor(targetDiary);
  }

  if (del) {
    const targetDiary = diaries.find(d => d.id === del.dataset.del);
    if (!targetDiary) return;

    const ok = await confirmDialog({
      title: 'ยืนยันลบบันทึก',
      message: `คุณต้องการลบบันทึก “${targetDiary.title}” และรูปภาพทั้งหมดในบันทึกนี้ใช่หรือไม่?`,
      confirmLabel: 'ยืนยันลบ',
      danger: true
    });
    if (!ok) return;

    try {
      await deleteDiary(targetDiary);
      toast('ลบบันทึกเรียบร้อย', 'ok');
      await Promise.all([loadMonthCalendar(), refreshJournal()]);
    } catch (err) {
      console.error(err);
      toast('ไม่สามารถลบบันทึกได้', 'error');
    }
  }
});

// ── Event Listeners ───────────────────────────────────────
// Calendar Grid Click
$('grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-day]');
  if (btn) {
    selectDay(btn.dataset.day);
  }
});

// Month navigation
$('prev').addEventListener('click', () => changeMonth(-1));
$('next').addEventListener('click', () => changeMonth(1));
$('cal-today-btn').addEventListener('click', () => {
  view = new Date();
  view.setDate(1);
  loadMonthCalendar();
  selectDay(localYmd(new Date()));
});

// Selected Day Actions
$('btn-add-for-day')?.addEventListener('click', () => {
  openEditor(null, selectedDay);
});
$('btn-clear-day-filter')?.addEventListener('click', clearDayFilter);
$('filter-banner-clear')?.addEventListener('click', clearDayFilter);

// Filter Form
['f-from', 'f-to', 'f-place'].forEach(id => {
  $(id)?.addEventListener('change', () => {
    // If user changes custom dates, release single-day calendar lock
    if (id === 'f-from' || id === 'f-to') {
      selectedDay = null;
      $('filter-banner').style.display = 'none';
      renderCalendar();
    }
    refreshJournal();
  });
});

$('btn-reset-filters')?.addEventListener('click', () => {
  if ($('f-from')) $('f-from').value = '';
  if ($('f-to')) $('f-to').value = '';
  if ($('f-place')) $('f-place').value = '';
  clearDayFilter();
});

// Top and Modal Buttons
$('new-top-btn')?.addEventListener('click', () => openEditor(null));
$('new')?.addEventListener('click', () => openEditor(null));
$('ed-cancel')?.addEventListener('click', () => $('editor').close());

// ── Initialization ────────────────────────────────────────
(async () => {
  session = await requireAuth();
  if (!session) return;

  try {
    const { data, error } = await supabase.from('places')
      .select('id, name')
      .eq('status', 'published')
      .order('name');
    if (!error && data) {
      places = data;
      fillPlacesDropdown();
    }
  } catch (err) {
    console.warn('Load places error:', err);
  }

  // Check URL query parameters (e.g. ?place_id=... or ?date=...)
  const params = new URLSearchParams(location.search);
  const prePlace = params.get('place_id');
  const preDate = params.get('date');

  await Promise.all([loadMonthCalendar(), refreshJournal()]);

  if (preDate) {
    selectDay(preDate);
  }

  if (isUuid(prePlace)) {
    openEditor(null);
  }
})();
