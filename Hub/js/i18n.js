// i18n.js — Language and localization management (Thai & English)
const STORAGE_KEY = 'tc_lang';

export const DICT = {
  th: {
    // Nav
    nav_explore: 'สำรวจสถานที่',
    nav_quests: 'เควสท์ & ภารกิจ',
    nav_planner: 'AI แชท & วางแผน',
    nav_collection: 'ตัวละครสะสม',
    nav_journal: 'ปฏิทิน & ไดอารี่',
    nav_calendar: 'ปฏิทิน & ไดอารี่',
    nav_help: 'คู่มือใช้งาน',
    nav_partner: 'เพิ่มสถานที่',
    nav_admin: 'ผู้ดูแลระบบ',
    nav_signin: 'เข้าสู่ระบบ',
    nav_signout: 'ออกจากระบบ',
    nav_profile: 'โปรไฟล์ของฉัน',

    // Quests page
    quests_title: 'เควสท์ & ภารกิจท่องเที่ยว',
    quests_subtitle: 'พิชิตเควสท์ประจำสถานที่จริง ตอบคำถามประวัติศาสตร์และวัฒนธรรมไทย หรือใส่รหัสเช็คอิน เพื่อรับเหรียญโทเคนและปลดล็อกตัวละครสะสมสุดพิเศษ!',
    tab_all: 'ทั้งหมด',
    tab_active: 'กำลังทำ',
    tab_completed: 'สำเร็จแล้ว',
    filter_type: 'ประเภทเควสท์',
    filter_diff: 'ระดับความยาก',
    filter_place: 'สถานที่',
    filter_camp: 'แคมเปญ',
    filter_all_types: 'ทุกประเภท',
    filter_all_diff: 'ทุกระดับ',
    filter_all_places: 'ทุกสถานที่',
    filter_all_camps: 'ทุกแคมเปญ',
    diff_easy: 'ง่าย',
    diff_medium: 'ปานกลาง',
    diff_hard: 'ท้าทาย',
    type_quiz: 'ตอบคำถาม (Quiz)',
    type_code: 'รหัสเช็คอิน (Check-in)',
    type_exploration: 'การสำรวจ (Exploration)',
    type_culture: 'วัฒนธรรมท้องถิ่น (Culture)',
    type_history: 'ประวัติศาสตร์ (History)',
    type_photo: 'ถ่ายภาพ (Photo)',
    status_not_started: 'ยังไม่เริ่ม',
    status_in_progress: 'กำลังทำ',
    status_completed: 'สำเร็จแล้ว',
    btn_start: 'เริ่มทำเควสท์',
    btn_continue: 'ทำเควสท์ต่อ',
    btn_view: 'ดูผลลัพธ์',
    reward_label: 'รางวัล:',
    reward_tokens: 'โทเคน',
    reward_character: '+ ตัวละครพิเศษ',
    modal_submit: 'ส่งคำตอบ',
    modal_close: 'ปิดหน้าต่าง',
    modal_enter_code: 'กรอกรหัสเช็คอินที่ได้รับจากสถานที่',
    modal_code_hint: 'รหัสเช็คอินมีระบุ ณ จุดบริการนักท่องเที่ยวหรือป้ายกิจกรรม',
    modal_success: 'ยินดีด้วย! คุณพิชิตเควสท์สำเร็จ ได้รับรางวัลเรียบร้อย',
    modal_wrong: 'คำตอบยังไม่ถูกต้อง ลองใหม่อีกครั้งนะครับ',
    modal_already_done: 'คุณเคยทำเควสท์นี้สำเร็จแล้ว',

    // Common
    search_placeholder: 'ค้นหาชื่อเควสท์หรือสถานที่...',
    loading: 'กำลังโหลด...',
    lang_btn: 'TH',
    lang_toggle_title: 'Switch to English',
  },
  en: {
    // Nav
    nav_explore: 'Explore',
    nav_quests: 'Quests',
    nav_planner: 'AI Chat & Plan',
    nav_collection: 'Collection',
    nav_journal: 'Calendar & Journal',
    nav_calendar: 'Calendar & Journal',
    nav_help: 'User Guide',
    nav_partner: 'Add a place',
    nav_admin: 'Admin',
    nav_signin: 'Sign in',
    nav_signout: 'Sign out',
    nav_profile: 'My Profile',

    // Quests page
    quests_title: 'Quests & Challenges',
    quests_subtitle: 'Conquer real-world destination quests, solve cultural & historical quizzes, or check in with secrets to earn token rewards and unlock collector characters!',
    tab_all: 'All Quests',
    tab_active: 'In Progress',
    tab_completed: 'Completed',
    filter_type: 'Quest Type',
    filter_diff: 'Difficulty',
    filter_place: 'Destination',
    filter_camp: 'Campaign',
    filter_all_types: 'All types',
    filter_all_diff: 'All levels',
    filter_all_places: 'All destinations',
    filter_all_camps: 'All campaigns',
    diff_easy: 'Easy',
    diff_medium: 'Medium',
    diff_hard: 'Hard',
    type_quiz: 'Quiz',
    type_code: 'Check-in Code',
    type_exploration: 'Exploration',
    type_culture: 'Local Culture',
    type_history: 'History',
    type_photo: 'Photo Challenge',
    status_not_started: 'Not started',
    status_in_progress: 'In progress',
    status_completed: 'Completed',
    btn_start: 'Start Quest',
    btn_continue: 'Continue',
    btn_view: 'View Result',
    reward_label: 'Reward:',
    reward_tokens: 'tokens',
    reward_character: '+ Exclusive Character',
    modal_submit: 'Submit Answer',
    modal_close: 'Close',
    modal_enter_code: 'Enter Destination Check-in Code',
    modal_code_hint: 'Check-in codes are displayed at the verified venue.',
    modal_success: 'Quest complete! Tokens awarded to your wallet.',
    modal_wrong: 'Not quite right. Please try again.',
    modal_already_done: 'You have already completed this quest.',

    // Common
    search_placeholder: 'Search quest or destination…',
    loading: 'Loading…',
    lang_btn: 'EN',
    lang_toggle_title: 'เปลี่ยนเป็นภาษาไทย',
  }
};

export function getLang() {
  return localStorage.getItem(STORAGE_KEY) || 'th';
}

export function setLang(lang) {
  const target = lang === 'en' ? 'en' : 'th';
  localStorage.setItem(STORAGE_KEY, target);
  document.documentElement.lang = target;
  window.dispatchEvent(new CustomEvent('tc_lang_change', { detail: { lang: target } }));
  return target;
}

export function toggleLang() {
  const current = getLang();
  const next = current === 'th' ? 'en' : 'th';
  return setLang(next);
}

export function t(key) {
  const lang = getLang();
  return DICT[lang]?.[key] || DICT.th[key] || DICT.en[key] || key;
}
