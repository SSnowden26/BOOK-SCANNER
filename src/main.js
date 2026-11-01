import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { supabase, isConfigured } from "./supabaseClient.js";
import { lookupBook } from "./bookLookup.js";
import "./style.css";

const statusEl = document.getElementById("status");
const tabScanBtn = document.getElementById("tab-scan");
const tabLibraryBtn = document.getElementById("tab-library");
const panelScan = document.getElementById("panel-scan");
const panelLibrary = document.getElementById("panel-library");
const libraryGrid = document.getElementById("library-grid");

let html5QrCode = null;
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
  if (html5QrCode) return;
  html5QrCode = new Html5Qrcode("scanner-view");
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const width = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.9);
          return { width, height: Math.floor(width * 0.45) };
        },
        disableFlip: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
        ],
        videoConstraints: {
          facingMode: "environment",
          width: { min: 1280, ideal: 1920 },
          height: { min: 720, ideal: 1080 },
        },
      },
      onScanSuccess
    );
    showStatus("Point the camera at a barcode.", "info");
  } catch (err) {
    showStatus(`Camera error: ${err}`, "error");
    html5QrCode = null;
  }
}

async function stopScanner() {
  if (!html5QrCode) return;
  try {
    await html5QrCode.stop();
    html5QrCode.clear();
  } catch {
    // ignore stop errors
  }
  html5QrCode = null;
}

async function onScanSuccess(decodedText) {
  const isbn = decodedText.replace(/[^0-9Xx]/g, "");
  if (isProcessing) return;

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
