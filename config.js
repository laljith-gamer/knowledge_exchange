// Replace with your Supabase project credentials
const SUPABASE_URL = "https://bvkjxqirfjviiwlxpdyf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2a2p4cWlyZmp2aWl3bHhwZHlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMzQ4OTYsImV4cCI6MjA3MTcxMDg5Nn0.1VVpQoAXAcrzXm-KLADaTZxulm11S7GUTGBe6311l_E";

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other files
window.supabaseClient = supabase;
