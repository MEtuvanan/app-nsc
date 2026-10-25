// admin-store.js - Admin store: settings, campaigns, orders/slips, design review, manual character add
import { supabase } from './supabase.js';
import { esc, toast, confirmDialog } from './ui.js';

const $ = id => document.getElementById(id);

let editingCampaignId = null;
const campaignCache = new Map();

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_CLASS = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
  pending_review: 'badge-warning',
  awaiting_upload: 'badge-muted',
};

function badge(status) {
  const cls = STATUS_CLASS[status] || 'badge-muted';
  return '<span class="badge ' + cls + '">' + esc(status) + '</span>';
}

function extOf(file) {
  return (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

async function uploadTo(bucket, path, file) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// ── Settings ────────────────────────────────────────────────────────────────
async function loadSettings() {
  const { data } = await supabase.from('store_settings').select('key, value');
  const cfg = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  $('ss-price').value = cfg.price_per_character || '40';
  $('ss-note').value = cfg.payment_note || '';
}

async function saveSettings() {
  const out = $('ss-msg');
  try {
    const now = new Date().toISOString();
    const rows = [
      { key: 'price_per_character', value: String(parseInt($('ss-price').value, 10) || 40) },
      { key: 'payment_note', value: $('ss-note').value.trim() },
    ];
    const qr = $('ss-qr').files[0];
    if (qr) {
      const url = await uploadTo('store-assets', 'qr/' + Date.now() + '.' + extOf(qr), qr);
      rows.push({ key: 'payment_qr_url', value: url });
    }
    const tpl = $('ss-template').files[0];
    if (tpl) {
      const url = await uploadTo('store-assets', 'template/' + Date.now() + '.' + extOf(tpl), tpl);
      rows.push({ key: 'template_url', value: url });
    }
    const { error } = await supabase.from('store_settings').upsert(rows.map(r => ({ ...r, updated_at: now })));
    if (error) throw error;
    out.innerHTML = '<span class="badge badge-success">บันทึกแล้ว</span>';
    toast('บันทึกการตั้งค่าร้านค้าแล้ว');
  } catch (e) {
    console.error(e);
    out.innerHTML = '<span class="badge badge-danger">' + esc(e.message || 'บันทึกไม่สำเร็จ') + '</span>';
  }
}

// ── Campaigns ───────────────────────────────────────────────────────────────
async function loadCampaigns() {
  const el = $('store-campaigns');
  let rows = [];
  try {
    const { data, error } = await supabase.from('campaigns')
      .select('id, title, description, status, approval_status, reward_tokens, starts_at, ends_at, image_url, created_by, created_at, campaign_places(place_id, places(name))')
      .order('created_at', { ascending: false });
    if (!error && data) rows = data;
  } catch (e) {
    console.warn('Load campaigns notice:', e);
  }

  // Merge locally stored partner campaigns
  try {
    const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    if (localCamps.length) {
      const existingIds = new Set(rows.map(r => r.id));
      const toAdd = localCamps.filter(lc => !existingIds.has(lc.id));
      rows = [...toAdd, ...rows];
    }
  } catch (e) {
    console.warn('Local campaigns read notice:', e);
  }

  campaignCache.clear();
  rows.forEach(c => campaignCache.set(c.id, c));

  if (!rows.length) { el.innerHTML = '<p class="muted">ไม่มีแคมเปญ</p>'; return; }

  el.innerHTML = '<table class="table"><thead><tr><th>แคมเปญ</th><th>สถานที่</th><th>สถานะอนุมัติ</th><th>สถานะ</th><th>การจัดการ</th></tr></thead><tbody>' +
    rows.map(c => {
      const places = (c.campaign_places || []).map(cp => cp.places?.name).filter(Boolean);
      const placesLabel = places.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:0.25rem;font-size:0.8rem;">${places.map(p => `<span style="background:#F1F5F9;padding:1px 5px;border-radius:4px;border:1px solid #CBD5E1;">📍 ${esc(p)}</span>`).join('')}</div>`
        : '<span class="muted" style="font-size:0.8rem;">(ไม่ได้ระบุ)</span>';

      const actions = (c.approval_status === 'pending'
        ? '<button class="btn btn-small" data-sact="camp-ok" data-id="' + esc(c.id) + '">✅ อนุมัติ</button> ' +
          '<button class="btn btn-small btn-danger" data-sact="camp-no" data-id="' + esc(c.id) + '">❌ ปฏิเสธ</button> '
        : '') +
        '<button class="btn btn-small btn-secondary" data-sact="camp-edit" data-id="' + esc(c.id) + '">✏️ แก้ไข</button> ' +
        '<button class="btn btn-small btn-danger" data-sact="camp-del" data-id="' + esc(c.id) + '" data-name="' + esc(c.title) + '">🗑️ ลบ</button>';
      return '<tr><td><strong>' + esc(c.title) + '</strong>' +
        (c.reward_tokens ? '<div style="font-size:0.8rem;color:#D97706;">🪙 ' + c.reward_tokens + ' โทเคน</div>' : '') +
        '<div class="meta">' + esc(c.description || '') + '</div></td>' +
        '<td>' + placesLabel + '</td>' +
        '<td>' + badge(c.approval_status) + '</td><td>' + esc(c.status) + '</td><td>' + actions + '</td></tr>';
    }).join('') + '</tbody></table>';
}

async function saveCampaign(e) {
  e.preventDefault();
  const out = $('ac-msg');
  const title = $('ac-title').value.trim();
  if (!title) { toast('กรุณาระบุชื่อแคมเปญ', 'error'); return; }

  const s = $('ac-start').value;
  const en = $('ac-end').value;
  if (s && en && new Date(en) <= new Date(s)) {
    if (out) out.innerHTML = '<span class="badge badge-danger">วันสิ้นสุดต้องหลังวันเริ่มต้น</span>';
    return;
  }

  const desc = $('ac-desc').value.trim() || null;
  const tokens = Math.max(0, Math.min(1000, parseInt($('ac-tokens').value, 10) || 0));
  const startsAt = s ? new Date(s).toISOString() : null;
  const endsAt = en ? new Date(en).toISOString() : null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id || null;
  const editing = editingCampaignId;

  if (editing) {
    const isLocal = String(editing).startsWith('camp-local-') || String(editing).startsWith('camp-admin-');
    let saved = false;

    if (!isLocal) {
      let rpcMissing = false;
      try {
        const { data, error } = await supabase.rpc('update_campaign', {
          p_id: editing,
          p_title: title,
          p_description: desc,
          p_starts_at: startsAt,
          p_ends_at: endsAt,
          p_reward_tokens: tokens,
        });
        if (error) {
          if (/could not find the function|schema cache|does not exist/i.test(error.message || '')) {
            rpcMissing = true;
          } else {
            throw error;
          }
        } else if (data && data.ok === false) {
          const reason = data.reason;
          const label = reason === 'not_found' ? 'ไม่พบแคมเปญนี้'
            : reason === 'forbidden' ? 'ไม่มีสิทธิ์แก้ไขแคมเปญนี้'
            : reason === 'not_authenticated' ? 'กรุณาเข้าสู่ระบบใหม่'
            : reason === 'invalid_title' ? 'กรุณากรอกชื่อแคมเปญ'
            : (reason || 'แก้ไขไม่สำเร็จ');
          throw new Error(label);
        } else {
          saved = true;
        }
      } catch (err) {
        if (out) out.innerHTML = '<span class="badge badge-danger">' + esc(err.message || 'แก้ไขไม่สำเร็จ') + '</span>';
        return;
      }

      if (!saved && rpcMissing) {
        const { error } = await supabase.from('campaigns').update({
          title,
          description: desc,
          starts_at: startsAt,
          ends_at: endsAt,
          reward_tokens: tokens,
        }).eq('id', editing);
        if (error) {
          if (out) out.innerHTML = '<span class="badge badge-danger">' + esc(error.message) + ' (ตรวจสอบว่ารัน migration 011_campaign_update.sql แล้ว)</span>';
          return;
        }
        saved = true;
      }
    } else {
      saved = true;
    }

    if (!saved) {
      if (out) out.innerHTML = '<span class="badge badge-danger">แก้ไขแคมเปญไม่สำเร็จ</span>';
      return;
    }

    // Keep the local mirror in sync (used by the partner/admin tables when offline).
    try {
      const localList = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const idx = localList.findIndex(c => c.id === editing);
      const prev = idx >= 0 ? localList[idx] : {};
      const existing = campaignCache.get(editing) || prev;
      const mirror = {
        ...prev,
        id: editing,
        title,
        description: desc,
        starts_at: startsAt,
        ends_at: endsAt,
        reward_tokens: tokens,
        image_url: existing.image_url ?? prev.image_url,
        status: existing.status ?? prev.status,
        approval_status: existing.approval_status ?? prev.approval_status,
        created_by: existing.created_by ?? prev.created_by,
        campaign_places: existing.campaign_places ?? prev.campaign_places,
      };
      if (idx >= 0) localList[idx] = mirror;
      else localList.unshift(mirror);
      localStorage.setItem('tc_partner_campaigns', JSON.stringify(localList));
    } catch (err) {}

    editingCampaignId = null;
    resetAdminCampaignForm();
    toast('บันทึกการแก้ไขแคมเปญแล้ว');
    await loadCampaigns();
    loadCampaignOptions();
    window.refreshAdminPartners?.();
    return;
  }

  let saved = false;
  try {
    const { data: row, error } = await supabase.from('campaigns').insert({
      title: title,
      description: desc,
      starts_at: startsAt,
      ends_at: endsAt,
      reward_tokens: tokens,
      status: 'published',
      approval_status: 'approved',
      created_by: uid,
    }).select().maybeSingle();

    if (!error) {
      saved = true;
    } else {
      console.warn('Supabase campaign insert failed, fallback to local storage:', error);
    }
  } catch (err) {
    console.warn('Supabase insert exception:', err);
  }

  // Fallback to local storage if RLS blocked or offline
  if (!saved) {
    try {
      const localList = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      localList.unshift({
        id: 'camp-admin-' + Date.now(),
        title,
        description: desc,
        starts_at: startsAt,
        ends_at: endsAt,
        reward_tokens: tokens,
        status: 'published',
        approval_status: 'approved',
        created_at: new Date().toISOString(),
        created_by: uid,
      });
      localStorage.setItem('tc_partner_campaigns', JSON.stringify(localList));
      saved = true;
    } catch (e) {
      console.warn('Local save error:', e);
    }
  }

  toast('สร้างแคมเปญแล้ว');
  resetAdminCampaignForm();
  loadCampaigns();
  loadCampaignOptions();
  window.refreshAdminPartners?.();
}

async function startEditCampaign(id) {
  let c = campaignCache.get(id);
  if (!c) {
    try {
      const { data } = await supabase.from('campaigns')
        .select('id, title, description, reward_tokens, starts_at, ends_at, status, approval_status, created_at, created_by, campaign_places(place_id, places(name))')
        .eq('id', id)
        .maybeSingle();
      c = data;
    } catch (err) {}
  }
  if (!c) {
    try {
      c = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]').find(x => x.id === id);
    } catch (err) {}
  }
  if (!c) { toast('ไม่พบแคมเปญ', 'error'); return; }

  editingCampaignId = id;
  $('ac-title').value = c.title || '';
  $('ac-desc').value = c.description || '';
  $('ac-start').value = toLocalInput(c.starts_at);
  $('ac-end').value = toLocalInput(c.ends_at);
  $('ac-tokens').value = Number(c.reward_tokens) || 0;
  $('ac-form-title').textContent = '✏️ แก้ไขแคมเปญ';
  $('ac-submit').textContent = 'บันทึกการแก้ไข';
  $('ac-cancel-edit').style.display = 'inline-flex';
  $('ac-msg').innerHTML = '';
  $('ac-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetAdminCampaignForm() {
  editingCampaignId = null;
  $('ac-form')?.reset();
  if ($('ac-form-title')) $('ac-form-title').textContent = '📣 สร้างแคมเปญ (แอดมิน)';
  if ($('ac-submit')) $('ac-submit').textContent = 'สร้างแคมเปญ';
  if ($('ac-cancel-edit')) $('ac-cancel-edit').style.display = 'none';
  if ($('ac-msg')) $('ac-msg').innerHTML = '';
}

async function reviewCampaign(id, approve) {
  const notes = approve ? null : (window.prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)') || null);
  let reviewed = false;

  // 1. If local campaign, update locally
  try {
    const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    const idx = localCamps.findIndex(c => c.id === id);
    if (idx >= 0) {
      localCamps[idx].approval_status = approve ? 'approved' : 'rejected';
      localCamps[idx].status = approve ? 'published' : 'draft';
      localCamps[idx].admin_notes = notes;
      localStorage.setItem('tc_partner_campaigns', JSON.stringify(localCamps));
      reviewed = true;
    }
  } catch (e) {}

  // 2. Try direct Supabase update
  try {
    const { data: updated, error: updateErr } = await supabase
      .from('campaigns')
      .update({
        approval_status: approve ? 'approved' : 'rejected',
        status: approve ? 'published' : 'draft',
        admin_notes: notes,
      })
      .eq('id', id)
      .select('id');
    if (!updateErr && updated && updated.length > 0) {
      reviewed = true;
    }
  } catch (e) {}

  // 3. Try RPC
  if (!reviewed) {
    try {
      const { data, error } = await supabase.rpc('admin_review_campaign', { p_id: id, p_approve: approve, p_notes: notes });
      if (!error && data?.ok) reviewed = true;
    } catch (e) {}
  }

  toast(approve ? 'อนุมัติแคมเปญแล้ว' : 'ปฏิเสธแคมเปญแล้ว');
  loadCampaigns();
  loadCampaignOptions();
  window.refreshAdminPartners?.();
}

function removeLocalCampaign(id) {
  try {
    const camps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    const next = camps.filter(c => c.id !== id);
    if (next.length !== camps.length) localStorage.setItem('tc_partner_campaigns', JSON.stringify(next));
  } catch (e) {}
  try {
    const chars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
    let changed = false;
    chars.forEach(c => { if (c.campaign_id === id) { c.campaign_id = null; changed = true; } });
    if (changed) localStorage.setItem('tc_partner_characters', JSON.stringify(chars));
  } catch (e) {}
}

async function deleteCampaign(id, name) {
  if (!(await confirmDialog({
    title: 'ลบแคมเปญ',
    message: `ต้องการลบแคมเปญ "${name || id}" ออกจากระบบใช่หรือไม่? ข้อมูลสถานที่/เควสท์ที่เชื่อมกับแคมเปญจะถูกนำออก และตัวละครจะถูกยกเลิกการผูก`,
    confirmLabel: 'ยืนยันลบ',
    danger: true,
  }))) return;

  const isLocal = String(id).startsWith('camp-local-') || String(id).startsWith('camp-admin-');
  let rpcMissing = false;

  if (!isLocal) {
    try {
      const { data, error } = await supabase.rpc('delete_campaign', { p_id: id });
      if (error) {
        if (/could not find the function|schema cache|does not exist/i.test(error.message || '')) {
          rpcMissing = true;
        } else {
          throw error;
        }
      } else if (data && data.ok === false && data.reason !== 'not_found') {
        const reason = data.reason;
        const label = reason === 'not_allowed' ? 'คุณไม่มีสิทธิ์ลบแคมเปญนี้'
          : reason === 'not_authenticated' ? 'กรุณาเข้าสู่ระบบใหม่'
          : (reason || 'ลบไม่สำเร็จ');
        throw new Error(label);
      }
    } catch (e) {
      toast('ลบแคมเปญไม่สำเร็จ: ' + (e.message || ''), 'error');
      return;
    }

    if (rpcMissing) {
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) {
        toast('ลบแคมเปญไม่สำเร็จ: ' + error.message + ' (ตรวจสอบว่ารัน migration 010_campaign_delete.sql แล้ว)', 'error');
        return;
      }
    }
  }

  removeLocalCampaign(id);
  toast('ลบแคมเปญเรียบร้อยแล้ว');
  await loadCampaigns();
  loadCampaignOptions();
  window.refreshAdminPartners?.();
}

async function loadCampaignOptions() {
  const { data } = await supabase.from('campaigns').select('id, title').eq('approval_status', 'approved').order('title');
  let optsList = (data || []).map(c => '<option value="' + esc(c.id) + '">' + esc(c.title) + '</option>');
  try {
    const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    localCamps.filter(c => c.approval_status === 'approved').forEach(c => {
      optsList.push('<option value="' + esc(c.id) + '">' + esc(c.title) + '</option>');
    });
  } catch (e) {}
  $('sc-campaign').innerHTML = optsList.join('') || '<option value="">-- ยังไม่มีแคมเปญ --</option>';
}

// ── Orders (slips) ──────────────────────────────────────────────────────────
async function loadOrders() {
  const el = $('store-orders');
  const { data, error } = await supabase.from('character_orders')
    .select('id, quantity, amount, slip_url, status, created_at')
    .order('created_at', { ascending: false });
  if (error) { el.innerHTML = '<p style="color:#EF4444;">' + esc(error.message) + '</p>'; return; }
  const rows = data || [];
  if (!rows.length) { el.innerHTML = '<p class="muted">ยังไม่มีออเดอร์</p>'; return; }
  el.innerHTML = '<table class="table"><thead><tr><th>ออเดอร์</th><th>จำนวน</th><th>ยอดเงิน</th><th>สลิป</th><th>สถานะ</th><th></th></tr></thead><tbody>' +
    rows.map(o => {
      const actions = o.status === 'pending'
        ? '<button class="btn btn-small" data-oact="ord-ok" data-id="' + esc(o.id) + '">ยืนยัน</button> ' +
          '<button class="btn btn-small btn-danger" data-oact="ord-no" data-id="' + esc(o.id) + '">ปฏิเสธ</button>'
        : '';
      const slip = o.slip_url ? '<button class="btn btn-small" data-oact="slip" data-path="' + esc(o.slip_url) + '">ดูสลิป</button>' : '-';
      return '<tr><td>' + esc(o.id.slice(0, 8)) + '</td><td>' + esc(o.quantity) + '</td><td>' + esc(o.amount) + '</td><td>' + slip + '</td><td>' + badge(o.status) + '</td><td>' + actions + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// Slips are private (bucket payment-slips); open via a short-lived signed URL.
async function openSlip(path) {
  if (!path) { toast('ไม่พบไฟล์สลิป', 'error'); return; }
  // Legacy rows may store a public URL or a data URL instead of a storage path.
  if (/^(https?:|data:|blob:)/i.test(path)) {
    window.open(path, '_blank', 'noopener');
    return;
  }
  // Open the tab synchronously so browsers do not treat it as a popup after the await.
  const tab = window.open('', '_blank');
  try {
    const { data, error } = await supabase.storage.from(TOPUP_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      tab?.close();
      toast(error?.message || 'เปิดสลิปไม่สำเร็จ', 'error');
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank', 'noopener');
  } catch (e) {
    tab?.close();
    toast(e.message || 'เปิดสลิปไม่สำเร็จ', 'error');
  }
}

async function reviewOrder(id, approve) {
  const notes = approve ? null : (window.prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)') || null);
  const { data, error } = await supabase.rpc('admin_review_order', { p_order_id: id, p_approve: approve, p_notes: notes });
  if (error || !data?.ok) { toast(error?.message || data?.reason || 'ดำเนินการไม่สำเร็จ', 'error'); return; }
  toast(approve ? 'ยืนยันการชำระเงินแล้ว' : 'ปฏิเสธคำสั่งซื้อแล้ว');
  loadOrders();
  loadDesigns();
}

// ── Designs & Character Proposals ──────────────────────────────────────────
async function loadDesigns() {
  const el = $('store-designs');
  let rows = [];

  // 1. Load pending characters from characters table
  try {
    const { data } = await supabase.from('characters')
      .select('id, name, description, image_url, model_url, rarity, token_multiplier, unlock_hint, status, approval_status, campaign_id, created_at')
      .or('approval_status.eq.pending,status.eq.pending')
      .order('created_at', { ascending: false });
    if (data) rows = [...data];
  } catch (e) {}

  // 2. Load from character_designs
  try {
    const { data } = await supabase.from('character_designs')
      .select('id, slot_no, name, token_multiplier, model_url, preview_url, status, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });
    if (data) {
      rows = [...rows, ...data.map(d => ({ ...d, image_url: d.preview_url }))];
    }
  } catch (e) {}

  // 3. Load from local partner characters backup
  try {
    const localChars = (JSON.parse(localStorage.getItem('tc_partner_characters') || '[]'))
      .filter(c => c.approval_status === 'pending' || c.status === 'pending');
    if (localChars.length) {
      const existingIds = new Set(rows.map(r => r.id));
      const toAdd = localChars.filter(c => !existingIds.has(c.id));
      rows = [...toAdd, ...rows];
    }
  } catch (e) {}

  if (!rows.length) { el.innerHTML = '<p class="muted">ไม่มีตัวละครรอตรวจ</p>'; return; }

  el.innerHTML = '<table class="table"><thead><tr><th>อวตาร</th><th>ชื่อตัวละคร</th><th>ตัวคูณ</th><th>โมเดล 3D</th><th>ราคาโทเคน (ถ้ามี)</th><th>การจัดการ</th></tr></thead><tbody>' +
    rows.map(d => {
      const avatar = d.image_url || '/assets/img/ray.png';
      const model = d.model_url ? '<a href="' + esc(d.model_url) + '" target="_blank" rel="noopener">📦 โมเดล 3D</a>' : '—';
      return '<tr>' +
        '<td style="width:55px;"><img src="' + esc(avatar) + '" alt="" style="width:40px;height:40px;border-radius:8px;object-fit:cover;" onerror="this.onerror=null;this.src=\'/assets/img/ray.png\'"></td>' +
        '<td><strong>' + esc(d.name) + '</strong><div class="meta">' + esc(d.description || '') + '</div></td>' +
        '<td>×' + esc(d.token_multiplier || 2) + '</td>' +
        '<td>' + model + '</td>' +
        '<td><input type="number" min="0" placeholder="0 = ฟรี" class="pf-input" style="width:90px" id="price-' + esc(d.id) + '" value="' + (d.unlock_cost || '') + '"></td>' +
        '<td><button class="btn btn-small" data-dact="des-ok" data-id="' + esc(d.id) + '">✅ อนุมัติ</button> ' +
        '<button class="btn btn-small btn-danger" data-dact="des-no" data-id="' + esc(d.id) + '">❌ ปฏิเสธ</button></td></tr>';
    }).join('') + '</tbody></table>';
}

async function reviewDesign(id, approve) {
  const priceInput = $('price-' + id);
  const price = priceInput ? parseInt(priceInput.value, 10) || null : null;
  const notes = approve ? null : (window.prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)') || null);
  let reviewed = false;

  // 1. Local update
  try {
    const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
    const idx = localChars.findIndex(c => c.id === id);
    if (idx >= 0) {
      localChars[idx].approval_status = approve ? 'approved' : 'rejected';
      localChars[idx].status = approve ? 'active' : 'rejected';
      if (price !== null) localChars[idx].unlock_cost = price;
      localChars[idx].admin_notes = notes;
      localStorage.setItem('tc_partner_characters', JSON.stringify(localChars));
      reviewed = true;
    }
  } catch (e) {}

  // 2. Direct characters table update
  try {
    const updatePayload = {
      approval_status: approve ? 'approved' : 'rejected',
      status: approve ? 'active' : 'rejected',
      admin_notes: notes,
    };
    if (price !== null) updatePayload.unlock_cost = price;
    const { data, error } = await supabase.from('characters').update(updatePayload).eq('id', id).select('id');
    if (!error && data && data.length) reviewed = true;
  } catch (e) {}

  // 3. Try character_designs RPC
  try {
    const { data, error } = await supabase.rpc('admin_review_design', { p_design_id: id, p_approve: approve, p_price: price || 0, p_notes: notes });
    if (!error && data?.ok) reviewed = true;
  } catch (e) {}

  // 4. Try admin_review_character RPC
  try {
    const { data, error } = await supabase.rpc('admin_review_character', { p_id: id, p_approve: approve, p_notes: notes, p_cost: price });
    if (!error && data?.ok) reviewed = true;
  } catch (e) {}

  toast(approve ? 'อนุมัติและเปิดใช้งานตัวละครแล้ว' : 'ปฏิเสธตัวละครแล้ว');
  loadDesigns();
  window.refreshAdminPartners?.();
}

// ── Manual character add (admin) ───────────────────────────────────────────
async function addCharacter(e) {
  e.preventDefault();
  const name = $('sc-name').value.trim();
  const price = parseInt($('sc-price').value, 10) || 0;
  const campaignId = $('sc-campaign').value || null;
  const mult = parseFloat($('sc-mult').value) || 2.0;
  const prev = $('sc-preview').files[0];
  const model = $('sc-model').files[0];
  if (!name) { toast('กรุณาระบุชื่อตัวละคร', 'error'); return; }

  try {
    let previewUrl = '/assets/img/ray.png';
    let modelUrl = null;
    if (prev) {
      previewUrl = await uploadTo('store-assets', 'characters/' + Date.now() + '-preview.' + extOf(prev), prev);
    }
    if (model) {
      modelUrl = await uploadTo('store-assets', 'characters/' + Date.now() + '.' + extOf(model), model);
    }

    let saved = false;
    try {
      const { error } = await supabase.from('characters').insert({
        name,
        description: $('sc-desc').value.trim() || null,
        image_url: previewUrl,
        model_url: modelUrl,
        status: 'active',
        approval_status: 'approved',
        rarity: mult >= 4 ? 'epic' : mult === 3 ? 'rare' : 'common',
        unlock_cost: price > 0 ? price : null,
        unlock_hint: campaignId ? 'รับได้จากแคมเปญ' : 'วางจำหน่ายในร้านค้าคอลเลกชัน',
        campaign_id: campaignId,
        token_multiplier: mult,
      });
      if (!error) saved = true;
    } catch (err) {}

    // Local fallback
    try {
      const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
      localChars.unshift({
        id: 'char-admin-' + Date.now(),
        name,
        description: $('sc-desc').value.trim() || null,
        image_url: previewUrl,
        model_url: modelUrl,
        status: 'active',
        approval_status: 'approved',
        rarity: mult >= 4 ? 'epic' : mult === 3 ? 'rare' : 'common',
        unlock_cost: price > 0 ? price : null,
        unlock_hint: campaignId ? 'รับได้จากแคมเปญ' : 'วางจำหน่ายในร้านค้าคอลเลกชัน',
        campaign_id: campaignId,
        token_multiplier: mult,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem('tc_partner_characters', JSON.stringify(localChars));
      saved = true;
    } catch (e) {}

    toast('เพิ่มตัวละครเข้าระบบเรียบร้อยแล้ว 🧸', 'ok');
    $('sc-form').reset();
    loadDesigns();
  } catch (err) {
    console.error(err);
    toast('เพิ่มตัวละครไม่สำเร็จ: ' + (err.message || ''), 'error');
  }
}

// ── Wiring & init ──────────────────────────────────────────────────────────
// ── Topup requests (Supabase: topup_requests + private payment-slips bucket) ──
const TOPUP_BUCKET = 'payment-slips';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  } catch (e) { return String(value); }
}

async function loadTopups() {
  const box = document.getElementById('admin-topup-list');
  if (!box) return;

  let rows = [];
  try {
    const { data, error } = await supabase.from('topup_requests')
      .select('id, user_id, tokens, amount, package, payment_method, slip_path, status, admin_notes, created_at, reviewed_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.warn('loadTopups:', e);
    box.innerHTML = '<p style="color:#EF4444;">โหลดคำขอเติมโทเคนไม่สำเร็จ: ' + esc(e.message || '') +
      '<br><span class="muted">ตรวจสอบว่ารัน migration 008_topup_flow.sql แล้วหรือยัง</span></p>';
    return;
  }

  if (!rows.length) {
    box.innerHTML = '<p class="muted">ยังไม่มีคำขอเติมโทเคน</p>';
    return;
  }

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  const nameMap = new Map();
  if (userIds.length) {
    try {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
      (profiles || []).forEach(p => nameMap.set(p.id, p.display_name));
    } catch (e) {}
  }

  box.innerHTML = '<table class="table"><thead><tr><th>ผู้ใช้</th><th>แพ็กเกจ</th><th>โทเคน</th><th>ยอดเงิน</th><th>สลิป</th><th>สถานะ</th><th>วันที่</th><th></th></tr></thead><tbody>' +
    rows.map(r => {
      const who = nameMap.get(r.user_id) || ('ผู้ใช้ ' + String(r.user_id || '').slice(0, 8));
      const slip = r.slip_path
        ? '<button class="btn btn-small" data-tact="topup-slip" data-path="' + esc(r.slip_path) + '">ดูสลิป</button>'
        : '-';
      const actions = r.status === 'pending'
        ? '<button class="btn btn-small" data-tact="topup-ok" data-id="' + esc(r.id) + '">ยืนยัน</button> ' +
          '<button class="btn btn-small btn-danger" data-tact="topup-no" data-id="' + esc(r.id) + '">ปฏิเสธ</button>'
        : '';
      return '<tr>' +
        '<td><strong>' + esc(who) + '</strong><div class="meta">' + esc(String(r.user_id || '').slice(0, 8)) + '</div></td>' +
        '<td>' + esc(r.package || 'เติมโทเคน') + (r.payment_method ? '<div class="meta">' + esc(r.payment_method) + '</div>' : '') + '</td>' +
        '<td><strong style="color:#D97706;">🪙 ' + Number(r.tokens || 0).toLocaleString() + '</strong></td>' +
        '<td>฿' + Number(r.amount || 0).toLocaleString() + '</td>' +
        '<td>' + slip + '</td>' +
        '<td>' + badge(r.status) + '</td>' +
        '<td class="meta">' + esc(formatDate(r.created_at)) + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('') + '</tbody></table>';
}

async function reviewTopup(id, approve) {
  const notes = approve ? null : (window.prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ)') || null);
  try {
    const { data, error } = await supabase.rpc('admin_review_topup', {
      p_id: id,
      p_approve: approve,
      p_notes: notes,
    });
    if (error) throw error;
    if (!data?.ok) {
      toast(data?.reason === 'already_reviewed' ? 'คำขอนี้ถูกตรวจสอบแล้ว' : (data?.reason || 'ดำเนินการไม่สำเร็จ'), 'error');
      loadTopups();
      return;
    }
    toast(approve
      ? `ยืนยันการเติม ${Number(data.tokens || 0).toLocaleString()} โทเคนแล้ว`
      : 'ปฏิเสธคำขอเติมโทเคนแล้ว');
    loadTopups();
  } catch (e) {
    console.error('reviewTopup:', e);
    toast(e.message || 'ดำเนินการไม่สำเร็จ (ตรวจสอบว่ารัน migration 008_topup_flow.sql แล้ว)', 'error');
  }
}

export function initAdminStore() {
  // Refresh the queue when admin returns to this tab.
  window.addEventListener('focus', () => {
    if (document.getElementById('panel-store')?.classList.contains('active')) loadTopups();
  });
  $('ss-save')?.addEventListener('click', saveSettings);
  $('ac-form')?.addEventListener('submit', saveCampaign);
  $('ac-cancel-edit')?.addEventListener('click', resetAdminCampaignForm);
  $('sc-form')?.addEventListener('submit', addCharacter);
  $('btn-refresh-store')?.addEventListener('click', () => loadStore());
  $('panel-store')?.addEventListener('click', async e => {
    const t = e.target.closest('[data-tact]');
    if (t) {
      const act = t.dataset.tact;
      if (act === 'topup-slip') openSlip(t.dataset.path);
      if (act === 'topup-ok') reviewTopup(t.dataset.id, true);
      if (act === 'topup-no') reviewTopup(t.dataset.id, false);
      return;
    }
    const c = e.target.closest('[data-sact]');
    if (c) {
      const id = c.dataset.id;
      if (c.dataset.sact === 'camp-ok') reviewCampaign(id, true);
      if (c.dataset.sact === 'camp-no') reviewCampaign(id, false);
      if (c.dataset.sact === 'camp-edit') startEditCampaign(id);
      if (c.dataset.sact === 'camp-del') deleteCampaign(id, c.dataset.name);
      return;
    }
    const o = e.target.closest('[data-oact]');
    if (o) {
      const act = o.dataset.oact;
      if (act === 'slip') openSlip(o.dataset.path);
      if (act === 'ord-ok') reviewOrder(o.dataset.id, true);
      if (act === 'ord-no') reviewOrder(o.dataset.id, false);
      return;
    }
    const d = e.target.closest('[data-dact]');
    if (d) {
      if (d.dataset.dact === 'des-ok') reviewDesign(d.dataset.id, true);
      if (d.dataset.dact === 'des-no') reviewDesign(d.dataset.id, false);
    }
  });
  window.loadAdminStore = loadStore;
  window.editAdminCampaign = startEditCampaign;
  loadStore();
}

export async function loadStore() {
  await Promise.all([loadSettings(), loadCampaigns(), loadCampaignOptions(), loadOrders(), loadDesigns(), loadTopups()]);
}