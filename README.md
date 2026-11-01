# Book Scanner

Scan a book's barcode on your phone, see it show up live in your library on
any browser (phone or PC). Built as a static site (Vite, vanilla JS) backed
by Supabase for storage and realtime sync.

## How it works

- **Scan & Search tab** (use on your phone): scan a barcode with the
  camera, type an ISBN manually, or search by title -- each looks up
  title/author/cover (via Open Library, falling back to Google Books) and
  inserts a row into Supabase. Title search results let you choose **Add
  to Library** (status `unread`) or **Add to Wishlist** (status
  `wishlisted`).
- **Library tab** (use on phone or PC): every book, filterable/sortable by
  status, updating live via Supabase Realtime whenever anything changes
  from any device.
- **Wishlist tab**: just the books with status `wishlisted` -- books you
  want but don't have yet.
- **Sign in**: each person gets their own account (username + password)
  and their own private library -- nobody sees anyone else's books.
- **Profile tab**: shows your username, total books, and books read, plus
  a Sign Out button.

## 1. Create a Supabase project

1. Go to https://supabase.com, sign in, and create a new project (free
   tier).
2. Once it's ready, open the **SQL Editor** and run:

   ```sql
   create table profiles (
     id uuid primary key references auth.users(id) on delete cascade,
     username text not null,
     username_normalized text not null unique,
     created_at timestamptz not null default now()
   );

   alter table profiles enable row level security;
   create policy "profiles are viewable by everyone" on profiles for select using (true);
   create policy "users can insert their own profile" on profiles for insert with check (auth.uid() = id);

   create table books (
     id bigint generated always as identity primary key,
     user_id uuid not null references auth.users(id) on delete cascade,
     isbn text not null,
     title text,
     author text,
     cover_url text,
     status text not null default 'unread'
       check (status in ('unread', 'reading', 'read', 'owned', 'wishlisted')),
     created_at timestamptz not null default now()
   );

   alter table books enable row level security;

   create policy "users can read own books" on books for select using (auth.uid() = user_id);
   create policy "users can insert own books" on books for insert with check (auth.uid() = user_id);
   create policy "users can update own books" on books for update using (auth.uid() = user_id);
   create policy "users can delete own books" on books for delete using (auth.uid() = user_id);

   alter publication supabase_realtime add table books;
   ```

   Each row is tied to the account that owns it (`auth.uid() = user_id`), so
   one person's library is invisible to everyone else.

3. Go to **Authentication -> Providers -> Email** and turn **off** "Confirm
   email". The app uses a made-up email address behind the scenes (see
   "Sign in" below) that can never receive a real confirmation link, so
   sign-up would otherwise get stuck.
4. Go to **Project Settings -> API** and copy the **Project URL** and the
   **anon public** key.

### Already created the table before the reading-status feature existed?

Run this in the SQL Editor to add it without losing your existing books:

```sql
alter table books add column status text not null default 'unread'
  check (status in ('unread', 'reading', 'read'));

create policy "public update" on books for update using (true) with check (true);
```

### Already have the status column, just need Owned/Wishlisted added?

The check constraint has to be dropped and recreated to allow the new
values. This also renames the old "Unowned" status to "Wishlisted" (safe
to run even if you have no rows with that status yet):

```sql
alter table books drop constraint books_status_check;
alter table books add constraint books_status_check
  check (status in ('unread', 'reading', 'read', 'owned', 'unowned', 'wishlisted'));

update books set status = 'wishlisted' where status = 'unowned';

alter table books drop constraint books_status_check;
alter table books add constraint books_status_check
  check (status in ('unread', 'reading', 'read', 'owned', 'wishlisted'));
```

(The constraint is widened first so the rename update doesn't get rejected
by the old constraint, then narrowed back down to the final set.)

### Already have a shared library, adding sign-in now?

This changes the library from "everyone shares one list" to "each account
has its own private list," so it takes a few steps in order:

1. Add the `profiles` table and a (temporarily nullable) owner column on
   `books`, and swap the old public policies for per-user ones:

   ```sql
   create table profiles (
     id uuid primary key references auth.users(id) on delete cascade,
     username text not null,
     username_normalized text not null unique,
     created_at timestamptz not null default now()
   );

   alter table profiles enable row level security;
   create policy "profiles are viewable by everyone" on profiles for select using (true);
   create policy "users can insert their own profile" on profiles for insert with check (auth.uid() = id);

   alter table books add column user_id uuid references auth.users(id) on delete cascade;

   drop policy "public read" on books;
   drop policy "public insert" on books;
   drop policy "public update" on books;
   drop policy "public delete" on books;

   create policy "users can read own books" on books for select using (auth.uid() = user_id);
   create policy "users can insert own books" on books for insert with check (auth.uid() = user_id);
   create policy "users can update own books" on books for update using (auth.uid() = user_id);
   create policy "users can delete own books" on books for delete using (auth.uid() = user_id);
   ```

2. Go to **Authentication -> Providers -> Email** and turn **off** "Confirm
   email" (see the note under step 1 above for why).
3. Push/deploy the app, open it, and **sign up** for an account with the
   username you want to own the existing books (e.g. `SarcasmTree`).
4. Back in the SQL Editor, assign every existing (ownerless) book to that
   account, then lock the column down now that every row has an owner:

   ```sql
   update books set user_id = (select id from profiles where username_normalized = 'sarcasmtree')
   where user_id is null;

   alter table books alter column user_id set not null;
   ```

   (Use the lowercase, letters/numbers-only form of whatever username you
   signed up with -- that's what `username_normalized` stores.)

## 2. Configure the app

Edit `src/config.js`:

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

The anon key is meant to be public in client-side code — access is enforced
by the RLS policies above, not by hiding the key.

Also set `ACCESS_CODE` to whatever shared code you want to give out. Anyone
who opens the deployed link has to enter this once (it's then remembered in
their browser) before the app loads. This is a casual gate only — the code
ships inside the public JS bundle, so it stops accidental link-sharing, not
a determined snooper.

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
