# Phase 2 Guide – Activities, Feed, News, Notifications

What is new: trainers report events with photos; the Back Office approves, rejects or requests corrections; approved events appear in a common feed (with filters, gallery and appreciation); Back Office publishes News and Notifications (with scheduling, expiry and targeting); the trainer dashboard shows real counts, notifications and news.

## Step 1 – Run the new database script in Supabase
1. Supabase > **SQL Editor** > **New query**.
2. Open `supabase/migrations/0002_phase2_activities_news.sql` from the new folder in Notepad, select all, copy, paste into Supabase, click **Run**.
3. Expect "Success. No rows returned". Run it only ONCE.
✔ Check: Table Editor now lists `activities`, `activity_photos`, `activity_likes`, `news`, `notifications`. Storage lists two new private buckets: `activity-photos` and `content-files`.

## Step 2 – Update the code on GitHub
1. Unzip the new `preksha-platform.zip` to any folder.
2. Open **GitHub Desktop**. Menu **Repository > Show in Explorer** opens your project folder.
3. Open the unzipped `preksha-platform` folder, select EVERYTHING inside it (Ctrl+A), copy, and paste into your project folder. Choose **Replace the files in the destination** when asked. (Copy the contents, do not replace the whole folder.)
4. Back in GitHub Desktop you will see a list of changed files. Type "Phase 2" in the summary box, click **Commit to main**, then **Push origin**.

## Step 3 – Let Vercel build it
1. Open Vercel > your project > **Deployments**. A new deployment starts by itself.
2. Wait until it shows **Ready**. If it shows **Error**, open it, copy the red error text and send it to me.

## Step 4 – Test the full flow (you need a second email address for a test trainer)
1. **Trainer:** sign in with the test email, register, then approve that trainer from **Back Office > Trainers** (using your Super Admin login in another browser window).
2. **Report an activity:** as the trainer, open **My Activities > Report new activity**, fill the form, add 1 to 5 photos, submit. Status shows "Pending verification".
3. **Request corrections:** as admin, open **Back Office > Activity Approvals**, type a remark, click **Request corrections**. As trainer, open My Activities: you see the remark and an **Edit** link. Change something, save: it returns to pending.
4. **Approve:** as admin, click **Approve**. The trainer's dashboard counts update.
5. **Feed:** open **Activity Feed** as the trainer: the activity shows with trainer name, photos and an **Appreciate** button. Try the filters.
6. **News:** Back Office > News > publish an item with an image. It appears on the trainer's **News** page and dashboard. Try a future "Publish on" time: it stays hidden until then.
7. **Notifications:** Back Office > Notifications > publish one for "All trainers", and another for a single level only. Confirm a trainer of a different level does not see the second one.
8. **Audit check:** in Supabase Table Editor open `audit_logs`; you should see entries such as "Activity approved", "news insert", "notifications insert".

## Things to know
- Dates and times typed in the Back Office are treated as Indian time.
- Photos are shrunk in the browser before upload (about 1600 px wide).
- News images and notification attachments are limited to 5 MB.
- Notifications by email or WhatsApp are not built yet (WhatsApp comes with Phase 3).
- Not yet built from Phase 1: trainer profile editing, and a screen for creating staff users and roles.
- I could not run this code on my side, so please send me any red error you see (Vercel log or on-screen message).
