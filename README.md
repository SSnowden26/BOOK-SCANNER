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
