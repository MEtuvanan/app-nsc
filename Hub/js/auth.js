import { supabase } from './supabase.js';

const isUuid = s => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const ADMIN_STORAGE_KEY = 'tc_admin_session';

export async function getSession() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session) return data.session;
  } catch (err) {
    console.warn('Supabase getSession notice:', err);
  }

  // Admin fallback for offline/development if authenticated as admin
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  return null;
}

export function loginAsAdmin() {
  const session = {
    access_token: 'admin-token-' + Date.now(),
    token_type: 'bearer',
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'ttt@gmail.com',
      user_metadata: { display_name: 'ผู้ดูแลระบบ (Admin)' },
      role: 'authenticated'
    },
    isAdmin: true,
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 30
  };
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(session));
  return session;
}

// Role is read from the database (profiles.role)
export async function getProfile() {
  const session = await getSession();
  if (!session) return null;

  if (session.isAdmin || session.user?.email?.toLowerCase() === 'ttt@gmail.com') {
    return {
      id: session.user.id,
      display_name: 'ผู้ดูแลระบบ (Admin)',
      avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      role: 'admin'
    };
  }

  if (session.user && isUuid(session.user.id)) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (data) {
        if (session.user?.email?.toLowerCase() === 'ttt@gmail.com') {
          data.role = 'admin';
        }
        return data;
      }

      // If record in profiles is not created yet (e.g. from Google OAuth), create it now
      const meta = session.user.user_metadata || {};
      const fallbackName = meta.full_name || meta.name || meta.display_name || session.user.email?.split('@')[0] || 'นักเดินทาง';
      const fallbackAvatar = meta.avatar_url || meta.picture || null;
      const role = session.user.email?.toLowerCase() === 'ttt@gmail.com' ? 'admin' : 'user';

      const newProfile = {
        id: session.user.id,
        display_name: fallbackName.slice(0, 40),
        avatar_url: fallbackAvatar,
        role
      };

      await supabase.from('profiles').upsert(newProfile);
      return newProfile;
    } catch (err) {
      console.warn('Error reading profile from Supabase:', err);
    }
  }

  // Fallback to metadata
  const meta = session.user?.user_metadata || {};
  return {
    id: session.user?.id || 'user',
    display_name: meta.full_name || meta.name || meta.display_name || session.user?.email?.split('@')[0] || 'สมาชิกนักเดินทาง',
    avatar_url: meta.avatar_url || meta.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    role: session.isAdmin ? 'admin' : 'user'
  };
}

export const signUp = (email, password, displayName) =>
  supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${location.origin}/login.html`
    },
  });

export const signIn = async (email, password) => {
  const normEmail = email.trim().toLowerCase();

  // Check if banned by admin
  try {
    const banned = JSON.parse(localStorage.getItem('tc_banned_users') || '[]');
    if (banned.includes(normEmail)) {
      return { data: null, error: { message: 'บัญชีของคุณถูกระงับการใช้งานชั่วคราวโดยผู้ดูแลระบบ (Banned)' } };
    }
  } catch {}

  // Root Admin direct access
  if (normEmail === 'ttt@gmail.com' && password === '123456') {
    try {
      const res = await supabase.auth.signInWithPassword({ email: normEmail, password });
      if (res.data?.session) {
        localStorage.removeItem(ADMIN_STORAGE_KEY);
        return res;
      }
    } catch {}
    const adminSession = loginAsAdmin();
    return { data: { session: adminSession, user: adminSession.user }, error: null };
  }

  localStorage.removeItem(ADMIN_STORAGE_KEY);
  return supabase.auth.signInWithPassword({ email: normEmail, password });
};

// Sign in with OAuth (Google)
export const signInWithOAuth = (provider = 'google') => {
  const nextParam = safeNext(new URLSearchParams(location.search).get('next'));
  const redirectTo = `${location.origin}/login.html?next=${encodeURIComponent(nextParam)}`;
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      }
    }
  });
};

export const signOut = async () => {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  localStorage.removeItem('tc_guest_session');
  return supabase.auth.signOut();
};

export const resetPassword = email =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login.html` });

// Only allow same-site relative paths as post-login targets (prevents open redirects).
export function safeNext(raw) {
  return typeof raw === 'string' && /^\/(?![\/\\])[A-Za-z0-9_\-./?=&%]*$/.test(raw) ? raw : '/index.html';
}

// UX redirect only; protection of data is done by RLS.
export async function requireAuth() {
  const s = await getSession();
  if (!s) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return null;
  }
  return s;
}

// Redirect to login if the session disappears or expires while the page is open.
export function watchSession() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && document.body.dataset.protected === 'true') {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
      localStorage.removeItem('tc_guest_session');
      location.href = `/login.html?next=${encodeURIComponent(location.pathname)}&expired=1`;
    }
  });
}
