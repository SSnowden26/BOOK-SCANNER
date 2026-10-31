// Looks up book metadata for an ISBN, trying Open Library first and
// falling back to Google Books (both free, no API key required).
export async function lookupBook(isbn) {
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    );
    const data = await res.json();
    const entry = data[`ISBN:${isbn}`];
    if (entry) {
      return {
        title: entry.title ?? null,
        author: (entry.authors || []).map((a) => a.name).join(", ") || null,
        cover_url: entry.cover?.medium ?? entry.cover?.small ?? null,
      };
    }
  } catch {
    // fall through to Google Books
  }

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await res.json();
    const info = data.items?.[0]?.volumeInfo;
    if (info) {
      return {
        title: info.title ?? null,
        author: (info.authors || []).join(", ") || null,
        cover_url: info.imageLinks?.thumbnail ?? null,
      };
    }
  } catch {
    // no match from either source
  }

  return { title: null, author: null, cover_url: null };
}
