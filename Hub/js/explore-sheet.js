// Mobile place sheet: drag the handle to snap between collapsed, default and expanded.
// A tap on the handle cycles the same states. The locate button pans the existing map.
const sheet = document.getElementById('sheet');
const handle = document.getElementById('sheet-handle');
const closeBtn = document.getElementById('sheet-close');
const locateBtn = document.querySelector('.xm-fab[aria-label="ตำแหน่งของฉัน"]');
const isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

if (sheet && handle) {
  const STATES = ['is-collapsed', 'default', 'is-expanded'];

  const currentState = () => {
    if (sheet.classList.contains('is-expanded')) return 'is-expanded';
    if (sheet.classList.contains('is-collapsed')) return 'is-collapsed';
    return 'default';
  };

  const applyState = state => {
    sheet.classList.remove('is-collapsed', 'is-expanded');
    if (state !== 'default') sheet.classList.add(state);
    handle.setAttribute('aria-expanded', String(state !== 'is-collapsed'));
  };

  const setOpen = open => applyState(open ? 'default' : 'is-collapsed');

  // Tap cycles: collapsed -> default -> expanded -> collapsed
  handle.addEventListener('click', () => {
    if (drag.moved) return; // a drag already set the state
    const next = { 'is-collapsed': 'default', default: 'is-expanded', 'is-expanded': 'is-collapsed' };
    applyState(next[currentState()]);
  });

  closeBtn?.addEventListener('click', () => setOpen(false));

  // Drag: follow the pointer, then snap to the nearest state on release
  const drag = { active: false, moved: false, startY: 0, startH: 0 };

  const heightOf = state => {
    const vh = sheet.parentElement?.clientHeight || window.innerHeight;
    if (state === 'is-collapsed') return 104;
    if (state === 'is-expanded') return vh * 0.88;
    return vh * 0.58;
  };

  handle.addEventListener('pointerdown', e => {
    if (isDesktop()) return;
    drag.active = true;
    drag.moved = false;
    drag.startY = e.clientY;
    drag.startH = sheet.getBoundingClientRect().height;
    sheet.style.transition = 'none';
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', e => {
    if (!drag.active) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 6) drag.moved = true;
    const vh = sheet.parentElement?.clientHeight || window.innerHeight;
    const h = Math.min(vh * 0.88, Math.max(104, drag.startH - dy));
    sheet.style.height = `${h}px`;
  });

  const endDrag = e => {
    if (!drag.active) return;
    drag.active = false;
    sheet.style.transition = '';
    if (!drag.moved) { sheet.style.height = ''; return; }
    const h = sheet.getBoundingClientRect().height;
    // Pick the state whose height is closest to where the user released
    const best = STATES.reduce((a, b) =>
      Math.abs(heightOf(a) - h) <= Math.abs(heightOf(b) - h) ? a : b);
    sheet.style.height = '';
    applyState(best);
    setTimeout(() => { drag.moved = false; }, 0);
    try { handle.releasePointerCapture(e.pointerId); } catch {}
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  // Reset to open whenever the layout switches between mobile and desktop
  window.matchMedia('(min-width: 900px)').addEventListener('change', () => {
    sheet.style.height = '';
    setOpen(true);
  });
  setOpen(true);
}

locateBtn?.addEventListener('click', () => {
  if (!navigator.geolocation) return;
  locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      locateBtn.disabled = false;
      const { latitude: lat, longitude: lng } = pos.coords;
      const map = window.__exploreMap;
      if (!map) return;
      if (map._isLeaflet) map.setView([lat, lng], 14);
      else { map.panTo({ lat, lng }); map.setZoom(14); }
    },
    () => {
      locateBtn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
});
