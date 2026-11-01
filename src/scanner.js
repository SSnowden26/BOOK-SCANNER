import { readBarcodes } from "zxing-wasm/reader";

const SCAN_INTERVAL_MS = 300;

// Manual camera + canvas-frame-grab loop, decoded with zxing-wasm (a WASM
// port of the real ZXing C++ engine). This is noticeably more accurate at
// 1D barcodes on iOS Safari than the pure-JS zxing-js decoders, which don't
// have access to a BarcodeDetector API there.
export function createScanner({ container, onDetected }) {
  let stream = null;
  let video = null;
  let canvas = null;
  let ctx = null;
  let intervalId = null;
  let scanningFrame = false;

  async function start() {
    container.innerHTML = "";

    video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.muted = true;
    video.autoplay = true;
    container.appendChild(video);

    const guide = document.createElement("div");
    guide.className = "scan-guide";
    container.appendChild(guide);

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx = canvas.getContext("2d", { willReadFrequently: true });

    container.addEventListener("click", onTap);

    intervalId = setInterval(scanFrame, SCAN_INTERVAL_MS);
  }

  // Chrome on Android exposes focusMode/pointsOfInterest via getUserMedia
  // constraints, so tapping can nudge the camera to refocus there. iOS
  // Safari doesn't expose these at all (track.getCapabilities().focusMode
  // comes back empty), so this silently does nothing there -- which is
  // fine, since iOS already autofocuses well on its own.
  function onTap(e) {
    if (!video || !stream) return;
    showFocusRing(e.clientX, e.clientY);

    const track = stream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() ?? {};
    if (!capabilities.focusMode || !video.videoWidth) return;

    const rect = container.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;

    // Map the tap position (in the displayed, object-fit:cover-cropped
    // box) back to a normalized point in the camera's native frame.
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const offsetX = (renderedWidth - rect.width) / 2;
    const offsetY = (renderedHeight - rect.height) / 2;
    const x = Math.min(1, Math.max(0, (displayX + offsetX) / renderedWidth));
    const y = Math.min(1, Math.max(0, (displayY + offsetY) / renderedHeight));

    // Combine pointsOfInterest and focusMode into a single constraint set
    // (rather than separate "advanced" entries) -- some Android camera
    // stacks only honor a new point of interest when it's applied
    // together with the focus mode in the same set.
    const constraintSet = { pointsOfInterest: [{ x, y }] };
    if (capabilities.focusMode.includes("single-shot")) {
      constraintSet.focusMode = "single-shot";
    } else if (capabilities.focusMode.includes("continuous")) {
      constraintSet.focusMode = "continuous";
    }
    track.applyConstraints({ advanced: [constraintSet] }).catch(() => {
      // some devices reject certain combinations; nothing to do about it
    });
  }

  function showFocusRing(clientX, clientY) {
    const ring = document.createElement("div");
    ring.className = "focus-ring";
    const rect = container.getBoundingClientRect();
    ring.style.left = `${clientX - rect.left}px`;
    ring.style.top = `${clientY - rect.top}px`;
    container.appendChild(ring);
    ring.addEventListener("animationend", () => ring.remove());
  }

  async function scanFrame() {
    if (scanningFrame || !video || video.readyState < 2) return;
    scanningFrame = true;
    try {
      if (video.videoWidth && canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const results = await readBarcodes(imageData, {
        tryHarder: true,
        formats: ["EAN-13", "UPC-A"],
        maxNumberOfSymbols: 1,
      });
      if (results.length > 0) {
        onDetected(results[0].text);
      }
    } catch {
      // a single frame failing to decode is expected/normal; ignore
    } finally {
      scanningFrame = false;
    }
  }

  function stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    container.removeEventListener("click", onTap);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    container.innerHTML = "";
    video = null;
    canvas = null;
    ctx = null;
  }

  return { start, stop };
}
