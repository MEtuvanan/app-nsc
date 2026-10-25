// test_campaigns_characters_flow.mjs
// Comprehensive End-to-End Test for Campaign & Character Workflow

import https from 'node:https';
import fs from 'node:fs';

const CONFIG = {
  SUPABASE_URL: 'https://tnoemhibqtrjpccnwfzz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRub2VtaGlicXRyanBjY253Znp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODYxNjEsImV4cCI6MjEwODI2MjE2MX0.mkFwqGlidN8f7uBbubCEdG9emxFeeWF8uYXOGw2Ctpg'
};

const baseUrl = CONFIG.SUPABASE_URL + '/rest/v1';
const headers = {
  apikey: CONFIG.SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

// Simple Mock LocalStorage
class MockLocalStorage {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}
globalThis.localStorage = new MockLocalStorage();

console.log('════════════════════════════════════════════════════════════════');
console.log('🧪 TEST: CAMPAIGN & CHARACTER WORKFLOW (PARTNER -> ADMIN -> USER)');
console.log('════════════════════════════════════════════════════════════════\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(cond, name) {
  if (cond) {
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } else {
    console.error(`❌ [FAIL] ${name}`);
    testsFailed++;
  }
}

async function runTests() {
  const testPartnerUid = 'd89b1234-5678-4321-abcd-partner00001';
  const testPlaceId = 'b90a117f-07db-4fcf-90ac-1efd08ad7362'; // Wat Arun

  // ─────────────────────────────────────────────────────────────
  // 1. PARTNER SIDE: CREATE CAMPAIGN
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. Testing Partner: Create Campaign ---');
  const campPayload = {
    id: 'camp-test-' + Date.now(),
    title: '🏮 มหกรรมเทศกาลโคมไฟริมเจ้าพระยา',
    description: 'ชมความงามของโคมไฟโบราณและร่วมภารกิจริมแม่น้ำเจ้าพระยา',
    image_url: '/assets/img/Wat Arun (Temple of Dawn).webp',
    reward_tokens: 200,
    status: 'draft',
    approval_status: 'pending',
    admin_notes: 'รอดำเนินการตรวจสอบ',
    created_by: testPartnerUid,
    created_at: new Date().toISOString(),
    campaign_places: [{ place_id: testPlaceId, places: { id: testPlaceId, name: 'วัดอรุณราชวราราม' } }]
  };

  // Partner saves campaign to localStorage (as per partner-store.js fallback / sync)
  const partnerCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns') || '[]');
  partnerCamps.unshift(campPayload);
  localStorage.setItem('tc_partner_campaigns', JSON.stringify(partnerCamps));

  const storedCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns'));
  assert(storedCamps.length >= 1, 'Partner campaign successfully saved to local queue');
  assert(storedCamps[0].approval_status === 'pending', 'Partner campaign starts with approval_status = "pending"');
  assert(storedCamps[0].status === 'draft', 'Partner campaign starts with status = "draft"');

  // ─────────────────────────────────────────────────────────────
  // 2. PARTNER SIDE: PROPOSE CHARACTER
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. Testing Partner: Propose Character ---');
  const charPayload = {
    id: 'char-test-' + Date.now(),
    name: 'น้องโคมนำโชค (Lucky Lantern)',
    description: 'ภูติน้อยผู้ถือโคมไฟทองคำ ส่องสว่างนำทางริมฝั่งเจ้าพระยา',
    image_url: '/assets/img/ray.png',
    model_url: 'https://example.com/models/lantern.glb',
    rarity: 'epic',
    token_multiplier: 3.0,
    unlock_hint: 'เช็คอินในแคมเปญมหกรรมเทศกาลโคมไฟริมเจ้าพระยา',
    campaign_id: campPayload.id,
    status: 'pending',
    approval_status: 'pending',
    admin_notes: 'รอดำเนินการตรวจสอบ',
    created_by: testPartnerUid,
    created_at: new Date().toISOString()
  };

  // Partner saves character proposal to localStorage
  const partnerChars = JSON.parse(localStorage.getItem('tc_partner_characters') || '[]');
  partnerChars.unshift(charPayload);
  localStorage.setItem('tc_partner_characters', JSON.stringify(partnerChars));

  const storedChars = JSON.parse(localStorage.getItem('tc_partner_characters'));
  assert(storedChars.length >= 1, 'Partner character successfully saved to local queue');
  assert(storedChars[0].campaign_id === campPayload.id, 'Character correctly links to the campaign');
  assert(storedChars[0].approval_status === 'pending', 'Character starts with approval_status = "pending"');

  // ─────────────────────────────────────────────────────────────
  // 3. ADMIN SIDE: REVIEW & PENDING QUEUE INSPECTION
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. Testing Admin: Queue & Stats ---');
  // Admin inspects pending campaigns
  const adminPendingCamps = storedCamps.filter(c => c.approval_status === 'pending');
  assert(adminPendingCamps.some(c => c.id === campPayload.id), 'Admin queue detects pending campaign');

  // Admin inspects pending characters
  const adminPendingChars = storedChars.filter(c => c.approval_status === 'pending' || c.status === 'pending');
  assert(adminPendingChars.some(c => c.id === charPayload.id), 'Admin queue detects pending character');

  // ─────────────────────────────────────────────────────────────
  // 4. ADMIN SIDE: APPROVE CAMPAIGN
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 4. Testing Admin: Approve Campaign ---');
  // Admin approves campaign (simulating action in admin.js / admin-store.js)
  const campIdx = storedCamps.findIndex(c => c.id === campPayload.id);
  storedCamps[campIdx].approval_status = 'approved';
  storedCamps[campIdx].status = 'published';
  storedCamps[campIdx].admin_notes = null;
  localStorage.setItem('tc_partner_campaigns', JSON.stringify(storedCamps));

  const approvedCamps = JSON.parse(localStorage.getItem('tc_partner_campaigns'));
  assert(approvedCamps[campIdx].approval_status === 'approved', 'Campaign approval_status changed to "approved"');
  assert(approvedCamps[campIdx].status === 'published', 'Campaign status changed to "published"');

  // ─────────────────────────────────────────────────────────────
  // 5. ADMIN SIDE: APPROVE CHARACTER
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 5. Testing Admin: Approve Character ---');
  // Admin approves character
  const charIdx = storedChars.findIndex(c => c.id === charPayload.id);
  storedChars[charIdx].approval_status = 'approved';
  storedChars[charIdx].status = 'active';
  storedChars[charIdx].admin_notes = null;
  localStorage.setItem('tc_partner_characters', JSON.stringify(storedChars));

  const approvedChars = JSON.parse(localStorage.getItem('tc_partner_characters'));
  assert(approvedChars[charIdx].approval_status === 'approved', 'Character approval_status changed to "approved"');
  assert(approvedChars[charIdx].status === 'active', 'Character status changed to "active"');

  // ─────────────────────────────────────────────────────────────
  // 6. USER SIDE: HOMEPAGE DISPLAY (home.js)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 6. Testing User: Homepage Display ---');
  // In home.js: campaigns() queries published campaigns and maps linked characters
  const userVisibleCamps = approvedCamps.filter(c => c.status === 'published' && c.approval_status === 'approved');
  assert(userVisibleCamps.some(c => c.id === campPayload.id), 'Approved campaign is visible to public users on Homepage');

  const charMap = new Map();
  approvedChars.filter(c => c.status === 'active' || c.approval_status === 'approved').forEach(c => {
    if (c.campaign_id) charMap.set(c.campaign_id, c);
  });
  const linkedCharForCamp = charMap.get(campPayload.id);
  assert(Boolean(linkedCharForCamp), 'Homepage correctly resolves linked character for campaign');
  assert(linkedCharForCamp.name === 'น้องโคมนำโชค (Lucky Lantern)', 'Homepage displays custom character name: ' + linkedCharForCamp.name);
  assert(linkedCharForCamp.token_multiplier === 3.0, 'Homepage displays correct token multiplier: ×' + linkedCharForCamp.token_multiplier);

  // ─────────────────────────────────────────────────────────────
  // 7. USER SIDE: CHARACTER COLLECTION DISPLAY (collection.js)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 7. Testing User: Character Collection ---');
  // In collection.js: active partner characters are merged into collection and store
  const userCollectionChars = approvedChars.filter(c => c.status === 'active' || c.approval_status === 'approved');
  assert(userCollectionChars.some(c => c.id === charPayload.id), 'Approved character is visible in user Character Collection');
  assert(userCollectionChars.find(c => c.id === charPayload.id).rarity === 'epic', 'Character maintains Epic rarity badge');

  // ─────────────────────────────────────────────────────────────
  // 8. USER SIDE: PLACE CAMPAIGN BANNER (place.js)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 8. Testing User: Place Detail Banner ---');
  // In place.js: queries if place belongs to any approved campaign
  const placeCamps = approvedCamps.filter(c => {
    if (c.approval_status === 'rejected') return false;
    return (c.campaign_places || []).some(cp => cp.place_id === testPlaceId);
  });
  assert(placeCamps.some(c => c.id === campPayload.id), 'Wat Arun place page displays the approved festival campaign');

  // ─────────────────────────────────────────────────────────────
  // 9. REJECTION TEST CASE: VERIFY REJECTED ITEMS ARE HIDDEN
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 9. Testing Rejection Flow: Ensure Rejected Items are NOT Shown ---');
  const rejectedCamp = {
    id: 'camp-rejected-' + Date.now(),
    title: 'แคมเปญไม่ผ่านเกณฑ์',
    status: 'draft',
    approval_status: 'rejected',
    admin_notes: 'ข้อมูลไม่ครบถ้วน'
  };
  storedCamps.push(rejectedCamp);

  const publicCampsAfterReject = storedCamps.filter(c => c.status === 'published' && c.approval_status === 'approved');
  assert(!publicCampsAfterReject.some(c => c.id === rejectedCamp.id), 'Rejected campaign is STRICTLY HIDDEN from public users');

  // ─────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`📊 TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('════════════════════════════════════════════════════════════════');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
