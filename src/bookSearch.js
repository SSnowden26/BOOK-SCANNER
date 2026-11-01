import { normalizeIsbn } from "./isbn.js";

// Open Library's search has no API key and isn't aggressively rate
// limited, unlike Google Books' anonymous quota (easily exhausted since
// it's shared across every unauthenticated caller). Try that first and
// only fall back to Google Books if it comes up empty.
async function searchOpenLibrary(query) {
  const res = await fetch(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(
      query
    )}&fields=title,author_name,isbn,cover_i&limit=12`
  );
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`);
  const data = await res.json();
  const docs = data.docs ?? [];

  const results = [];
  for (const doc of docs) {
    const rawIsbn = (doc.isbn ?? []).find((candidate) => normalizeIsbn(candidate));
    if (!rawIsbn) continue;

    results.push({
      isbn: normalizeIsbn(rawIsbn),
      title: doc.title ?? null,
      author: (doc.author_name ?? []).join(", ") || null,
      cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    });
  }
  return results;
}

async function searchGoogleBooks(query) {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
      `intitle:${query}`
    )}&maxResults=12`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message ?? "Google Books request failed");
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

export async function searchBooksByTitle(query) {
  const results = await searchOpenLibrary(query);
  if (results.length > 0) return results;
  return await searchGoogleBooks(query);
}
