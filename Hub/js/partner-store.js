// partner-store.js — Partner tab: Campaigns & Characters creation, review tracking & store integration
import { supabase } from './supabase.js';
import { esc, toast } from './ui.js';

const STATUS = {
  pending: ['⏳', 'รอตรวจสอบ'],
  approved: ['✅', 'อนุมัติแล้ว'],
  rejected: ['❌', 'ไม่ผ่านการอนุมัติ'],
  active: ['✅', 'อนุมัติแล้ว (ใช้งานอยู่)'],
  draft: ['📝', 'ร่าง'],
};

const PRESET_CHAR_AVATARS = [
  { name: 'นักสำรวจ เรย์ (ชุดน้ำเงิน)', url: '/assets/img/ray.png' },
  { name: 'นักสำรวจ มายา (ชุดเหลือง-เขียว)', url: '/assets/img/maya.png' },
  { name: 'พ่อมดกลางคืน ซาเอล (ชุดม่วง)', url: '/assets/img/zael.png' },
  { name: 'พ่อมดแห่งวัด ลูน่า (ชุดแดง-ขาว)', url: '/assets/img/luna.png' },
  { name: 'Tuk-Tuk Speedy (มาสค็อตตุ๊กตุ๊ก)', url: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&auto=format&fit=crop&q=80' },
  { name: 'Guardian Yak (ยักษ์วัดแจ้ง)', url: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=400&auto=format&fit=crop&q=80' },
];

const PRESET_CAMPAIGN_COVERS = [
  { name: 'วัดอรุณราชวราราม', url: '/assets/img/Wat Arun (Temple of Dawn).webp' },
  { name: 'ริมแม่น้ำเจ้าพระยา & ท่าเรือ', url: 'https://images.unsplash.com/photo-1548940740-204726a19be3?w=800&auto=format&fit=crop&q=80' },
  { name: 'ย่านเมืองเก่า & พระบรมมหาราชวัง', url: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&auto=format&fit=crop&q=80' },
  { name: 'ตลาดน้ำและคาเฟ่ริมคลอง', url: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&auto=format&fit=crop&q=80' },
];

const badge = s => {
  const [i, l] = STATUS[s] || ['•', s || 'pending'];
  const cls = (s === 'approved' || s === 'active') ? 'approved' : s === 'rejected' ? 'rejected' : 'pending';
  return `<span class="status-badge status-${cls}">${i} ${l}</span>`;
};

const msg = (t, type = 'info') => `<div class="partner-alert ${type}" style="margin:0.75rem 0;padding:0.75rem 1rem;border-radius:10px;font-size:0.88rem;background:${type === 'error' ? '#FEF2F2' : type === 'success' ? '#ECFDF5' : '#EFF6FF'};color:${type === 'error' ? '#991B1B' : type === 'success' ? '#065F46' : '#1E40AF'};border:1px solid ${type === 'error' ? '#FCA5A5' : type === 'success' ? '#A7F3D0' : '#BFDBFE'};">${t}</div>`;

const ext = f => (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadTo(bucket, path, file) {
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (!error) {
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }
  } catch (e) {
    console.warn('Storage upload fallback:', e);
  }
  // Fallback to Data URL for client-side persistence
  return await fileToDataUrl(file);
}

export async function renderStoreTab(el, session) {
  el.innerHTML = '<div style="padding:2rem;text-align:center;color:#64748B;">⏳ กำลังโหลดข้อมูลแคมเปญและตัวละคร...</div>';
  const uid = session.user.id;
  const isAdmin = session.isAdmin || session.user?.email?.toLowerCase() === 'ttt@gmail.com';

  const [campsRes, charsRes, placesRes] = await Promise.all([
    supabase.from('campaigns')
      .select('id, title, description, image_url, status, approval_status, admin_notes, reward_tokens, starts_at, ends_at, created_at, created_by, campaign_places(place_id, places(id, name))')
      .order('created_at', { ascending: false }),
    supabase.from('characters')
      .select('id, name, description, image_url, model_url, rarity, token_multiplier, unlock_hint, status, approval_status, admin_notes, campaign_id, created_by, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('places').select('id, name, status, approval_status, created_by').order('name'),
  ]);

  let allPlaces = placesRes.data || [];
  try {
    const localPending = JSON.parse(localStorage.getItem('tc_partner_pending_places') || '[]');
    if (localPending.length) {
      const existingIds = new Set(allPlaces.map(p => p.id));
      const newLocals = localPending.filter(p => !existingIds.has(p.id));
      allPlaces = [...newLocals, ...allPlaces];
    }
  } catch (e) {}

  const myPlaceIds = new Set(allPlaces.filter(p => p.created_by === uid || (!p.created_by && isAdmin)).map(p => p.id));

  // Merge campaigns
  let campaigns = (campsRes.data || []).filter(c => {
    if (isAdmin) return true;
    if (c.created_by === uid || !c.created_by) return true;
    return (c.campaign_places || []).some(cp => myPlaceIds.has(cp.place_id));
  });

  try {
    const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
    if (localCamps.length) {
      const existingMap = new Map(campaigns.map(c => [c.id, c]));
      for (const lc of localCamps) {
        if (!isAdmin && lc.created_by && lc.created_by !== uid) continue;
        if (existingMap.has(lc.id)) {
          const ex = existingMap.get(lc.id);
          if (lc.approval_status) ex.approval_status = lc.approval_status;
          if (lc.status) ex.status = lc.status;
          if (lc.admin_notes) ex.admin_notes = lc.admin_notes;
        } else {
          campaigns.push(lc);
        }
      }
    }
  } catch (e) {}

  // Merge characters
  let characters = (charsRes.data || []).filter(c => {
    if (isAdmin) return true;
    if (c.created_by === uid) return true;
    return campaigns.some(camp => camp.id === c.campaign_id);
  });

  try {
    const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
    if (localChars.length) {
      const existingMap = new Map(characters.map(c => [c.id, c]));
      for (const lc of localChars) {
        if (!isAdmin && lc.created_by && lc.created_by !== uid) continue;
        if (existingMap.has(lc.id)) {
          const ex = existingMap.get(lc.id);
          if (lc.approval_status) ex.approval_status = lc.approval_status;
          if (lc.status) ex.status = lc.status;
          if (lc.admin_notes) ex.admin_notes = lc.admin_notes;
        } else {
          characters.push(lc);
        }
      }
    }
  } catch (e) {}

  const approvedCampaigns = campaigns.filter(c => c.approval_status === 'approved');
  const campName = id => campaigns.find(c => c.id === id)?.title || '—';

  el.innerHTML = `
    <!-- ── 1. Create Campaign Card ── -->
    <div class="add-card" style="background:#FFF;border:1.5px solid #E2E8F0;border-radius:16px;padding:1.5rem;box-shadow:0 4px 15px rgba(0,0,0,0.03);">
      <div class="add-card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid #F1F5F9;padding-bottom:0.75rem;">
        <span class="add-card-title" style="font-size:1.15rem;font-weight:700;color:#0F172A;display:flex;align-items:center;gap:0.4rem;">
          📣 สร้างแคมเปญการท่องเที่ยวใหม่ (Campaign Proposal)
        </span>
        <span style="font-size:0.75rem;background:#ECFDF5;color:#059669;padding:3px 10px;border-radius:9999px;font-weight:700;">ฟรี ไม่มีค่าธรรมเนียม</span>
      </div>
      <p style="font-size:0.88rem;color:#64748B;margin-top:-0.5rem;margin-bottom:1.25rem;">
        สร้างแคมเปญโปรโมทร้านค้าหรือสถานที่ท่องเที่ยวของคุณ กำหนดสถานที่ร่วมรายการ และแจกโทเคนหรือตัวละครพิเศษเป็นรางวัล เมื่อแอดมินอนุมัติจะแสดงในหน้าแรกและหน้าเควสท์ทันที
      </p>
      <div id="camp-msg"></div>
      <form id="camp-form" novalidate>
        <div class="pf-grid pf-grid-2">
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label">ชื่อแคมเปญ <span>*</span></label>
            <input id="cf-title" class="pf-input" maxlength="200" required placeholder="เช่น ท่องเที่ยวตามรอยคาเฟ่สุดชิค ริมสายน้ำเจ้าพระยา">
          </div>
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label">รายละเอียดแคมเปญ &amp; จุดเด่น</label>
            <textarea id="cf-desc" class="pf-textarea" maxlength="1000" rows="3" placeholder="อธิบายกิจกรรม เงื่อนไขการเข้าร่วม หรือสิทธิประโยชน์ที่จะได้รับในแคมเปญนี้..."></textarea>
          </div>

          <!-- Cover Image Option -->
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label" style="display:flex;justify-content:space-between;">
              <span>🖼️ ภาพปกแคมเปญ (Cover Image)</span>
              <span style="font-size:0.75rem;color:#64748B;">เลือกภาพตัวอย่างด่วน หรืออัปโหลดไฟล์ / ระบุ URL</span>
            </label>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem;">
              ${PRESET_CAMPAIGN_COVERS.map((p, idx) => `
                <button type="button" class="btn btn-secondary btn-small cf-preset-cover" data-url="${esc(p.url)}" style="font-size:0.78rem;padding:0.25rem 0.6rem;">
                  📷 ${esc(p.name)}
                </button>
              `).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1fr auto;gap:0.5rem;">
              <input id="cf-img-url" class="pf-input" placeholder="https://... หรืออัปโหลดไฟล์ด้านขวา">
              <input id="cf-img-file" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">
              <button type="button" class="btn btn-secondary btn-small" id="cf-img-btn" style="white-space:nowrap;">📁 เลือกไฟล์รูป</button>
            </div>
            <div id="cf-cover-preview-box" style="margin-top:0.5rem;display:none;">
              <img id="cf-cover-preview" src="" alt="Cover preview" style="max-height:140px;border-radius:10px;border:1px solid #E2E8F0;object-fit:cover;">
            </div>
          </div>

          <div class="pf-field">
            <label class="pf-label">วันเริ่มต้นแคมเปญ</label>
            <input id="cf-start" class="pf-input" type="datetime-local">
          </div>
          <div class="pf-field">
            <label class="pf-label">วันสิ้นสุดแคมเปญ</label>
            <input id="cf-end" class="pf-input" type="datetime-local">
          </div>
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label">โทเคนรางวัลรวมเมื่อทำสำเร็จ (Tokens: 0–1000)</label>
            <input id="cf-tokens" class="pf-input" type="number" min="0" max="1000" value="100" placeholder="100">
          </div>

          <!-- Places Multi-select -->
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
              <span>📍 สถานที่ของแคมเปญ (เลือกสถานที่ที่เข้าร่วม — เลือกได้หลายที่)</span>
              <span id="cf-places-count" style="font-size:0.82rem;font-weight:600;color:#059669;">เลือกแล้ว 0 แห่ง</span>
            </label>
            <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
              <input id="cf-place-filter" class="pf-input" type="search" placeholder="🔍 ค้นหาสถานที่..." style="padding:0.4rem 0.65rem;font-size:0.85rem;flex:1;">
              <button class="btn btn-secondary btn-small" type="button" id="cf-places-clear" style="white-space:nowrap;padding:0.35rem 0.65rem;font-size:0.8rem;">ล้างที่เลือก</button>
            </div>
            <div id="cf-places-box" style="max-height:190px;overflow-y:auto;border:1.5px solid #E2E8F0;border-radius:10px;padding:0.5rem;background:#F8FAFC;display:flex;flex-direction:column;gap:0.35rem;">
              ${allPlaces.length ? allPlaces.map(p => {
                const isMine = p.created_by === uid;
                return `<label class="cf-place-item" style="display:flex;align-items:center;gap:0.55rem;padding:0.4rem 0.6rem;background:#FFF;border:1px solid #E2E8F0;border-radius:6px;cursor:pointer;font-size:0.85rem;user-select:none;">
                  <input type="checkbox" class="cf-place-chk" value="${esc(p.id)}" style="cursor:pointer;width:16px;height:16px;accent-color:#059669;">
                  <span class="cf-place-name" style="flex:1;font-weight:500;">${esc(p.name)}</span>
                  ${isMine ? '<span style="font-size:0.72rem;background:#ECFDF5;color:#059669;padding:2px 6px;border-radius:4px;font-weight:700;">สถานที่ของคุณ</span>' : ''}
                </label>`;
              }).join('') : '<div style="color:#94A3B8;font-size:0.85rem;padding:0.75rem;text-align:center;">ยังไม่มีสถานที่ในระบบ คุณสามารถสร้างสถานที่ได้ที่แท็บ "สถานที่ของฉัน"</div>'}
            </div>
          </div>
        </div>
        <div style="margin-top:1.25rem;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.82rem;color:#64748B;">เมื่อส่งข้อมูลแล้ว แอดมินจะตรวจสอบและแจ้งผลอนุมัติ</span>
          <button class="btn" type="submit" id="cf-submit" style="padding:0.6rem 1.4rem;">📤 ส่งแคมเปญให้แอดมินตรวจสอบ</button>
        </div>
      </form>
    </div>

    <!-- ── 2. My Campaigns Table ── -->
    <div class="partner-table-wrap" style="margin-top:1.5rem;background:#FFF;border:1.5px solid #E2E8F0;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.03);">
      <div style="padding:1rem 1.25rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #F1F5F9;">
        <span style="font-size:1.05rem;color:#0F172A;">📋 แคมเปญของฉัน (${campaigns.length})</span>
        <span style="font-size:0.82rem;color:#64748B;">อนุมัติแล้ว ${approvedCampaigns.length} แคมเปญ</span>
      </div>
      <table class="partner-table" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#F8FAFC;text-align:left;font-size:0.82rem;color:#64748B;border-bottom:1px solid #E2E8F0;">
            <th style="padding:0.75rem 1rem;">ปก</th>
            <th style="padding:0.75rem 1rem;">ชื่อแคมเปญ &amp; รางวัล</th>
            <th style="padding:0.75rem 1rem;">สถานที่ที่เข้าร่วม</th>
            <th style="padding:0.75rem 1rem;">สถานะอนุมัติ</th>
            <th style="padding:0.75rem 1rem;">หมายเหตุแอดมิน</th>
          </tr>
        </thead>
        <tbody>
          ${campaigns.map(c => {
            const places = (c.campaign_places || []).map(cp => cp.places?.name).filter(Boolean);
            const placesHtml = places.length
              ? `<div style="display:flex;flex-wrap:wrap;gap:0.3rem;font-size:0.82rem;">
                  ${places.map(pn => `<span style="background:#F1F5F9;border:1px solid #CBD5E1;padding:1px 6px;border-radius:4px;color:#1E293B;">📍 ${esc(pn)}</span>`).join('')}
                </div>`
              : '<span class="muted" style="font-size:0.82rem;color:#94A3B8;">(ไม่ได้ระบุสถานที่)</span>';
            const thumb = c.image_url || '/assets/img/Wat Arun (Temple of Dawn).webp';
            return `<tr style="border-bottom:1px solid #F1F5F9;">
              <td style="padding:0.75rem 1rem;width:75px;">
                <img src="${esc(thumb)}" alt="" style="width:65px;height:45px;border-radius:6px;object-fit:cover;border:1px solid #E2E8F0;" onerror="this.onerror=null;this.src='/assets/img/Wat Arun (Temple of Dawn).webp'">
              </td>
              <td style="padding:0.75rem 1rem;">
                <strong style="color:#0F172A;font-size:0.92rem;">${esc(c.title)}</strong>
                ${c.reward_tokens ? `<div style="font-size:0.8rem;color:#D97706;font-weight:600;margin-top:2px;">🪙 รางวัล ${c.reward_tokens} โทเคน</div>` : ''}
                <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">${esc((c.description || '').slice(0, 90))}</div>
              </td>
              <td style="padding:0.75rem 1rem;">${placesHtml}</td>
              <td style="padding:0.75rem 1rem;">${badge(c.approval_status)}</td>
              <td style="padding:0.75rem 1rem;font-size:0.82rem;color:#475569;">${esc(c.admin_notes || '—')}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="muted" style="padding:2rem;text-align:center;color:#94A3B8;">ยังไม่มีแคมเปญ กรอกฟอร์มด้านบนเพื่อเริ่มสร้างแคมเปญแรกของคุณ!</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- ── 3. Propose / Add Character Card ── -->
    <div class="add-card" style="margin-top:2rem;background:#FFF;border:1.5px solid #E2E8F0;border-radius:16px;padding:1.5rem;box-shadow:0 4px 15px rgba(0,0,0,0.03);">
      <div class="add-card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid #F1F5F9;padding-bottom:0.75rem;">
        <span class="add-card-title" style="font-size:1.15rem;font-weight:700;color:#0F172A;display:flex;align-items:center;gap:0.4rem;">
          🧸 เพิ่มตัวละครประจำแคมเปญ (Character Submission)
        </span>
        <span style="font-size:0.75rem;background:#EEF2FF;color:#4F46E5;padding:3px 10px;border-radius:9999px;font-weight:700;">แจกฟรีในแคมเปญ หรือขึ้นร้านค้า</span>
      </div>
      <p style="font-size:0.88rem;color:#64748B;margin-top:-0.5rem;margin-bottom:1.25rem;">
        เสนอตัวละครหรือมาสค็อตประจำร้านค้า/แคมเปญของคุณ กำหนดตัวคูณโทเคน (×2 ถึง ×5) เพื่อเป็นแรงจูงใจให้ผู้เล่นเดินทางมาทำเควสท์ที่ร้านของคุณ ตัวละครที่ได้รับการอนุมัติจะปรากฏในหน้าแรก และหน้าร้านค้าคอลเลกชัน
      </p>

      <div id="char-msg"></div>
      <form id="char-form" novalidate>
        <div class="pf-grid pf-grid-2">
          <div class="pf-field">
            <label class="pf-label">ชื่อตัวละคร <span>*</span></label>
            <input id="chf-name" class="pf-input" maxlength="80" required placeholder="เช่น น้องช้างนำโชค, มาสค็อตชานมไข่มุก">
          </div>
          <div class="pf-field">
            <label class="pf-label">ผูกกับแคมเปญ <span>*</span></label>
            <select id="chf-camp" class="pf-select" required>
              ${campaigns.length ? campaigns.map(c => `
                <option value="${esc(c.id)}" ${c.approval_status === 'approved' ? 'selected' : ''}>
                  ${c.approval_status === 'approved' ? '✅ ' : '⏳ '}${esc(c.title)}
                </option>
              `).join('') : '<option value="">-- กรุณาสร้างแคมเปญก่อน --</option>'}
            </select>
          </div>

          <div class="pf-field">
            <label class="pf-label">ตัวคูณโทเคนพิเศษ (Token Multiplier)</label>
            <select id="chf-mult" class="pf-select">
              <option value="2.0">×2.0 เท่า (เควสท์ทั่วไป)</option>
              <option value="2.5">×2.5 เท่า</option>
              <option value="3.0">×3.0 เท่า (เควสท์ระดับกลาง)</option>
              <option value="4.0">×4.0 เท่า</option>
              <option value="5.0">×5.0 เท่า (กิจกรรมพิเศษ)</option>
            </select>
          </div>
          <div class="pf-field">
            <label class="pf-label">ระดับความหายาก (Rarity)</label>
            <select id="chf-rarity" class="pf-select">
              <option value="common">Common (ทั่วไป)</option>
              <option value="rare">Rare (หายาก)</option>
              <option value="epic" selected>Epic (พิเศษสุดคุ้ม)</option>
              <option value="legendary">Legendary (ตำนานประจำแคมเปญ)</option>
            </select>
          </div>

          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label">คำอธิบายตัวละคร &amp; เรื่องราว</label>
            <textarea id="chf-desc" class="pf-textarea" maxlength="500" rows="2" placeholder="บอกเล่าเรื่องราว จุดเด่น หรือบุคลิกของตัวละครนี้..."></textarea>
          </div>
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label">เงื่อนไขการปลดล็อก (Unlock Hint)</label>
            <input id="chf-hint" class="pf-input" maxlength="200" placeholder="เช่น เช็คอินครบ 3 แห่งในแคมเปญ หรือ ทำเควสท์ครบ 5 ภารกิจ">
          </div>

          <!-- Character Avatar Option -->
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label" style="display:flex;justify-content:space-between;">
              <span>🎨 รูปตัวละคร / อวตาร (Avatar Image) <span>*</span></span>
              <span style="font-size:0.75rem;color:#64748B;">เลือกภาพมาสค็อต หรืออัปโหลดไฟล์ของร้าน</span>
            </label>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem;">
              ${PRESET_CHAR_AVATARS.map(p => `
                <button type="button" class="btn btn-secondary btn-small chf-preset-avatar" data-url="${esc(p.url)}" style="font-size:0.78rem;padding:0.25rem 0.6rem;">
                  🧸 ${esc(p.name)}
                </button>
              `).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1fr auto;gap:0.5rem;">
              <input id="chf-img-url" class="pf-input" placeholder="ระบุ URL รูปภาพ หรือกดปุ่มอัปโหลดด้านขวา">
              <input id="chf-img-file" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;">
              <button type="button" class="btn btn-secondary btn-small" id="chf-img-btn" style="white-space:nowrap;">📁 เลือกไฟล์รูปภาพ</button>
            </div>
            <div id="chf-avatar-preview-box" style="margin-top:0.5rem;display:none;align-items:center;gap:0.75rem;">
              <img id="chf-avatar-preview" src="" alt="Avatar preview" style="width:70px;height:70px;border-radius:12px;border:1.5px solid #CBD5E1;object-fit:cover;">
              <span style="font-size:0.82rem;color:#059669;font-weight:600;">✓ เลือกรูปตัวละครเรียบร้อย</span>
            </div>
          </div>

          <!-- 3D Model Option (Optional) -->
          <div class="pf-field" style="grid-column:1/-1">
            <label class="pf-label">ไฟล์โมเดล 3D (ทางเลือกเพิ่มเติม: .glb, .gltf, .zip สำหรับ AR)</label>
            <div style="display:grid;grid-template-columns:1fr auto;gap:0.5rem;">
              <input id="chf-model-url" class="pf-input" placeholder="URL ไฟล์โมเดล 3D (ไม่บังคับ)">
              <input id="chf-model-file" type="file" accept=".glb,.gltf,.fbx,.obj,.zip" style="display:none;">
              <button type="button" class="btn btn-secondary btn-small" id="chf-model-btn" style="white-space:nowrap;">📦 เลือกไฟล์ 3D</button>
            </div>
            <div id="chf-model-name" style="font-size:0.8rem;color:#64748B;margin-top:0.25rem;"></div>
          </div>
        </div>
        <div style="margin-top:1.25rem;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.82rem;color:#64748B;">แอดมินจะตรวจสอบตัวละครและนำขึ้นสู่ระบบ</span>
          <button class="btn" type="submit" id="chf-submit" style="padding:0.6rem 1.4rem;">📤 ส่งตัวละครให้แอดมินตรวจสอบ</button>
        </div>
      </form>
    </div>

    <!-- ── 4. My Characters Table ── -->
    <div class="partner-table-wrap" style="margin-top:1.5rem;background:#FFF;border:1.5px solid #E2E8F0;border-radius:16px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.03);">
      <div style="padding:1rem 1.25rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #F1F5F9;">
        <span style="font-size:1.05rem;color:#0F172A;">🧸 ตัวละครของฉัน (${characters.length})</span>
        <span style="font-size:0.82rem;color:#64748B;">แสดงในร้านค้า &amp; คอลเลกชันเมื่ออนุมัติ</span>
      </div>
      <table class="partner-table" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#F8FAFC;text-align:left;font-size:0.82rem;color:#64748B;border-bottom:1px solid #E2E8F0;">
            <th style="padding:0.75rem 1rem;">อวตาร</th>
            <th style="padding:0.75rem 1rem;">ชื่อตัวละคร &amp; แคมเปญ</th>
            <th style="padding:0.75rem 1rem;">ตัวคูณ / ความหายาก</th>
            <th style="padding:0.75rem 1rem;">โมเดล 3D</th>
            <th style="padding:0.75rem 1rem;">สถานะอนุมัติ</th>
            <th style="padding:0.75rem 1rem;">หมายเหตุแอดมิน</th>
          </tr>
        </thead>
        <tbody>
          ${characters.map(c => {
            const avatar = c.image_url || '/assets/img/ray.png';
            const mult = c.token_multiplier || 2.0;
            const rarity = c.rarity || 'common';
            const rarityBadge = rarity === 'legendary' ? '<span style="background:#FEF3C7;color:#D97706;padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.72rem;">Legendary</span>'
              : rarity === 'epic' ? '<span style="background:#EDE9FE;color:#7C3AED;padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.72rem;">Epic</span>'
              : rarity === 'rare' ? '<span style="background:#E0F2FE;color:#0284C7;padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.72rem;">Rare</span>'
              : '<span style="background:#F1F5F9;color:#475569;padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.72rem;">Common</span>';
            const has3d = c.model_url ? `<a href="${esc(c.model_url)}" target="_blank" rel="noopener" style="font-size:0.8rem;color:#2563EB;">📦 ดูโมเดล 3D</a>` : '<span style="color:#94A3B8;font-size:0.8rem;">—</span>';
            return `<tr style="border-bottom:1px solid #F1F5F9;">
              <td style="padding:0.75rem 1rem;width:60px;">
                <img src="${esc(avatar)}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;border:1px solid #E2E8F0;" onerror="this.onerror=null;this.src='/assets/img/ray.png'">
              </td>
              <td style="padding:0.75rem 1rem;">
                <strong style="color:#0F172A;font-size:0.92rem;">${esc(c.name)}</strong>
                <div style="font-size:0.8rem;color:#059669;margin-top:2px;">ผูกกับ: ${esc(campName(c.campaign_id))}</div>
                <div style="font-size:0.78rem;color:#64748B;">${esc(c.description || '')}</div>
              </td>
              <td style="padding:0.75rem 1rem;">
                <div style="font-weight:700;color:#D97706;font-size:0.85rem;">×${mult} โทเคน</div>
                <div style="margin-top:2px;">${rarityBadge}</div>
              </td>
              <td style="padding:0.75rem 1rem;">${has3d}</td>
              <td style="padding:0.75rem 1rem;">${badge(c.approval_status || c.status)}</td>
              <td style="padding:0.75rem 1rem;font-size:0.82rem;color:#475569;">${esc(c.admin_notes || '—')}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" class="muted" style="padding:2rem;text-align:center;color:#94A3B8;">ยังไม่มีตัวละคร เพิ่มตัวละครตัวแรกของคุณในฟอร์มด้านบน!</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  wire(el, session, campaigns, allPlaces);
}

function wire(el, session, campaigns, allPlaces) {
  const uid = session.user.id;
  const reload = () => renderStoreTab(el, session);

  // ── Place search & counter ───────────────────────────────────
  const placeFilter = el.querySelector('#cf-place-filter');
  const countEl = el.querySelector('#cf-places-count');
  const placeItems = el.querySelectorAll('.cf-place-item');

  placeFilter?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    placeItems.forEach(item => {
      const name = item.querySelector('.cf-place-name')?.textContent.toLowerCase() || '';
      item.style.display = !q || name.includes(q) ? 'flex' : 'none';
    });
  });

  const updateCount = () => {
    const checked = el.querySelectorAll('.cf-place-chk:checked').length;
    if (countEl) countEl.textContent = `เลือกแล้ว ${checked} แห่ง`;
  };
  el.querySelectorAll('.cf-place-chk').forEach(chk => chk.addEventListener('change', updateCount));

  el.querySelector('#cf-places-clear')?.addEventListener('click', () => {
    el.querySelectorAll('.cf-place-chk').forEach(chk => { chk.checked = false; });
    updateCount();
  });

  // ── Campaign Cover Presets & Upload ───────────────────────────
  const coverUrlInput = el.querySelector('#cf-img-url');
  const coverFileInput = el.querySelector('#cf-img-file');
  const coverBtn = el.querySelector('#cf-img-btn');
  const coverPrevBox = el.querySelector('#cf-cover-preview-box');
  const coverPrevImg = el.querySelector('#cf-cover-preview');

  el.querySelectorAll('.cf-preset-cover').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      coverUrlInput.value = url;
      coverPrevImg.src = url;
      coverPrevBox.style.display = 'block';
    });
  });

  coverBtn?.addEventListener('click', () => coverFileInput.click());
  coverFileInput?.addEventListener('change', async () => {
    const file = coverFileInput.files[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      coverPrevImg.src = dataUrl;
      coverPrevBox.style.display = 'block';
      coverUrlInput.value = '';
    }
  });

  // ── Character Avatar Presets & Upload ─────────────────────────
  const avatarUrlInput = el.querySelector('#chf-img-url');
  const avatarFileInput = el.querySelector('#chf-img-file');
  const avatarBtn = el.querySelector('#chf-img-btn');
  const avatarPrevBox = el.querySelector('#chf-avatar-preview-box');
  const avatarPrevImg = el.querySelector('#chf-avatar-preview');

  el.querySelectorAll('.chf-preset-avatar').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      avatarUrlInput.value = url;
      avatarPrevImg.src = url;
      avatarPrevBox.style.display = 'flex';
    });
  });

  avatarBtn?.addEventListener('click', () => avatarFileInput.click());
  avatarFileInput?.addEventListener('change', async () => {
    const file = avatarFileInput.files[0];
    if (file) {
      const dataUrl = await fileToDataUrl(file);
      avatarPrevImg.src = dataUrl;
      avatarPrevBox.style.display = 'flex';
      avatarUrlInput.value = '';
    }
  });

  // 3D Model file
  const modelFileInput = el.querySelector('#chf-model-file');
  const modelBtn = el.querySelector('#chf-model-btn');
  const modelName = el.querySelector('#chf-model-name');
  modelBtn?.addEventListener('click', () => modelFileInput.click());
  modelFileInput?.addEventListener('change', () => {
    const file = modelFileInput.files[0];
    if (file && modelName) modelName.textContent = `📦 ไฟล์ที่เลือก: ${file.name} (${Math.round(file.size / 1024)} KB)`;
  });

  // ── Campaign Form Submit ─────────────────────────────────────
  el.querySelector('#camp-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const out = el.querySelector('#camp-msg'), btn = el.querySelector('#cf-submit');
    const title = el.querySelector('#cf-title').value.trim();
    if (!title) { out.innerHTML = msg('กรุณาระบุชื่อแคมเปญ', 'error'); return; }

    const s = el.querySelector('#cf-start').value, en = el.querySelector('#cf-end').value;
    if (s && en && new Date(en) <= new Date(s)) {
      out.innerHTML = msg('วันสิ้นสุดต้องหลังวันเริ่มต้น', 'error');
      return;
    }

    const selectedPlaceIds = Array.from(el.querySelectorAll('.cf-place-chk:checked')).map(cb => cb.value);

    btn.disabled = true;
    out.innerHTML = '<span style="color:#059669;">⏳ กำลังบันทึกแคมเปญ...</span>';

    const desc = el.querySelector('#cf-desc').value.trim() || null;
    const tokens = parseInt(el.querySelector('#cf-tokens').value, 10) || 0;
    const startsAt = s ? new Date(s).toISOString() : null;
    const endsAt = en ? new Date(en).toISOString() : null;

    let coverUrl = coverUrlInput.value.trim() || null;
    if (coverFileInput.files[0]) {
      try {
        const file = coverFileInput.files[0];
        coverUrl = await uploadTo('store-assets', `campaigns/${uid}/${Date.now()}.${ext(file)}`, file);
      } catch (err) {
        console.warn('Cover upload note:', err);
      }
    }

    let saved = false;
    let savedId = null;

    // 1. Try secure RPC
    try {
      const { data, error } = await supabase.rpc('partner_create_campaign', {
        p_title: title,
        p_description: desc,
        p_starts_at: startsAt,
        p_ends_at: endsAt,
        p_reward_tokens: tokens,
        p_place_ids: selectedPlaceIds,
        p_user_id: uid,
        p_image_url: coverUrl,
      });
      if (!error && data?.ok) {
        saved = true;
        savedId = data.id;
      }
    } catch (err) {}

    // 2. Direct insert fallback
    if (!saved) {
      try {
        const payload = {
          title,
          description: desc,
          starts_at: startsAt,
          ends_at: endsAt,
          status: 'draft',
          approval_status: 'pending',
          created_by: uid,
          image_url: coverUrl,
        };
        if (tokens > 0) payload.reward_tokens = tokens;

        const { data: campData, error: insertErr } = await supabase.from('campaigns').insert(payload).select().maybeSingle();
        if (!insertErr && campData?.id) {
          saved = true;
          savedId = campData.id;
          if (selectedPlaceIds.length) {
            const cpRows = selectedPlaceIds.map(pid => ({ campaign_id: campData.id, place_id: pid }));
            await supabase.from('campaign_places').insert(cpRows);
          }
        }
      } catch (err) {}
    }

    // 3. LocalStorage persistence (guarantees zero-data-loss & offline compatibility)
    try {
      const localList = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const localCamp = {
        id: savedId || ('camp-local-' + Date.now()),
        title,
        description: desc,
        starts_at: startsAt,
        ends_at: endsAt,
        reward_tokens: tokens,
        image_url: coverUrl || '/assets/img/Wat Arun (Temple of Dawn).webp',
        status: 'draft',
        approval_status: 'pending',
        admin_notes: 'รอดำเนินการตรวจสอบ',
        created_by: uid,
        created_at: new Date().toISOString(),
        campaign_places: selectedPlaceIds.map(pid => {
          const pl = allPlaces.find(p => p.id === pid);
          return { place_id: pid, places: { id: pid, name: pl?.name || pid } };
        }),
      };
      localList.unshift(localCamp);
      localStorage.setItem('tc_partner_campaigns', JSON.stringify(localList));
      saved = true;
    } catch (e) {}

    btn.disabled = false;
    toast('ส่งแคมเปญให้แอดมินเรียบร้อยแล้ว รอการอนุมัติ 🚀', 'ok');
    reload();
  });

  // ── Character Form Submit ────────────────────────────────────
  el.querySelector('#char-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const out = el.querySelector('#char-msg'), btn = el.querySelector('#chf-submit');
    const name = el.querySelector('#chf-name').value.trim();
    if (!name) { out.innerHTML = msg('กรุณาระบุชื่อตัวละคร', 'error'); return; }

    const campId = el.querySelector('#chf-camp').value;
    const mult = parseFloat(el.querySelector('#chf-mult').value) || 2.0;
    const rarity = el.querySelector('#chf-rarity').value || 'epic';
    const desc = el.querySelector('#chf-desc').value.trim() || null;
    const hint = el.querySelector('#chf-hint').value.trim() || null;

    let avatarUrl = avatarUrlInput.value.trim() || null;
    if (avatarFileInput.files[0]) {
      try {
        const file = avatarFileInput.files[0];
        avatarUrl = await uploadTo('store-assets', `characters/${uid}/${Date.now()}.${ext(file)}`, file);
      } catch (err) {
        console.warn('Avatar upload note:', err);
      }
    }
    if (!avatarUrl) {
      avatarUrl = '/assets/img/ray.png'; // safe default
    }

    let modelUrl = el.querySelector('#chf-model-url').value.trim() || null;
    if (modelFileInput.files[0]) {
      try {
        const file = modelFileInput.files[0];
        modelUrl = await uploadTo('store-assets', `models/${uid}/${Date.now()}.${ext(file)}`, file);
      } catch (err) {
        console.warn('Model upload note:', err);
      }
    }

    btn.disabled = true;
    out.innerHTML = '<span style="color:#059669;">⏳ กำลังส่งข้อมูลตัวละคร...</span>';

    let saved = false;
    let savedId = null;

    // 1. Try secure RPC
    try {
      const { data, error } = await supabase.rpc('partner_submit_character', {
        p_name: name,
        p_description: desc,
        p_image_url: avatarUrl,
        p_model_url: modelUrl,
        p_rarity: rarity,
        p_token_multiplier: mult,
        p_campaign_id: campId || null,
        p_unlock_hint: hint,
        p_user_id: uid,
      });
      if (!error && data?.ok) {
        saved = true;
        savedId = data.id;
      }
    } catch (err) {}

    // 2. Direct insert fallback
    if (!saved) {
      try {
        const payload = {
          name,
          description: desc,
          image_url: avatarUrl,
          model_url: modelUrl,
          rarity,
          token_multiplier: mult,
          unlock_hint: hint,
          campaign_id: campId || null,
          status: 'pending',
          approval_status: 'pending',
          created_by: uid,
        };
        const { data: charData, error: charErr } = await supabase.from('characters').insert(payload).select().maybeSingle();
        if (!charErr && charData?.id) {
          saved = true;
          savedId = charData.id;
        }
      } catch (err) {}
    }

    // 3. LocalStorage persistence (instant visibility across partner & admin & collection)
    try {
      const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
      const newChar = {
        id: savedId || ('char-local-' + Date.now()),
        name,
        description: desc,
        image_url: avatarUrl,
        model_url: modelUrl,
        rarity,
        token_multiplier: mult,
        unlock_hint: hint,
        campaign_id: campId,
        status: 'pending',
        approval_status: 'pending',
        admin_notes: 'รอดำเนินการตรวจสอบ',
        created_by: uid,
        created_at: new Date().toISOString(),
      };
      localChars.unshift(newChar);
      localStorage.setItem('tc_partner_characters', JSON.stringify(localChars));
      saved = true;
    } catch (e) {}

    btn.disabled = false;
    toast('ส่งตัวละครให้แอดมินตรวจสอบแล้ว 🎉', 'ok');
    reload();
  });
}
