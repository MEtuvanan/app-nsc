// ─── AI Quest Boost — อัลกอริทึมจัดอันดับสถานที่ ─────────────────────────
// วัตถุประสงค์: ช่วย "ดันโพสต์" ให้คนเห็นสถานที่ท่องเที่ยว/เควสท์ที่เพิ่มเข้ามาใหม่
// เพื่อให้คนรู้จักได้เร็วขึ้น โดยสถานที่ที่ถูกเพิ่มใหม่จะถูกดันไปอยู่หน้าแรกสุด
// ของรายการที่เกี่ยวข้อง (หน้าสำรวจ, หน้าแรก, หน้าเควสท์) เป็นเวลา BOOST_DAYS วัน
//
// ทำงานแบบ deterministic ฝั่งหน้า (ไม่ต้องเรียก model/API):
//   1) Tier สูงสุด: สถานที่อายุ ≤ 7 วัน  →  ขึ้นหน้าแรกเสมอ (เรียงไหม่สุดก่อน)
//   2) Tier ปกติ: คะแนน = เควสท์ที่ผูก + แคมเปญที่ผูก
//        + สถานะ "ตรวจสอบแล้ว" + ความสดใหม่ที่ลดทอนช้า ๆ (30 วัน)
//   3) เสมอกันเรียงตามชื่อ (th)

export const BOOST_DAYS = 7;
const DAY_MS = 86400000;

// อายุของสถานที่ (วัน) — Infinity เมื่อไม่ทราบวันสร้าง
export function placeAgeDays(place, now = Date.now()) {
  const t = Date.parse(place?.created_at || '');
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (now - t) / DAY_MS);
}

// จำนวนวันที่เหลือของการดันโดย AI (0 = หมดอายุ/ไม่ทราบวันสร้าง)
export function boostDaysLeft(place, now = Date.now()) {
  const age = placeAgeDays(place, now);
  if (!Number.isFinite(age)) return 0;
  return Math.max(0, Math.ceil(BOOST_DAYS - age));
}

export function isBoosted(place, now = Date.now()) {
  return boostDaysLeft(place, now) > 0;
}

// คะแนนความเด่น (สูง = ขึ้นก่อน) — ใช้เรียง tier ปกติหลังหมดช่วงดัน
// signals: { quests: n, campaigns: n, verified: bool } ใส่ได้เท่าที่มีข้อมูล
export function placeScore(place, signals = {}, now = Date.now()) {
  let score =
    (signals.quests || 0) * 10 +
    (signals.campaigns || 0) * 6 +
    ((signals.verified || place?.verified) ? 20 : 0);
  // ความสดใหม่หลังหมดโบนัสดันยังมีน้ำหนักคงเหลือ (ลดทอนเร็ว: 30 วันหมดความหมาย)
  const age = placeAgeDays(place, now);
  if (Number.isFinite(age) && age < 30) score += ((30 - age) / 30) * 15;
  // โบนัส tier การดัน: ทับทุกคะแนน tier ปกติ รายใหม่ก่อนเสมอ
  if (isBoosted(place, now)) score += 10000 + boostDaysLeft(place, now);
  return score;
}

// คัดลอกเรียงใหม่ — signalsOf(place) คืน { quests, campaigns, verified } ได้
export function rankPlaces(list, signalsOf = () => ({}), now = Date.now()) {
  return [...list].sort((a, b) =>
    placeScore(b, signalsOf(b, now) || {}, now) - placeScore(a, signalsOf(a, now) || {}, now) ||
    String(a.name || '').localeCompare(String(b.name || ''), 'th'));
}

// ป้าย "ถูก AI ดัน" สำหรับใส่ในรายการ (คืน HTML ว่างเมื่อไม่ถูกดัน)
export function boostBadge(place, now = Date.now()) {
  const left = boostDaysLeft(place, now);
  if (!left) return '';
  return `<span class="badge" style="background:linear-gradient(135deg,#F2A81D,#D08B10);color:#2A1600;font-weight:700;box-shadow:0 2px 6px rgba(242,168,29,.35);" title="โดน AI ดันให้คนเห็นมากขึ้น — สถานที่เพิ่มเข้าระบบอายุ ≤ 7 วัน">🚀 ใหม่ • AI จัดอันดับ (อีก ${left} วัน)</span>`;
}
