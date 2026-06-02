// supabase-client.js - Supabase Client configuration for browser
const SUPABASE_URL = "https://zdqgkwzsifphcyvtnzaf.supabase.co";
const SUPABASE_KEY = "sb_publishable_hSxQVUY_VSoyeGUh8_f-Kw_28nuPfG9";

if (typeof supabase === 'undefined') {
  console.error("Supabase CDN library is not loaded. Please include the Supabase CDN script tag in your HTML file.");
}

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
