import { supabase } from './supabase.js';
import { requireAuth, getProfile, signOut } from './auth.js';
import { esc, toast, confirmDialog } from './ui.js';
import { icon } from './icons.js';

const $ = id => document.getElementById(id);

async function load(session) {
  const uid = session.user.id;

  // ── ดึงข้อมูลทั้งหมดพร้อมกัน ────────────────────────────────────────────
  const [profileRes, questsRes, tripsRes, balanceRes, txRes] = await Promise.allSettled([
    getProfile(),
    supabase
      .from('user_quests')
      .select('quest_id, status, completed_at, photo_url, caption, gps_dist, quests(id, title, image_url, reward_tokens)')
      .eq('user_id', uid)
      .order('completed_at', { ascending: false })
      .limit(50),
    supabase
      .from('trips')
      .select('id, title, start_date, total_days, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.rpc('my_token_balance'),
    supabase
      .from('token_transactions')
      .select('amount')
      .eq('user_id', uid)
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
  let questsData = questsRes.status === 'fulfilled' ? (questsRes.value.data || []) : [];
  const tripsData = tripsRes.status === 'fulfilled' ? (tripsRes.value.data || []) : [];
  
  // Robust token balance: RPC first, fallback to sum of transactions
  let tokenBalance = balanceRes.status === 'fulfilled' && balanceRes.value?.data != null
    ? Number(balanceRes.value.data)
    : 0;
  
  if (tokenBalance === 0 && txRes.status === 'fulfilled' && txRes.value?.data?.length) {
    tokenBalance = txRes.value.data.reduce((acc, row) => acc + Number(row.amount || 0), 0);
  }

  // Fallback: merge locally saved completed checkins if not present in DB result
  try {
    const rawLocal = localStorage.getItem(`hub_checkins_${uid}`) || localStorage.getItem('hub_checkins');
    if (rawLocal) {
      const localMap = JSON.parse(rawLocal);
      const existingQuestIds = new Set(questsData.map(q => q.quest_id));
      for (const [qId, item] of Object.entries(localMap)) {
        if (!existingQuestIds.has(qId)) {
          questsData.push({
            quest_id: qId,
            status: 'completed',
            completed_at: item.checkedInAt || new Date().toISOString(),
            photo_url: item.photoUrl || '',
            caption: item.caption || '',
            gps_dist: item.gps?.dist ?? null,
            quests: { id: qId, title: item.questTitle || item.placeName || 'ภารกิจเช็คอิน' }
          });
        }
      }
    }
  } catch (e) {
    console.warn('Local checkin merge error:', e);
  }

  if (questsRes.status === 'rejected' || questsRes.value?.error) {
    console.warn('user_quests query error:', questsRes.value?.error || questsRes.reason);
  }

  if (!profile) { $('status').textContent = 'ไม่สามารถโหลดโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง'; return; }

  // ── Header ───────────────────────────────────────────────────────────────
  $('p-name').textContent = profile.display_name || session.user.email;
  $('p-email').textContent = session.user.email;
  $('p-role').textContent = profile.role === 'admin' ? 'Administrator' : profile.role === 'partner' ? 'ผู้ประกอบการ' : 'Explorer';
  $('p-tokens').textContent = tokenBalance;

  // ── Stats ────────────────────────────────────────────────────────────────
  const completed = questsData.filter(q => q.status === 'completed');
  $('stat-quests').textContent = completed.length;

  // ดึง unique places จาก quest_places ของเควสที่ทำสำเร็จ
  let uniquePlacesCount = 0;
  if (completed.length > 0) {
    const completedQuestIds = completed.map(q => q.quest_id);
    const { data: qpData } = await supabase
      .from('quest_places')
      .select('place_id')
      .in('quest_id', completedQuestIds);
    const uniquePlaces = new Set((qpData || []).map(x => x.place_id));
    uniquePlacesCount = Math.max(uniquePlaces.size, completed.length > 0 ? 1 : 0);
  }
  $('stat-places').textContent = uniquePlacesCount;
  $('stat-trips').textContent = tripsData.length;

  // ── Quest history ─────────────────────────────────────────────────────────
  const qEl = $('p-quests');
  if (completed.length) {
    qEl.innerHTML = completed.map(q => {
      const title = q.quests?.title || 'ภารกิจถ่ายรูปเช็คอิน';
      const photo = q.photo_url || q.quests?.image_url || '';
      const dateStr = q.completed_at
        ? new Date(q.completed_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      const distStr = q.gps_dist != null
        ? (q.gps_dist >= 1000 ? (q.gps_dist / 1000).toFixed(1) + ' กม.' : Math.round(q.gps_dist) + ' ม.')
        : '';
      return `
      <li class="quest-history-item">
        ${photo ? `<img class="quest-history-thumb" src="${esc(photo)}" alt="${esc(title)}" loading="lazy">` : `<div class="quest-history-thumb quest-thumb-placeholder">${icon('camera', 20)}</div>`}
        <div class="quest-history-info">
          <span class="quest-history-title">${esc(title)}</span>
          <div class="quest-history-meta">
            ${dateStr ? `<span>${icon('calendar', 13)} ${esc(dateStr)}</span>` : ''}
            ${distStr ? `<span>${icon('gps', 13)} ${esc(distStr)}</span>` : ''}
            <span class="badge" style="background:#D1FAE5;color:#065F46;font-size:0.7rem;">${icon('check', 11)} สำเร็จ</span>
          </div>
          ${q.caption ? `<p class="quest-history-caption">"${esc(q.caption)}"</p>` : ''}
        </div>
      </li>`;
    }).join('');
  } else {
    qEl.innerHTML = '<li class="muted" style="padding:1rem 0;">ยังไม่มีภารกิจที่เสร็จสมบูรณ์ ออกไปสำรวจและเช็คอินสถานที่จริงเลย!</li>';
  }

  // ── Saved trips ───────────────────────────────────────────────────────────
  const tEl = $('p-trips');
  tEl.innerHTML = tripsData.length ? tripsData.map(t => `
    <li>
      <a href="/planner.html?trip=${encodeURIComponent(t.id)}">${esc(t.title)}</a>
      <span class="meta">${t.total_days} วัน${t.start_date ? ' · ' + esc(new Date(t.start_date + 'T00:00:00').toLocaleDateString('th-TH')) : ''}</span>
    </li>`).join('') : '<li class="muted">ยังไม่มีทริปที่บันทึกไว้</li>';

  // ── Pre-fill edit form ────────────────────────────────────────────────────
  $('ed-name').value = profile.display_name || '';
  $('ed-name-current').textContent = profile.display_name || session.user.email;

  $('status').hidden = true;
  $('content').hidden = false;
}

let currentSession = null;

// ── Edit display name ─────────────────────────────────────────────────────────
$('ed-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('ed-name').value.trim().slice(0, 40);
  if (!name) { toast('Display name cannot be empty.', 'error'); return; }
  $('ed-save').disabled = true;
  try {
    const uid = currentSession?.user?.id;
    if (!uid) throw new Error('Not authenticated');
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', uid);
    if (error) throw error;
    $('p-name').textContent = name;
    $('ed-name-current').textContent = name;
    toast('อัพเดตชื่อเรียบร้อยแล้ว');
  } catch (e) { console.error(e); toast('ไม่สามารถอัพเดตชื่อได้', 'error'); }
  finally { $('ed-save').disabled = false; }
});

// ── Change password ───────────────────────────────────────────────────────────
$('pw-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('pw-new').value;
  const pw2 = $('pw-confirm').value;
  if (pw.length < 8) { toast('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'error'); return; }
  if (pw !== pw2) { toast('รหัสผ่านไม่ตรงกัน', 'error'); return; }
  $('pw-save').disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) throw error;
    $('pw-new').value = ''; $('pw-confirm').value = '';
    toast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
  } catch (e) { console.error(e); toast(e.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้', 'error'); }
  finally { $('pw-save').disabled = false; }
});

// ── Sign out ──────────────────────────────────────────────────────────────────
$('btn-signout').addEventListener('click', async () => {
  await signOut();
  location.href = '/';
});

// ── Delete account ────────────────────────────────────────────────────────────
$('btn-delete-account')?.addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'ลบบัญชี',
    message: 'การลบบัญชีจะลบข้อมูลทั้งหมดอย่างถาวร และไม่สามารถกู้คืนได้',
    confirmLabel: 'ลบบัญชีของฉัน',
    danger: true,
  });
  if (!ok) return;
  toast('กรุณาติดต่อฝ่ายสนับสนุนเพื่อลบบัญชี', 'error');
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const session = await requireAuth();
  if (!session) return;
  currentSession = session;
  try {
    await load(session);
  } catch (e) {
    console.error(e);
    $('status').textContent = 'ไม่สามารถโหลดโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง';
  }
})();
