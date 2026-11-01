// Validates/normalizes barcode and ISBN input into the canonical 13-digit
// (or 12-digit UPC-A) form the rest of the app stores and looks up by.

function eanCheckDigit(digitsWithoutCheck) {
  const len = digitsWithoutCheck.length + 1;
  let sum = 0;
  for (let i = 0; i < len - 1; i++) {
    const n = Number(digitsWithoutCheck[i]);
    const fromEnd = len - 1 - i; // weight pattern is defined from the check digit backwards
    sum += fromEnd % 2 === 1 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

// EAN-13 (ISBN-13 barcodes) or UPC-A (12 digits, occasionally used on books).
function isValidEanOrUpc(digits) {
  if (!/^\d{12}$|^\d{13}$/.test(digits)) return false;
  return eanCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

// Older books are often only printed with an ISBN-10, not a scannable
// barcode in that form.
function isValidIsbn10(digits) {
  if (!/^\d{9}[\dX]$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(digits[i]);
  sum += digits[9] === "X" ? 10 : Number(digits[9]);
  return sum % 11 === 0;
}

function isbn10to13(digits) {
  const core = "978" + digits.slice(0, 9);
  return core + eanCheckDigit(core);
}

// Returns a valid, canonical barcode/ISBN string, or null if the input
// doesn't check out as EAN-13, UPC-A, or ISBN-10.
export function normalizeIsbn(raw) {
  const cleaned = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (isValidIsbn10(cleaned)) return isbn10to13(cleaned);
  if (isValidEanOrUpc(cleaned)) return cleaned;
  return null;
}
