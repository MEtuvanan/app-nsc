// campaigns.js — public campaign helpers used by home and quest pages.
import { supabase } from './supabase.js';

export async function listPublishedCampaigns() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id, title, description, starts_at, ends_at, status')
    .eq('status', 'published')
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getCampaign(id) {
  const { data, error } = await supabase
    .from('campaigns')
    .select(`
      id, title, description, starts_at, ends_at, status, reward_tokens,
      campaign_places(places(id, name)),
      campaign_quests(quests(id, title, difficulty, reward_tokens))
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Join and claim campaign reward — both are server-validated.
export const joinCampaign = id =>
  supabase.from('campaign_participants').insert({ campaign_id: id });

export const claimCampaignReward = id =>
  supabase.rpc('claim_campaign_reward', { p_campaign_id: id });
