/**
 * ai-planner-modal.js — Explore Page Centered Bottom Chatbot & Round Popup Widget
 * 
 * Features:
 *  - Positioned bottom-center on Explore page
 *  - Close button minimizes it into a round popup button on the right
 *  - Suggestions shown ONLY on initial entry (removed upon interaction)
 *  - Full AI Chatbot + Trip Planning capability
 *  - Interacts with the Explore page map (pan/zoom to places)
 */

import { supabase } from './supabase.js';
import { AI_PLANNER_URL, SUPABASE_ANON_KEY } from './config.js';
import { AI_CONFIG } from './config.local.js';
import { loadAiCatalog, buildTravelAiSystemPrompt, groundItinerary } from './ai-catalog.js';
import { esc, toast } from './ui.js';

// Markdown parser
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

  // Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  let newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (/^\|[-|\s]+\|$/.test(line)) continue;
      const cols = line.slice(1, -1).split('|').map(c => c.trim());
      if (!inTable) {
        inTable = true;
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

  // Lists
  html = html.replace(/^\s*[-•*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gms, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Paragraphs
  html = html.split('\n\n').map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<ul')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

export class ExploreAIChatbot {
  constructor() {
    this.isOpen = true;
    this.hasInteracted = false;
    this.messages = [];
    this.catalog = [];
    this.initCatalog();
    this.initDOM();
  }

  async initCatalog() {
    try {
      this.catalog = await loadAiCatalog();
    } catch (_) {
      this.catalog = [];
    }
    this.applyCatalogPills();
  }

  applyCatalogPills() {
    const wrap = document.getElementById('dock-pills');
    if (!wrap || !this.catalog.length) return;
    const [a, b, c] = this.catalog;
    const pills = [];
    if (a) pills.push([`ℹ️ ${a.name}`, `${a.name} มีจุดเด่นอะไร เปิดกี่โมง แต่งตัวยังไง และเดินทางยังไง จากข้อมูลในเว็บ`]);
    if (b) pills.push(['🗺️ ทริป 1 วัน', `จัดทริปเที่ยว 1 วันจากสถานที่ที่มีในเว็บนี้ โดยเริ่มที่ ${b.name}`]);
    if (this.catalog.some(p => p.quests?.length)) {
      pills.push(['📸 เควสท์ในเว็บ', 'มีเควสท์อะไรในเว็บนี้บ้าง แนะนำจากสถานที่ที่มีเควสท์ในระบบเท่านั้น']);
    } else if (c && a) {
      pills.push(['⚖️ เปรียบเทียบ', `เปรียบเทียบ ${a.name} กับ ${c.name} จากข้อมูลในเว็บนี้เท่านั้น`]);
    }
    wrap.innerHTML = `<span class="dock-pills-label">💡 ลองถาม:</span>` + pills.map(([label, q]) =>
      `<button class="dock-pill-btn" type="button" data-q="${esc(q)}">${esc(label)}</button>`
    ).join('');
    wrap.querySelectorAll('.dock-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        const textarea = document.getElementById('dock-input');
        if (q && textarea) {
          textarea.value = q;
          this.handleSend();
        }
      });
    });
  }

  initDOM() {
    // 1. Bottom-Center Chatbot Dock
    const dock = document.createElement('aside');
    dock.className = 'ai-bottom-dock';
    dock.id = 'ai-bottom-dock';
    dock.setAttribute('aria-label', 'AI ผู้ช่วยท่องเที่ยว');

    dock.innerHTML = `
      <header class="ai-dock-header">
        <div class="ai-dock-title-wrap">
          <span class="ai-dock-sparkle">✨</span>
          <span class="ai-dock-title">AI ผู้ช่วยท่องเที่ยว & วางแผน</span>
          <span class="ai-dock-badge">พร้อมตอบ</span>
        </div>
        <div class="ai-dock-actions">
          <button class="ai-dock-btn-reset" id="btn-dock-reset" type="button" title="เริ่มสนทนาใหม่" hidden>
            <span>🔄</span> แชทใหม่
          </button>
          <button class="ai-dock-btn-close" id="btn-dock-close" type="button" aria-label="ย่อเป็นปุ่มลอย" title="ย่อเป็นปุ่มลอย">✕</button>
        </div>
      </header>

      <!-- Chat Messages Container (Hidden initially until first message) -->
      <div class="ai-dock-messages" id="dock-messages"></div>

      <!-- Suggestion Pills (Shown ONLY on first entry) -->
      <div class="ai-dock-pills-wrap" id="dock-pills">
        <span class="dock-pills-label">💡 ลองถาม:</span>
        <button class="dock-pill-btn" type="button" data-q="มีสถานที่อะไรในเว็บบ้าง แนะนำจากรายการในระบบ">📍 สถานที่ในเว็บ</button>
        <button class="dock-pill-btn" type="button" data-q="จัดทริป 1 วันจากสถานที่ที่มีในเว็บนี้">🗺️ จัดทริป 1 วัน</button>
        <button class="dock-pill-btn" type="button" data-q="มีเควสท์อะไรในเว็บนี้บ้าง">📸 เควสท์ในเว็บ</button>
      </div>

      <!-- Dock Input Bar -->
      <form class="ai-dock-form" id="dock-form">
        <div class="ai-dock-input-row">
          <textarea id="dock-input" rows="1" placeholder="ถามหรือขอจัดทริปจากสถานที่ที่มีในเว็บนี้..." autocomplete="off"></textarea>
          <button class="ai-dock-send-btn" id="dock-send-btn" type="submit" aria-label="ส่งข้อความ" title="ส่งข้อความ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </form>
    `;
    document.body.appendChild(dock);

    // 2. Round Floating Button on the Right (Minimized State)
    const fab = document.createElement('button');
    fab.className = 'ai-fab-round-right';
    fab.id = 'ai-fab-round-right';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'เปิด AI ผู้ช่วยท่องเที่ยว');
    fab.setAttribute('title', 'เปิด AI ผู้ช่วยท่องเที่ยว');
    fab.innerHTML = `
      <span class="ai-fab-sparkle">✨</span>
      <span class="ai-fab-round-badge">AI</span>
    `;
    document.body.appendChild(fab);

    // Bind Minimize / Re-open Events
    document.getElementById('btn-dock-close').addEventListener('click', () => this.minimize());
    fab.addEventListener('click', () => this.maximize());

    // Bind Textarea Auto-resize & Enter-to-send
    const textarea = document.getElementById('dock-input');
    const form = document.getElementById('dock-form');

    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      this.handleSend();
    });

    // Pills are wired in applyCatalogPills after catalog loads; bind defaults now
    document.querySelectorAll('.dock-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.q;
        if (q) {
          textarea.value = q;
          this.handleSend();
        }
      });
    });

    // Reset button
    document.getElementById('btn-dock-reset')?.addEventListener('click', () => {
      this.messages = [];
      document.getElementById('dock-messages').innerHTML = '';
      document.getElementById('btn-dock-reset').hidden = true;
      textarea.value = '';
      textarea.focus();
    });

    if (this.catalog.length) this.applyCatalogPills();
  }

  minimize() {
    this.isOpen = false;
    document.getElementById('ai-bottom-dock').classList.add('minimized');
    document.getElementById('ai-fab-round-right').classList.add('visible');
  }

  maximize() {
    this.isOpen = true;
    document.getElementById('ai-fab-round-right').classList.remove('visible');
    document.getElementById('ai-bottom-dock').classList.remove('minimized');
    setTimeout(() => document.getElementById('dock-input')?.focus(), 200);
  }

  removeSuggestions() {
    if (!this.hasInteracted) {
      this.hasInteracted = true;
      const pills = document.getElementById('dock-pills');
      if (pills) pills.remove();
    }
  }

  async handleSend() {
    const input = document.getElementById('dock-input');
    const query = input.value.trim();
    if (!query) return;

    // 1. Remove suggestions permanently on first interaction
    this.removeSuggestions();

    // 2. Clear input
    input.value = '';
    input.style.height = 'auto';

    // 3. Show Reset Button
    document.getElementById('btn-dock-reset').hidden = false;

    // 4. Append user message
    this.appendUserMsg(query);

    // 5. Append typing indicator
    this.showTyping();

    // 6. Disable send button while generating
    const sendBtn = document.getElementById('dock-send-btn');
    sendBtn.disabled = true;

    try {
      const rawReply = await this.callAI(query);
      this.removeTyping();

      const { cleanText, itinerary } = this.extractItinerary(rawReply);
      this.messages.push({ role: 'user', content: query });
      this.messages.push({ role: 'assistant', content: cleanText });

      this.appendAIMsg(cleanText, itinerary);
    } catch (err) {
      console.error(err);
      this.removeTyping();
      this.appendAIMsg(`ขออภัยครับ เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถรับคำตอบได้'}`);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  async callAI(userPrompt) {
    if (!this.catalog.length) await this.initCatalog();
    const systemPrompt = buildTravelAiSystemPrompt(this.catalog);

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...this.messages.slice(-4),
      { role: 'user', content: userPrompt }
    ];

    if (AI_CONFIG?.apiKey) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AI_CONFIG.apiKey}`
        },
        body: JSON.stringify({
          model: AI_CONFIG.model || 'openai/gpt-oss-120b',
          messages: apiMessages,
          temperature: 0.4,
          max_tokens: 1500
        })
      });

      if (res.ok) {
        const json = await res.json();
        return json.choices?.[0]?.message?.content || '';
      }
    }

    // Fallback: Edge Function
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
        history: this.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
      })
    });
    if (res.ok) {
      const data = await res.json();
      return typeof data === 'string' ? data : (data.reply || data.content || JSON.stringify(data));
    }

    throw new Error('ไม่สามารถติดต่อ AI ได้ในขณะนี้');
  }

  extractItinerary(fullText = '') {
    const match = fullText.match(/```json:itinerary\s*([\s\S]*?)\s*```/);
    if (!match) return { cleanText: fullText, itinerary: null };
    const cleanText = fullText.replace(/```json:itinerary\s*[\s\S]*?\s*```/, '').trim();
    try {
      const itinerary = groundItinerary(JSON.parse(match[1]), this.catalog);
      return { cleanText, itinerary };
    } catch (_) {
      return { cleanText: fullText, itinerary: null };
    }
  }

  appendUserMsg(text) {
    const box = document.getElementById('dock-messages');
    const row = document.createElement('div');
    row.className = 'dock-msg-row user';
    row.innerHTML = `
      <div class="dock-msg-bubble">${esc(text).replace(/\n/g, '<br>')}</div>
      <div class="dock-msg-avatar">คุณ</div>
    `;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  showTyping() {
    const box = document.getElementById('dock-messages');
    const row = document.createElement('div');
    row.className = 'dock-msg-row ai';
    row.id = 'dock-typing-row';
    row.innerHTML = `
      <div class="dock-msg-avatar">✨</div>
      <div class="dock-msg-bubble">
        <div class="dock-typing">
          <span class="dock-typing-dot"></span>
          <span class="dock-typing-dot"></span>
          <span class="dock-typing-dot"></span>
        </div>
      </div>
    `;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  removeTyping() {
    document.getElementById('dock-typing-row')?.remove();
  }

  appendAIMsg(cleanText, itinerary = null) {
    const box = document.getElementById('dock-messages');
    const row = document.createElement('div');
    row.className = 'dock-msg-row ai';

    let itinHtml = '';
    if (itinerary && Array.isArray(itinerary.stops)) {
      itinHtml = `
        <div class="dock-itinerary-card">
          <div class="dock-itinerary-header">
            <div class="dock-itinerary-title">🗺️ ${esc(itinerary.trip_title || 'แผนท่องเที่ยวแนะนำ')}</div>
            <p class="dock-itinerary-summary">${esc(itinerary.summary || '')}</p>
          </div>
          <div class="dock-stops-list">
            ${itinerary.stops.map((s, idx) => `
              <div class="dock-stop-item">
                <div class="dock-stop-num">${idx + 1}</div>
                <div class="dock-stop-info">
                  <div class="dock-stop-name">${esc(s.name)} ${s.arrival_time ? `<span style="font-size:0.75rem;color:#64748b;font-weight:normal;">(${esc(s.arrival_time)})</span>` : ''}</div>
                  ${s.why ? `<div class="dock-stop-desc">${esc(s.why)}</div>` : ''}
                  <div class="dock-stop-actions">
                    ${s.lat && s.lng ? `
                      <a href="/navigate.html?lat=${s.lat}&lng=${s.lng}&name=${encodeURIComponent(s.name)}" class="btn-dock-nav">
                        🧭 นำทาง GPS
                      </a>
                      <button type="button" class="btn-dock-map" data-lat="${s.lat}" data-lng="${s.lng}" data-name="${esc(s.name)}">
                        📍 ดูบนแผนที่
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="dock-msg-avatar">✨</div>
      <div class="dock-msg-bubble">
        ${parseMarkdown(cleanText)}
        ${itinHtml}
      </div>
    `;
    box.appendChild(row);

    // Pan map on Explore page if "ดูบนแผนที่" clicked
    row.querySelectorAll('.btn-dock-map').forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        const name = btn.dataset.name;
        if (window.__exploreMap && !isNaN(lat) && !isNaN(lng)) {
          window.__exploreMap.setView([lat, lng], 15);
          toast(`ปักหมุดไปที่: ${name}`);
        }
      });
    });

    box.scrollTop = box.scrollHeight;
  }
}

let instance = null;
export function initAIPlannerModal() {
  if (!instance) {
    instance = new ExploreAIChatbot();
  }
  return instance;
}
