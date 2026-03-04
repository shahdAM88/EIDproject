const videoEl = document.getElementById("video");
const canvasEl = document.getElementById("overlay");
const ctx = canvasEl.getContext("2d");

const btnToggle = document.getElementById("toggleDraw");
const btnClear = document.getElementById("clear");
const btnAuto = document.getElementById("autoEid");

// ----- Drawing state -----
let drawingEnabled = true;
let lastPoint = null;         // {x,y}
let strokePoints = [];        // store points so we keep drawings between frames

// Glow style
function drawGlowLine(p1, p2) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // You can tweak these:
  const width = 8;
  ctx.lineWidth = width;

  ctx.shadowBlur = 22;
  ctx.shadowColor = "rgba(255, 215, 0, 0.95)";
  ctx.strokeStyle = "rgba(255, 215, 0, 0.95)";

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
}

// Redraw everything we already drew (so it persists)
function redrawStrokes() {
  for (let i = 1; i < strokePoints.length; i++) {
    const a = strokePoints[i - 1];
    const b = strokePoints[i];
    if (!a.break && !b.break) drawGlowLine(a, b);
  }
}

// Resize canvas to match displayed video size
function resizeCanvas() {
  const rect = videoEl.getBoundingClientRect();
  canvasEl.width = Math.floor(rect.width);
  canvasEl.height = Math.floor(rect.height);
}
window.addEventListener("resize", () => {
  resizeCanvas();
  renderFrameOnly();
});

// Clear overlay (but keep video visible)
function clearDrawing() {
  strokePoints = [];
  lastPoint = null;
  renderFrameOnly();
}

btnToggle.addEventListener("click", () => {
  drawingEnabled = !drawingEnabled;
  btnToggle.textContent = `الرسم: ${drawingEnabled ? "ON" : "OFF"}`;
  // Add a break so next stroke doesn't connect
  strokePoints.push({ break: true });
  lastPoint = null;
});

btnClear.addEventListener("click", clearDrawing);

// ----- Gesture helpers -----
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

// A simple “fist” heuristic: fingertips close to palm center
function isFist(landmarks) {
  // palm center approx: average of wrist (0), index_mcp (5), pinky_mcp (17)
  const wrist = landmarks[0];
  const idxMcp = landmarks[5];
  const pkyMcp = landmarks[17];
  const palm = {
    x: (wrist.x + idxMcp.x + pkyMcp.x) / 3,
    y: (wrist.y + idxMcp.y + pkyMcp.y) / 3
  };

  const tips = [4, 8, 12, 16, 20].map(i => landmarks[i]); // thumb/index/middle/ring/pinky tips
  const avgTipDist = tips.reduce((acc, t) => acc + dist(t, palm), 0) / tips.length;

  // Threshold tuned for normalized coords
  return avgTipDist < 0.13;
}

// Convert normalized landmark (0..1) to canvas pixels
function toCanvasPoint(lm) {
  // Mirror horizontally to match “selfie” view
  const x = (1 - lm.x) * canvasEl.width;
  const y = lm.y * canvasEl.height;
  return { x, y };
}

// Render only current frame overlay (clear + redraw strokes + optional debug)
function renderFrameOnly(debugLandmarks = null) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  // Keep existing drawing
  redrawStrokes();

  // Optional: draw small hand points
  if (debugLandmarks) {
    ctx.save();
    ctx.fillStyle = "rgba(0,255,255,.8)";
    for (const p of debugLandmarks) {
      const pt = toCanvasPoint(p);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ----- MediaPipe Hands -----
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6,
  selfieMode: true,
});

hands.onResults((results) => {
  // Ensure canvas matches the displayed video size
  if (canvasEl.width === 0 || canvasEl.height === 0) resizeCanvas();

  const landmarks = results.multiHandLandmarks?.[0] ?? null;

  // Always redraw existing strokes
  if (!landmarks) {
    // If no hand detected, break stroke
    strokePoints.push({ break: true });
    lastPoint = null;
    renderFrameOnly(null);
    return;
  }

  const fist = isFist(landmarks);

  // Fingertip: index finger tip = 8
  const indexTip = landmarks[8];
  const pt = toCanvasPoint(indexTip);

  // Stop drawing when fist (acts like "pen up")
  const penDown = drawingEnabled && !fist;

  // If pen is down, add stroke points and draw segment
  if (penDown) {
    if (lastPoint) {
      strokePoints.push(pt);
      // Draw only the latest segment for efficiency
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      redrawStrokes();
      drawGlowLine(lastPoint, pt);
    } else {
      // Start new stroke
      strokePoints.push({ break: true });
      strokePoints.push(pt);
    }
    lastPoint = pt;
  } else {
    // Pen up -> break
    strokePoints.push({ break: true });
    lastPoint = null;
    renderFrameOnly(null);
  }
});

// Camera
const camera = new Camera(videoEl, {
  onFrame: async () => {
    await hands.send({ image: videoEl });
  },
  width: 1280,
  height: 720,
});

(async function start() {
  try {
    await camera.start();
    // Wait a moment for layout then size canvas
    setTimeout(resizeCanvas, 300);
  } catch (e) {
    alert("تعذر تشغيل الكاميرا. تأكدي من السماح بالوصول للكاميرا وتشغيل عبر localhost.");
    console.error(e);
  }
})();

// ----- Auto draw "عيد مبارك" (simple path animation) -----
btnAuto.addEventListener("click", async () => {
  // This draws a pre-defined path (not OCR). Just a fun demo.
  // You can replace points with your own path later.
  clearDrawing();

  const W = canvasEl.width, H = canvasEl.height;
  const path = makeEidMubarakPath(W, H);

  drawingEnabled = false;
  btnToggle.textContent = `الرسم: OFF`;

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (a.break || b.break) {
      strokePoints.push({ break: true });
      lastPoint = null;
      continue;
    }
    strokePoints.push(b);
    ctx.clearRect(0, 0, W, H);
    redrawStrokes();
    drawGlowLine(a, b);
    await sleep(10);
  }
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// A very rough handwritten-style path for "عيد مبارك" (two words).
function makeEidMubarakPath(W, H) {
  const pts = [];
  const sx = W * 0.15, sy = H * 0.35;
  const scale = Math.min(W, H) * 0.0022;

  function moveTo(x, y) { pts.push({ break: true }); pts.push({ x, y }); }
  function lineTo(x, y) { pts.push({ x, y }); }
  function curve(points) {
    for (const [x, y] of points) lineTo(x, y);
  }

  // "عيد" (very stylized)
  moveTo(sx, sy);
  curve([
    [sx + 80*scale*100, sy + 20*scale*100],
    [sx + 140*scale*100, sy - 10*scale*100],
    [sx + 200*scale*100, sy + 10*scale*100],
    [sx + 260*scale*100, sy + 0*scale*100],
  ]);

  moveTo(sx + 280*scale*100, sy + 10*scale*100);
  curve([
    [sx + 300*scale*100, sy + 40*scale*100],
    [sx + 330*scale*100, sy + 70*scale*100],
    [sx + 360*scale*100, sy + 40*scale*100],
    [sx + 380*scale*100, sy + 10*scale*100],
  ]);

  // dots for ي
  moveTo(sx + 340*scale*100, sy + 90*scale*100);
  lineTo(sx + 342*scale*100, sy + 92*scale*100);
  moveTo(sx + 365*scale*100, sy + 92*scale*100);
  lineTo(sx + 367*scale*100, sy + 94*scale*100);

  // "مبارك" (stylized)
  const x2 = W * 0.18, y2 = H * 0.62;
  moveTo(x2, y2);
  curve([
    [x2 + 60*scale*100, y2 - 40*scale*100],
    [x2 + 120*scale*100, y2 + 10*scale*100],
    [x2 + 180*scale*100, y2 - 30*scale*100],
    [x2 + 240*scale*100, y2 + 10*scale*100],
    [x2 + 300*scale*100, y2 - 10*scale*100],
    [x2 + 360*scale*100, y2 + 10*scale*100],
    [x2 + 420*scale*100, y2 - 20*scale*100],
    [x2 + 480*scale*100, y2 + 0*scale*100],
  ]);

  // dots (rough)
  moveTo(x2 + 250*scale*100, y2 + 60*scale*100);
  lineTo(x2 + 252*scale*100, y2 + 62*scale*100);
  moveTo(x2 + 280*scale*100, y2 + 62*scale*100);
  lineTo(x2 + 282*scale*100, y2 + 64*scale*100);

  return pts;
}