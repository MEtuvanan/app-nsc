import { getProfile, signOut, getSession, watchSession } from './auth.js';
import { esc } from './ui.js';
import { getLang, toggleLang, t } from './i18n.js';
import { icon } from './icons.js';

const NAV = [
  ['/explore.html',    'nav_explore',    '/explore',    'map'],
  ['/quests.html',     'nav_quests',     '/quests',     'quest'],
  ['/planner.html',    'nav_planner',    '/planner',    'ai'],
  ['/collection.html', 'nav_collection', '/collection', 'star'],
  ['/journal.html',    'nav_journal',    '/journal',    'journal'],
  ['/partner.html',    'nav_partner',    '/partner',    'store'],
  ['/help.html',       'nav_help',       '/help',       'book'],
];
// Pages shown only when logged in (injected into auth slot)
const NAV_AUTH_EXTRAS = [
  ['/topup.html', 'nav_topup', '/topup', 'coin'],
];

// Apply saved language on boot
document.documentElement.lang = getLang();

function renderNav() {
  const el = document.getElementById('site-nav');
  if (!el) return;
  const cleanHere = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  const lang = getLang();
  const langBtnLabel = lang === 'th' ? 'EN' : 'TH';
  const langBtnTitle = lang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย';

  el.innerHTML = `
    <a class="brand" href="/index.html">
      <span class="brand-badge">TH</span>
      Travel <span>&amp;</span> Challenge
    </a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links" aria-label="Toggle menu">
      ${icon('menu', 22)}
    </button>
    <ul id="nav-links" class="nav-links">
      ${NAV.map(([h, key, clean, icn]) => {
        const label = t(key);
        const isCurrent = cleanHere === clean || location.pathname === h;
        return `<li><a href="${h}" ${isCurrent ? 'aria-current="page"' : ''}>${icon(icn, 15)} ${esc(label)}</a></li>`;
      }).join('')}
      <li>
        <button class="btn btn-small btn-lang" id="lang-toggle" title="${langBtnTitle}" type="button">
          ${icon('sun', 14)} ${langBtnLabel}
        </button>
      </li>
      <li id="nav-auth"></li>
    </ul>`;

  const btn = el.querySelector('.nav-toggle');
  btn.addEventListener('click', () => {
    const open = el.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.classList.contains('open')) {
      el.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });

  document.getElementById('lang-toggle').addEventListener('click', () => {
    toggleLang();
    renderNav();
    renderFooter();
    renderAuth();
  });
}

function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;
  el.className = 'site-footer';
  el.innerHTML = `<div class="container footer-grid">
    <div class="footer-brand">
      <a class="brand" href="/index.html"><span class="brand-badge">TH</span> Travel <span>&amp;</span> Challenge</a>
      <p class="meta">${t('nav_explore') === 'สำรวจสถานที่' ? 'เปลี่ยนทุกการเดินทางให้กลายเป็นผจญภัย ค้นพบสถานที่จริงทั่วไทย พิชิตเควสท์ สะสมรางวัล ปลดล็อกตัวละคร และบันทึกไดอารี่การเดินทาง' : 'Turn every trip into an adventure. Discover authentic destinations across Thailand, complete quests, earn token rewards, collect characters, and keep a personal travel diary.'}</p>
    </div>
    <nav aria-label="Footer"><ul class="footer-links">
      <li><strong>${t('nav_explore')}</strong></li>
      <li><a href="/explore.html">${icon('map', 14)} ${t('nav_explore')}</a></li>
      <li><a href="/quests.html">${icon('quest', 14)} ${t('nav_quests')}</a></li>
      <li><a href="/collection.html">${icon('star', 14)} ${t('nav_collection')}</a></li>
      <li><a href="/help.html">${icon('book', 14)} ${t('nav_help')}</a></li>
      <li><a href="/partner.html">${icon('store', 14)} ${t('nav_partner')}</a></li>
    </ul></nav>
    <nav aria-label="Account"><ul class="footer-links">
      <li><strong>${t('nav_profile')} &amp; บันทึก</strong></li>
      <li><a href="/profile.html">${icon('user', 14)} ${t('nav_profile')}</a></li>
      <li><a href="/journal.html">${icon('journal', 14)} ${t('nav_journal')}</a></li>
      <li><a href="/planner.html">${icon('ai', 14)} ${t('nav_planner')}</a></li>
      <li><a href="/help.html">${icon('info', 14)} คู่มือ &amp; วิธีใช้งาน</a></li>
      <li><a href="/login.html">${icon('user', 14)} ${t('nav_signin')} / สมัครสมาชิก</a></li>
    </ul></nav>
  </div>
  <div class="container footer-bottom">
    <p class="meta">© 2026 Travel and Challenge. ${getLang() === 'th' ? 'ครอบคลุมทุกจังหวัดทั่วไทย พร้อมข้อมูลที่ผ่านการตรวจสอบแล้ว' : 'Nationwide coverage with verified destinations.'}</p>
  </div>`;
}

async function renderAuth() {
  const slot = document.getElementById('nav-auth');
  if (!slot) return;
  const session = await getSession();
  if (!session) {
    slot.innerHTML = `<a class="btn btn-small btn-secondary nav-btn" href="/login.html">${icon('user', 15)} ${t('nav_signin')}</a>`;
    return;
  }
  const p = await getProfile();
  const avatar = p?.avatar_url
    ? `<img src="${esc(p.avatar_url)}" alt="" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">`
    : icon('user', 15);

  const roleBadge = p?.role === 'admin'
    ? `<span class="nav-role-badge nav-role-admin">ADMIN</span>`
    : p?.role === 'partner'
    ? `<span class="nav-role-badge nav-role-partner">Partner</span>`
    : '';

  const topupTitle = getLang() === 'th' ? 'เติมโทเคน' : 'Top up tokens';

  slot.innerHTML = `
    <a class="nav-user-pill" href="/profile.html" title="${esc(p?.display_name || 'Profile')}">
      ${avatar}
      <span class="nav-user-name">${esc(p?.display_name || 'Profile')}</span>
      ${roleBadge}
    </a>
    <a class="nav-btn-topup-square" href="/topup.html" title="${topupTitle}" aria-label="${topupTitle}">
      ${icon('coin', 16)}
    </a>
    <button class="btn btn-small btn-secondary" id="logout" type="button" title="${t('nav_signout')}">${icon('logout', 14)} ${t('nav_signout')}</button>`;
  slot.style.display = 'contents';
  document.getElementById('logout').addEventListener('click', async () => {
    await signOut();
    location.href = '/index.html';
  });
}

renderNav();
renderFooter();
renderAuth();
watchSession();

// Initialize interactive player onboarding guide & floating trigger
import('./onboarding.js').then(m => m.initOnboarding()).catch(e => console.warn('Onboarding load:', e));
