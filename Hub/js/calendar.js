import { requireAuth } from './auth.js';
import { supabase } from './supabase.js';
import { esc } from './ui.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const localYmd = iso => { const d = new Date(iso); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };

let view = new Date(); view.setDate(1);
let byDay = new Map();
let selected = null;

const add = (day, kind, item) => {
  if (!byDay.has(day)) byDay.set(day, { diary: [], photo: 0, quest: [], trip: [] });
  const e = byDay.get(day);
  if (kind === 'photo') e.photo += item; else e[kind].push(item);
};

async function loadMonth() {
  const y = view.getFullYear(), m = view.getMonth();
  const first = ymd(y, m, 1), last = ymd(y, m, new Date(y, m + 1, 0).getDate());
  const startIso = new Date(y, m, 1).toISOString(), endIso = new Date(y, m + 1, 1).toISOString();
  byDay = new Map();
  const [diaries, quests, trips] = await Promise.all([
    supabase.from('travel_diaries').select('id, title, travel_date, diary_photos(id)').gte('travel_date', first).lte('travel_date', last),
    supabase.from('user_quests').select('quest_id, completed_at, quests(title)').eq('status', 'completed').gte('completed_at', startIso).lt('completed_at', endIso),
    supabase.from('trips').select('id, title, start_date, total_days').not('start_date', 'is', null),
  ]);
  for (const r of [diaries, quests, trips]) if (r.error) throw r.error;
  diaries.data.forEach(d => { add(d.travel_date, 'diary', d); if (d.diary_photos.length) add(d.travel_date, 'photo', d.diary_photos.length); });
  quests.data.forEach(q => add(localYmd(q.completed_at), 'quest', q));
  trips.data.forEach(t => {
    const s = new Date(t.start_date + 'T00:00:00');
    for (let i = 0; i < t.total_days; i++) {
      const d = new Date(s); d.setDate(s.getDate() + i);
      if (d.getFullYear() === y && d.getMonth() === m) add(ymd(y, m, d.getDate()), 'trip', t);
    }
  });
}

function render() {
  const y = view.getFullYear(), m = view.getMonth();
  $('month').textContent = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  const todayStr = localYmd(new Date());
  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-dow" role="columnheader">${d}</div>`).join('');
  html += '<div class="cal-day blank" aria-hidden="true"></div>'.repeat(lead);
  for (let d = 1; d <= days; d++) {
    const key = ymd(y, m, d), e = byDay.get(key);
    const dots = e ? `<span class="dots">${e.diary.length ? '<span class="dot d-diary"></span>' : ''}${e.photo ? '<span class="dot d-photo"></span>' : ''}${e.quest.length ? '<span class="dot d-quest"></span>' : ''}${e.trip.length ? '<span class="dot d-trip"></span>' : ''}</span>` : '';
    const label = e ? `${d}: ${e.diary.length} diary, ${e.photo} photos, ${e.quest.length} quests, ${e.trip.length} trips` : String(d);
    html += `<button class="cal-day${key === todayStr ? ' today' : ''}" data-day="${key}" role="gridcell" aria-selected="${key === selected}" aria-label="${esc(label)}"><span>${d}</span>${dots}</button>`;
  }
  $('grid').innerHTML = html;
}

function showDay(key) {
  selected = key;
  render();
  const e = byDay.get(key);
  $('day-title').textContent = new Date(key + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'full' });
  if (!e) { $('day').innerHTML = '<p class="muted">Nothing recorded on this day.</p>'; return; }
  $('day').innerHTML = [
    ...e.diary.map(d => `<div class="card"><span class="badge">Diary</span> <a href="/journal.html">${esc(d.title)}</a> <span class="meta">(${d.diary_photos.length} photos)</span></div>`),
    ...e.quest.map(q => `<div class="card"><span class="badge badge-warn">Quest completed</span> ${esc(q.quests?.title)}</div>`),
    ...e.trip.map(t => `<div class="card"><span class="badge badge-muted">Trip</span> <a href="/planner.html?trip=${encodeURIComponent(t.id)}">${esc(t.title)}</a></div>`),
  ].join('');
}

async function go(delta) {
  view.setMonth(view.getMonth() + delta); selected = null;
  $('day-title').textContent = 'Select a day'; $('day').innerHTML = '';
  try { await loadMonth(); } catch (e) { console.error(e); $('day').innerHTML = '<p class="state-error" role="alert">Could not load calendar data.</p>'; }
  render();
}

$('grid').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) showDay(b.dataset.day); });
$('prev').addEventListener('click', () => go(-1));
$('next').addEventListener('click', () => go(1));

(async () => { if (await requireAuth()) go(0); })();
