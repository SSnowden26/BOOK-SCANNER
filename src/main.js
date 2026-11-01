import { supabase, isConfigured } from "./supabaseClient.js";
import { lookupBook } from "./bookLookup.js";
import { createScanner } from "./scanner.js";
import "./style.css";

const statusEl = document.getElementById("status");
const tabScanBtn = document.getElementById("tab-scan");
const tabLibraryBtn = document.getElementById("tab-library");
const panelScan = document.getElementById("panel-scan");
const panelLibrary = document.getElementById("panel-library");
const libraryGrid = document.getElementById("library-grid");

const scanner = createScanner({
  container: document.getElementById("scanner-view"),
  onDetected: onScanSuccess,
});

let isProcessing = false;
const recentlyScanned = new Map(); // isbn -> timestamp, debounces repeat scans

function showStatus(message, kind = "info") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

function switchTab(tab) {
  const toScan = tab === "scan";
  tabScanBtn.classList.toggle("active", toScan);
  tabLibraryBtn.classList.toggle("active", !toScan);
  panelScan.classList.toggle("hidden", !toScan);
  panelLibrary.classList.toggle("hidden", toScan);

  if (toScan) {
    startScanner();
  } else {
    stopScanner();
  }
}

async function startScanner() {
  try {
    await scanner.start();
    showStatus("Point the camera at a barcode.", "info");
  } catch (err) {
    showStatus(`Camera error: ${err.message || err}`, "error");
  }
}

function stopScanner() {
  scanner.stop();
}

// Validates the check digit on an EAN-13 or UPC-A barcode. Catches the
// occasional misread digit from the camera decoder before it's looked up.
function isValidBarcode(digits) {
  if (!/^\d{12}$|^\d{13}$/.test(digits)) return false;
  const len = digits.length;
  let sum = 0;
  for (let i = 0; i < len - 1; i++) {
    const n = Number(digits[i]);
    const fromEnd = len - 1 - i; // weight pattern is defined from the check digit backwards
    sum += fromEnd % 2 === 1 ? n * 3 : n;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[len - 1]);
}

async function onScanSuccess(decodedText) {
  const isbn = decodedText.replace(/[^0-9Xx]/g, "");
  if (isProcessing) return;

  if (!isValidBarcode(isbn)) {
    showStatus(`Misread (${isbn}) — try again.`, "error");
    return;
  }

  const lastSeen = recentlyScanned.get(isbn);
  if (lastSeen && Date.now() - lastSeen < 5000) return;
  recentlyScanned.set(isbn, Date.now());

  isProcessing = true;
  showStatus(`Looking up ${isbn}...`, "info");
  try {
    const book = await lookupBook(isbn);
    const { error } = await supabase.from("books").insert({
      isbn,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
    });
    if (error) throw error;
    showStatus(`Added: ${book.title ?? isbn}`, "success");
  } catch (err) {
    showStatus(`Failed to add ${isbn}: ${err.message}`, "error");
  } finally {
    isProcessing = false;
  }
}

async function loadLibrary() {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    showStatus(error.message, "error");
    return;
  }
  renderLibrary(data);
}

function renderLibrary(books) {
  libraryGrid.innerHTML = "";
  if (books.length === 0) {
    libraryGrid.innerHTML = `<p class="empty">No books scanned yet.</p>`;
    return;
  }
  for (const book of books) {
    libraryGrid.appendChild(bookCard(book));
  }
}

function bookCard(book) {
  const card = document.createElement("div");
  card.className = "book-card";

  const img = document.createElement("img");
  img.src = book.cover_url || "";
  img.alt = book.title ?? "Unknown title";
  img.onerror = () => {
    img.style.visibility = "hidden";
  };

  const info = document.createElement("div");
  info.className = "book-info";
  info.innerHTML = `
    <strong>${escapeHtml(book.title ?? "Unknown title")}</strong>
    <span>${escapeHtml(book.author ?? "")}</span>
    <span class="isbn">${escapeHtml(book.isbn)}</span>
  `;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Remove";
  deleteBtn.addEventListener("click", () => deleteBook(book.id));

  card.append(img, info, deleteBtn);
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function deleteBook(id) {
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) showStatus(error.message, "error");
}

function subscribeToLibrary() {
  supabase
    .channel("books-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "books" }, loadLibrary)
    .subscribe();
}

function init() {
  if (!isConfigured) {
    showStatus(
      "Supabase isn't configured yet. Edit src/config.js with your project URL and anon key (see README.md).",
      "error"
    );
    tabScanBtn.disabled = true;
    tabLibraryBtn.disabled = true;
    return;
  }

  tabScanBtn.addEventListener("click", () => switchTab("scan"));
  tabLibraryBtn.addEventListener("click", () => switchTab("library"));

  startScanner();
  loadLibrary();
  subscribeToLibrary();
}

init();
