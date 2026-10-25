// ai-catalog.js — load every published place on the site for AI grounding
import { supabase } from './supabase.js';
import { enrichPlaceData } from './places-data.js';

const PAGE = 1000;

function publishedQuest(q) {
  if (!q) return false;
  if (q.status && q.status !== 'published') return false;
  if (q.approval_status === 'pending' || q.approval_status === 'rejected') return false;
  return true;
}

export async function loadAiCatalog() {
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from('places')
      .select(`
        id, name, summary, description, visitor_info, opening_hours, entry_fee,
        history, highlights, tips, lat, lng, approval_status, status,
        provinces(name_th, name_en),
        districts(name_th, name_en),
        place_categories(name),
        quest_places(quests(id, title, difficulty, reward_tokens, status, approval_status))
      `)
      .eq('status', 'published')
      .order('name')
      .range(from, from + PAGE - 1);

    let { data, error } = await query;
    if (error && String(error.message || '').includes('quest_places')) {
      const retry = await supabase
        .from('places')
        .select(`
          id, name, summary, description, visitor_info, opening_hours, entry_fee,
          history, highlights, tips, lat, lng, approval_status, status,
          provinces(name_th, name_en),
          districts(name_th, name_en),
          place_categories(name)
        `)
        .eq('status', 'published')
        .order('name')
        .range(from, from + PAGE - 1);
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return rows
    .filter(p => p.approval_status !== 'pending' && p.approval_status !== 'rejected')
    .map(p => {
      const e = enrichPlaceData(p);
      const quests = (p.quest_places || [])
        .map(qp => qp.quests)
        .filter(publishedQuest)
        .map(q => ({
          id: q.id,
          title: q.title,
          difficulty: q.difficulty || '',
          tokens: q.reward_tokens || 0
        }));
      return {
        id: p.id,
        name: e.name_display || p.name,
        name_en: e.name_en_display || p.name,
        category: p.place_categories?.name || '',
        province: p.provinces?.name_th || p.provinces?.name_en || '',
        district: p.districts?.name_th || p.districts?.name_en || '',
        summary: String(e.summary_display || p.summary || '').slice(0, 400),
        description: String(e.description_display || p.description || '').slice(0, 500),
        visitor_info: e.visitor_info_display || p.visitor_info || '',
        opening_hours: e.opening_hours_display || p.opening_hours || '',
        entry_fee: e.entry_fee_display || p.entry_fee || '',
        transportation: e.transportation_display || p.tips || '',
        best_time: e.best_time_display || '',
        highlights: (e.highlights_display || []).map(h => h.title).filter(Boolean).slice(0, 4),
        lat: p.lat,
        lng: p.lng,
        quests
      };
    });
}

export function formatCatalogForPrompt(catalog) {
  const compact = catalog.length > 40;
  return catalog.map((c, i) => {
    const loc = [c.district, c.province].filter(Boolean).join(', ');
    const q = c.quests.length
      ? `เควสท์ในเว็บ: ${c.quests.map(x => `${x.title}${x.tokens ? ` (${x.tokens} โทเคน)` : ''}`).join('; ')}`
      : '';
    const hl = c.highlights.length ? `จุดเด่น: ${c.highlights.join(', ')}` : '';
    if (compact) {
      return `${i + 1}. [ID:${c.id}] ${c.name}${loc ? ` (${loc})` : ''} | ${c.category || ''} | ${c.summary}${c.opening_hours ? ` | เวลา: ${c.opening_hours}` : ''}${q ? ` | ${q}` : ''}`;
    }
    return `${i + 1}. [ID:${c.id}] ${c.name}${loc ? ` — ${loc}` : ''} (${c.category || 'สถานที่'})
สรุป: ${c.summary || c.description || '—'}
${c.opening_hours ? `เวลาเปิด-ปิดในระบบ: ${c.opening_hours}` : 'เวลาเปิด-ปิด: ยังไม่มีในระบบ'}
${c.entry_fee ? `ค่าเข้าชมในระบบ: ${c.entry_fee}` : ''}
${c.visitor_info ? `คำแนะนำนักท่องเที่ยว: ${c.visitor_info}` : ''}
${c.transportation ? `การเดินทาง: ${c.transportation}` : ''}
${c.best_time ? `ช่วงเวลาที่เหมาะ: ${c.best_time}` : ''}
${hl}
${q}
พิกัด: ${c.lat}, ${c.lng}`.replace(/\n{3,}/g, '\n\n').trim();
  }).join('\n\n');
}

export function buildTravelAiSystemPrompt(catalog) {
  // ── ถ้าไม่มี catalog ให้ตอบแบบทั่วไป ────────────────────────────────────────
  if (!catalog.length) {
    return `คุณคือ "Travel & Challenge AI" ผู้ช่วยวางแผนการท่องเที่ยวไทย ตอบเป็นภาษาไทยที่สุภาพและเป็นประโยชน์
ตอบคำถามท่องเที่ยว แนะนำสถานที่ ช่วยวางแผนทริป และให้ข้อมูลเกี่ยวกับการเดินทางในประเทศไทยได้ทั่วไป
ถ้าผู้ใช้ขอจัดทริป ให้วางแผน day-by-day พร้อมเวลาและเหตุผล`;
  }

  // ── จำกัดขนาด catalog ไม่เกิน 60 รายการเพื่อป้องกัน context overflow ─────
  const MAX_CATALOG = 60;
  const usedCatalog = catalog.length > MAX_CATALOG ? catalog.slice(0, MAX_CATALOG) : catalog;
  const hasMore = catalog.length > MAX_CATALOG;

  const names = usedCatalog.map(c => c.name).join(', ');
  return `คุณคือ "Travel & Challenge AI" ผู้ช่วยวางแผนท่องเที่ยวในเว็บ Travel & Challenge ตอบเป็นภาษาไทยที่สุภาพและชัดเจน

แนวทาง:
- สถานที่ที่มีในระบบ (${usedCatalog.length} แห่ง${hasMore ? ` จาก ${catalog.length} แห่งทั้งหมด` : ''}): ${names}
- **ให้ความสำคัญกับสถานที่ในระบบก่อน** เมื่อแนะนำสถานที่ในรายการ ให้ใส่ข้อมูลจากระบบด้วย (เวลาเปิด-ปิด เควสท์ พิกัด)
- สำหรับสถานที่ที่ไม่มีในระบบ สามารถตอบข้อมูลทั่วไปได้ แต่ให้บอกว่าสถานที่นั้นยังไม่มีเควสท์หรือเช็คอินในแอป
- เมื่อผู้ใช้ขอจัดทริปหรือเส้นทาง ให้วางแผน day-by-day จากสถานที่ในระบบ แล้วปิดท้ายด้วยบล็อก \`\`\`json:itinerary
- คำถามทั่วไปเกี่ยวกับท่องเที่ยวตอบได้โดยไม่ต้องใส่ json:itinerary

สถานที่ในระบบ (ข้อมูลครบ):
${formatCatalogForPrompt(usedCatalog)}

รูปแบบ json:itinerary (ใช้เฉพาะเมื่อผู้ใช้ขอวางแผนทริป):
\`\`\`json:itinerary
{
  "trip_title": "ชื่อทริป",
  "summary": "สรุปทริป",
  "total_days": 1,
  "daily_plan": [
    {
      "day": 1,
      "theme": "ธีม",
      "stops": [
        {
          "place_id": "uuid จากรายการ (ใส่เฉพาะสถานที่ในระบบ)",
          "name": "ชื่อสถานที่",
          "arrival_time": "09:00",
          "duration_minutes": 90,
          "why": "เหตุผล",
          "notes": "คำแนะนำ",
          "lat": 13.75,
          "lng": 100.49
        }
      ]
    }
  ]
}
\`\`\``;
}

function matchPlace(stop, catalog) {
  if (!stop || !catalog.length) return null;
  if (stop.place_id) {
    const byId = catalog.find(c => c.id === stop.place_id);
    if (byId) return byId;
  }
  const name = String(stop.name || '').trim().toLowerCase();
  if (!name) return null;
  return catalog.find(c => {
    const n = (c.name || '').toLowerCase();
    const en = (c.name_en || '').toLowerCase();
    return n === name || en === name || n.includes(name) || name.includes(n) || (en && (en.includes(name) || name.includes(en)));
  }) || null;
}

function groundStop(stop, catalog) {
  const place = matchPlace(stop, catalog);
  if (!place) return null;
  return {
    ...stop,
    place_id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng
  };
}

export function groundItinerary(itinerary, catalog) {
  if (!itinerary || !catalog?.length) return null;

  if (Array.isArray(itinerary.daily_plan)) {
    itinerary.daily_plan = itinerary.daily_plan
      .map(day => ({
        ...day,
        stops: (day.stops || []).map(s => groundStop(s, catalog)).filter(Boolean)
      }))
      .filter(day => day.stops.length);
    if (!itinerary.daily_plan.length) return null;
    itinerary.stops = itinerary.daily_plan.flatMap(d => d.stops);
    return itinerary;
  }

  if (Array.isArray(itinerary.stops)) {
    itinerary.stops = itinerary.stops.map(s => groundStop(s, catalog)).filter(Boolean);
    if (!itinerary.stops.length) return null;
    return itinerary;
  }

  return null;
}
