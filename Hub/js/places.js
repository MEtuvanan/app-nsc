import { supabase } from './supabase.js';
import { isUuid } from './ui.js';
import { enrichPlaceData } from './places-data.js';

export { isUuid, enrichPlaceData };

const LIST_COLS = 'id, name, summary, description, lat, lng, province_id, district_id, category_id, status, place_images(url, alt, position)';

// Select places (published or draft fallback for preview), sorted by name
export async function listPlaces({ search, provinceId, districtId, categoryId } = {}) {
  let q = supabase.from('places').select(LIST_COLS).eq('status', 'published').neq('approval_status', 'pending').order('name');
  if (provinceId) q = q.eq('province_id', provinceId);
  if (districtId) q = q.eq('district_id', districtId);
  if (categoryId) q = q.eq('category_id', categoryId);
  
  const { data, error } = await q;
  if (error) throw error;

  let places = (data || []).map(p => enrichPlaceData(p));

  const term = (search || '').trim().toLowerCase();
  if (term) {
    places = places.filter(p => {
      const nameEn = (p.name || '').toLowerCase();
      const nameTh = (p.name_display || '').toLowerCase();
      const sumEn = (p.summary || '').toLowerCase();
      const sumTh = (p.summary_display || '').toLowerCase();
      const descTh = (p.description_display || '').toLowerCase();
      const catTh = (p.category_th || '').toLowerCase();
      const highlights = (p.highlights_display || []).map(h => (h.title || '') + ' ' + (h.desc || '')).join(' ').toLowerCase();

      return nameEn.includes(term) ||
             nameTh.includes(term) ||
             sumEn.includes(term) ||
             sumTh.includes(term) ||
             descTh.includes(term) ||
             catTh.includes(term) ||
             highlights.includes(term);
    });
  }

  return places;
}

export async function getFilterOptions() {
  const [p, d, c] = await Promise.all([
    supabase.from('provinces').select('id, name_en, name_th').order('id'),
    supabase.from('districts').select('id, province_id, name_en, name_th').order('id'),
    supabase.from('place_categories').select('id, name, slug').order('id'),
  ]);
  for (const r of [p, d, c]) if (r.error) throw r.error;
  return { provinces: p.data, districts: d.data, categories: c.data };
}

export async function getPlace(id) {
  if (!isUuid(id)) throw new Error('invalid id');
  const { data, error } = await supabase.from('places')
    .select(`*, provinces(name_en), districts(name_en), place_categories(name), place_images(url, alt, position)`)
    .eq('id', id).eq('status', 'published').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.place_images) data.place_images.sort((a, b) => a.position - b.position);
  else data.place_images = [];
  return enrichPlaceData(data);
}

// Public counts used for "has quests / campaigns" indicators.
export async function getPlaceIndicators() {
  const [q, c] = await Promise.all([
    supabase.from('quest_places').select('place_id'),
    supabase.from('campaign_places').select('place_id'),
  ]);
  const toSet = r => new Set((r.data || []).map(x => x.place_id));
  return { quests: toSet(q), campaigns: toSet(c) };
}
