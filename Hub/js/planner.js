/**
 * planner.js — Centered AI Travel Chatbot & Trip Planner 3.0
 * 
 * Features:
 *  - Centered hero prompt box on initial open (Perplexity / ChatGPT style)
 *  - Dual AI capability: General Travel Q&A Chatbot + Grounded Itinerary Planner
 *  - Interactive day-by-day itinerary cards with GPS navigation & place links
 *  - Direct trip saving to Supabase (trips & trip_stops tables)
 *  - Interactive Leaflet route map modal
 *  - Slide-over drawer for past saved trips
 */

import { supabase } from './supabase.js';
import { requireAuth } from './auth.js';
import { AI_PLANNER_URL, SUPABASE_ANON_KEY } from './config.js';
import { AI_CONFIG } from './config.local.js';
import { loadAiCatalog, buildTravelAiSystemPrompt, groundItinerary } from './ai-catalog.js';
import { createMap, setMarkers, drawPath } from './maps.js';
import { esc, toast, confirmDialog } from './ui.js';

const $ = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let currentSession = null;
let chatHistory = [];       // Array of { role: 'user' | 'assistant', content: string, itinerary?: object }
let dbCatalog = [];         // Loaded destinations catalog
let mapInstance = null;
let mapState = {};
let currentMapItinerary = null;

// ── Markdown Parser (Lightweight, robust, handles tables, bold, lists) ────────
function parseMarkdown(md = '') {
  if (!md) return '';
  let html = esc(md);

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  let newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      // Check if it's a separator line |---|---|
      if (/^\|[-|\s]+\|$/.test(line)) {
        continue;
      }
      const cols = line.slice(1, -1).split('|').map(c => c.trim());
      if (!inTable) {
        inTable = true;
        // First row is header
        tableRows.push(`<tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>`);
      } else {
        tableRows.push(`<tr>${cols.map(c => `<td>${c}</td>`).join('')}</tr>`);
      }
    } else {
      if (inTable) {
        newLines.push(`<table><tbody>${tableRows.join('')}</tbody></table>`);
        inTable = false;
        tableRows = [];
      }
      newLines.push(lines[i]);
    }
  }
  if (inTable) {
    newLines.push(`<table><tbody>${tableRows.join('')}</tbody></table>`);
  }
  html = newLines.join('\n');

  // Bullet lists
  html = html.replace(/^\s*[-•*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
  // Clean up nested <ul> tags created by multiline
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Paragraphs & Line Breaks
  html = html.split('\n\n').map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<ul') || p.startsWith('<block')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

// ── Catalog Initializer ───────────────────────────────────────────────────────
async function loadCatalog() {
  try {
    dbCatalog = await loadAiCatalog();
  } catch (err) {
    console.warn('Could not load places from Supabase:', err);
    dbCatalog = [];
  }
}

// ── AI Engine ─────────────────────────────────────────────────────────────────

/** Call Groq with a specific model; returns content string or null on failure */
async function callGroq(apiMessages, model, apiKey) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        temperature: 0.5,
        max_tokens: 2048
      })
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.warn(`Groq [${model}] HTTP ${res.status}:`, errBody);
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content?.trim() || '';
    if (!content) {
      console.warn(`Groq [${model}] returned empty content. finish_reason:`, json.choices?.[0]?.finish_reason);
      return null;
    }
    return content;
  } catch (e) {
    console.warn(`Groq [${model}] fetch error:`, e);
    return null;
  }
}

async function callAI(userPrompt) {
  if (!dbCatalog.length) await loadCatalog();
  const systemPrompt = buildTravelAiSystemPrompt(dbCatalog);

  // Build message sequence for LLM
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-6).map(m => ({ role: m.role, content: m.rawContent || m.content })),
    { role: 'user', content: userPrompt }
  ];

  // ── Priority 1: Groq direct (primary model → fallback model) ──────────────
  if (AI_CONFIG?.apiKey) {
    const primaryModel   = AI_CONFIG.model || 'openai/gpt-oss-120b';
    const fallbackModels = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].filter(m => m !== primaryModel);

    // Try primary
    let content = await callGroq(apiMessages, primaryModel, AI_CONFIG.apiKey);

    // If primary returned empty, try fallback models
    if (!content) {
      for (const m of fallbackModels) {
        content = await callGroq(apiMessages, m, AI_CONFIG.apiKey);
        if (content) break;
      }
    }

    if (content) return content;
    console.warn('All Groq models returned empty — falling through to Edge Function');
  }

  // ── Priority 2: Supabase Edge Function ────────────────────────────────────
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(AI_PLANNER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        prompt: userPrompt,
        history: chatHistory.slice(-6).map(m => ({ role: m.role, content: m.rawContent || m.content }))
      })
    });
    if (res.ok) {
      const data = await res.json();
      const reply = typeof data === 'string' ? data : (data.reply || data.content || '');
      if (reply?.trim()) return reply;
    } else {
      console.warn('Edge function HTTP', res.status, await res.text().catch(() => ''));
    }
  } catch (edgeErr) {
    console.warn('Edge function fallback error:', edgeErr);
  }

  throw new Error('ไม่สามารถเชื่อมต่อกับ AI ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง');
}

// ── Itinerary Parser ──────────────────────────────────────────────────────────
function extractItinerary(fullText = '') {
  const match = fullText.match(/```json:itinerary\s*([\s\S]*?)\s*```/);
  if (!match) return { cleanText: fullText, itinerary: null };

  const cleanText = fullText.replace(/```json:itinerary\s*[\s\S]*?\s*```/, '').trim();
  try {
    const itinerary = JSON.parse(match[1]);

    // Backfill real coordinates from catalog if possible
    const grounded = groundItinerary(itinerary, dbCatalog);
    return { cleanText, itinerary: grounded };
  } catch (e) {
    console.warn('Failed to parse itinerary JSON:', e);
    return { cleanText: fullText, itinerary: null };
  }
}

// ── UI View Switching ─────────────────────────────────────────────────────────
function activateChatView() {
  $('ai-landing-view').hidden = true;
  $('ai-chat-view').hidden = false;
  $('btn-new-chat').hidden = false;
  setTimeout(() => $('chat-input')?.focus(), 150);
}

function resetToLandingView() {
  chatHistory = [];
  $('chat-messages').innerHTML = '';
  $('ai-chat-view').hidden = true;
  $('ai-landing-view').hidden = false;
  $('btn-new-chat').hidden = true;
  $('landing-input').value = '';
  $('landing-input').style.height = 'auto';
  $('landing-input').focus();
}

// ── Rendering Chat Messages ───────────────────────────────────────────────────
function appendUserMessage(text) {
  const container = $('chat-messages');
  const row = document.createElement('div');
  row.className = 'chat-row user-row';
  row.innerHTML = `
    <div class="chat-bubble">
      ${esc(text).replace(/\n/g, '<br>')}
    </div>
    <div class="chat-avatar" title="คุณ">คุณ</div>
  `;
  container.appendChild(row);
  scrollToBottom();
}

function showTypingIndicator() {
  const container = $('chat-messages');
  const row = document.createElement('div');
  row.className = 'chat-row ai-row';
  row.id = 'ai-typing-indicator';
  row.innerHTML = `
    <div class="chat-avatar">✨</div>
    <div class="chat-bubble">
      <div class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  container.appendChild(row);
  scrollToBottom();
}

function removeTypingIndicator() {
  $('ai-typing-indicator')?.remove();
}

function appendAIMessage(cleanText, itinerary = null) {
  removeTypingIndicator();
  const container = $('chat-messages');
  const row = document.createElement('div');
  row.className = 'chat-row ai-row';

  const formattedHtml = parseMarkdown(cleanText);
  let itineraryHtml = '';

  if (itinerary) {
    itineraryHtml = renderItineraryCard(itinerary);
  }

  row.innerHTML = `
    <div class="chat-avatar">✨</div>
    <div class="chat-bubble">
      ${formattedHtml}
      ${itineraryHtml}
    </div>
  `;

  container.appendChild(row);

  // Attach event handlers for the newly rendered itinerary card
  if (itinerary) {
    bindItineraryEvents(row, itinerary);
  }

  scrollToBottom();
}

function scrollToBottom() {
  window.scrollTo({
    top: document.body.scrollHeight,
    behavior: 'smooth'
  });
}

// ── Render Itinerary Card Component ───────────────────────────────────────────
function renderItineraryCard(plan) {
  const totalDays = plan.daily_plan?.length || plan.total_days || 1;
  const days = plan.daily_plan || [];

  return `
    <div class="itinerary-card" data-plan-json="${esc(JSON.stringify(plan))}">
      <div class="itinerary-card-header">
        <div class="itinerary-badge-row">
          <span class="badge" style="background:#0d9488;color:#fff;">🗺️ แผนการเดินทาง</span>
          <span class="badge" style="background:rgba(13,148,136,0.15);color:#0d9488;">${totalDays} วัน</span>
        </div>
        <h4 class="itinerary-card-title">${esc(plan.trip_title || 'แผนท่องเที่ยว')}</h4>
        <p class="itinerary-card-summary">${esc(plan.summary || '')}</p>
      </div>

      ${totalDays > 1 ? `
        <div class="itinerary-day-tabs">
          ${days.map((d, i) => `
            <button class="day-tab-btn ${i === 0 ? 'active' : ''}" data-day="${i + 1}" type="button">
              วันที่ ${d.day || (i + 1)}
            </button>
          `).join('')}
        </div>
      ` : ''}

      <div class="itinerary-stops-container">
        ${days.map((d, i) => `
          <div class="itinerary-stops-list day-pane" data-day-pane="${i + 1}" ${i > 0 ? 'hidden' : ''}>
            ${(d.stops || []).map((s, si) => `
              <div class="itinerary-stop-item">
                <div class="stop-number-badge">${si + 1}</div>
                <div class="stop-details-body">
                  <div class="stop-meta-line">
                    <span>⏰ ${esc(s.arrival_time || 'เวลาแนะนำ')}</span>
                    ${s.duration_minutes ? `<span>· ~${Number(s.duration_minutes)} นาที</span>` : ''}
                  </div>
                  <h5 class="stop-title">${esc(s.name)}</h5>
                  ${s.why ? `<div class="stop-why">${esc(s.why)}</div>` : ''}
                  ${s.notes ? `<div class="stop-notes">💡 ${esc(s.notes)}</div>` : ''}
                  <div class="stop-actions-row">
                    ${s.lat && s.lng ? `
                      <a href="/navigate.html?lat=${s.lat}&lng=${s.lng}&name=${encodeURIComponent(s.name)}" class="btn-stop-action btn-stop-nav" title="เปิดระบบนำทาง GPS จริง">
                        🧭 นำทาง GPS
                      </a>
                    ` : ''}
                    ${s.place_id ? `
                      <a href="/place.html?id=${encodeURIComponent(s.place_id)}" class="btn-stop-action btn-stop-info">
                        ℹ️ ข้อมูลสถานที่
                      </a>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>

      <div class="itinerary-card-footer">
        <button class="btn-itinerary-save" type="button" title="บันทึกลงบัญชีเพื่อเรียกดูภายหลัง">
          💾 บันทึกทริปนี้
        </button>
        <button class="btn-itinerary-map" type="button" title="ดูภาพรวมเส้นทางบนแผนที่">
          🗺️ แสดงแผนที่เส้นทาง
        </button>
      </div>
    </div>
  `;
}

// ── Bind Interactive Actions on Itinerary Card ────────────────────────────────
function bindItineraryEvents(container, plan) {
  // Day tab switcher
  const tabs = container.querySelectorAll('.day-tab-btn');
  const panes = container.querySelectorAll('.day-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const day = tab.dataset.day;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      panes.forEach(p => p.hidden = p.dataset.dayPane !== day);
    });
  });

  // Save Trip to Supabase
  const btnSave = container.querySelector('.btn-itinerary-save');
  btnSave?.addEventListener('click', async () => {
    btnSave.disabled = true;
    btnSave.textContent = 'กำลังบันทึก...';

    try {
      if (!currentSession?.user?.id) {
        toast('กรุณาเข้าสู่ระบบก่อนบันทึกทริป', 'error');
        return;
      }

      const totalDays = plan.daily_plan?.length || plan.total_days || 1;
      const row = {
        title: plan.trip_title || 'ทริปท่องเที่ยว',
        total_days: totalDays,
        user_id: currentSession.user.id,
        preferences: { summary: plan.summary || '', generated_at: new Date().toISOString() }
      };

      const { data: tripData, error: tripErr } = await supabase
        .from('trips')
        .insert(row)
        .select('id')
        .single();

      if (tripErr) throw tripErr;

      // Insert trip stops
      const allStops = [];
      (plan.daily_plan || []).forEach(d => {
        (d.stops || []).forEach((s, idx) => {
          allStops.push({
            trip_id: tripData.id,
            day_number: d.day || 1,
            stop_order: idx + 1,
            place_id: (s.place_id && s.place_id.length > 20) ? s.place_id : null,
            suggested_time: s.arrival_time || null,
            duration_minutes: Number(s.duration_minutes) || null,
            notes: [s.name, s.why, s.notes].filter(Boolean).join(' · ').slice(0, 500)
          });
        });
      });

      if (allStops.length) {
        await supabase.from('trip_stops').insert(allStops);
      }

      toast('บันทึกทริปสำเร็จแล้ว! ดูได้ใน "ทริปที่บันทึกไว้"');
      btnSave.textContent = '✅ บันทึกแล้ว';
      updateSavedCount();
    } catch (e) {
      console.error(e);
      toast('ไม่สามารถบันทึกทริปได้: ' + (e.message || ''), 'error');
      btnSave.disabled = false;
      btnSave.textContent = '💾 บันทึกทริปนี้';
    }
  });

  // Open Map Modal
  const btnMap = container.querySelector('.btn-itinerary-map');
  btnMap?.addEventListener('click', () => {
    openMapModal(plan);
  });
}

// ── Leaflet Route Map Modal ───────────────────────────────────────────────────
async function openMapModal(plan) {
  const modal = $('itinerary-map-modal');
  modal.hidden = false;
  $('map-modal-title').textContent = `🗺️ แผนที่เส้นทาง: ${plan.trip_title || 'ทริปท่องเที่ยว'}`;

  const allStops = (plan.daily_plan || []).flatMap(d => d.stops || []).filter(s => s.lat && s.lng);

  setTimeout(async () => {
    const el = $('itinerary-map');
    try {
      if (!mapInstance) {
        mapInstance = await createMap(el);
      }
      if (allStops.length) {
        setMarkers(mapInstance, mapState, allStops, () => {});
        if (allStops.length > 1) {
          drawPath(mapInstance, mapState, allStops);
        }
      }
    } catch (e) {
      console.warn('Map initialization note:', e);
    }
  }, 100);
}

$('btn-close-map-modal')?.addEventListener('click', () => {
  $('itinerary-map-modal').hidden = true;
});
$('map-modal-backdrop')?.addEventListener('click', () => {
  $('itinerary-map-modal').hidden = true;
});

// ── Saved Trips Drawer ────────────────────────────────────────────────────────
async function updateSavedCount() {
  if (!currentSession?.user?.id) return;
  const { count } = await supabase.from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', currentSession.user.id);
  $('saved-count').textContent = count || 0;
}

async function openSavedDrawer() {
  const drawer = $('saved-trips-drawer');
  drawer.hidden = false;
  const list = $('saved-list');
  list.innerHTML = '<li class="muted">กำลังโหลดทริป...</li>';

  try {
    const { data, error } = await supabase.from('trips')
      .select('id, title, total_days, created_at, trip_stops(id, day_number, stop_order, suggested_time, notes, place_id)')
      .eq('user_id', currentSession.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      list.innerHTML = '<li class="muted">ยังไม่มีทริปที่บันทึกไว้</li>';
      return;
    }

    list.innerHTML = data.map(t => `
      <li class="saved-trip-item">
        <div>
          <a href="#" data-open-saved="${esc(t.id)}">${esc(t.title)}</a>
          <span class="meta">${t.total_days || 1} วัน · ${new Date(t.created_at).toLocaleDateString('th-TH')}</span>
        </div>
        <button class="btn-del-trip" data-del-saved="${esc(t.id)}" type="button" title="ลบทริป">🗑️</button>
      </li>
    `).join('');

    // Attach click events
    list.querySelectorAll('[data-open-saved]').forEach(link => {
      link.addEventListener('click', async e => {
        e.preventDefault();
        const tid = link.dataset.openSaved;
        const trip = data.find(item => item.id === tid);
        if (trip) {
          drawer.hidden = true;
          activateChatView();
          appendUserMessage(`เปิดทริปที่บันทึกไว้: "${trip.title}"`);
          
          // Construct plan object
          const reconstructedPlan = {
            trip_title: trip.title,
            summary: `ทริปที่บันทึกไว้เมื่อ ${new Date(trip.created_at).toLocaleDateString('th-TH')}`,
            total_days: trip.total_days || 1,
            daily_plan: [
              {
                day: 1,
                theme: trip.title,
                stops: (trip.trip_stops || []).map(ts => ({
                  name: ts.notes || 'จุดแวะท่องเที่ยว',
                  arrival_time: ts.suggested_time || '09:00',
                  place_id: ts.place_id,
                  lat: 13.7515,
                  lng: 100.4927
                }))
              }
            ]
          };

          appendAIMessage(`นี่คือรายละเอียดของทริป **${trip.title}** ที่คุณบันทึกไว้ครับ สามารถกดนำทาง GPS หรือดูแผนที่ได้เลย!`, reconstructedPlan);
        }
      });
    });

    list.querySelectorAll('[data-del-saved]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tid = btn.dataset.delSaved;
        const ok = await confirmDialog({
          title: 'ลบทริป',
          message: 'คุณแน่ใจหรือไม่ว่าต้องการลบทริปนี้?',
          confirmLabel: 'ลบทริป',
          danger: true
        });
        if (!ok) return;

        await supabase.from('trip_stops').delete().eq('trip_id', tid);
        await supabase.from('trips').delete().eq('id', tid);
        toast('ลบทริปเรียบร้อย');
        openSavedDrawer();
        updateSavedCount();
      });
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = '<li class="muted">เกิดข้อผิดพลาดในการโหลดทริป</li>';
  }
}

$('btn-open-saved')?.addEventListener('click', openSavedDrawer);
$('btn-close-saved')?.addEventListener('click', () => $('saved-trips-drawer').hidden = true);
$('drawer-overlay')?.addEventListener('click', () => $('saved-trips-drawer').hidden = true);

// ── Handle Sending Prompt (Both Landing & Chat Input) ─────────────────────────
async function handleSendPrompt(inputEl) {
  const query = inputEl.value.trim();
  if (!query) return;

  // Clear input & reset height
  inputEl.value = '';
  inputEl.style.height = 'auto';

  // Ensure Chat View is visible
  activateChatView();

  // Render User Message
  appendUserMessage(query);

  // Show Typing Indicator
  showTypingIndicator();

  // Disable send buttons while thinking
  $('landing-send-btn').disabled = true;
  $('chat-send-btn').disabled = true;

  try {
    const rawReply = await callAI(query);
    const { cleanText, itinerary } = extractItinerary(rawReply);

    // Record in conversation history
    chatHistory.push({ role: 'user', content: query, rawContent: query });
    chatHistory.push({ role: 'assistant', content: cleanText, rawContent: rawReply, itinerary });

    // Render AI Reply
    appendAIMessage(cleanText, itinerary);
  } catch (err) {
    console.error(err);
    removeTypingIndicator();
    appendAIMessage(`ขออภัยครับ เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถรับคำตอบได้'}`);
  } finally {
    $('landing-send-btn').disabled = false;
    $('chat-send-btn').disabled = false;
    $('chat-input')?.focus();
  }
}

// ── Setup Textarea Behavior (Auto-resize & Enter-to-send) ─────────────────────
function setupTextarea(textareaEl, formEl) {
  if (!textareaEl || !formEl) return;

  textareaEl.addEventListener('input', () => {
    textareaEl.style.height = 'auto';
    textareaEl.style.height = Math.min(textareaEl.scrollHeight, 160) + 'px';
  });

  textareaEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formEl.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  formEl.addEventListener('submit', e => {
    e.preventDefault();
    handleSendPrompt(textareaEl);
  });
}

// ── Quick Suggestion Pills ───────────────────────────────────────────────────
document.querySelectorAll('.pill-btn').forEach(pill => {
  pill.addEventListener('click', () => {
    const prompt = pill.dataset.prompt;
    if (prompt) {
      $('landing-input').value = prompt;
      handleSendPrompt($('landing-input'));
    }
  });
});

// ── New Chat Button ───────────────────────────────────────────────────────────
$('btn-new-chat')?.addEventListener('click', () => {
  resetToLandingView();
});

// ── Init on Page Boot ─────────────────────────────────────────────────────────
(async () => {
  currentSession = await requireAuth();
  if (!currentSession) return;

  await loadCatalog();
  updateSavedCount();

  setupTextarea($('landing-input'), $('landing-form'));
  setupTextarea($('chat-input'), $('chat-form'));

  // Check URL params for pre-filled query or place_id
  const p = new URLSearchParams(location.search);
  const q = p.get('q') || p.get('query');
  const placeId = p.get('place_id');

  if (placeId) {
    const matched = dbCatalog.find(c => c.id === placeId);
    const placeName = matched ? matched.name : 'สถานที่นี้';
    $('landing-input').value = `แนะนำข้อมูลและจัดทริปเที่ยวที่ ${placeName}`;
    handleSendPrompt($('landing-input'));
  } else if (q) {
    $('landing-input').value = decodeURIComponent(q);
    handleSendPrompt($('landing-input'));
  } else {
    // Focus landing prompt box
    setTimeout(() => $('landing-input')?.focus(), 200);
  }
})();
