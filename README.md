# Let's Pray

A free, open-source prayer roster tool for youth ministry leaders. Built to help your team pray intentionally and consistently for every student and leader in your group.

**Built by Jordan Baker** — youth pastor at Calvary Baptist Church in Westland, Michigan.

---

> 👋 If this tool is useful for your ministry, I'd love it if you checked out my resources on DYM. Your support helps me keep building free tools like this one.
>
> **[Browse my resources at DYM →](https://www.downloadyouthministry.com/contributors/jordan-baker)**
>
> If you've used something from DYM, leaving a review goes a long way. Thank you!

---

## What It Does

- Prayer card deck — swipe or arrow through your roster one person at a time
- Mark as Prayed — tracks who has been prayed for each week, resets every Monday
- Week tab — see who's been prayed for, upcoming birthdays, and a running streak counter
- Roster tab — public-facing directory filtered by MS, HS, and Leaders
- People tab (admin) — add, edit, and manage your roster
- Import — paste a CSV to bulk-import your roster
- Report tab (admin) — weekly prayer percentages over the last several weeks

---

## Setup (About 15 Minutes)

You will need a free [Cloudflare](https://cloudflare.com) account. Cloudflare hosts the app and stores your data for free.

### Step 1 — Fork this repo

Click **Fork** in the top right of this GitHub page to create your own copy.

### Step 2 — Create a Cloudflare KV namespace

This is where your roster data will be stored.

1. Log into [dash.cloudflare.com](https://dash.cloudflare.com)
2. In the left sidebar click **Storage & Databases → KV**
3. Click **Create namespace**
4. Name it `LETSPRAY_KV` and click **Add**

### Step 3 — Deploy to Cloudflare Pages

1. In Cloudflare dashboard click **Workers & Pages → Create**
2. Choose **Pages** → **Connect to Git**
3. Select your forked repository
4. Set the build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Click **Save and Deploy**

Wait for the first build to complete (about 1 minute).

### Step 4 — Bind your KV namespace

1. Go to your new Pages project → **Settings → Bindings**
2. Click **Add** → **KV Namespace**
3. Set variable name: `INTERCEDE_KV`
4. Select your `LETSPRAY_KV` namespace from the dropdown
5. Click **Save**
6. Go to **Deployments** and click **Retry deployment** (needed for the binding to take effect)

### Step 5 — Open your app and complete setup

Your app is now live at a URL like `your-project.pages.dev`.

When you open it for the first time you'll see a setup screen. Enter:
- Your **ministry name** (e.g. "First Baptist Students")
- An optional **subtitle** (e.g. "Let's Pray" or leave blank)
- An **admin password** — this protects the People, Report, and Import tabs

That's it. Start adding your people.

---

## Using the App

### Adding People

Go to the **People** tab (requires admin login — tap "admin" at the bottom of the screen and enter your password).

You can add people one at a time using the form at the top, or import a whole roster using the **Import** tab.

**Importing from CSV:** Your CSV needs at least a first name and last name column. Birthdays can be in MM-DD, YYYY-MM-DD, or month name formats. The app will auto-detect the columns.

### Praying

Open the **Pray** tab. Swipe through cards or use the arrows. Tap **Mark as Prayed** when you've prayed for someone. The list resets every Monday at midnight Eastern Time.

### Admin Access

Tap the small **admin** link at the bottom of the screen and enter your password. This unlocks the People, Report, and Import tabs. Your session lasts 24 hours.

To lock the admin view, tap **lock admin** at the bottom.

---

## Appendix A — Adding Push Notifications (Optional)

Push notifications let each leader opt into a daily reminder at a time they choose. This requires an additional setup step.

> ⚠️ **iPhone note:** Push notifications on iPhone require the app to be saved to the Home Screen and opened from there. Chrome on iPhone does not support web push. Your leaders will need to use Safari and add the app to their Home Screen.

### What you'll need

- The same Cloudflare account from the main setup
- About 30 additional minutes

### Step A1 — Generate VAPID keys

VAPID keys are how the browser authenticates push notifications. You can generate them using Node.js:

```bash
node -e "
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pubDer = publicKey.export({ type: 'spki', format: 'der' });
const pubRaw = pubDer.slice(pubDer.length - 65);
const pubB64 = pubRaw.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
let privStart = -1;
for (let i = 0; i < privDer.length - 32; i++) {
  if (privDer[i] === 0x04 && privDer[i+1] === 0x20) { privStart = i + 2; break; }
}
const privB64 = privDer.slice(privStart, privStart + 32).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
console.log('PUBLIC:', pubB64);
console.log('PRIVATE:', privB64);
"
```

Save both keys — you'll need them in a moment.

### Step A2 — Add the push functions to your Pages project

Add these two files to your GitHub repo under `functions/api/`:

**`functions/api/push-register.js`** and **`functions/api/push-check.js`**

You can find the contents of both files in the `appendix/push/` folder of this repo.

### Step A3 — Update App.jsx

In `src/App.jsx`, find the comment:

```
// PUSH NOTIFICATIONS — uncomment to enable
```

And follow the instructions in that section to enable the push notification UI.

Replace `YOUR_VAPID_PUBLIC_KEY` with the public key you generated in Step A1.

### Step A4 — Create the cron Worker

1. In Cloudflare → **Workers & Pages → Create → Worker**
2. Name it `letspray-push`
3. Paste the contents of `appendix/push/push-worker.js` into the editor
4. Click **Deploy**

### Step A5 — Configure the Worker

In your Worker's **Settings**:

**Secrets (under Variables and Secrets):**
- `VAPID_PUBLIC_KEY` — your public key from Step A1
- `VAPID_PRIVATE_KEY` — your private key from Step A1

Update the `mailto:` contact in the Worker code to your email address.

**KV Binding:**
- Variable name: `INTERCEDE_KV`
- Namespace: your `LETSPRAY_KV` namespace

**Cron Trigger (under Triggers):**
- Add: `* * * * *`

### How it works

Each leader opens the app, scrolls to the bottom of the Pray tab, and taps **Enable Reminders**. They choose a time. Every minute the Worker checks whether it's time to send a reminder to each subscribed device, and skips anyone who has already opened the app that day.

---

## Appendix B — Adding Photo Uploads (Optional)

Photos let you add a headshot to each person's prayer card. This requires Cloudflare R2 (free for the first 10GB).

### Step B1 — Create an R2 bucket

1. In Cloudflare → **R2** → **Create bucket**
2. Name it `letspray-photos`
3. Go to the bucket's **Settings → Public access** and enable it
4. Copy the public URL (looks like `https://pub-xxxx.r2.dev`)

### Step B2 — Bind R2 to your Pages project

1. Pages project → **Settings → Bindings → Add → R2 Bucket**
2. Variable name: `INTERCEDE_R2`
3. Select `letspray-photos`
4. Click **Save**

**Also add a variable:**
- Name: `R2_PUBLIC_URL`
- Value: your public URL from Step B1 (no trailing slash)

### Step B3 — Add the photo upload function

Copy `appendix/photos/photo-upload.js` into `functions/api/photo-upload.js` in your repo.

### Step B4 — Enable photos in App.jsx

In `src/App.jsx`, find the comment:

```
// PHOTOS — uncomment to enable
```

And follow the instructions to enable photo uploads.

---

## License

Free to use, modify, and deploy for your ministry. Please don't resell it.

If you improve it in a meaningful way and want to share back, open a pull request — I'd love to see it.

---

*Built with React + Vite, deployed on Cloudflare Pages, data stored in Cloudflare KV.*
