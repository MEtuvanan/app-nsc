// Public client configuration ONLY. Never put service_role or Groq keys here:
// anything in this file is visible to every visitor.
// The Supabase anon key is safe to expose only because every table is protected by RLS.
export const SUPABASE_URL = 'https://tnoemhibqtrjpccnwfzz.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRub2VtaGlicXRyanBjY253Znp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODYxNjEsImV4cCI6MjEwODI2MjE2MX0.mkFwqGlidN8f7uBbubCEdG9emxFeeWF8uYXOGw2Ctpg';

// Map API Key (Google Maps AIza... or Map provider key)
export const MAP_API_KEY = 'd16a6e6d5592077308931f90023b15348c9b1404e4918f63d2a45b6993bb4994';
export const GOOGLE_MAPS_API_KEY = MAP_API_KEY;

// Whole of Thailand. No bounds restriction is applied anywhere.
export const MAP_DEFAULTS = { center: { lat: 13.0, lng: 101.0 }, zoom: 6 };

// Edge Function endpoint for the AI planner (production path; the browser never holds a Groq key).
export const AI_PLANNER_URL = `${SUPABASE_URL}/functions/v1/ai-trip-planner`;
