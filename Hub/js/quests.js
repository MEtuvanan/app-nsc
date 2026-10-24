import { supabase } from './supabase.js';
import { getSession } from './auth.js';

// Columns selected from quests table
const COLS = 'id, title, description, type, difficulty, starts_at, ends_at, reward_tokens, reward_character_id';

// Fetch published quests only (pending partner submissions stay hidden until approved)
export async function listQuests() {
  let data = null, error = null;
  // Select directly from Supabase: quests, image_url, and linked places with their place_images
  const res = await supabase.from('quests')
    .select(`
      ${COLS},
      image_url,
      quest_places(
        place_id,
        places(
          id, name, lat, lng, summary,
          place_images(url, position)
        )
      ),
      campaign_quests(campaign_id)
    `)
    .eq('status', 'published')
    .order('title');

  if (res.error) {
    // Graceful fallback if nested relations or image_url column need simpler query
    console.warn('listQuests primary query note:', res.error);
    const fallback = await supabase.from('quests')
      .select(`${COLS}, quest_places(place_id, places(name, lat, lng, summary)), campaign_quests(campaign_id)`)
      .eq('status', 'published')
      .order('title');
    data = fallback.data;
    error = fallback.error;
  } else {
    data = res.data;
    error = res.error;
  }

  let allQuests = data || [];
  try {
    const adminQuests = JSON.parse(localStorage.getItem('tc_local_custom_quests') || '[]');
    const partnerQuests = JSON.parse(localStorage.getItem('tc_partner_pending_quests') || '[]');
    const publishedLocal = [
      ...adminQuests.filter(q => q.status === 'published'),
      ...partnerQuests.filter(q => q.status === 'published' || q.approval_status === 'approved')
    ];
    if (publishedLocal.length) {
      const existingIds = new Set(allQuests.map(q => q.id));
      const newItems = publishedLocal.filter(lq => !existingIds.has(lq.id));
      allQuests = [...newItems, ...allQuests];
    }
  } catch (e) {
    console.warn('Local quest merge notice:', e);
  }

  // Normalise: ensure arrays exist and derive completion_method from type
  return allQuests.map(q => {
    const qPlaces = (q.quest_places || []).map(qp => {
      const p = qp.places;
      if (!p) return qp;
      const sortedImgs = (p.place_images || []).sort((a, b) => (a.position || 0) - (b.position || 0));
      return {
        ...qp,
        places: {
          ...p,
          cover_image: sortedImgs[0]?.url || null,
          all_images: sortedImgs.map(img => img.url).filter(Boolean)
        }
      };
    });

    return {
      ...q,
      quest_places: qPlaces,
      campaign_quests: q.campaign_quests || [],
      image_url: q.image_url || null,
      completion_method: q.completion_method ?? (q.type === 'code' ? 'code' : 'quiz'),
      instructions: q.instructions ?? null,
    };
  });
}

export async function listQuestsForPlace(placeId) {
  const { data, error } = await supabase.from('quest_places')
    .select('quests(id, title, difficulty, reward_tokens, image_url)').eq('place_id', placeId);
  if (error) throw error;
  return (data || []).map(r => r.quests).filter(Boolean);
}

export async function getQuestQuestions(questId) {
  const { data, error } = await supabase.from('quest_questions')
    .select('id, prompt, position, quest_options(id, label, position)')
    .eq('quest_id', questId).order('position');
  if (error) throw error;
  data.forEach(q => q.quest_options.sort((a, b) => a.position - b.position));
  return data;
}

export async function myProgress() {
  const session = await getSession();
  if (!session) return new Map();
  try {
    let { data, error } = await supabase.from('user_quests')
      .select('quest_id, status, photo_url, caption, gps_lat, gps_lng, gps_dist, completed_at');
    if (error) {
      // Fallback if extra columns not created yet
      const fallback = await supabase.from('user_quests').select('quest_id, status');
      data = fallback.data;
      error = fallback.error;
    }
    if (error) {
      console.warn('user_quests fetch notice:', error);
      return new Map();
    }
    // Returns Map: quest_id => { status, photo_url, ... }
    return new Map((data || []).map(r => [
      r.quest_id,
      {
        status: r.status,
        photo_url: r.photo_url || null,
        caption: r.caption || null,
        gps_lat: r.gps_lat,
        gps_lng: r.gps_lng,
        gps_dist: r.gps_dist,
        completed_at: r.completed_at
      }
    ]));
  } catch {
    return new Map();
  }
}

export const startQuest = id => supabase.rpc('start_quest', { p_quest_id: id });
export const completeQuest = (id, answers, code) =>
  supabase.rpc('complete_quest', { p_quest_id: id, p_answers: answers || {}, p_code: code || null });
