# Travel and Challenge 🇹🇭🗺️

**Travel and Challenge** is a full-featured, responsive, gamified tourism web application built for exploring destinations across Thailand. It seamlessly combines verified geographic destination discovery, location-based quests, collectible characters and tokens, a personal travel journal with photo storage, calendar integration, and an AI-powered trip planner grounded in real destination data.

---

## 🌟 Key Features

### 1. 📍 Destination Discovery & Interactive Map
- **Complete Thailand Coverage**: Nationwide coordinate scope without artificial bounds.
- **Verified Metadata**: Categorized by province, district, entry fees, verified opening hours, and accessibility details.
- **Interactive Map**: Google Maps integration with custom markers and responsive search/filtering by province and category.

### 2. ⚔️ Gamified Quests & Challenges
- **Multiple Quest Types**: Exploration, history, culture, photography, check-in codes, and multiple-choice quizzes.
- **Security-Definer Anti-Cheat**:
  - Answers and check-in secret codes are verified entirely on the server (`complete_quest` RPC).
  - Rate limiting protects against brute force (maximum 5 failed attempts per quest per 10 minutes).
  - Clients cannot tamper with reward amounts.
- **One-time Rewards**: Quests grant tokens only on initial completion.

### 3. 🪙 Token Economy & Character Collection
- **Server-Minted Tokens**: Token balances are strictly derived from immutable `token_transactions` records.
- **Collectible Characters**: Unlock exclusive Thai-themed characters using earned tokens (`unlock_character` RPC).
- **Achievements Engine**: Dynamic criteria evaluation for quests completed, destinations visited, categories explored, and journals written.

### 4. 🤖 Grounded AI Trip Planner
- **Zero Hallucination Grounding**: The AI planner (powered by GPT-OSS) selects stops **only** from verified destination records stored in the database.
- **Customizable Preferences**: Tailored by duration (1–7 days), daily pace, travel style, budget, transport type, and accessibility needs.
- **Interactive Itinerary & Map Route**: Visual polyline path on the map with drag/reorder controls.
- **Dual Runtime Support**:
  - **Production**: Supabase Edge Function (`ai-trip-planner`) with zero client-side secret exposure.
  - **Local Development**: Built-in fallback via `js/config.local.js` for instant testing without deploying Deno functions.

### 5. 📔 Private Travel Journal & Calendar
- **Private Diary Entries**: RLS-enforced private travel records with multi-photo uploads to Supabase Storage.
- **Travel Calendar**: Monthly calendar tracking diary entries, photos taken, quests completed, and planned trips.

### 6. 🛡️ Admin CMS & Audit Logging
- **Dashboard Metrics**: Live counts of published places, active quests, campaigns, and user completions.
- **Full CRUD & Publishing Workflow**: Verification status checks before public release.
- **Audit Logs**: Automatic logging of administrative actions with admin identity.

---

## 🏗️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vanilla JavaScript (ES Modules), HTML5 Semantic Architecture, Modern Vanilla CSS (Design tokens, Glassmorphism, Responsive Grid/Flexbox) |
| **Backend & DB** | Supabase (PostgreSQL 15+, Row Level Security, Triggers, Security Definer Stored Procedures) |
| **Authentication** | Supabase Auth (Email & Password, Session management) |
| **Storage** | Supabase Storage (Private bucket `diary-photos` with user folder separation) |
| **AI Engine** | GPT-OSS via Supabase Edge Function (Deno) / Local Dev Fallback |
| **Mapping** | Google Maps JavaScript API (with graceful fallback when API key is unconfigured) |
| **Deployment** | Vercel (Clean URLs, Strict Security Headers) |

---

## 📁 Project Structure

```text
Hub/
├── index.html                  # Landing page with hero illustration and overview
├── explore.html                # Nationwide destination search & interactive map
├── place.html                  # Destination detail view with verified facts & quests
├── quests.html                 # Quest browser and challenge submission modal
├── planner.html                # AI-powered grounded trip itinerary planner
├── collection.html             # Character collection, achievements, and token balance
├── journal.html                # Personal travel journal and photo manager
├── calendar.html               # Monthly travel timeline & activity calendar
├── profile.html                # User profile, quest history, and saved trips
├── admin.html                  # Admin CMS dashboard, editors, and audit logs
├── login.html                  # Authentication (Sign in, Sign up, Password reset)
├── vercel.json                 # Vercel routing and security headers
├── .gitignore                  # Git ignore rules (protects config.local.js)
├── assets/
│   └── illustrations/hero.jpg  # Generated theme illustration
├── css/
│   ├── base.css                # Typography, color tokens, form controls, resets
│   ├── desktop.css             # Desktop layout enhancements
│   ├── mobile.css              # Mobile responsive adaptations
│   ├── animations.css         # Keyframe animations (fade-up, pulse, float)
│   └── pages/                  # Page-specific stylesheets
├── js/
│   ├── config.js               # Public client config (Supabase URL & Anon Key)
│   ├── config.local.js         # Local development Groq key template (git-ignored)
│   ├── supabase.js             # Supabase client singleton
│   ├── auth.js                 # Auth helpers, role detection, session listeners
│   ├── ui.js                   # Toasts, modals, alerts, sanitization
│   ├── maps.js                 # Google Maps lifecycle and marker utilities
│   ├── places.js               # Destination data service
│   ├── quests.js               # Quests and submission service
│   ├── journal.js              # Journal and storage management
│   ├── planner.js              # AI Planner UI, state, and Groq fallback
│   └── admin.js                # Admin CMS controllers
└── supabase/
    ├── functions/
    │   └── ai-trip-planner/    # Production Deno Edge Function for Groq AI
    └── migrations/
        ├── 001_foundation.sql
        ├── 002_quests_rewards.sql
        ├── 003_journal.sql
        ├── 004_campaigns_admin.sql
        ├── 005_trips_achievements.sql
        ├── 006_seed_bangkok.sql
        └── 007_hardening_and_features.sql
```

---

## 🚀 Setup & Local Development

### 1. Clone & Serve
You can run the application with any static web server (such as Python, Node `serve`, or VS Code Live Server):

```bash
# Using Python 3:
python -m http.server 3000

# Or using Node.js:
npx serve -l 3000
```
Open `http://localhost:3000` in your browser.

### 2. Configure Client Settings (`js/config.js`)
Edit `js/config.js` with your Supabase credentials:
```javascript
export const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-supabase-anon-key';
export const GOOGLE_MAPS_API_KEY = 'your-google-maps-api-key'; // Optional: Maps work gracefully without key
```

### 3. Local AI Planner Testing (`js/config.local.js`)
To test the AI Trip Planner locally without deploying the Supabase Edge Function:
1. Open `js/config.local.js`.
2. Enter your Groq API key (from [console.groq.com](https://console.groq.com)):
   ```javascript
   export const AI_CONFIG = {
     provider: 'groq',
     apiKey: 'gsk_your_actual_groq_key_here',
     model: 'llama-3.3-70b-versatile',
   };
   ```
3. The planner will automatically use this key when testing locally. `js/config.local.js` is ignored by `.gitignore` to prevent leaks.

---

## 🗄️ Database Migrations

Apply the migration scripts in sequential order in your Supabase SQL Editor:

1. **`001_foundation.sql`**: Core schemas for `profiles`, `provinces`, `districts`, `place_categories`, and `places`. RLS policies and user profile triggers.
2. **`002_quests_rewards.sql`**: `quests`, `quest_places`, `quest_questions`, `quest_secrets`, `characters`, `user_quests`, `user_characters`, `token_transactions`, and the initial `complete_quest` RPC.
3. **`003_journal.sql`**: `travel_diaries`, `diary_photos`, `diary_place_links`, and Supabase Storage bucket policy.
4. **`004_campaigns_admin.sql`**: `campaigns`, `campaign_places`, `campaign_quests`, `audit_logs`, and admin RLS helpers (`is_admin()`).
5. **`005_trips_achievements.sql`**: `trips`, `trip_stops`, `achievements`, and `user_achievements`.
6. **`006_seed_bangkok.sql`**: Bangkok destination seed data, districts, categories, and initial quests.
7. **`007_hardening_and_features.sql`**:
   - Slug generation triggers for destinations.
   - Server-side rate limiting on quest attempts (`quest_attempts`).
   - Anti-brute-force hardening for `complete_quest`.
   - Dynamic criteria-based achievements engine (`evaluate_achievements`).
   - Token character purchase procedure (`unlock_character`).

---

## 🛡️ Security Architecture

- **Row Level Security (RLS)**: Enforced on 100% of tables.
- **Client Security**: The `service_role` key is **never** bundled or exposed in client JavaScript.
- **Quest Anti-Brute-Force**: Stored check-in codes are hidden in `quest_secrets` with zero client SELECT policies. Quiz and code evaluations are computed entirely inside `SECURITY DEFINER` database functions.
- **Server Rate Limiting**: Maximum 5 failed attempts per quest per user within 10 minutes.
- **Admin Verification**: Administrative access relies on database-level `is_admin()` evaluation against `profiles.role = 'admin'`.

---

## 🚢 Production Deployment

### 1. Deploy Frontend to Vercel
1. Push this repository to GitHub or GitLab.
2. Import the project into Vercel.
3. Vercel automatically honors `vercel.json` for clean URL rewrites and strict security headers (`X-Frame-Options`, `Content-Security-Policy`, etc.).

### 2. Deploy Supabase Edge Function
To run the AI trip planner through your Supabase Edge Function:
```bash
# Link your project
supabase link --project-ref your-supabase-ref

# Set secrets
supabase secrets set GROQ_API_KEY="your-groq-key" GROQ_MODEL="llama-3.3-70b-versatile"

# Deploy edge function
supabase functions deploy ai-trip-planner --no-verify-jwt
```

---

## 📄 License
MIT License. Built with ❤️ for exploration and adventure in Thailand.
