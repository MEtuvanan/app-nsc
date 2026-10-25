import { signIn, signUp, signInWithOAuth, resetPassword, getSession, safeNext } from './auth.js';
import { supabase } from './supabase.js';
import { esc } from './ui.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let mode = 'signin';

function show(text, type = 'error') {
  const m = $('msg');
  if (!m) return;
  m.hidden = false;
  m.className = `alert alert-${type === 'ok' ? 'ok' : 'error'}`;
  m.innerHTML = text;
}

function setMode(next) {
  mode = next;
  const up = mode === 'signup';
  $('title').textContent = up ? 'สมัครสมาชิก (Create account)' : 'เข้าสู่ระบบ (Sign in)';
  $('submit').innerHTML = up ? '<span>สร้างบัญชีผู้ใช้</span> <span class="btn-arrow">→</span>' : '<span>เข้าสู่ระบบ</span> <span class="btn-arrow">→</span>';
  $('toggle').textContent = up ? 'ฉันมีบัญชีอยู่แล้ว (Sign in)' : 'ยังไม่มีบัญชี? สมัครสมาชิกใหม่';
  $('tab-signin')?.setAttribute('aria-selected', String(!up));
  $('tab-signup')?.setAttribute('aria-selected', String(up));
  $('f-name').hidden = !up;
  $('pw-hint').hidden = !up;
  $('password').autocomplete = up ? 'new-password' : 'current-password';
  $('msg').hidden = true;
}

$('tab-signin')?.addEventListener('click', () => setMode('signin'));
$('tab-signup')?.addEventListener('click', () => setMode('signup'));
$('toggle')?.addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));

// Google OAuth Sign-in Handler
$('btn-google')?.addEventListener('click', async () => {
  $('btn-google').disabled = true;
  show('กำลังเชื่อมต่อเข้าสู่ระบบ Google ผ่าน Supabase...', 'ok');
  try {
    const { error } = await signInWithOAuth('google');
    if (error) throw error;
  } catch (err) {
    console.error('Google Sign-in error:', err);
    show('เข้าสู่ระบบด้วย Google ไม่สำเร็จ: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'));
    $('btn-google').disabled = false;
  }
});

$('forgot')?.addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) { show('กรุณากรอกอีเมลก่อน แล้วกด “ลืมรหัสผ่าน?”.'); $('email').focus(); return; }
  const { error } = await resetPassword(email);
  show(error ? 'ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง' : 'หากอีเมลนี้มีอยู่ในระบบ ลิงก์สำหรับตั้งรหัสผ่านใหม่จะถูกส่งไปที่กล่องจดหมายของคุณ', error ? 'error' : 'ok');
});

function translateAuthError(err) {
  const raw = err?.message || String(err || '');
  if (raw.includes('Invalid login credentials')) {
    return '❌ <strong>อีเมลหรือรหัสผ่านไม่ถูกต้อง</strong><br><span style="font-size:0.875rem">หากท่านยังไม่เคยสร้างบัญชี กรุณากดแท็บ <strong>"สมัครสมาชิก"</strong> ด้านบน หรือเข้าสู่ระบบด้วยปุ่ม <strong>"Google"</strong> ครับ</span>';
  }
  if (raw.includes('rate limit') || raw.includes('over_email_send_rate_limit')) {
    return '⚠️ <strong>ระบบส่งอีเมลยืนยันของ Supabase มีการเรียกใช้ถี่เกินไป</strong><br><span style="font-size:0.875rem">กรุณารอสักครู่ หรือเข้าสู่ระบบด้วย Google แทนได้ทันที</span>';
  }
  if (raw.includes('Email not confirmed')) {
    return '⚠️ <strong>บัญชียังไม่ได้รับการยืนยันอีเมล</strong><br><span style="font-size:0.875rem">กรุณากดลิงก์ยืนยันในอีเมลของคุณ หรือเข้าสู่ระบบผ่าน Google</span>';
  }
  if (raw.includes('User already registered')) {
    return 'ℹ️ อีเมลนี้เคยสมัครสมาชิกแล้ว กรุณากดแท็บ <strong>"เข้าสู่ระบบ"</strong> หรือกดลืมรหัสผ่าน';
  }
  if (raw.includes('Password should be at least')) {
    return 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร';
  }
  return raw || 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
}

$('form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !$('email').validity.valid) { show('กรุณากรอกอีเมลที่ถูกต้อง (Enter a valid email address)'); return; }
  if (password.length < 6) { show('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร'); return; }

  $('submit').disabled = true;
  try {
    if (mode === 'signup') {
      const { data, error } = await signUp(email, password, $('name').value.trim() || email.split('@')[0]);
      if (error) throw error;
      if (!data.session) {
        show('✅ สร้างบัญชีสำเร็จ! กรุณาตรวจสอบกล่องข้อความในอีเมลของคุณเพื่อยืนยันบัญชี หรือเข้าสู่ระบบได้ทันที', 'ok');
        setMode('signin');
        return;
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) throw error;
    }
    location.href = safeNext(params.get('next'));
  } catch (err) {
    show(translateAuthError(err));
  } finally {
    $('submit').disabled = false;
  }
});

// Auto-redirect if already logged in or after OAuth callback
(async () => {
  if (params.get('expired')) show('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');

  // Supabase auth state listener for OAuth redirect
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      location.href = safeNext(params.get('next'));
    }
  });

  const session = await getSession();
  if (session && !params.get('expired')) {
    location.href = safeNext(params.get('next'));
  }
})();
