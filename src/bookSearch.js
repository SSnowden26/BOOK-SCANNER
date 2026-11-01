import { normalizeIsbn } from "./isbn.js";

// Searches by title via Google Books (free, no API key) and resolves each
// result down to a usable ISBN-13, since a title search can turn up
// editions with only an ISBN-10 or no identifiers at all.
export async function searchBooksByTitle(query) {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
      `intitle:${query}`
    )}&maxResults=12`
  );
  const data = await res.json();
  const items = data.items ?? [];

  const results = [];
  for (const item of items) {
    const info = item.volumeInfo ?? {};
    const identifiers = info.industryIdentifiers ?? [];
    const rawIsbn =
      identifiers.find((id) => id.type === "ISBN_13")?.identifier ??
      identifiers.find((id) => id.type === "ISBN_10")?.identifier;
    if (!rawIsbn) continue;

    const isbn = normalizeIsbn(rawIsbn);
    if (!isbn) continue;

    results.push({
      isbn,
      title: info.title ?? null,
      author: (info.authors || []).join(", ") || null,
      cover_url: info.imageLinks?.thumbnail ?? null,
    });
  }
  return results;
}
