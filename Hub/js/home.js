import { supabase } from './supabase.js';
import { esc, stateEmpty } from './ui.js';

// ─── Real Unsplash photos for Thailand destinations (CDN, free-to-use) ─────────
const PLACE_IMAGES = {
  // Temples & Landmarks — verified photo IDs
  'wat-phra-kaew':    '/assets/img/Wat Phra Kaew (Temple of the Emerald Buddha).webp',
  'grand-palace':     '/assets/img/Wat Phra Kaew (Temple of the Emerald Buddha).webp',
  'wat-pho':          '/assets/img/Wat Pho (Temple of the Reclining Buddha).webp',
  'wat-arun':         '/assets/img/Wat Arun (Temple of Dawn).webp',
  'wat-saket':        'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&auto=format&fit=crop&q=80',
  // Markets & Culture
  'chatuchak':        '/assets/img/Chatuchak Weekend Market.webp',
  'yaowarat':         '/assets/img/Yaowarat (Bangkok Chinatown).webp',
  'asiatique':        'https://images.unsplash.com/photo-1512003867696-6d5ce6835040?w=800&auto=format&fit=crop&q=80',
  // Parks & Nature
  'lumphini':         '/assets/img/Lumphini Park.webp',
  'bangkrachao':      'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&auto=format&fit=crop&q=80',
  // Museums & Arts
  'jim-thompson':     'https://images.unsplash.com/photo-1531259683007-016a7b628fc3?w=800&auto=format&fit=crop&q=80',
  'national-museum':  'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&auto=format&fit=crop&q=80',
  // Default fallbacks by category
  '_default_temple':  'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&auto=format&fit=crop&q=80',
  '_default_market':  'https://images.unsplash.com/photo-1540704260519-4ae72e0e35a2?w=800&auto=format&fit=crop&q=80',
  '_default_nature':  'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&auto=format&fit=crop&q=80',
  '_default':         'https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800&auto=format&fit=crop&q=80',
};

// Look up best image for a place by name slug or category
function getPlaceImage(place) {
  const sorted = (place.place_images || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  if (sorted[0]?.url) return sorted[0].url;
  if (place.cover_image_display) return place.cover_image_display;
  const name = (place.name || '').toLowerCase().replace(/\s+/g, '-');
  for (const key of Object.keys(PLACE_IMAGES)) {
    if (key.startsWith('_')) continue;
    if (name.includes(key) || key.includes(name.split('-')[0])) return PLACE_IMAGES[key];
  }
  const cat = (place.place_categories?.name || '').toLowerCase();
  if (cat.includes('temple') || cat.includes('วัด')) return PLACE_IMAGES['_default_temple'];
  if (cat.includes('market') || cat.includes('ตลาด')) return PLACE_IMAGES['_default_market'];
  if (cat.includes('park') || cat.includes('สวน')) return PLACE_IMAGES['_default_nature'];
  return PLACE_IMAGES['_default'];
}

// ─── Featured Destinations ────────────────────────────────────────────────────
async function featured() {
  const el = document.getElementById('featured');
  try {
    const { data, error } = await supabase.from('places')
      .select('id, name, summary, districts(name_en), provinces(name_en), place_categories(name), place_images(url, alt, position), quests(id, reward_tokens)')
      .eq('status', 'published').order('created_at').limit(6);
    if (error) throw error;

    // Fallback demo cards if DB is empty
    const places = data?.length ? data : getDemoPlaces();

    el.innerHTML = places.map(p => {
      const imgUrl = getPlaceImage(p);
      const questCount = p.quests?.length || 0;
      const district = [p.districts?.name_en, p.provinces?.name_en].filter(Boolean).join(', ') || 'Bangkok';
      return `
      <article class="card destination-card">
        <div class="card-media">
          <img src="${esc(imgUrl)}" alt="${esc(p.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'card-media-placeholder\\'><span>🏛️</span></div>'">
          <span class="card-category-tag">${esc(p.place_categories?.name || 'Destination')}</span>
        </div>
        <div class="card-content">
          <div class="card-location">📍 ${esc(district)}</div>
          <h3 class="card-title"><a href="/place.html?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a></h3>
          <p class="card-summary">${esc(p.summary || '')}</p>
          <div class="card-footer">
            ${questCount > 0 ? `<span class="badge badge-quest">⚔️ ${questCount} Quest${questCount > 1 ? 's' : ''}</span>` : '<span class="badge badge-muted">Explore</span>'}
            <a class="card-action-link" href="/place.html?id=${encodeURIComponent(p.id)}">View details →</a>
          </div>
        </div>
      </article>`;
    }).join('');
  } catch (e) {
    console.error(e);
    // Show demo cards even on error
    const places = getDemoPlaces();
    el.innerHTML = places.map(p => {
      const imgUrl = getPlaceImage(p);
      return `
      <article class="card destination-card">
        <div class="card-media">
          <img src="${esc(imgUrl)}" alt="${esc(p.name)}" loading="lazy">
          <span class="card-category-tag">${esc(p.place_categories?.name || 'Destination')}</span>
        </div>
        <div class="card-content">
          <div class="card-location">📍 ${p.districts?.name_en || 'Bangkok'}</div>
          <h3 class="card-title">${esc(p.name)}</h3>
          <p class="card-summary">${esc(p.summary || '')}</p>
          <div class="card-footer">
            <span class="badge badge-quest">⚔️ Quest Available</span>
            <a class="card-action-link" href="/explore.html">View on map →</a>
          </div>
        </div>
      </article>`;
    }).join('');
  }
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
function getDemoCampaigns() {
  const now = Date.now();
  return [
    {
      id: 'camp-ray',
      title: '🔭 สำรวจเมืองแห่งการค้นพบ',
      description: 'ออกเดินทางค้นหาสถานที่ซ่อนเร้นทั่วเมือง! เช็คอินให้ครบ 5 สถานที่ในแคมเปญนี้ แล้วรับตัวละครพิเศษ "นักสำรวจ เรย์" พร้อมโทเคนโบนัส 150 โทเคนเป็นรางวัล',
      cover_image: '/assets/img/Wat Arun (Temple of Dawn).webp',
      reward_tokens: 150,
      char_name: 'นักสำรวจ — เรย์',
      char_thumb: '/assets/img/ray.png',
      char_sub: 'ชุดน้ำเงิน-ขาว สหายนกเพนกวิน • ×2 โทเคนเควสท์ใหม่',
      condition_text: 'เช็คอินสถานที่ร่วมรายการครบ 5 แห่ง',
      multiplier_text: 'ได้รับโทเคน ×2 เท่า จากเควสท์สำรวจสถานที่ใหม่',
      ends_at: new Date(now + 90 * 86400000).toISOString(),
      theme: 'ray',
    },
    {
      id: 'camp-maya',
      title: '⛵ ผจญภัยชายฝั่ง — มายา อีดิชัน',
      description: 'สำรวจท่าเรือ ตลาดน้ำ และสถานที่ริมแม่น้ำ สัมผัสวิถีชีวิตชาวน้ำ เช็คอินให้ครบแล้วรับตัวละคร "นักสำรวจ มายา" พร้อม 120 โทเคนเป็นรางวัล!',
      cover_image: 'https://images.unsplash.com/photo-1548940740-204726a19be3?w=800&auto=format&fit=crop&q=80',
      reward_tokens: 120,
      char_name: 'นักสำรวจ — มายา',
      char_thumb: '/assets/img/maya.png',
      char_sub: 'ชุดเหลือง-เขียว สหายผีใบไม้ • ×2 โทเคนเควสท์ริมน้ำ',
      condition_text: 'เช็คอินริมน้ำ/ท่าเรือ/ตลาดน้ำครบ 4 แห่ง',
      multiplier_text: 'ได้รับโทเคน ×2 เท่า จากเควสท์บริเวณริมน้ำ',
      ends_at: new Date(now + 60 * 86400000).toISOString(),
      theme: 'maya',
    },
  ];
}

function renderCampaignCard(c, linkedChar) {
  const isMaya = (c.title || '').includes('มายา') || (c.title || '').includes('ชายฝั่ง') || c.theme === 'maya';
  const isRay = (c.title || '').includes('ค้นพบ') || (c.title || '').includes('เรย์') || c.theme === 'ray' || (!isMaya && !linkedChar);

  const themeClass = isMaya ? 'campaign-maya' : 'campaign-ray';
  const rewardTheme = isMaya ? 'reward-maya' : 'reward-ray';
  const tagClass = isMaya ? 'campaign-char-badge-tag tag-maya' : 'campaign-char-badge-tag';
  const coverImg = c.image_url || c.cover_image || (isMaya
    ? 'https://images.unsplash.com/photo-1548940740-204726a19be3?w=800&auto=format&fit=crop&q=80'
    : '/assets/img/Wat Arun (Temple of Dawn).webp');

  const charThumb = linkedChar?.image_url || c.char_thumb || (isMaya ? '/assets/img/maya.png' : '/assets/img/ray.png');
  const charName = linkedChar?.name || c.char_name || (isMaya ? 'นักสำรวจ — มายา' : 'นักสำรวจ — เรย์');
  const charRarity = linkedChar?.rarity ? (linkedChar.rarity.charAt(0).toUpperCase() + linkedChar.rarity.slice(1)) : 'Epic';
  const charSub = linkedChar?.description || c.char_sub || (isMaya ? 'ชุดเหลือง-เขียว สหายผีใบไม้ • ×2 โทเคนเควสท์ริมน้ำ' : 'ชุดน้ำเงิน-ขาว สหายนกเพนกวิน • ×2 โทเคนเควสท์ใหม่');
  const condText = linkedChar?.unlock_hint || c.condition_text || (isMaya ? 'เช็คอินริมน้ำ/ท่าเรือ/ตลาดน้ำครบ 4 แห่ง' : 'เช็คอินสถานที่ร่วมรายการครบ 5 แห่ง');
  const mult = linkedChar?.token_multiplier || (isMaya ? 2.0 : 2.0);
  const multText = linkedChar ? `ได้รับโทเคน ×${mult} เท่า เมื่อทำเควสท์ในแคมเปญนี้` : (c.multiplier_text || (isMaya ? 'ได้รับโทเคน ×2 เท่า จากเควสท์บริเวณริมน้ำ' : 'ได้รับโทเคน ×2 เท่า จากเควสท์สำรวจสถานที่ใหม่'));

  const fmtDate = d => {
    if (!d) return isMaya ? 'เหลืออีก 60 วัน' : 'เหลืออีก 90 วัน';
    try {
      const diff = Math.ceil((new Date(d) - Date.now()) / (1000 * 60 * 60 * 24));
      return diff > 0 ? `เหลืออีก ${diff} วัน` : new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

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
          <span class="campaign-deadline"><svg class="ic" width="14" height="14" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-calendar"></use></svg> ${esc(fmtDate(c.ends_at))}</span>
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
          <a class="btn btn-small" href="/quests.html">เข้าร่วมแคมเปญ →</a>
        </div>
      </div>
    </article>`;
}

async function campaigns() {
  const el = document.getElementById('campaigns');
  if (!el) return;
  try {
    const [campsRes, charsRes] = await Promise.all([
      supabase.from('campaigns')
        .select('id, title, description, starts_at, ends_at, reward_tokens, image_url, approval_status, status')
        .eq('status', 'published')
        .order('created_at', { ascending: false }),
      supabase.from('characters')
        .select('id, name, description, image_url, rarity, token_multiplier, unlock_hint, campaign_id, status, approval_status')
        .or('status.eq.active,approval_status.eq.approved'),
    ]);

    let items = (campsRes.data || []).filter(c => c.approval_status !== 'rejected');

    // Merge locally approved campaigns
    try {
      const localCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
      const approvedLocals = localCamps.filter(c => c.approval_status === 'approved' || c.status === 'published');
      if (approvedLocals.length) {
        const existingIds = new Set(items.map(c => c.id));
        for (const lc of approvedLocals) {
          if (!existingIds.has(lc.id)) items.push(lc);
        }
      }
    } catch (e) {}

    // Merge characters
    let chars = charsRes.data || [];
    try {
      const localChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
      const activeLocals = localChars.filter(c => c.approval_status === 'approved' || c.status === 'active');
      if (activeLocals.length) {
        const existingIds = new Set(chars.map(c => c.id));
        for (const lc of activeLocals) {
          if (!existingIds.has(lc.id)) chars.push(lc);
        }
      }
    } catch (e) {}

    // Map characters to campaigns
    const charMap = new Map();
    for (const ch of chars) {
      if (ch.campaign_id) charMap.set(ch.campaign_id, ch);
    }

    if (!items.length) items = getDemoCampaigns();

    el.innerHTML = items.map(c => {
      const linkedChar = charMap.get(c.id);
      return renderCampaignCard(c, linkedChar);
    }).join('');
  } catch (e) {
    console.error(e);
    if (!el.children || el.children.length === 0) {
      el.innerHTML = getDemoCampaigns().map(c => renderCampaignCard(c)).join('');
    }
  }
}

// ─── Demo data fallback (when DB is unavailable) ──────────────────────────────
function getDemoPlaces() {
  return [];
}

featured();
campaigns();
