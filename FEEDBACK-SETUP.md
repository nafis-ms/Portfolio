# Online feedback inbox: 5-minute setup (free)

Without this, visitor feedback only exists in the visitor's own browser. With it, every
submission lands in **Admin > Feedback > Pending**, and approved ones appear on the site instantly.

1. Create a free project at https://supabase.com (any name, pick a region near you).
2. **Authentication > Providers > Email**: keep Email on. **Authentication > Sign In / Providers**:
   turn **"Allow new users to sign up" OFF** (so nobody else can create an account).
3. **Authentication > Users > Add user**: create yourself with your email and a strong password
   (tick "Auto Confirm User").
4. **SQL Editor > New query**: open `supabase-feedback.sql`, replace `YOUR_ADMIN_EMAIL` (2 places)
   with that same email, paste it in and click **Run**.
5. **Project Settings > API**: copy the **Project URL** and the **anon public** key into
   `js/config.js` (`supabaseUrl`, `supabaseKey`). Never use the `service_role` key.
6. Redeploy the site. Open the admin panel > Feedback and sign in with the email/password from step 3.

The URL and anon key are meant to be public. What they can do is limited by the rules in the SQL file:
visitors can only add *pending* messages and read *accepted* ones; only your email can do anything else.
