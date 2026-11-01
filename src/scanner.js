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

    intervalId = setInterval(scanFrame, SCAN_INTERVAL_MS);
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
