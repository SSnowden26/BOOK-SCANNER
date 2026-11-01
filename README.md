# Book Scanner

Scan a book's barcode on your phone, see it show up live in your library on
any browser (phone or PC). Built as a static site (Vite, vanilla JS) backed
by Supabase for storage and realtime sync.

## How it works

- **Scan tab** (use on your phone): opens the camera, reads the ISBN
  barcode, looks up the title/author/cover via Open Library (falling back to
  Google Books), and inserts a row into a Supabase table.
- **Library tab** (use on phone or PC): shows every scanned book, and
  updates live via Supabase Realtime whenever a new book is added from any
  device.

## 1. Create a Supabase project

1. Go to https://supabase.com, sign in, and create a new project (free
   tier).
2. Once it's ready, open the **SQL Editor** and run:

   ```sql
   create table books (
     id bigint generated always as identity primary key,
     isbn text not null,
     title text,
     author text,
     cover_url text,
     status text not null default 'unread' check (status in ('unread', 'reading', 'read')),
     created_at timestamptz not null default now()
   );

   alter table books enable row level security;

   create policy "public read" on books for select using (true);
   create policy "public insert" on books for insert with check (true);
   create policy "public update" on books for update using (true) with check (true);
   create policy "public delete" on books for delete using (true);

   alter publication supabase_realtime add table books;
   ```

   These RLS policies make the table publicly readable/writable, which is
   fine for a personal single-user app using only the anon key. If you ever
   want to lock this down to just you, swap these for policies that check
   `auth.uid()` and add Supabase Auth.

3. Go to **Project Settings -> API** and copy the **Project URL** and the
   **anon public** key.

### Already created the table before the reading-status feature existed?

Run this in the SQL Editor to add it without losing your existing books:

```sql
alter table books add column status text not null default 'unread'
  check (status in ('unread', 'reading', 'read'));

create policy "public update" on books for update using (true) with check (true);
```

## 2. Configure the app

Edit `src/config.js`:

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

The anon key is meant to be public in client-side code — access is enforced
by the RLS policies above, not by hiding the key.

## 3. Run it locally

```bash
npm install
npm run dev
```

Open the printed `localhost` URL in your PC browser for the Library view.

**Camera note:** mobile browsers only allow camera access over HTTPS (or on
`localhost`). A `vite dev` server reached from your phone over your home
Wi-Fi (e.g. `http://192.168.1.x:5173`) is **not** secure and the Scan tab
won't be able to open the camera. To test scanning from your phone, deploy
to GitHub Pages first (step 4) and open the HTTPS URL on your phone.

## 4. Deploy to GitHub Pages

1. Create a new GitHub repo and push this project to it:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. In the repo on GitHub, go to **Settings -> Pages**, and under "Build and
   deployment" set **Source** to **GitHub Actions**. The included workflow
   (`.github/workflows/deploy.yml`) will build and deploy automatically on
   every push to `main`.
3. After the first workflow run finishes, your app will be live at
   `https://<you>.github.io/<repo>/`. Open that URL on your phone (Scan tab)
   and on your PC (Library tab).

## Later: syncing to Google Sheets

Not set up yet. The straightforward approach when you're ready: a Google
Apps Script (bound to your Sheet) on a time-driven trigger that calls the
Supabase REST API (`GET /rest/v1/books`) with the anon key and writes any
new rows into the sheet. That keeps today's architecture unchanged — ask
when you want this wired up.
