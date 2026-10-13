/* Online feedback inbox (optional). Leave both empty to keep feedback in this browser only.
 * To turn it on, follow FEEDBACK-SETUP.md (about 5 minutes, free), then paste the two values here.
 * Both are PUBLIC by design: the database rules (supabase-feedback.sql) decide what they can do. */
window.PF_CONFIG = {
  supabaseUrl: "",   // e.g. "https://abcdxyzcompany.supabase.co"
  supabaseKey: ""    // the "anon public" key (never the service_role key)
};
