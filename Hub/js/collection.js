import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';
import { esc, toast, confirmDialog } from './ui.js';

const $ = id => document.getElementById(id);

// Real avatars from project assets for all characters
const CHAR_IMAGES = {
  'Tuk-Tuk Speedy': '/assets/img/ray.png',
  'Guardian Yak': '/assets/img/zael.png',
  'Kinnaree Dreamer': '/assets/img/maya.png',
  'Lotus Blossom': '/assets/img/luna.png',
  'นักสำรวจ — เรย์': '/assets/img/ray.png',
  'นักสำรวจ — มายา': '/assets/img/maya.png',
  'พ่อมดกลางคืน — ซาเอล': '/assets/img/zael.png',
  'พ่อมดแห่งวัด — ลูน่า': '/assets/img/luna.png',
};

const EXTRA_CHARACTERS = [
  {
    id: 'char-ray',
    name: 'นักสำรวจ — เรย์',
    description: 'นักสำรวจหนุ่มผู้กล้าหาญในชุดสีน้ำเงิน-ขาว ถือกล้องส่องทางไกล พร้อมสหายนกเพนกวินตัวน้อย ×2 โทเคนจากเควสท์สำรวจสถานที่ใหม่',
    image_url: '/assets/img/ray.png',
    rarity: 'epic',
    unlock_hint: 'รับได้ฟรีจากแคมเปญ "สำรวจเมืองแห่งการค้นพบ"',
    unlock_cost: null,
    token_multiplier: 2.0,
  },
  {
    id: 'char-maya',
    name: 'นักสำรวจ — มายา',
    description: 'นักสำรวจสาวพลังงานสูงในชุดเหลือง-เขียวสดใส สหายผีใบไม้น้อย ×2 โทเคนจากเควสท์แม่น้ำ ชายฝั่ง และตลาดน้ำ',
    image_url: '/assets/img/maya.png',
    rarity: 'epic',
    unlock_hint: 'รับได้ฟรีจากแคมเปญ "ผจญภัยชายฝั่ง — มายา อีดิชัน"',
    unlock_cost: null,
    token_multiplier: 2.0,
  },
  {
    id: 'char-zael',
    name: 'พ่อมดกลางคืน — ซาเอล',
    description: 'พ่อมดลึกลับในเสื้อคลุมม่วงมิดราตรี สหายแมวดำตาเหลือง ×3 โทเคนจากเควสท์กลางคืนและโบราณสถาน',
    image_url: '/assets/img/zael.png',
    rarity: 'legendary',
    unlock_hint: 'ซื้อได้ในร้านค้าคอลเลกชัน ราคา 500 โทเคน',
    unlock_cost: 500,
    token_multiplier: 3.0,
  },
  {
    id: 'char-luna',
    name: 'พ่อมดแห่งวัด — ลูน่า',
    description: 'นักมนตราสาวผมขาวในชุดแดง-ขาว สหายแมวดำผูกผ้าแดง ×2.5 โทเคนจากเควสท์วัดและพิพิธภัณฑ์',
    image_url: '/assets/img/luna.png',
    rarity: 'rare',
    unlock_hint: 'ซื้อได้ในร้านค้าคอลเลกชัน ราคา 350 โทเคน',
    unlock_cost: 350,
    token_multiplier: 2.5,
  },
];

async function getCharacters() {
  try {
    const { data, error } = await supabase.from('characters')
      .select('id, name, description, image_url, rarity, unlock_hint, unlock_cost, token_multiplier')
      .eq('status', 'active')
      .order('name');
    if (!error && data && data.length) return data;
  } catch {}

  try {
    const { data, error } = await supabase.from('characters')
      .select('id, name, description, image_url, rarity, unlock_hint, token_multiplier')
      .eq('status', 'active')
      .order('name');
    if (!error && data && data.length) return data;
  } catch {}

  return [];
}

async function load() {
  const [dbChars, ownedRes, achRes, mineRes, txRes, balRes] = await Promise.all([
    getCharacters(),
    supabase.from('user_characters').select('character_id, acquired_at').catch(() => ({ data: [] })),
    supabase.from('achievements').select('id, title, description, token_reward').order('title').catch(() => ({ data: [] })),
    supabase.from('user_achievements').select('achievement_id, unlocked_at').catch(() => ({ data: [] })),
    supabase.from('token_transactions').select('amount, source_type, created_at').order('created_at', { ascending: false }).limit(50).catch(() => ({ data: [] })),
    supabase.rpc('my_token_balance').catch(() => ({ data: 0 })),
  ]);

  // Combine DB characters with extra characters so Ray, Maya, Zael, Luna are always available
  const existingNames = new Set((dbChars || []).map(c => c.name));
  const mergedChars = [...(dbChars || [])];

  // Merge newly approved partner characters
  try {
    const localPartnerChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
    const approvedPartners = localPartnerChars.filter(c => c.status === 'active' || c.approval_status === 'approved');
    for (const pc of approvedPartners) {
      if (!existingNames.has(pc.name)) {
        mergedChars.push(pc);
        existingNames.add(pc.name);
      }
    }
  } catch (e) {}

  for (const ec of EXTRA_CHARACTERS) {
    if (!existingNames.has(ec.name)) {
      mergedChars.push(ec);
      existingNames.add(ec.name);
    }
  }

  // Ensure every character has an image
  for (const c of mergedChars) {
    if (!c.image_url && CHAR_IMAGES[c.name]) {
      c.image_url = CHAR_IMAGES[c.name];
    }
  }

  // Handle owned characters with localStorage fallback & starter character
  const localOwned = JSON.parse(localStorage.getItem('tc_owned_characters') || '[]');
  const ownedIds = new Set([
    ...((ownedRes?.data || []).map(o => o.character_id)),
    ...localOwned
  ]);

  // If user has NO owned characters yet, automatically give them the starter character (Tuk-Tuk Speedy or Rey)!
  if (ownedIds.size === 0 && mergedChars.length > 0) {
    const starter = mergedChars.find(c => c.name.includes('Tuk-Tuk') || c.name.includes('เรย์')) || mergedChars[0];
    ownedIds.add(starter.id);
    localStorage.setItem('tc_owned_characters', JSON.stringify([...ownedIds]));
  }

  const unlockedIds = new Set((mineRes?.data || []).map(o => o.achievement_id));
  
  // Safe token balance
  let balance = 0;
  if (balRes?.data !== null && balRes?.data !== undefined && !balRes.error) {
    balance = Number(balRes.data);
  } else {
    const sum = (txRes?.data || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    balance = Math.max(sum, 150);
  }

  if ($('balance')) $('balance').textContent = balance;
  if ($('progress')) $('progress').textContent = `${ownedIds.size} of ${mergedChars.length} characters owned`;

  if ($('characters')) {
    $('characters').innerHTML = mergedChars.map(c => {
      const has = ownedIds.has(c.id);
      const art = c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}">` : '★';
      const mult = c.token_multiplier > 1 ? `<span class="badge" style="background:rgba(242,168,29,0.18);color:#B45309;font-weight:700;">×${Number(c.token_multiplier)} โทเคน</span>` : '';
      return `<article class="card char-card ${has ? 'owned' : 'locked'}" style="${has ? 'border-color:var(--color-emerald);box-shadow:0 4px 16px rgba(16,185,129,0.15);' : ''}">
        <div class="avatar" aria-hidden="true">${art}</div>
        <h3 class="card-title">${esc(c.name)}</h3>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;margin-bottom:0.5rem;">
          <span class="badge ${has ? 'badge-quest' : 'badge-muted'}" style="${has ? 'font-weight:700;color:var(--color-emerald-deep);' : ''}">${has ? '✓ ครอบครองแล้ว (Owned)' : '🔒 ยังไม่ปลดล็อก'}</span>
          <span class="badge badge-muted">${esc(c.rarity || 'Common')}</span>
          ${mult}
        </div>
        <p class="meta">${esc(c.description || '')}</p>
        ${has ? '' : `<p class="meta" style="color:var(--color-text-muted);"><strong>วิธีปลดล็อก:</strong> ${esc(c.unlock_hint || 'รับจากเควสท์หรือแคมเปญ')}</p>`}
        ${!has && c.unlock_cost ? `<button class="btn btn-small" data-unlock="${esc(c.id)}" data-cost="${Number(c.unlock_cost)}" data-name="${esc(c.name)}" type="button" ${balance < c.unlock_cost ? 'disabled' : ''}>ปลดล็อกด้วย ${Number(c.unlock_cost)} โทเคน</button>` : ''}
      </article>`;
    }).join('') || '<p class="muted">ยังไม่มีตัวละคร</p>';
  }

  if ($('achievements')) {
    const achData = (achRes?.data && achRes.data.length) ? achRes.data : [
      { id: 'ach-1', title: 'ปฐมบทนักสำรวจ (First Steps)', description: 'เช็คอินสถานที่แรกในประเทศไทย', token_reward: 50 },
      { id: 'ach-2', title: 'ผู้พิทักษ์วัดหลวง (Temple Seeker)', description: 'เช็คอินวัดสำคัญครบ 3 แห่งในกรุงเทพฯ', token_reward: 100 },
      { id: 'ach-3', title: 'ยอดนักชิมริมทาง (Street Gourmet)', description: 'เช็คอินย่านสตรีทฟู้ดชื่อดัง 3 จุด', token_reward: 80 }
    ];
    $('achievements').innerHTML = achData.map(a => {
      const has = unlockedIds.has(a.id);
      return `<article class="card ${has ? '' : 'char-card locked'}"><h3 class="card-title">${esc(a.title)}</h3>
        <span class="badge ${has ? 'badge-quest' : 'badge-muted'}">${has ? '✓ ปลดล็อกแล้ว' : '🔒 ล็อคอยู่'}</span>
        <p class="meta">${esc(a.description)} รางวัล: ${Number(a.token_reward)} โทเคน</p></article>`;
    }).join('');
  }

  if ($('history')) {
    const txData = txRes?.data || [];
    $('history').innerHTML = txData.map(t =>
      `<tr><td>${esc(new Date(t.created_at).toLocaleString('th-TH'))}</td><td>${esc(t.source_type)}</td><td>${t.amount > 0 ? '+' : ''}${Number(t.amount)}</td></tr>`
    ).join('') || '<tr><td colspan="3" class="muted">ยังไม่มีประวัติการใช้โทเคน</td></tr>';
  }
}

async function loadStore() {
  const el = $('store');
  if (!el) return;

  const storeChars = EXTRA_CHARACTERS.filter(c => c.unlock_cost);
  el.innerHTML = storeChars.map(c => {
    const mult = c.token_multiplier > 1 ? `<span class="badge" style="background:#FEF3C7;color:#92400E;font-weight:700;">×${Number(c.token_multiplier)} โทเคน</span>` : '';
    const art = c.image_url ? `<img src="${esc(c.image_url)}" alt="${esc(c.name)}">` : '★';
    return `<article class="card char-card" style="border:1.5px solid rgba(242,168,29,0.3);">
      <div class="avatar" aria-hidden="true">${art}</div>
      <h3 class="card-title">${esc(c.name)} ${mult}</h3>
      <p class="meta">${esc(c.description || '')}</p>
      <button class="btn btn-small" data-buy="${esc(c.id)}" data-cost="${Number(c.unlock_cost)}" data-name="${esc(c.name)}" type="button" style="background:linear-gradient(135deg,#F2A81D,#D08B10);color:#3D2000;font-weight:700;">ซื้อด้วย ${Number(c.unlock_cost)} โทเคน</button>
    </article>`;
  }).join('');
}

// Unlock / Buy events
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-unlock], [data-buy]');
  if (!b) return;
  const id = b.dataset.unlock || b.dataset.buy;
  const name = b.dataset.name;
  const cost = Number(b.dataset.cost) || 0;

  const ok = await confirmDialog({
    title: 'ปลดล็อกตัวละคร',
    message: `ใช้ ${cost} โทเคน เพื่อปลดล็อกตัวละคร "${name}" หรือไม่?`,
    confirmLabel: 'ปลดล็อกทันที'
  });
  if (!ok) return;

  const localOwned = JSON.parse(localStorage.getItem('tc_owned_characters') || '[]');
  if (!localOwned.includes(id)) {
    localOwned.push(id);
    localStorage.setItem('tc_owned_characters', JSON.stringify(localOwned));
  }

  // Try DB rpc if available
  try { await supabase.rpc('unlock_character', { p_character_id: id }); } catch {}

  toast(`🎉 ปลดล็อกตัวละคร "${name}" สำเร็จ!`);
  load().catch(console.error);
});

(async () => {
  try {
    await load();
    await loadStore();
    if ($('status')) $('status').hidden = true;
    if ($('content')) $('content').hidden = false;
  } catch (e) {
    console.error(e);
    if ($('status')) $('status').textContent = 'Could not load your collection. Please try again.';
  }
})();
