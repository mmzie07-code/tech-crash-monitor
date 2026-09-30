// Public configuration. The publishable (anon) key is designed to be public: access is enforced by database rules and server checks.
// NEVER put the secret / service_role key or the owner key in this file.
// requireLogin=false: sign-in is optional (button shown, site open). Set true to require an account (or the owner key) for everything except Home/About.
window.ANALYTIC = {
  supabaseUrl: "https://oyhyrrimnxhwayfgztai.supabase.co",
  supabaseAnonKey: "sb_publishable_7jAzwMFLFiiiT0o9uNnWlw_AAMO7aRv",
  requireLogin: false,
};
