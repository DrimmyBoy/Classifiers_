// =====================================================================
//  1) EMBED YOUR TEACHABLE MACHINE LINKS HERE (paste once, never type them again)
//     Example: "https://teachablemachine.withgoogle.com/models/AbCdEfGhI/"
//     Leave "" to type the link in the page's Settings instead.
// =====================================================================
const DEFAULT_SOUND_URL = "https://teachablemachine.withgoogle.com/models/pWNhJfmgw/";   // your AUDIO project link
const DEFAULT_IMAGE_URL = "https://teachablemachine.withgoogle.com/models/fqBXbw-LP/";   // your IMAGE project link
// =====================================================================
//  2) PICTURES: put one picture per class inside an "images" folder, named after the class
//     in lowercase (spaces become hyphens). Class "Dog" -> images/dog.jpg  (.jpg .jpeg .png .webp)
//     Class "Rooster Crow" -> images/rooster-crow.jpg
//     Want a different file name? List it below. If no picture is found, an emoji is shown.
// =====================================================================
const IMAGES = {
  // "Dog": "dog.jpg",
  // "Cat": "cat.jpg",
};
// =====================================================================
//  3) EFFECTS: switch things on/off or tune them
// =====================================================================
const FX = {
  confetti: true,      // colour burst when something new is detected
  vibrate: true,       // short buzz on phones
  visualizer: false,    // live sound bars (sound mode)
  holdMs: 1200,        // keep showing a result this long after it dips below the confidence level
  waves: true,         // colour waves across the screen that move with your voice
  waveLayers: 5,       // how many wave layers (3-7 looks good)
  waveHeight: 1,       // 0.5 = calmer, 2 = bigger waves
};

// Emoji fallback: matches if the class name contains any of these words
const EMOJI_HINTS = [
  [["dog","aso","bark","tahol"], "🐶"], [["cat","pusa","meow"], "🐱"],
  [["rooster","manok","chicken","tilaok"], "🐔"], [["pig","baboy"], "🐷"],
  [["cow","baka"], "🐮"], [["goat","kambing"], "🐐"], [["horse","kabayo"], "🐴"],
  [["duck","pato"], "🦆"], [["bird","ibon"], "🐦"], [["frog","palaka"], "🐸"],
  [["owl","kuwago"], "🦉"], [["lion","leon"], "🦁"], [["bee","bubuyog"], "🐝"],
  [["clap","palakpak"], "👏"], [["whistle","sipol"], "😗"], [["snap"], "🫰"],
  [["speech","voice","talk","salita"], "🗣️"], [["music","musika"], "🎵"],
  [["person","tao","face","mukha"], "🙂"], [["hand","kamay"], "🖐️"], [["thumb"], "👍"],
];
const emojiFor = name => {
  const n = name.toLowerCase();
  for (const [words, e] of EMOJI_HINTS) if (words.some(w => n.includes(w))) return e;
  return mode === "image" ? "👀" : "🔊";   // no matching word: eyes for the camera, speaker for sound
};
// classes that mean "nothing detected"
const isIdle = name => /background|noise|ingay|empty|nothing|walang/i.test(name);

// ---------------------------------------------------------------------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const el = {
  status:$("mic-status"), emoji:$("emoji"), img:$("img"), label:$("label"), hint:$("hint"),
  btn:$("toggle"), flip:$("flip"), bars:$("bars"), cam:$("cam-wrap"), ring:$("ring"),
  visual:$("visual"), viz:$("viz"), fx:$("fx"), waves:$("waves"),
  histWrap:$("history-wrap"), history:$("history"),
  conf:$("conf"), confVal:$("confVal"), settings:$("settings"),
  card:document.querySelector(".card"), tabs:[...document.querySelectorAll(".tab")],
};

const MODES = {
  sound: { key:"tmSoundUrl", def:DEFAULT_SOUND_URL, input:$("soundUrl"), box:$("soundBox"),
           start:"Start Listening", off:"🎤 Microphone is off", on:"🎤 Listening...",
           go:"Make a sound!", none:"No clear sound" },
  image: { key:"tmImageUrl", def:DEFAULT_IMAGE_URL, input:$("imageUrl"), box:$("imageBox"),
           start:"Start Camera", off:"🔍 Camera is off", on:"🔍 Camera is on",
           go:"Point the camera at something", none:"Nothing detected" },
};

let mode = "sound", running = false, lastLabel = null, lastHit = 0, facing = "user";
const sound = { recognizer:null, labels:[], url:"" };
const image = { model:null, webcam:null, labels:[], url:"" };

// restore saved links / hide the box when a link is embedded above
for (const m of Object.values(MODES)) {
  m.input.value = m.def || localStorage.getItem(m.key) || "";
  if (m.def) m.box.style.display = "none";
}
el.conf.value = localStorage.getItem("tmConf") || 80;
el.confVal.textContent = el.conf.value;
el.conf.oninput = () => { el.confVal.textContent = el.conf.value; localStorage.setItem("tmConf", el.conf.value); };

function normalizeUrl(u) {
  u = u.trim().replace(/model\.json$|metadata\.json$/, "");
  if (u && !u.endsWith("/")) u += "/";
  return u;
}

// =====================================================================
//  Mood colour: every class gets its own hue, the background follows it
// =====================================================================
const IDLE_HUE = 230;
let hue = IDLE_HUE;
const hueFor = name => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function setHue(h) { hue = h; document.documentElement.style.setProperty("--hue", h); }

// =====================================================================
//  Confetti burst
// =====================================================================
const fctx = el.fx.getContext("2d");
let parts = [], fxRunning = false;
function sizeFx() { el.fx.width = window.innerWidth; el.fx.height = window.innerHeight; }
window.addEventListener("resize", sizeFx); sizeFx();

function burst() {
  if (!FX.confetti || reduceMotion) return;
  const r = el.visual.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
    parts.push({ x:cx, y:cy, vx:Math.cos(a) * s, vy:Math.sin(a) * s - 3, life:1,
                 size:5 + Math.random() * 6, hue:hue + (Math.random() * 70 - 35),
                 rot:Math.random() * 6, vr:(Math.random() - .5) * .4 });
  }
  if (!fxRunning) { fxRunning = true; requestAnimationFrame(tickFx); }
}
function tickFx() {
  fctx.clearRect(0, 0, el.fx.width, el.fx.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += .25; p.vx *= .985; p.life -= .016; p.rot += p.vr;
    fctx.save(); fctx.globalAlpha = Math.max(p.life, 0);
    fctx.translate(p.x, p.y); fctx.rotate(p.rot);
    fctx.fillStyle = `hsl(${p.hue} 85% 62%)`; fctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    fctx.restore();
  }
  if (parts.length) requestAnimationFrame(tickFx);
  else { fxRunning = false; fctx.clearRect(0, 0, el.fx.width, el.fx.height); }
}

// =====================================================================
//  Live sound visualizer (own mic tap, only used for the pretty bars)
// =====================================================================
const viz = { ctx:null, stream:null, analyser:null, data:null, raf:0, level:0 };

async function startViz() {
  if (!FX.visualizer || reduceMotion) return;
  try {
    viz.stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const AC = window.AudioContext || window.webkitAudioContext;
    viz.ctx = new AC();
    const src = viz.ctx.createMediaStreamSource(viz.stream);
    viz.analyser = viz.ctx.createAnalyser();
    viz.analyser.fftSize = 128; viz.analyser.smoothingTimeConstant = .75;
    src.connect(viz.analyser);
    viz.data = new Uint8Array(viz.analyser.frequencyBinCount);
    el.viz.hidden = false;
    drawViz();
  } catch (e) { console.warn("Visualizer unavailable:", e); stopViz(); }
}

function drawViz() {
  const c = el.viz, g = c.getContext("2d");
  viz.analyser.getByteFrequencyData(viz.data);
  g.clearRect(0, 0, c.width, c.height);
  const n = 32, bw = c.width / n; let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = viz.data[i + 1] / 255; sum += v;
    const h = Math.max(4, v * c.height);
    g.fillStyle = `hsl(${hue + i * 2} 80% 62%)`;
    g.fillRect(i * bw + 2, (c.height - h) / 2, bw - 4, h);
  }
  viz.level = Math.min(1, (sum / n) * 2.2);
  el.visual.style.setProperty("--level", viz.level.toFixed(3));
  viz.raf = requestAnimationFrame(drawViz);
}

function stopViz() {
  cancelAnimationFrame(viz.raf);
  if (viz.stream) viz.stream.getTracks().forEach(t => t.stop());
  if (viz.ctx) viz.ctx.close().catch(() => {});
  viz.stream = viz.ctx = viz.analyser = viz.data = null; viz.level = 0;
  el.viz.hidden = true;
  el.visual.style.setProperty("--level", 0);
}

// =====================================================================
//  Flowing colour waves: height follows the mic spectrum, colours follow the class hue
// =====================================================================
const wctx = el.waves.getContext("2d");
let waveLevel = 0, waveT = 0, lastWave = 0;
function sizeWaves() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  el.waves.width = Math.round(window.innerWidth * dpr);
  el.waves.height = Math.round(window.innerHeight * dpr);
}
window.addEventListener("resize", sizeWaves); sizeWaves();

function drawWaves(ts) {
  requestAnimationFrame(drawWaves);
  const w = el.waves.width, h = el.waves.height;
  wctx.clearRect(0, 0, w, h);
  if (!FX.waves || reduceMotion || !document.body.classList.contains("active")) { waveLevel = 0; return; }

  const dt = Math.min((ts - lastWave) / 1000 || 0.016, 0.05); lastWave = ts;
  // ease towards the current loudness: quick to rise, slow to fall
  const target = running && mode === "sound" ? viz.level : 0.06;
  waveLevel += (target - waveLevel) * (target > waveLevel ? 0.35 : 0.08);
  waveT += dt * (1 + waveLevel * 5);               // louder = faster flow

  const spec = viz.data;                            // frequency bins (may be null)
  const layers = Math.max(1, Math.min(8, FX.waveLayers));
  const scale = h / 900;
  for (let k = 0; k < layers; k++) {
    const baseY = h * (0.62 + k * 0.07);
    const amp = (10 + waveLevel * 170 * FX.waveHeight) * (1 - k * 0.1) * scale;
    const grad = wctx.createLinearGradient(0, 0, w, 0);
    for (let s = 0; s <= 4; s++) {                  // hue travels along the wave and over time
      const hh = (hue + k * 22 + s * 28 + waveT * 25) % 360;
      grad.addColorStop(s / 4, `hsla(${hh} 85% 60% / ${0.30 - k * 0.03})`);
    }
    wctx.beginPath();
    wctx.moveTo(0, h);
    const step = 8;
    for (let x = 0; x <= w + step; x += step) {
      const u = x / w;
      const bin = spec ? spec[1 + Math.floor(Math.min(u, 0.999) * 30)] / 255 : 0;   // loudness at this pitch
      const local = 0.45 + bin * 1.6;
      const y = baseY
        - Math.sin(u * 7 + waveT * (1.2 + k * 0.25) + k * 1.3) * amp * local
        - Math.sin(u * 13 - waveT * (0.8 + k * 0.2)) * amp * 0.35 * local;
      wctx.lineTo(x, y);
    }
    wctx.lineTo(w, h); wctx.closePath();
    wctx.fillStyle = grad; wctx.fill();
    wctx.lineWidth = 2 * scale + 1;
    wctx.strokeStyle = `hsla(${(hue + k * 22 + waveT * 25) % 360} 90% 70% / ${0.5 - k * 0.06})`;
    wctx.stroke();
  }
}
requestAnimationFrame(drawWaves);

// =====================================================================
//  Recent detections log
// =====================================================================
const history = [];
function pushHistory(name, pct) {
  history.unshift({ name, pct, t:new Date() });
  history.length = Math.min(history.length, 6);
  el.histWrap.hidden = false;
  el.history.innerHTML = history.map(h => `
    <li style="--h:${hueFor(h.name)}"><span>${emojiFor(h.name)} ${esc(h.name)}</span>
      <em>${h.pct}% · ${h.t.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" })}</em></li>`).join("");
}
function clearHistory() { history.length = 0; el.history.innerHTML = ""; el.histWrap.hidden = true; }

// =====================================================================
//  UI helpers
// =====================================================================
function buildBars(labels) {
  el.bars.innerHTML = labels.map((l, i) => `
    <div class="row" id="r${i}"><span>${emojiFor(l)} ${esc(l)}</span>
      <div class="track"><div class="fill" id="f${i}"></div></div>
      <span class="pct" id="p${i}">0%</span></div>`).join("");
  labels.forEach(findImage); // preload pictures so they appear instantly
}

function setActive(on) {
  document.body.classList.toggle("active", on);
  document.body.classList.toggle("idle-anim", on);
}

function resetUI() {
  const m = MODES[mode];
  el.status.textContent = m.off; el.status.classList.remove("on");
  el.btn.textContent = m.start; el.btn.classList.remove("stop");
  el.emoji.style.display = ""; el.img.style.display = "none";
  el.emoji.textContent = ""; el.label.textContent = ""; el.hint.textContent = "Press Start...";
  el.visual.classList.add("empty");
  el.card.classList.remove("detected");
  setActive(false); setHue(IDLE_HUE);
}

function runningUI() {
  const m = MODES[mode];
  el.status.textContent = m.on; el.status.classList.add("on");
  el.btn.textContent = "Stop"; el.btn.classList.add("stop");
  el.emoji.style.display = ""; el.img.style.display = "none";
  el.visual.classList.remove("empty");
  el.emoji.textContent = mode === "image" ? "🔍" : "👂";
  el.label.textContent = mode === "image" ? "Looking..." : "Listening...";
  el.hint.textContent = m.go;
  setActive(true);
}

// ---------- Mode switching ----------
async function setMode(m) {
  if (running) await stop();
  mode = m;
  el.tabs.forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  el.flip.hidden = m !== "image";
  el.cam.hidden = true;
  el.bars.innerHTML = "";
  clearHistory();
  resetUI();
}
el.tabs.forEach(t => t.addEventListener("click", () => { if (t.dataset.mode !== mode) setMode(t.dataset.mode); }));

// ---------- Start / Stop ----------
async function start() {
  const m = MODES[mode];
  const url = normalizeUrl(m.input.value);
  if (!url) {
    el.settings.open = true;
    el.hint.textContent = "Please enter the model link in Settings ⚙️";
    return;
  }
  el.btn.disabled = true; el.hint.textContent = "Loading model...";
  try {
    if (mode === "sound") await startSound(url); else await startImage(url);
    localStorage.setItem(m.key, url);
    running = true; lastLabel = null; lastHit = 0;
    runningUI();
    if (mode === "image") loop(); else startViz();
  } catch (e) {
    console.error(e);
    const denied = e && e.name === "NotAllowedError";
    el.hint.textContent = denied
      ? `Permission denied for the ${mode === "sound" ? "microphone" : "camera"}. Please allow it in your browser settings.`
      : "Something went wrong. Check the link and permissions. (" + (e.message || e) + ")";
    el.settings.open = !denied;
    if (mode === "image") { el.cam.innerHTML = ""; el.cam.hidden = true; }
  } finally { el.btn.disabled = false; }
}

async function stop() {
  if (mode === "sound") {
    if (sound.recognizer && running) sound.recognizer.stopListening();
    stopViz();
  } else {
    if (image.webcam) { image.webcam.stop(); image.webcam = null; }
    el.cam.innerHTML = ""; el.cam.hidden = true;
  }
  running = false; lastLabel = null; showToken++;
  resetUI();
  document.querySelectorAll(".fill").forEach(f => f.style.width = "0");
  document.querySelectorAll(".pct").forEach(p => p.textContent = "0%");
  document.querySelectorAll(".row.top").forEach(r => r.classList.remove("top"));
}

el.btn.addEventListener("click", () => (running ? stop() : start()));
el.flip.addEventListener("click", async () => {
  facing = facing === "user" ? "environment" : "user";
  if (running && mode === "image") { await stop(); await start(); }
});

// ---------- Sound (Teachable Machine audio) ----------
async function startSound(url) {
  if (!sound.recognizer || sound.url !== url) {
    const r = speechCommands.create("BROWSER_FFT", undefined, url + "model.json", url + "metadata.json");
    await r.ensureModelLoaded();
    sound.recognizer = r; sound.labels = r.wordLabels(); sound.url = url;
  }
  buildBars(sound.labels);
  await sound.recognizer.listen(result => {
    if (running) onScores(sound.labels, Array.from(result.scores));
  }, { includeSpectrogram:false, probabilityThreshold:0, invokeCallbackOnNoiseAndUnknown:true, overlapFactor:0.5 });
}

// ---------- Camera (Teachable Machine image) ----------
async function startImage(url) {
  if (!image.model || image.url !== url) {
    image.model = await tmImage.load(url + "model.json", url + "metadata.json");
    image.labels = image.model.getClassLabels(); image.url = url;
  }
  buildBars(image.labels);
  const webcam = new tmImage.Webcam(260, 260, facing === "user"); // mirror only the front camera
  await webcam.setup({ facingMode: facing });
  await webcam.play();
  image.webcam = webcam;
  el.cam.innerHTML = ""; el.cam.appendChild(webcam.canvas); el.cam.hidden = false;
}

async function loop() {
  if (!running || mode !== "image" || !image.webcam) return;
  image.webcam.update();
  try {
    const preds = await image.model.predict(image.webcam.canvas);
    if (running && mode === "image") onScores(preds.map(p => p.className), preds.map(p => p.probability));
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

// ---------- Show results (same for sound and camera) ----------
function onScores(labels, scores) {
  let top = 0; scores.forEach((s, i) => { if (s > scores[top]) top = i; });

  scores.forEach((s, i) => {
    const f = $("f" + i), p = $("p" + i), r = $("r" + i);
    if (!f) return;
    f.style.width = Math.round(s * 100) + "%"; p.textContent = Math.round(s * 100) + "%";
    r.classList.toggle("top", i === top && !isIdle(labels[i]));
  });

  const name = labels[top], pct = Math.round(scores[top] * 100);
  const now = performance.now();

  if (isIdle(name) || pct < Number(el.conf.value)) {
    // keep the last result on screen briefly so it doesn't flicker
    if (lastLabel && now - lastHit < FX.holdMs) return;
    el.img.style.display = "none"; el.emoji.style.display = "";
    el.emoji.textContent = mode === "image" ? "🔍" : "👂";
    el.label.textContent = mode === "image" ? "Looking..." : "Listening...";
    el.hint.textContent = isIdle(name) ? MODES[mode].none : "Not sure...";
    el.card.classList.remove("detected"); showToken++;
    setHue(IDLE_HUE);
    lastLabel = null; return;
  }

  lastHit = now;
  el.label.textContent = name;
  el.hint.textContent = `Detected: ${name} (${pct}%)`;
  if (lastLabel !== name) {
    setHue(hueFor(name));
    show(name);
    pushHistory(name, pct);
    burst();
    if (FX.vibrate && navigator.vibrate) navigator.vibrate(50);
  }
  lastLabel = name;
}

// Look for the class picture: IMAGES override first, then images/<class>.jpg/.jpeg/.png/.webp
const imgCache = {};
function findImage(name) {
  if (!imgCache[name]) {
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const candidates = IMAGES[name] ? [IMAGES[name]]
      : ["jpg", "jpeg", "png", "webp"].map(ext => `images/${slug}.${ext}`);
    imgCache[name] = (async () => {
      for (const src of candidates) {
        const ok = await new Promise(res => {
          const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src;
        });
        if (ok) return src;
      }
      return null;
    })();
  }
  return imgCache[name];
}

// Show the picture (or emoji) with a pop-in effect, a ripple ring and a glow in the class colour
let showToken = 0;
async function show(name) {
  const token = ++showToken;
  const src = await findImage(name);
  if (token !== showToken) return;            // result changed while the image was loading
  let target;
  if (src) { el.img.src = src; el.img.style.display = "block"; el.emoji.style.display = "none"; target = el.img; }
  else { el.img.style.display = "none"; el.emoji.style.display = ""; el.emoji.textContent = emojiFor(name); target = el.emoji; }

  target.classList.remove("reveal", "hit"); void target.offsetWidth;
  target.classList.add(src ? "reveal" : "hit");
  el.ring.classList.remove("go"); void el.ring.offsetWidth; el.ring.classList.add("go");
  el.card.classList.add("detected");
}