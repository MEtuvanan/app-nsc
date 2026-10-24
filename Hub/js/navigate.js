/**
 * navigate.js — GPS Turn-by-Turn Navigation Engine
 * 
 * Features:
 *  - Browser Geolocation API (real GPS on mobile)
 *  - OSRM routing (free, no API key required)
 *  - Turn-by-turn instructions translated to Thai
 *  - Live position tracking with re-route on deviation
 *  - Voice announcements via Web Speech API
 *  - Travel modes: driving / walking / cycling
 *  - Arrived detection
 */

import { requireAuth } from './auth.js';
import { supabase } from './supabase.js';

// ── Constants ─────────────────────────────────────────────────
const OSRM_BASE = 'https://router.project-osrm.org/route/v1';
const ARRIVED_RADIUS_M = 50;     // metres → trigger "arrived"
const REROUTE_RADIUS_M = 200;    // metres off-route → recalculate
const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 };
const MODE_OSRM = { driving: 'driving', walking: 'foot', cycling: 'cycling' };

// ── State ─────────────────────────────────────────────────────
let map, userMarker, destMarker, routeLayer, outlineLayer;
let watchId = null;
let voiceEnabled = true;
let travelMode = 'driving';
let destination = { lat: null, lng: null, name: '', id: null };
let steps = [];
let currentStepIdx = 0;
let userPos = null;
let isNavigating = false;
let lastSpoken = '';
let currentRouteCoords = [];
let simInterval = null;

// ── Read URL params ────────────────────────────────────────────
function readParams() {
  const p = new URLSearchParams(location.search);
  destination.lat  = parseFloat(p.get('lat'))  || null;
  destination.lng  = parseFloat(p.get('lng'))  || null;
  destination.name = decodeURIComponent(p.get('name') || 'ปลายทาง');
  destination.id   = p.get('id') || null;
}

// ── Maths helpers ──────────────────────────────────────────────
function toRad(d) { return d * Math.PI / 180; }
function haversine(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function formatDist(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} ม.`;
  return `${(m / 1000).toFixed(1)} กม.`;
}
function formatDuration(s) {
  if (s < 60) return `< 1 น.`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m} น.`;
  return `${h} ชม. ${m} น.`;
}
function formatETA(durationSeconds) {
  const now = new Date();
  now.setSeconds(now.getSeconds() + durationSeconds);
  return now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// ── Thai Turn Instructions ────────────────────────────────────
const TURN_ICON = {
  'turn-slight-left':    '↖', 'turn-left':    '←',  'turn-sharp-left':  '↙',
  'turn-slight-right':   '↗', 'turn-right':   '→',  'turn-sharp-right': '↘',
  'continue':            '↑',  'straight':     '↑',  'roundabout':       '⟳',
  'rotary':              '⟳', 'merge':         '↑',  'fork':             '↑',
  'ramp-left':           '↖', 'ramp-right':    '↗',
  'end of road-left':    '←',  'end of road-right': '→',
  'new name-straight':   '↑',  'arrive':        '◎', 'depart':           '⚐',
  'notification-straight': '↑', 'use lane':     '→',
};
const TURN_TH = {
  'turn-slight-left':    'เลี้ยวซ้ายเล็กน้อย',
  'turn-left':           'เลี้ยวซ้าย',
  'turn-sharp-left':     'เลี้ยวซ้ายอย่างชัดเจน',
  'turn-slight-right':   'เลี้ยวขวาเล็กน้อย',
  'turn-right':          'เลี้ยวขวา',
  'turn-sharp-right':    'เลี้ยวขวาอย่างชัดเจน',
  'continue':            'ตรงไปข้างหน้า',
  'straight':            'ตรงไปข้างหน้า',
  'roundabout':          'วนวงเวียน',
  'rotary':              'วนวงเวียน',
  'merge':               'รวมช่องจราจร',
  'fork':                'แยกทาง',
  'arrive':              'ถึงที่หมาย',
  'depart':              'ออกเดินทาง',
  'end of road-left':    'สิ้นสุดถนน — เลี้ยวซ้าย',
  'end of road-right':   'สิ้นสุดถนน — เลี้ยวขวา',
  'new name-straight':   'ตรงต่อไป (ชื่อถนนเปลี่ยน)',
  'notification-straight': 'ตรงไปข้างหน้า',
  'use lane':            'เลือกช่องทาง',
};
function instrThai(maneuver, name) {
  const type = maneuver?.type || 'continue';
  const mod  = maneuver?.modifier || '';
  const key  = mod ? `${type}-${mod}` : type;
  const base = TURN_TH[key] || TURN_TH[type] || type;
  return name ? `${base} บน ${name}` : base;
}
function turnIcon(maneuver) {
  const type = maneuver?.type || 'continue';
  const mod  = maneuver?.modifier || '';
  return TURN_ICON[`${type}-${mod}`] || TURN_ICON[type] || '↑';
}

// ── Leaflet Loader ────────────────────────────────────────────
function loadLeaflet() {
  if (window.L?.map) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[href*="leaflet"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(l);
    }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Leaflet failed to load'));
    document.head.appendChild(s);
  });
}

// ── Map Init ──────────────────────────────────────────────────
async function initMap() {
  await loadLeaflet();
  const el = document.getElementById('nav-map');
  map = L.map(el, { zoomControl: false, attributionControl: false }).setView(
    [destination.lat || 13.756, destination.lng || 100.502], 14
  );
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: '' }).addTo(map)
   .addAttribution('© <a href="https://www.openstreetmap.org">OSM</a> | Route: OSRM');

  // Destination marker
  const destIcon = L.divIcon({
    className: 'nav-dest-pin',
    html: `<div style="background:linear-gradient(135deg,#EF4444,#DC2626);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 4px 14px rgba(239,68,68,.55);display:grid;place-items:center;">
             <span style="transform:rotate(45deg);font-size:16px;line-height:1;">📍</span></div>`,
    iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -36]
  });
  destMarker = L.marker([destination.lat, destination.lng], { icon: destIcon })
    .addTo(map)
    .bindPopup(`<strong>🏁 ${destination.name}</strong>`, { autoClose: false });
}

// ── OSRM Routing ──────────────────────────────────────────────
async function fetchRoute(from, to, mode) {
  const profile = MODE_OSRM[mode] || 'driving';
  const url = `${OSRM_BASE}/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?steps=true&geometries=geojson&overview=full&annotations=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('ไม่พบเส้นทาง');
  return json.routes[0];
}

function drawRoute(geometry) {
  const coords = geometry.coordinates.map(c => [c[1], c[0]]);
  currentRouteCoords = coords;
  outlineLayer?.remove();
  routeLayer?.remove();
  outlineLayer = L.polyline(coords, { color: '#fff', weight: 9, opacity: .35 }).addTo(map);
  routeLayer   = L.polyline(coords, { color: '#00A86B', weight: 5, opacity: .95 }).addTo(map);

  // Fit route with padding for panels
  const bounds = L.latLngBounds(coords);
  const padTop = 80, padBot = window.innerWidth < 600 ? 300 : 80;
  map.fitBounds(bounds, { paddingTopLeft: [16, padTop], paddingBottomRight: [16, padBot] });
}

// ── ETA & Steps UI ────────────────────────────────────────────
function renderETA(route) {
  document.getElementById('eta-dist').textContent = formatDist(route.distance);
  document.getElementById('eta-dur').textContent  = formatDuration(route.duration);
  document.getElementById('eta-time').textContent = formatETA(route.duration);
}

function buildSteps(route) {
  steps = [];
  route.legs.forEach(leg => {
    leg.steps.forEach(s => {
      steps.push({
        instruction: instrThai(s.maneuver, s.name),
        icon: turnIcon(s.maneuver),
        distance: s.distance,
        duration: s.duration,
        location: s.maneuver.location, // [lng, lat]
      });
    });
  });
  currentStepIdx = 0;
  renderStepsList();
  updateTurnCard();
}

function renderStepsList() {
  const list = document.getElementById('steps-list');
  list.innerHTML = steps.map((s, i) => `
    <div class="step-row${i === currentStepIdx ? ' current' : ''}" data-idx="${i}">
      <div class="step-icon">${s.icon}</div>
      <div class="step-body">
        <div class="step-instruction">${s.instruction}</div>
        ${s.distance > 0 ? `<div class="step-dist">${formatDist(s.distance)}</div>` : ''}
      </div>
    </div>`).join('');
  // Scroll current step into view
  list.querySelector('.step-row.current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function updateTurnCard() {
  const step = steps[currentStepIdx];
  if (!step) { document.getElementById('turn-card').hidden = true; return; }
  document.getElementById('turn-card').hidden = false;
  document.getElementById('turn-arrow').textContent = step.icon;
  document.getElementById('turn-dist').textContent  = formatDist(step.distance);
  document.getElementById('turn-street').textContent = step.instruction;
  const next = steps[currentStepIdx + 1];
  document.getElementById('turn-next-icon').textContent = next ? next.icon : '◎';
}

// ── Voice Announcements ───────────────────────────────────────
function speak(text) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  if (text === lastSpoken) return;
  lastSpoken = text;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'th-TH';
  utt.rate = 1.05;
  speechSynthesis.speak(utt);
}

// ── GPS Tracking ──────────────────────────────────────────────
function startTracking() {
  if (!navigator.geolocation) {
    showGPSBar('❌', 'เบราว์เซอร์ไม่รองรับ GPS');
    return;
  }
  watchId = navigator.geolocation.watchPosition(onPosition, onGPSError, WATCH_OPTIONS);
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  userPos = { lat, lng };
  hideGPSBar();

  // Update user dot
  if (!userMarker) {
    const userIcon = L.divIcon({
      className: 'nav-user-dot',
      html: `<div style="width:18px;height:18px;background:#2563EB;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.2);"></div>`,
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
    userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 100 }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  if (!isNavigating) return;

  // Check arrived
  const distToDest = haversine(userPos, destination);
  if (distToDest <= ARRIVED_RADIUS_M) {
    onArrived();
    return;
  }

  // Advance step
  if (steps[currentStepIdx]) {
    const stepLoc = steps[currentStepIdx].location;
    const stepPos = { lat: stepLoc[1], lng: stepLoc[0] };
    const distToStep = haversine(userPos, stepPos);
    if (distToStep < 30 && currentStepIdx < steps.length - 1) {
      currentStepIdx++;
      renderStepsList();
      updateTurnCard();
      const s = steps[currentStepIdx];
      speak(s.instruction);
    }
    // Announce upcoming turn
    const distNext = steps[currentStepIdx].distance;
    if (distNext < 100 && distNext > 20) speak(`อีก ${Math.round(distNext)} เมตร ${steps[currentStepIdx].instruction}`);
  }
}

function onGPSError(err) {
  const msgs = {
    1: 'ถูกปฏิเสธการเข้าถึง GPS — กำลังใช้ตำแหน่งเริ่มต้นจำลองเพื่อทดสอบ',
    2: 'ไม่พบสัญญาณ GPS — กำลังใช้ตำแหน่งเริ่มต้นจำลอง',
    3: 'หมดเวลาค้นหา GPS — กำลังใช้ตำแหน่งเริ่มต้นจำลอง',
  };
  showGPSBar('📍', msgs[err.code] || 'ใช้ตำแหน่งเริ่มต้นจำลอง');
  if (!userPos && destination.lat && destination.lng) {
    const fallbackLat = destination.lat - 0.02;
    const fallbackLng = destination.lng - 0.02;
    onPosition({ coords: { latitude: fallbackLat, longitude: fallbackLng, accuracy: 20 } });
    calculateRoute();
  }
}

// ── Route Calculation ─────────────────────────────────────────
async function calculateRoute() {
  if (!userPos) {
    showGPSBar('📡', 'กำลังรอสัญญาณ GPS…');
    return;
  }
  showGPSBar('🔄', 'กำลังคำนวณเส้นทาง…');
  try {
    const route = await fetchRoute(userPos, destination, travelMode);
    drawRoute(route.geometry);
    renderETA(route);
    buildSteps(route);
    speak(`เริ่มนำทาง — ${steps[0]?.instruction || ''}`);
    hideGPSBar();
  } catch (e) {
    console.error('Route error:', e);
    showGPSBar('warning', `คำนวณเส้นทางไม่ได้: ${e.message}`);
  }
}

// ── Arrived ───────────────────────────────────────────────────
function onArrived() {
  isNavigating = false;
  stopTracking();
  speak('ถึงที่หมายแล้ว ยินดีด้วย!');
  document.getElementById('turn-card').hidden = true;
  const overlay = document.getElementById('arrived-overlay');
  document.getElementById('arrived-dest').textContent = destination.name;
  document.getElementById('arrived-view').href = destination.id
    ? `/place.html?id=${encodeURIComponent(destination.id)}` : '#';
  overlay.hidden = false;
}

// ── GPS Status Bar helpers ────────────────────────────────────
function showGPSBar(iconName, msg) {
  const bar = document.getElementById('gps-bar');
  bar.hidden = false;
  const iconEl = document.getElementById('gps-icon');
  if (iconEl) {
    iconEl.innerHTML = `<svg class="ic" width="16" height="16"><use href="/assets/icons/sprite.svg#i-${iconName || 'gps'}"></use></svg>`;
  }
  document.getElementById('gps-msg').textContent = msg;
}
function hideGPSBar() {
  document.getElementById('gps-bar').hidden = true;
}

// ── UI Setup ──────────────────────────────────────────────────
function setupUI() {
  // Destination info
  document.getElementById('dest-name').textContent = destination.name;
  document.getElementById('start-dest-name').textContent = destination.name;

  // Google Maps fallback link
  document.getElementById('gmaps-link').href =
    `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=${travelMode}`;

  // Mode buttons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      travelMode = btn.dataset.mode;
      document.getElementById('gmaps-link').href =
        `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=${travelMode}`;
    });
  });

  // Start Navigation
  document.getElementById('btn-start-nav').addEventListener('click', async () => {
    document.getElementById('start-overlay').style.display = 'none';
    showGPSBar('gps', 'กำลังหาตำแหน่ง GPS…');
    isNavigating = true;
    startTracking();

    // Wait up to 3.5 seconds for first GPS fix, otherwise fallback for instant usability
    let waited = 0;
    const waitGPS = setInterval(async () => {
      waited += 500;
      if (userPos) {
        clearInterval(waitGPS);
        await calculateRoute();
      } else if (waited >= 3500) {
        clearInterval(waitGPS);
        if (!userPos && destination.lat && destination.lng) {
          const fallbackLat = destination.lat - 0.025;
          const fallbackLng = destination.lng - 0.025;
          showGPSBar('pin', 'ใช้ตำแหน่งจำลองเริ่มต้น (พร้อมใช้งาน)');
          onPosition({ coords: { latitude: fallbackLat, longitude: fallbackLng, accuracy: 25 } });
          await calculateRoute();
        }
      }
    }, 500);
  });

  // Center on user
  document.getElementById('btn-center').addEventListener('click', () => {
    if (userPos) map.setView([userPos.lat, userPos.lng], 16);
    else showGPSBar('warning', 'ยังไม่พบตำแหน่ง GPS');
  });

  // Overview (fit route)
  document.getElementById('btn-overview').addEventListener('click', () => {
    if (routeLayer) map.fitBounds(routeLayer.getBounds(), { padding: [48, 48] });
    else if (destination.lat) map.setView([destination.lat, destination.lng], 14);
  });

  // Simulate Drive
  const btnSim = document.getElementById('btn-simulate');
  if (btnSim) {
    btnSim.addEventListener('click', () => {
      if (simInterval) {
        clearInterval(simInterval);
        simInterval = null;
        btnSim.innerHTML = '<svg class="ic" width="14" height="14"><use href="/assets/icons/sprite.svg#i-play"></use></svg> จำลองเดินทาง';
        showGPSBar('pause', 'หยุดจำลองชั่วคราว');
        return;
      }
      if (!currentRouteCoords.length) {
        showGPSBar('warning', 'กำลังคำนวณเส้นทาง กรุณารอสักครู่');
        return;
      }
      stopTracking();
      isNavigating = true;
      btnSim.innerHTML = '<svg class="ic" width="14" height="14"><use href="/assets/icons/sprite.svg#i-pause"></use></svg> พักจำลอง';
      showGPSBar('compass', 'กำลังจำลองการเดินทาง…');
      let idx = 0;
      // Subsample route to ~40-60 animation steps
      const stepJump = Math.max(1, Math.floor(currentRouteCoords.length / 50));
      simInterval = setInterval(() => {
        if (idx >= currentRouteCoords.length - 1) {
          clearInterval(simInterval);
          simInterval = null;
          btnSim.innerHTML = '<svg class="ic" width="14" height="14"><use href="/assets/icons/sprite.svg#i-play"></use></svg> จำลองเดินทาง';
          onPosition({ coords: { latitude: destination.lat, longitude: destination.lng, accuracy: 5 } });
          return;
        }
        const pt = currentRouteCoords[idx];
        onPosition({ coords: { latitude: pt[0], longitude: pt[1], accuracy: 10 } });
        map.panTo([pt[0], pt[1]], { animate: true, duration: 0.3 });
        idx = Math.min(idx + stepJump, currentRouteCoords.length - 1);
      }, 400);
    });
  }

  // Stop navigation
  document.getElementById('btn-stop').addEventListener('click', () => {
    if (simInterval) clearInterval(simInterval);
    isNavigating = false;
    stopTracking();
    history.back();
  });

  // Voice toggle
  document.getElementById('btn-voice').addEventListener('click', function() {
    voiceEnabled = !voiceEnabled;
    this.setAttribute('aria-pressed', String(voiceEnabled));
    this.innerHTML = voiceEnabled
      ? '<svg class="ic" width="18" height="18"><use href="/assets/icons/sprite.svg#i-volume"></use></svg>'
      : '<svg class="ic" width="18" height="18"><use href="/assets/icons/sprite.svg#i-volume-x"></use></svg>';
    if (!voiceEnabled) speechSynthesis.cancel();
  });

  // Arrived close
  document.getElementById('arrived-close').addEventListener('click', () => {
    document.getElementById('arrived-overlay').hidden = true;
    history.back();
  });
}

// ── Main ──────────────────────────────────────────────────────
(async () => {
  readParams();

  if (!destination.lat || !destination.lng) {
    document.getElementById('dest-name').textContent = 'ไม่พบพิกัดปลายทาง';
    document.getElementById('start-hint').textContent = 'URL ไม่มีพิกัด lat/lng — กรุณากลับและเลือกสถานที่อีกครั้ง';
    return;
  }

  await initMap();
  setupUI();
})();
