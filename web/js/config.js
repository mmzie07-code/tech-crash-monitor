// Public configuration. The publishable (anon) key is designed to be public: access is enforced by database rules and server checks.
// NEVER put the secret / service_role key or the owner key in this file.
// requireLogin=true: an account (or the owner key) is required for everything except Home and About. Set false to open the site to everyone.
window.ANALYTIC = {
  supabaseUrl: "https://oyhyrrimnxhwayfgztai.supabase.co",
  supabaseAnonKey: "sb_publishable_7jAzwMFLFiiiT0o9uNnWlw_AAMO7aRv",
  requireLogin: true,
  ask: false,   // true shows the Ask assistant to signed-in Plus users (needs ANTHROPIC_API_KEY + supabase/ask.sql + the redeployed edge function); the owner always sees it
  paywall: false,   // true locks Plus features for free users; must match PAYWALL=on in Supabase
  contactEmail: "analytic.systems.inc@gmail.com",  // public contact address shown on the Terms and Privacy pages (set this before launch)
};
