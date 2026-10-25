// rewards.js — token balance helper (thin wrapper around the my_token_balance RPC).
// The actual reward grant logic lives entirely in Supabase security-definer functions.
import { supabase } from './supabase.js';

export async function getTokenBalance() {
  const { data, error } = await supabase.rpc('my_token_balance');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getRecentTransactions(limit = 20) {
  const { data, error } = await supabase
    .from('token_transactions')
    .select('id, amount, source_type, source_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
