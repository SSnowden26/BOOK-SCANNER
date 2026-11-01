import { supabase, isConfigured } from "./supabaseClient.js";
import { lookupBook } from "./bookLookup.js";
import { searchBooksByTitle } from "./bookSearch.js";
import { createScanner } from "./scanner.js";
import { normalizeIsbn } from "./isbn.js";
import { ACCESS_CODE } from "./config.js";
import "./style.css";

const UNLOCK_STORAGE_KEY = "book-scanner-unlocked";
const appEl = document.getElementById("app");
const lockScreen = document.getElementById("lock-screen");
const lockForm = document.getElementById("lock-form");
const lockInput = document.getElementById("lock-input");
const lockError = document.getElementById("lock-error");

const statusEl = document.getElementById("status");
const tabScanBtn = document.getElementById("tab-scan");
const tabLibraryBtn = document.getElementById("tab-library");
const tabWishlistBtn = document.getElementById("tab-wishlist");
const panelScan = document.getElementById("panel-scan");
const panelLibrary = document.getElementById("panel-library");
const panelWishlist = document.getElementById("panel-wishlist");
const libraryGrid = document.getElementById("library-grid");
const sortSelect = document.getElementById("sort-select");
const filterSelect = document.getElementById("filter-select");
const manualForm = document.getElementById("manual-form");
const manualInput = document.getElementById("manual-input");
const scanStartBtn = document.getElementById("scan-start-btn");
const scannerView = document.getElementById("scanner-view");
const wishlistForm = document.getElementById("wishlist-form");
const wishlistInput = document.getElementById("wishlist-input");
const wishlistResults = document.getElementById("wishlist-results");
const wishlistGrid = document.getElementById("wishlist-grid");

const STATUS_LABELS = {
  unread: "Unread",
  reading: "Currently reading",
  read: "Read",
  owned: "Owned",
  wishlisted: "Wishlisted",
};
const STATUS_ORDER = { reading: 0, unread: 1, read: 2, owned: 3, wishlisted: 4 };

const SORTERS = {
  added_desc: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  added_asc: (a, b) => new Date(a.created_at) - new Date(b.created_at),
  title_asc: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  author_asc: (a, b) => (a.author ?? "").localeCompare(b.author ?? ""),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
};

let currentBooks = [];

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
  tabScanBtn.classList.toggle("active", tab === "scan");
  tabLibraryBtn.classList.toggle("active", tab === "library");
  tabWishlistBtn.classList.toggle("active", tab === "wishlist");
  panelScan.classList.toggle("hidden", tab !== "scan");
  panelLibrary.classList.toggle("hidden", tab !== "library");
  panelWishlist.classList.toggle("hidden", tab !== "wishlist");

  if (tab !== "scan") {
    closeScannerUI();
  }
}

async function openScannerUI() {
  scanStartBtn.classList.add("hidden");
  scannerView.classList.remove("hidden");
  try {
    await scanner.start();
    showStatus("Point the camera at a barcode.", "info");
  } catch (err) {
    showStatus(`Camera error: ${err.message || err}`, "error");
    closeScannerUI();
  }
}

function closeScannerUI() {
  scanner.stop();
  scannerView.classList.add("hidden");
  scanStartBtn.classList.remove("hidden");
}

async function addBookByIsbn(isbn) {
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

async function onScanSuccess(decodedText) {
  if (isProcessing) return;

  const isbn = normalizeIsbn(decodedText);
  if (!isbn) {
    showStatus(`Misread (${decodedText}) — try again.`, "error");
    return;
  }

  const lastSeen = recentlyScanned.get(isbn);
  if (lastSeen && Date.now() - lastSeen < 5000) return;
  recentlyScanned.set(isbn, Date.now());

  closeScannerUI();
  await addBookByIsbn(isbn);
}

async function handleManualAdd(rawInput) {
  if (isProcessing) return;

  const isbn = normalizeIsbn(rawInput);
  if (!isbn) {
    showStatus(`Invalid ISBN: ${rawInput}`, "error");
    return;
  }

  await addBookByIsbn(isbn);
}

async function handleWishlistSearch(query) {
  wishlistResults.innerHTML = "";
  showStatus(`Searching for "${query}"...`, "info");
  try {
    const results = await searchBooksByTitle(query);
    if (results.length === 0) {
      wishlistResults.innerHTML = `<p class="empty">No matches found.</p>`;
      showStatus("No matches found.", "error");
      return;
    }
    for (const result of results) {
      wishlistResults.appendChild(wishlistCard(result));
    }
    showStatus(`Found ${results.length} result${results.length === 1 ? "" : "s"}.`, "success");
  } catch (err) {
    showStatus(`Search failed: ${err.message}`, "error");
  }
}

function wishlistCard(result) {
  const card = document.createElement("div");
  card.className = "book-card";

  const img = document.createElement("img");
  img.src = result.cover_url || "";
  img.alt = result.title ?? "Unknown title";
  img.onerror = () => {
    img.style.visibility = "hidden";
  };

  const info = document.createElement("div");
  info.className = "book-info";
  info.innerHTML = `
    <strong>${escapeHtml(result.title ?? "Unknown title")}</strong>
    <span>${escapeHtml(result.author ?? "")}</span>
    <span class="isbn">${escapeHtml(result.isbn)}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "wishlist-actions";

  const addLibraryBtn = document.createElement("button");
  addLibraryBtn.type = "button";
  addLibraryBtn.className = "wishlist-add-btn";
  addLibraryBtn.textContent = "Add to Library";

  const addWishlistBtn = document.createElement("button");
  addWishlistBtn.type = "button";
  addWishlistBtn.className = "wishlist-add-btn wishlist-add-btn-secondary";
  addWishlistBtn.textContent = "Add to Wishlist";

  addLibraryBtn.addEventListener("click", () =>
    addSearchResult(result, "unread", [addLibraryBtn, addWishlistBtn], addLibraryBtn)
  );
  addWishlistBtn.addEventListener("click", () =>
    addSearchResult(result, "wishlisted", [addLibraryBtn, addWishlistBtn], addWishlistBtn)
  );

  actions.append(addLibraryBtn, addWishlistBtn);
  card.append(img, info, actions);
  return card;
}

async function addSearchResult(result, status, buttons, clickedBtn) {
  buttons.forEach((b) => (b.disabled = true));
  showStatus(`Adding ${result.title ?? result.isbn}...`, "info");
  try {
    const { data: existing, error: checkError } = await supabase
      .from("books")
      .select("id")
      .eq("isbn", result.isbn)
      .limit(1);
    if (checkError) throw checkError;
    if (existing.length > 0) {
      showStatus(`Already in your library: ${result.title ?? result.isbn}`, "error");
      buttons.forEach((b) => (b.disabled = false));
      return;
    }

    const { error } = await supabase.from("books").insert({
      isbn: result.isbn,
      title: result.title,
      author: result.author,
      cover_url: result.cover_url,
      status,
    });
    if (error) throw error;
    showStatus(`Added: ${result.title ?? result.isbn}`, "success");
    clickedBtn.textContent = "Added";
  } catch (err) {
    showStatus(`Failed to add: ${err.message}`, "error");
    buttons.forEach((b) => (b.disabled = false));
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
  currentBooks = data;
  renderLibrary(currentBooks);
  renderWishlistTab(currentBooks);
}

function renderWishlistTab(books) {
  wishlistGrid.innerHTML = "";
  const wishlisted = books.filter((b) => b.status === "wishlisted");
  if (wishlisted.length === 0) {
    wishlistGrid.innerHTML = `<p class="empty">No wishlisted books yet.</p>`;
    return;
  }
  const sorted = [...wishlisted].sort(SORTERS.added_desc);
  for (const book of sorted) {
    wishlistGrid.appendChild(bookCard(book));
  }
}

function renderLibrary(books) {
  libraryGrid.innerHTML = "";

  const filtered =
    filterSelect.value === "all" ? books : books.filter((b) => b.status === filterSelect.value);

  if (filtered.length === 0) {
    libraryGrid.innerHTML =
      books.length === 0
        ? `<p class="empty">No books scanned yet.</p>`
        : `<p class="empty">No books match this filter.</p>`;
    return;
  }

  const sorted = [...filtered].sort(SORTERS[sortSelect.value]);
  for (const book of sorted) {
    libraryGrid.appendChild(bookCard(book));
  }
}

function bookCard(book) {
  const card = document.createElement("div");
  card.className = "book-card";
  card.dataset.status = book.status;

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
  `;

  const isbnRow = document.createElement("div");
  isbnRow.className = "isbn-row";
  renderIsbnView(isbnRow, book);
  info.appendChild(isbnRow);

  const statusSelect = document.createElement("select");
  statusSelect.className = "status-select";
  for (const [value, label] of Object.entries(STATUS_LABELS)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (value === book.status) option.selected = true;
    statusSelect.appendChild(option);
  }
  statusSelect.addEventListener("change", () => {
    card.dataset.status = statusSelect.value;
    updateStatus(book.id, statusSelect.value);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Remove";
  deleteBtn.addEventListener("click", () => deleteBook(book.id));

  card.append(img, info, statusSelect, deleteBtn);
  return card;
}

async function updateStatus(id, status) {
  const { error } = await supabase.from("books").update({ status }).eq("id", id);
  if (error) showStatus(error.message, "error");
}

function renderIsbnView(isbnRow, book) {
  isbnRow.innerHTML = "";

  const isbnText = document.createElement("span");
  isbnText.className = "isbn";
  isbnText.textContent = book.isbn;

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "edit-isbn-btn";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => renderIsbnEdit(isbnRow, book));

  isbnRow.append(isbnText, editBtn);
}

function renderIsbnEdit(isbnRow, book) {
  isbnRow.innerHTML = "";

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.className = "isbn-edit-input";
  input.value = book.isbn;

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "isbn-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", async () => {
    const isbn = normalizeIsbn(input.value);
    if (!isbn) {
      showStatus(`Invalid ISBN: ${input.value}`, "error");
      return;
    }
    saveBtn.disabled = true;
    showStatus(`Updating to ${isbn}...`, "info");
    try {
      const updated = await lookupBook(isbn);
      const { error } = await supabase
        .from("books")
        .update({
          isbn,
          title: updated.title,
          author: updated.author,
          cover_url: updated.cover_url,
        })
        .eq("id", book.id);
      if (error) throw error;
      showStatus(`Updated: ${updated.title ?? isbn}`, "success");
    } catch (err) {
      showStatus(`Failed to update: ${err.message}`, "error");
      saveBtn.disabled = false;
    }
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "isbn-cancel-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => renderIsbnView(isbnRow, book));

  isbnRow.append(input, saveBtn, cancelBtn);
  input.focus();
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
    scanStartBtn.disabled = true;
    tabLibraryBtn.disabled = true;
    tabWishlistBtn.disabled = true;
    return;
  }

  tabScanBtn.addEventListener("click", () => switchTab("scan"));
  scanStartBtn.addEventListener("click", openScannerUI);
  tabLibraryBtn.addEventListener("click", () => switchTab("library"));
  tabWishlistBtn.addEventListener("click", () => switchTab("wishlist"));
  sortSelect.addEventListener("change", () => renderLibrary(currentBooks));
  filterSelect.addEventListener("change", () => renderLibrary(currentBooks));
  manualForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleManualAdd(manualInput.value);
    manualInput.value = "";
  });
  wishlistForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (wishlistInput.value.trim()) handleWishlistSearch(wishlistInput.value.trim());
  });

  loadLibrary();
  subscribeToLibrary();
}

function unlock() {
  localStorage.setItem(UNLOCK_STORAGE_KEY, "true");
  lockScreen.classList.add("hidden");
  appEl.classList.remove("hidden");
  init();
}

if (localStorage.getItem(UNLOCK_STORAGE_KEY) === "true") {
  unlock();
} else {
  lockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (lockInput.value === ACCESS_CODE) {
      unlock();
    } else {
      lockError.textContent = "Incorrect code.";
      lockInput.value = "";
    }
  });
}
