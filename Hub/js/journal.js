import { supabase } from './supabase.js';

const BUCKET = 'diary-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function validatePhoto(file) {
  if (!EXT[file.type]) return `${file.name}: only JPG, PNG or WebP images are allowed.`;
  if (file.size > MAX_BYTES) return `${file.name}: larger than 5 MB.`;
  return null;
}

export async function listDiaries({ from, to, placeId } = {}) {
  let q = supabase.from('travel_diaries')
    .select('id, title, body, travel_date, mood, diary_place_links(place_id, places(name)), diary_photos(id, storage_path, caption, position)')
    .order('travel_date', { ascending: false });
  if (from) q = q.gte('travel_date', from);
  if (to) q = q.lte('travel_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return placeId ? data.filter(d => d.diary_place_links.some(l => l.place_id === placeId)) : data;
}

// Photos are private: only short-lived signed URLs are ever used.
export async function signedUrls(paths) {
  if (!paths.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  return new Map(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

async function setPlaces(diaryId, placeIds) {
  const { error: delErr } = await supabase.from('diary_place_links').delete().eq('diary_id', diaryId);
  if (delErr) throw delErr;
  if (placeIds.length) {
    const { error } = await supabase.from('diary_place_links')
      .insert(placeIds.map(place_id => ({ diary_id: diaryId, place_id })));
    if (error) throw error;
  }
}

export async function uploadPhotos(userId, diaryId, items, startPos = 0) {
  const failed = [];
  for (const [i, { file, caption }] of items.entries()) {
    if (validatePhoto(file)) { failed.push(file.name); continue; }
    const path = `${userId}/${diaryId}/${crypto.randomUUID()}.${EXT[file.type]}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) { failed.push(file.name); continue; }
    const { error } = await supabase.from('diary_photos').insert({
      diary_id: diaryId, user_id: userId, storage_path: path, caption: caption || null, position: startPos + i,
    });
    if (error) { await supabase.storage.from(BUCKET).remove([path]); failed.push(file.name); }
  }
  return failed;
}

export async function saveDiary({ id, userId, title, body, travel_date, mood, placeIds, photos, startPos = 0 }) {
  const row = { title, body: body || null, travel_date, mood: mood || null };
  let diaryId = id;
  if (id) {
    const { error } = await supabase.from('travel_diaries').update(row).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('travel_diaries')
      .insert({ ...row, user_id: userId }).select('id').single();
    if (error) throw error;
    diaryId = data.id;
  }
  await setPlaces(diaryId, placeIds);
  const failed = await uploadPhotos(userId, diaryId, photos, startPos);
  return { diaryId, failed };
}

export async function deletePhoto(photo) {
  const { error } = await supabase.from('diary_photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([photo.storage_path]);
}

export async function deleteDiary(diary) {
  const paths = diary.diary_photos.map(p => p.storage_path);
  const { error } = await supabase.from('travel_diaries').delete().eq('id', diary.id);
  if (error) throw error;
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
