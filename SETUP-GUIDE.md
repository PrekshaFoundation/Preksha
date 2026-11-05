# Preksha Platform – Phase 1 Setup Guide (no coding needed)

You will do five things: (1) put the code on GitHub, (2) set up the database in Supabase, (3) set up email sign-in, (4) put the app online with Vercel, (5) make yourself Super Admin. Take your time; each step ends with a check.

## Step 1 – Put the code on GitHub
1. Unzip `preksha-platform.zip` on your computer. You get a folder called `preksha-platform`.
2. Open **GitHub Desktop** and sign in. Click **File > Add local repository**, choose the `preksha-platform` folder. If it says "not a Git repository", click **create a repository** and accept the defaults.
3. Click **Commit to main** (write "Phase 1" in the summary box), then **Publish repository**. Untick "Keep this code private" ONLY if you want it public; leave it ticked for private.
✔ Check: on github.com you can see your repository with the files inside.

## Step 2 – Create the database tables in Supabase
1. Open your Supabase project > left menu **SQL Editor** > **New query**.
2. Open the file `supabase/migrations/0001_phase1_foundation.sql` from the folder (any text editor, e.g. Notepad). Select all, copy.
3. Paste into the Supabase query box and click **Run**. You should see "Success. No rows returned".
✔ Check: **Table Editor** (left menu) now lists organisations, roles, profiles, trainers, audit_logs and others.
If you see an error, copy the whole message and send it to me. Run the script only once; if it must be re-run, tell me first.

## Step 3 – Set up email sign-in
1. **Authentication > Providers > Email**: make sure Email is enabled. Turn **Confirm email** ON.
2. **Authentication > Email Templates**: open the **Magic Link** template (and the **Confirm signup** template). Replace the message body with:
   `<h2>Your Preksha sign-in code</h2><p>Enter this code to sign in: <strong>{{ .Token }}</strong></p>`
   Click Save for each. (This makes the email contain a 6-digit code instead of a link.)
3. **Authentication > URL Configuration**: you will fill this in after Step 4.
4. Supabase's built-in email sender only sends a few emails per hour. Before real users start, set up a free sender: create an account at **resend.com** (or brevo.com), verify your domain, create an SMTP key, then enter it under **Project Settings > Authentication > SMTP Settings**. Tell me which you choose and I will give exact screens.

## Step 4 – Put the app online with Vercel
1. Supabase: **Project Settings > API**. Copy the **Project URL** and the **anon public** key. (Never share the "service_role" key.)
2. Go to vercel.com > **Add New > Project** > choose your `preksha-platform` repository > **Import**.
3. Open **Environment Variables** and add two:
   - Name `NEXT_PUBLIC_SUPABASE_URL` → paste the Project URL
   - Name `NEXT_PUBLIC_SUPABASE_ANON_KEY` → paste the anon public key
4. Click **Deploy**. Wait about 2 minutes. Vercel shows your live address (like `preksha-platform.vercel.app`).
5. Back in Supabase **Authentication > URL Configuration**: set **Site URL** to that address, and add it to **Redirect URLs** as well. Save.
✔ Check: opening your address shows the "Preksha Foundation" sign-in page.
If the Vercel build fails, open the failed deployment, copy the red error text and send it to me.

## Step 5 – Make yourself Super Admin
1. On your live site, sign in with YOUR email (code arrives by email). You will land on the registration form; you can close it without filling it.
2. In Supabase **SQL Editor > New query**, paste this (replace the email with yours) and Run:
   `update public.profiles set role_id = (select id from public.roles where key = 'super_admin') where email = 'you@example.com';`
3. Refresh the site, open `/dashboard`. You should see a **Back Office** link.
To make a staff member a Back Office user later, they sign in once, then run the same command with their email and `key = 'back_office'`. (A screen to do this will come in a later phase.)

## Step 6 – Test the full trainer workflow
1. Open the site in a private/incognito window, sign in with a different email, fill the registration form, submit. You see "waiting for approval".
2. In your normal window: **Back Office** > Pending tab > **Approve**.
3. In the incognito window refresh the dashboard: it now shows a Trainer ID (PT-0001) and "account is active".
4. Super Admin check: in Supabase Table Editor open `audit_logs`; you should see "Trainer status changed".
5. Change a level: Back Office > Approved tab > pick a new level > Approve again. Look in `trainer_history` for the old and new level.

## Known limits of this first delivery
- Trainers cannot yet edit their profile after approval; the Back Office screen for creating users/roles is not built yet (done in SQL for now).
- There is no automatic "account activated" email yet.
- Photos are limited to 5 MB and are not yet compressed.
- I could not run this code on my side (no internet in my workspace), so expect to send me a few error messages while we fix first-run issues.
