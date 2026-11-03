/* =========================================================
   THE UNIVERSE - inti game
   File lain:
     config.js    konstanta global + konfigurasi stage I-1..I-10
     sprites.js   koordinat atlas/sprite + definisi pahlawan
     worldgen.js  WorldGen: generator dunia per stage
     enemy-ai.js  EnemyAI : AI per tipe musuh (slime, golem, hantu)
========================================================= */
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const { VIEW_H, GROUND_Y, STEP, MAX_FALL, TIER } = CFG;

/* ---------------- state global ---------------- */
let gameState = "menu";   // menu | charselect | loading | intro | playing | paused | stageclear | gameover
let pauseSettingsOpen = false;
let accumulator = 0, lastTime = 0, frameCount = 0, introT = 0, stageExitT = 0, stageExitStartX = 0, stageExitTargetX = 0, dirty = true;

let level = null;
let platforms = [], hazards = [], enemies = [], pickups = [], chests = [];
let torches = [], structures = [], movers = [], ladders = [], decor = [];
let particles = [], popups = [], effects = [];
const keys = {};
const camera = { x: 0 };
const view = { scale: 1, w: 1280 };

let run = null;           // data run berjalan
let selectedHero = "knight", selectedSkin = "default";
try {
    selectedHero = localStorage.getItem("rs_hero") || "knight";
    selectedSkin = localStorage.getItem("rs_skin") || "default";
    if (!HEROES[selectedHero]) selectedHero = "knight";
} catch (e) { /* storage tidak tersedia */ }

/* =========================================================
   UTIL
========================================================= */
const rand = (a, b) => Math.random() * (b - a) + a;
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const nextTick = () => new Promise(r => setTimeout(r, 0));
const $ = id => document.getElementById(id);
const getDifficulty = () => Number($("diff-select")?.value || 1);

function isTouchDevice() {
    return matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

/* ---------- SFX sederhana (WebAudio) ---------- */
let audioCtx = null;
const SFX = {
    jump:   ["square", 280, 520, 0.10, 0.05],
    slash:  ["sawtooth", 420, 140, 0.12, 0.06],
    hit:    ["square", 200, 70, 0.12, 0.09],
    hurt:   ["sawtooth", 160, 60, 0.25, 0.10],
    pickup: ["triangle", 520, 980, 0.18, 0.08],
    kill:   ["square", 300, 60, 0.22, 0.08],
    slam:   ["sawtooth", 130, 40, 0.32, 0.13],
    charge: ["triangle", 200, 700, 0.40, 0.05],
    zap:    ["sawtooth", 1100, 120, 0.25, 0.07],
    chest:  ["triangle", 380, 1000, 0.28, 0.07],
    door:   ["square", 160, 420, 0.30, 0.05]
};
function sfx(type) {
    if (!$("sound-toggle")?.checked) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const P = SFX[type]; if (!P) return;
        const t = audioCtx.currentTime;
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = P[0];
        o.frequency.setValueAtTime(P[1], t);
        o.frequency.exponentialRampToValueAtTime(P[2], t + P[3]);
        g.gain.setValueAtTime(P[4], t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + P[3]);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + P[3] + 0.02);
    } catch (e) { /* audio tidak tersedia */ }
}

/* =========================================================
   ASET: pemuatan, bake sprite, progress
========================================================= */
const IMAGE_FILES = {
    bg: "map/bg_dungeon.webp", heroM: "player/hero_cowo.webp", heroF: "player/hero_cewe.webp",
    slime: "enemy/musuh.webp", golem: "enemy/musuh2.webp", ghost: "enemy/musuh3.webp",
    plat: "map/platform.webp", cons: "map/construction.webp", portal: "objects/portal.webp",
    chest: "objects/chest_potion.webp", road: "map/road.webp", hp: "ui/hp_bar.webp",
    lose: "ui/lose.webp", victory: "ui/victory.webp", pause: "ui/pause_fullscreen.webp",
    ui: "ui/UI_button.webp", mm: "ui/frame_minimap.webp"
};
const IMG = {};                 // key -> HTMLImageElement
const imgPromises = {};
const SPR = { sheets: {} };     // hasil bake
const baked = {};               // penanda grup yang sudah di-bake

function loadImage(key) {
    if (imgPromises[key]) return imgPromises[key];
    imgPromises[key] = new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const done = () => { IMG[key] = img; resolve(img); };
            if (img.decode) img.decode().then(done, done); else done();
        };
        img.onerror = () => { console.warn("Gagal memuat", IMAGE_FILES[key]); resolve(null); };
        img.src = "/assets/img/" + IMAGE_FILES[key];
    });
    return imgPromises[key];
}

function bakeRect(img, r, scale) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(r.sw * scale));
    c.height = Math.max(1, Math.round(r.sh * scale));
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, c.width, c.height);
    return c;
}

async function bakeSheet(name) {
    if (SPR.sheets[name] || !IMG[name]) return;
    const d = SHEETS[name], b = SHEET_BAKE[name] || 0.5, out = [];
    for (let r = 0; r < d.rows; r++) {
        out[r] = [];
        for (let c = 0; c < d.cols; c++) {
            out[r][c] = bakeRect(IMG[name],
                { sx: d.ox + c * d.cw, sy: r * d.ch, sw: d.cw, sh: d.ch }, b);
        }
        await nextTick();
    }
    SPR.sheets[name] = out;
}

async function bakeStatics() {
    if (baked.statics) return;
    const P = IMG.plat, C = IMG.cons, PORT = IMG.portal, R = IMG.chest;
    if (P) {
        SPR.plat = PLATFORM_SPRITES.map(r => bakeRect(P, r, 0.6));
        SPR.spike = SPIKE_SPRITES.map(r => bakeRect(P, r, 0.6));
        SPR.block = BLOCK_RECTS.map(r => bakeRect(P, r, 0.6));
        SPR.ladder = LADDER_RECTS.map(r => bakeRect(P, r, 0.6));
        SPR.icicle = ICICLE_RECTS.map(r => bakeRect(P, r, 0.7));
        SPR.gate = GATE_RECTS.map(r => tint(bakeRect(P, r, 0.6), 0.42));
        SPR.ruin = RUIN_RECTS.map(r => tint(bakeRect(P, r, 0.6), 0.42));
        SPR.hang = HANG_RECTS.map(r => tint(bakeRect(P, r, 0.5), 0.5));
    }
    await nextTick();
    if (C) {
        SPR.gtile = GROUND_TILE_X.map(x => bakeRect(C, { sx: x, sy: GROUND_TILE.y, sw: GROUND_TILE.w, sh: GROUND_TILE.h }, 0.8));
        SPR.wall = WALL_TILE_X.map(x => bakeRect(C, { sx: x, sy: WALL_TILE.y, sw: WALL_TILE.w, sh: WALL_TILE.h }, 0.7));
        SPR.ceil = bakeRect(C, CEILING_RECT, 0.5);
        SPR.side = {};
        for (const k in SIDE_WALL_RECTS) SPR.side[k] = bakeRect(C, SIDE_WALL_RECTS[k], 0.7);
    }
    await nextTick();
    if (PORT) {
        SPR.portalOpen = PORTAL_OPEN_FRAMES.map(r => bakeRect(PORT, r, 0.5));
        SPR.portalActive = PORTAL_ACTIVE_FRAMES.map(r => bakeRect(PORT, r, 0.5));
        SPR.portalClose = PORTAL_CLOSE_FRAMES.map(r => bakeRect(PORT, r, 0.5));
    }
    await nextTick();
    if (R) {
        SPR.chest = CHEST_FRAMES.map(r => bakeRect(R, r, 0.58));
        SPR.potion = {};
        for (const k in POTION_RECTS) SPR.potion[k] = bakeRect(R, POTION_RECTS[k], 0.48);
    }
    if (IMG.hp) SPR.heart = bakeRect(IMG.hp, HEART_SRC, 0.35);
    if (IMG.road) SPR.road = bakeRect(IMG.road, { sx: 0, sy: 586, sw: 2752, sh: 425 }, 0.5);
    SPR.chainSeg = makeChainSegment();
    SPR.wtorch = makeTorchSprites(false);
    SPR.storch = makeTorchSprites(true);
    if (IMG.bg) {
        const c = document.createElement("canvas");
        c.width = 1376; c.height = 768;
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(IMG.bg, 0, 0, c.width, c.height);
        SPR.bg = c;
    }
    SPR.glow = makeGlow();
    baked.statics = true;
}

function makeChainSegment() {
    const c = document.createElement("canvas"); c.width = 24; c.height = 96;
    const g = c.getContext("2d");
    g.strokeStyle = "#5b6275"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(12, 96); g.stroke();
    for (let y = 7; y < 96; y += 18) {
        g.strokeStyle = "#9ba4b7"; g.lineWidth = 3;
        g.beginPath(); g.ellipse(12, y, 5, 8, 0, 0, Math.PI * 2); g.stroke();
    }
    return c;
}

function makeTorchSprites(stand) {
    return Array.from({ length: 5 }, (_, i) => {
        const c = document.createElement("canvas"); c.width = 48; c.height = 88;
        const g = c.getContext("2d");
        const x = 24 + Math.sin(i * 1.3) * 2;
        g.fillStyle = "#49301e"; g.fillRect(stand ? 19 : 21, 36, 8, 48);
        g.fillStyle = "#a77b42"; g.fillRect(stand ? 15 : 18, 36, 15, 6);
        g.fillStyle = "#ff6a1a"; g.beginPath(); g.moveTo(x, 6 + (i % 2) * 2); g.quadraticCurveTo(x + 18, 25, x + 4, 39); g.quadraticCurveTo(x - 13, 31, x, 6); g.fill();
        g.fillStyle = "#ffd85a"; g.beginPath(); g.moveTo(x, 15); g.quadraticCurveTo(x + 8, 27, x + 2, 34); g.quadraticCurveTo(x - 7, 28, x, 15); g.fill();
        if (stand) { g.fillStyle = "#5b6578"; g.fillRect(10, 81, 28, 6); }
        return c;
    });
}
function tint(c, a) {                     // menggelapkan sprite agar terasa jauh di latar
    const g = c.getContext("2d");
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = `rgba(6,10,26,${a})`;
    g.fillRect(0, 0, c.width, c.height);
    return c;
}

function makeGlow() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,190,90,0.85)");
    grad.addColorStop(0.35, "rgba(255,130,40,0.35)");
    grad.addColorStop(1, "rgba(255,100,20,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return c;
}

/* ---------- layar loading ---------- */
const TIPS = [
    "Golem menghantam tanah: LOMPAT tepat saat ia menghantam!",
    "Sengatan hantu mengunci posisimu. Bergeraklah sebelum petir menyambar.",
    "Tekan S / panah bawah untuk turun menembus platform.",
    "Peti harta menyimpan ramuan: merah = damage, biru = kecepatan, hijau = max HP.",
    "Duri tidak bisa dibunuh. Lompati dengan tepat.",
    "Kalah berarti mengulang dari STAGE I-1. Manfaatkan setiap ramuan!"
];
let loadStarted = 0;
function showLoading(title) {
    loadStarted = performance.now();
    $("ld-title").textContent = title;
    $("ld-tip").textContent = "TIPS: " + TIPS[Math.floor(Math.random() * TIPS.length)];
    $("ld-fill").style.width = "0%";
    $("loading-screen").classList.add("active");
    $("loading-screen").setAttribute("aria-hidden", "false");
}
function setLoad(frac, text) {
    $("ld-fill").style.width = Math.round(clamp(frac, 0, 1) * 100) + "%";
    if (text) $("ld-step").textContent = text;
}
async function hideLoading() {
    const left = 650 - (performance.now() - loadStarted);   // tampil minimal agar tidak berkedip
    if (left > 0) await new Promise(r => setTimeout(r, left));
    $("loading-screen").classList.remove("active");
    $("loading-screen").setAttribute("aria-hidden", "true");
}

/* menyiapkan semua yang dibutuhkan satu stage */
async function prepareStage(n) {
    const S = getStageConfig(n);
    const need = ["bg", "plat", "cons", "portal", "chest", "road", "hp", "slime", HEROES[run.hero].sheet];
    if (S.hasGolem) need.push("golem");
    if (S.hasGhost) need.push("ghost");
    const warm = ["lose", "victory", "pause", "ui", "mm"];
    const total = need.length + warm.length + need.length + 2;
    let done = 0;
    const tick = text => setLoad(++done / total, text);

    for (const k of need) { await loadImage(k); tick("Memuat aset"); }
    for (const k of warm) { await loadImage(k); tick("Memuat UI"); }
    setLoad(done / total, "Memproses sprite");
    await bakeStatics();
    for (const k of need) {
        if (SHEETS[k]) await bakeSheet(k);
        tick("Memproses sprite");
    }
    setLoad(done / total, "Membangun dunia " + S.id);
    await nextTick();
    return S;
}

/* =========================================================
   LAYOUT SPRITE UI (potongan atlas via CSS background)
========================================================= */
const ATLAS_INFO = {
    pause: { url: "/assets/img/ui/pause_fullscreen.webp", w: 2400, h: 1792 },
    ui:    { url: "/assets/img/ui/UI_button.webp", w: 2752, h: 1536 },
    chest: { url: "/assets/img/objects/chest_potion.webp", w: 1024, h: 576 },
    hp:    { url: "/assets/img/ui/hp_bar.webp", w: 2752, h: 1536 }
};
const rectPath = (path) => path.split(".").reduce((o, k) => o[k], UI_RECTS);

/* menampilkan rect pada elemen: skala dari lebar rect dasar, dipusatkan */
function cropInto(el, atlas, base, r) {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const A = ATLAS_INFO[atlas], k = w / base.w;
    el.style.backgroundImage = `url(${A.url})`;
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundSize = `${A.w * k}px ${A.h * k}px`;
    el.style.backgroundPosition =
        `${w / 2 - (r.x + r.w / 2) * k}px ${h / 2 - (r.y + r.h / 2) * k}px`;
}

function initUiSprites() {
    document.querySelectorAll(".spr").forEach(el => {
        const r = rectPath(el.dataset.rect);
        el.style.aspectRatio = `${r.w} / ${r.h}`;
    });
    document.querySelectorAll(".spr-btn").forEach(el => {
        const g = rectPath(el.dataset.btn);
        el.style.aspectRatio = `${g.n.w} / ${g.n.h}`;
        const set = hov => cropInto(el, el.dataset.atlas, g.n, hov ? g.h : g.n);
        el._set = set;
        el.addEventListener("pointerenter", () => set(true));
        el.addEventListener("pointerleave", () => set(false));
        el.addEventListener("focus", () => set(true));
        el.addEventListener("blur", () => set(false));
    });
}

function layoutSprites() {
    document.querySelectorAll(".spr").forEach(el => {
        const r = rectPath(el.dataset.rect);
        cropInto(el, el.dataset.atlas, r, r);
    });
    document.querySelectorAll(".spr-btn").forEach(el => el._set && el._set(false));
    setPauseSprite("normal");
    setFullscreenSprite();
    for (const id in UI_RECTS.touch) {
        const el = $(id);
        if (el) cropInto(el, "ui", UI_RECTS.touch[id], UI_RECTS.touch[id]);
    }
    layoutBuffs();
    resizeHud();
}

function layoutBuffs() {                      // rangka dari hp_bar.webp + ikon ramuan dari chest_potion.webp
    document.querySelectorAll(".buff").forEach(b => {
        if (!b.clientWidth) return;
        cropInto(b, "hp", { x: BUFF_FRAME.sx, y: BUFF_FRAME.sy, w: BUFF_FRAME.sw, h: BUFF_FRAME.sh },
                          { x: BUFF_FRAME.sx, y: BUFF_FRAME.sy, w: BUFF_FRAME.sw, h: BUFF_FRAME.sh });
        const i = b.querySelector("i"), R = POTION_RECTS[b.dataset.buff];
        cropInto(i, "chest", { x: R.sx, y: R.sy, w: R.sw, h: R.sh }, { x: R.sx, y: R.sy, w: R.sw, h: R.sh });
    });
}

function setPauseSprite(state) {
    const el = $("pause-button");
    if (el) {
        cropInto(el, "pause", UI_RECTS.pause, UI_RECTS.pause);
        el.style.filter = state === "down" ? "brightness(1.35)" : state === "hover" ? "brightness(1.15)" : "none";
    }
}
function setFullscreenSprite() {
    const el = $("btn-fullscreen");
    if (el) cropInto(el, "pause", UI_RECTS.fullscreen, UI_RECTS.fullscreen);
}

let feedbackTimer = 0;
function showControlFeedback(label) {
    const el = $("control-feedback");
    if (!el) return;
    el.textContent = label;
    el.classList.add("show");
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => el.classList.remove("show"), 620);
}

(function bindPauseButton() {
    const el = $("pause-button");
    el.addEventListener("pointerenter", () => setPauseSprite("hover"));
    el.addEventListener("pointerleave", () => setPauseSprite("normal"));
    el.addEventListener("pointerdown", () => setPauseSprite("down"));
    el.addEventListener("pointerup", () => setPauseSprite("hover"));
    el.addEventListener("click", () => { el.blur(); showControlFeedback("PAUSE MENU"); });
})();
$("btn-fullscreen")?.addEventListener("pointerdown", () => { $("btn-fullscreen").classList.add("pressed"); showControlFeedback("FULLSCREEN"); });
$("btn-fullscreen")?.addEventListener("pointerup", () => $("btn-fullscreen").classList.remove("pressed"));
$("btn-fullscreen")?.addEventListener("pointerleave", () => $("btn-fullscreen").classList.remove("pressed"));

/* =========================================================
   UI: layar, pause, pilih karakter
========================================================= */
function updateMobileUI() {
    const el = $("mobile-ui");
    if (!el) return;
    const enabled = $("mobile-controls-toggle")?.checked !== false;
    const show = (gameState === "playing" || gameState === "intro") && isTouchDevice() && enabled;
    el.style.display = show ? "flex" : "none";
    if (show) {                                   // ukuran baru valid setelah tampil
        for (const id in UI_RECTS.touch) {
            const b = $(id);
            if (b) cropInto(b, "ui", UI_RECTS.touch[id], UI_RECTS.touch[id]);
        }
    }
}

function showScreen(id) {
    const layer = $("ui-layer");
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    if (id) {
        $(id)?.classList.add("active");
        if (layer) layer.style.display = "flex";
    } else if (layer) layer.style.display = "none";
    updateMobileUI();
}

function selectSettingsTab(tab, button) {
    document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".settings-tab").forEach(p => p.classList.remove("active"));
    button?.classList.add("active");
    $("tab-" + tab)?.classList.add("active");
}

function toggleFullscreen() {
    const entering = !document.fullscreenElement;
    const action = entering
        ? document.documentElement.requestFullscreen?.()
        : document.exitFullscreen?.();
    if (!action || typeof action.then !== "function") {
        showControlFeedback("FULLSCREEN TIDAK DIDUKUNG");
        return;
    }
    action.then(() => {
        showControlFeedback(document.fullscreenElement ? "FULLSCREEN AKTIF" : "KEMBALI KE WINDOW");
    }).catch(() => showControlFeedback("FULLSCREEN TIDAK DIDUKUNG"));
}

function setPauseScreen(on) {
    const el = $("pause-screen");
    el.classList.toggle("active", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
}

function showEndScreen(id, on) {
    const el = $(id);
    el.classList.toggle("active", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
    if (on) layoutSprites();
}

function clearKeys() {
    Object.keys(keys).forEach(k => keys[k] = false);
    document.querySelectorAll(".touch-btn.pressed").forEach(b => b.classList.remove("pressed"));
}

function togglePause() {
    if (gameState === "playing") {
        showControlFeedback("PAUSE");
        gameState = "paused"; pauseSettingsOpen = false;
        clearKeys(); setPauseScreen(true); updateMobileUI(); dirty = true;
    } else if (gameState === "paused" && !pauseSettingsOpen) resumeGame();
}

function resumeGame() {
    if (gameState !== "paused") return;
    showControlFeedback("RESUME");
    pauseSettingsOpen = false;
    setPauseScreen(false); showScreen(null);
    gameState = "playing";
    lastTime = performance.now(); accumulator = 0;
    updateMobileUI();
}

function openPauseSettings() {
    pauseSettingsOpen = true;
    setPauseScreen(false);
    showScreen("settings");
}

function settingsReturn() {
    if (pauseSettingsOpen && gameState === "paused") {
        pauseSettingsOpen = false;
        showScreen(null);
        setPauseScreen(true);
    } else showScreen("main-menu");
}

function quitToMenu() {
    gameState = "menu"; pauseSettingsOpen = false;
    setPauseScreen(false);
    showEndScreen("clear-screen", false);
    showEndScreen("death-screen", false);
    $("stage-banner").classList.remove("show");
    $("interact-prompt")?.classList.remove("show");
    document.body.classList.remove("game-active");
    clearKeys();
    refreshBest();
    showScreen("main-menu");
}

$("mobile-controls-toggle")?.addEventListener("change", e => {
    document.body.classList.toggle("hide-mobile-ui", !e.target.checked);
    updateMobileUI();
});
document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameState === "playing") togglePause();
});

/* ---------- rekor ---------- */
function getBest() { try { return Number(localStorage.getItem("rs_best") || 0); } catch (e) { return 0; } }
function saveBest(stage) { try { if (stage > getBest()) localStorage.setItem("rs_best", String(stage)); } catch (e) { } }
function refreshBest() {
    const b = getBest();
    $("menu-best").textContent = b ? `REKOR TERJAUH: STAGE I-${b}` : "";
}

/* ---------- pilih karakter & skin ---------- */
function markSelectedCard() {
    document.querySelectorAll(".cs-card").forEach(c =>
        c.classList.toggle("selected", c.dataset.hero === selectedHero));
}

function buildSkinList() {
    const list = $("skin-list");
    const H = HEROES[selectedHero];
    list.innerHTML = "";
    H.skins.forEach(s => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "skin-slot" + (s.id === selectedSkin ? " selected" : "");
        b.textContent = s.name;
        b.onclick = () => { selectedSkin = s.id; try { localStorage.setItem("rs_skin", s.id); } catch (e) { } buildSkinList(); };
        list.appendChild(b);
    });
    for (let i = 0; i < 2; i++) {                        // slot kosong untuk skin masa depan
        const b = document.createElement("button");
        b.type = "button"; b.className = "skin-slot locked"; b.disabled = true;
        b.innerHTML = "&#128274; SEGERA";
        list.appendChild(b);
    }
    if (!H.skins.some(s => s.id === selectedSkin)) selectedSkin = H.skins[0].id;
}

document.querySelectorAll(".cs-card").forEach(card => {
    card.addEventListener("click", () => {
        selectedHero = card.dataset.hero;
        try { localStorage.setItem("rs_hero", selectedHero); } catch (e) { }
        markSelectedCard(); buildSkinList();
    });
});

function openCharSelect() {
    markSelectedCard(); buildSkinList();
    showScreen("char-select");
    Promise.all([loadImage("heroM"), loadImage("heroF")])
        .then(() => bakeSheet("heroM")).then(() => bakeSheet("heroF"));
}

function drawCharPreviews() {
    document.querySelectorAll(".cs-card").forEach(card => {
        const cv = card.querySelector("canvas"), g = cv.getContext("2d");
        const H = HEROES[card.dataset.hero], frames = SPR.sheets[H.sheet];
        g.clearRect(0, 0, cv.width, cv.height);
        if (!frames) { g.fillStyle = "#888"; g.font = "14px Segoe UI"; g.textAlign = "center"; g.fillText("memuat...", cv.width / 2, cv.height / 2); return; }
        const a = H.anims.idle;
        const col = a.frames[Math.floor(performance.now() / a.ms) % a.frames.length];
        const d = SHEETS[H.sheet], b = SHEET_BAKE[H.sheet], sc = H.scale * 1.95, c = frames[a.row][col], k = sc / b;
        g.imageSmoothingQuality = "high";
        const sel = card.dataset.hero === selectedHero;
        g.globalAlpha = sel ? 1 : 0.6;
        const foot = Array.isArray(d.foot) ? d.foot[a.row] : d.foot;
        g.drawImage(c, cv.width / 2 - d.cx[a.row][col] * sc, cv.height - 16 - foot * sc, c.width * k, c.height * k);
        g.globalAlpha = 1;
    });
}

function confirmCharacter() { startRun(selectedHero); }

/* =========================================================
   CANVAS: resolusi & kualitas adaptif
========================================================= */
/* ---------- preset grafik: Rendah / Sedang / Tinggi ---------- */
const QUALITY = {
    low:    { dpr: 1,   res: 0.65, maxPx: 1.0e6, glow: false, particles: 60,  shadows: false, vignette: false, decor: false, smooth: "low",    crisp: true  },
    medium: { dpr: 1.5, res: 1,    maxPx: 2.4e6, glow: true,  particles: 140, shadows: true,  vignette: true,  decor: true,  smooth: "medium", crisp: false },
    high:   { dpr: 2,   res: 1,    maxPx: 4.6e6, glow: true,  particles: 260, shadows: true,  vignette: true,  decor: true,  smooth: "high",   crisp: false }
};
let Q = QUALITY.medium;
let qualityName = "medium";
try { qualityName = localStorage.getItem("rs_quality") || "medium"; } catch (e) { }
if (!QUALITY[qualityName]) qualityName = "medium";
Q = QUALITY[qualityName];

function setQuality(name) {
    qualityName = QUALITY[name] ? name : "medium";
    Q = QUALITY[qualityName];
    try { localStorage.setItem("rs_quality", qualityName); } catch (e) { }
    canvas.style.imageRendering = Q.crisp ? "pixelated" : "auto";
    bgStrip = null;                                  // dibuat ulang sesuai resolusi baru
    resizeCanvas();
}

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, Q.dpr) * Q.res;
    let w = window.innerWidth * dpr, h = window.innerHeight * dpr;
    if (w * h > Q.maxPx) { const k = Math.sqrt(Q.maxPx / (w * h)); w *= k; h *= k; }
    canvas.width = Math.max(320, Math.round(w));
    canvas.height = Math.max(240, Math.round(h));
    view.scale = canvas.height / VIEW_H;
    view.w = canvas.width / view.scale;
    ctx.imageSmoothingEnabled = !Q.crisp;
    ctx.imageSmoothingQuality = Q.smooth;
    makeVignette();
    layoutSprites();
    dirty = true;
}
window.addEventListener("resize", resizeCanvas);
$("quality-select")?.addEventListener("change", e => setQuality(e.target.value));

/* penghitung FPS (opsional) */
let fpsFrames = 0, fpsStamp = 0;
function tickFps(ts) {
    if (!$("fps-toggle")?.checked) { const el = $("fps-counter"); if (el.style.display !== "none") el.style.display = "none"; return; }
    fpsFrames++;
    if (ts - fpsStamp >= 500) {
        const el = $("fps-counter");
        el.style.display = "block";
        el.textContent = Math.round(fpsFrames * 1000 / (ts - fpsStamp)) + " FPS";
        fpsFrames = 0; fpsStamp = ts;
    }
}

let vignetteCv = null;
function makeVignette() {
    vignetteCv = document.createElement("canvas");
    vignetteCv.width = 256; vignetteCv.height = 144;
    const g = vignetteCv.getContext("2d");
    const gr = g.createRadialGradient(128, 72, 50, 128, 72, 140);
    gr.addColorStop(0, "rgba(160,0,0,0)");
    gr.addColorStop(1, "rgba(160,0,0,1)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 144);
}

/* =========================================================
   PLAYER
========================================================= */
const player = {
    x: 120, y: 0, w: 34, h: 88, vx: 0, vy: 0, gravity: CFG.PLAYER_GRAVITY, jumpPower: CFG.JUMP_POWER, speed: 5,
    climbing: false, ladder: null,
    hp: 100, maxHp: 100, damage: 25,
    grounded: false, standing: null, coyote: 0, jumpBuffer: 0, ignore: null, ignoreTimer: 0,
    facing: 1, state: "idle", animT: 0,
    attackT: 0, attackHit: null, invul: 0, stun: 0, knock: 0, dead: false, deathT: 0
};
const heroDef = () => HEROES[run ? run.hero : selectedHero];

function applyBuffs() {
    const H = heroDef();
    player.maxHp = 100;
    player.damage = Math.round(H.damage * (player.atkBuffT > 0 ? 1.5 : 1));
    player.speed = H.speed * (player.spdBuffT > 0 ? 1.35 : 1);
}

function resetPlayer(hp) {
    const H = heroDef();
    player.w = H.w; player.h = H.h;
    Object.assign(player, {
        x: 120, y: GROUND_Y - H.h, vx: 0, vy: 0, hp: clamp(hp, 1, 100),
        grounded: true, standing: platforms[0], coyote: 0, jumpBuffer: 0, ignore: null, ignoreTimer: 0,
        facing: 1, state: "idle", animT: 0, attackT: 0, attackHit: null,
        invul: 0, stun: 0, knock: 0, dead: false, deathT: 0, climbing: false, ladder: null,
        atkBuffT: 0, spdBuffT: 0, alpha: 1
    });
    applyBuffs();
    player.px = player.x; player.py = player.y;
}

/* =========================================================
   FISIKA (grid collision)
========================================================= */
function moveEntity(e, ignore) {
    const prevBottom = e.y + e.h;
    e.vy = Math.min(e.vy + e.gravity, MAX_FALL);
    e.y += e.vy;
    e.grounded = false; e.standing = null;
    if (e.vy < 0) return;
    const bottom = e.y + e.h, B = CFG.BUCKET;
    const grid = level.grid;
    for (let b = Math.floor(e.x / B), b1 = Math.floor((e.x + e.w) / B); b <= b1; b++) {
        const list = grid[b];
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p === ignore) continue;
            if (e.x + e.w > p.x + 6 && e.x < p.x + p.w - 6 && prevBottom <= p.y + 2 && bottom >= p.y) {
                e.y = p.y - e.h; e.vy = 0; e.grounded = true; e.standing = p;
                return;
            }
        }
    }
    if (prevBottom <= GROUND_Y + 2 && bottom >= GROUND_Y && e.x + e.w > 0 && e.x < level.width) {
        e.y = GROUND_Y - e.h; e.vy = 0; e.grounded = true; e.standing = platforms[0];
    }
}

/* =========================================================
   EFEK
========================================================= */
function burst(x, y, n, color, spd) {
    for (let i = 0; i < n && particles.length < Q.particles; i++) {
        const a = rand(0, Math.PI * 2), s = rand(0.6, spd);
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.2, life: rand(260, 520), max: 520, color, size: rand(2, 4.5) });
    }
}
function popup(x, y, text, color) { if (popups.length < 40) popups.push({ x, y, text, color, t: 0 }); }

function updateFx() {
    let n = 0;
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life -= STEP; p.x += p.vx; p.y += p.vy; p.vy += 0.14;
        if (p.life > 0) particles[n++] = p;
    }
    particles.length = n;
    n = 0;
    for (let i = 0; i < popups.length; i++) { const p = popups[i]; p.t += STEP; p.y -= 0.5; if (p.t < 800) popups[n++] = p; }
    popups.length = n;
    n = 0;
    for (let i = 0; i < effects.length; i++) { const f = effects[i]; f.t += STEP; if (f.t < f.life) effects[n++] = f; }
    effects.length = n;
    for (let i = 0; i < pickups.length; i++) pickups[i].t += 0.06;
}

/* =========================================================
   INPUT
========================================================= */
function jump() {
    if (gameState !== "playing" || player.dead) return;
    player.jumpBuffer = 6;
}
/* ---------- tangga ---------- */
function findLadder() {
    const cx = player.x + player.w / 2, feet = player.y + player.h;
    for (let i = 0; i < ladders.length; i++) {
        const l = ladders[i];
        if (Math.abs(cx - l.cx) < 24 && feet >= l.top - 6 && feet <= l.bottom + 8) return l;
    }
    return null;
}
function tryClimb(dir) {                         // dir -1 = naik, +1 = turun
    if (gameState !== "playing" || player.climbing || player.dead || player.stun > 0) return false;
    const l = findLadder();
    if (!l) return false;
    const feet = player.y + player.h;
    if (dir < 0 && feet <= l.top + 6) return false;               // sudah di puncak: biarkan melompat
    if (dir > 0 && !(feet <= l.top + 6 && player.grounded)) return false;
    player.climbing = true; player.ladder = l;
    player.vy = 0; player.grounded = false; player.standing = null; player.attackT = 0;
    if (dir > 0) player.y += 6;
    return true;
}
function pressUp() { if (player.climbing || tryClimb(-1)) return; jump(); }

function updateClimb() {
    const l = player.ladder;
    let dy = 0;
    if (keys["ArrowUp"] || keys["KeyW"]) dy -= 1;
    if (keys["ArrowDown"] || keys["KeyS"]) dy += 1;
    const side = (keys["ArrowLeft"] || keys["KeyA"] ? -1 : 0) + (keys["ArrowRight"] || keys["KeyD"] ? 1 : 0);
    player.vy = 0;
    player.y += dy * 3.4;
    player.x += (l.cx - player.w / 2 - player.x) * 0.35;
    player.state = dy ? "run" : "idle";
    if (player.jumpBuffer > 0) {                              // Space = melompat dari tangga
        player.climbing = false; player.ladder = null;
        player.vy = player.jumpPower * 0.8; player.jumpBuffer = 0;
        if (side) { player.facing = side; player.x += side * 10; }
        sfx("jump");
        return;
    }
    if (side) { player.climbing = false; player.ladder = null; player.facing = side; return; }
    const feet = player.y + player.h;
    if (feet <= l.top + 1) {
        player.y = l.top - player.h; player.climbing = false; player.ladder = null;
        player.grounded = true; player.standing = l.plat;
    } else if (feet >= l.bottom) {
        player.y = l.bottom - player.h; player.climbing = false; player.ladder = null;
        player.grounded = true; player.standing = platforms[0];
    }
}

function attack() {
    if (gameState !== "playing" || player.dead || player.attackT > 0 || player.stun > 0 || player.climbing) return;
    const H = heroDef();
    player.attackT = H.atkMs * H.anims.attack.frames.length;
    player.attackHit = new Set();
    player.animT = 0;
    sfx("slash");
}

window.addEventListener("keydown", e => {
    if (e.code === "Escape" && !e.repeat) {
        if (gameState === "playing") togglePause();
        else if (gameState === "paused") { if (pauseSettingsOpen) settingsReturn(); else resumeGame(); }
        return;
    }
    if (e.code === "KeyP" && !e.repeat && (gameState === "playing" || (gameState === "paused" && !pauseSettingsOpen))) {
        togglePause(); return;
    }
    if (e.code === "KeyF" && !e.repeat) { e.preventDefault(); toggleFullscreen(); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code) && gameState !== "menu") e.preventDefault();

    if (gameState === "gameover" && e.code === "Enter" && !e.repeat) { e.preventDefault(); restartRun(); return; }
    if (gameState === "stageclear" && e.code === "Enter" && !e.repeat) {
        e.preventDefault(); if (run.stage < CFG.MAX_STAGE) nextStage(); return;
    }
    if ($("char-select").classList.contains("active")) {
        if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
            selectedHero = selectedHero === "knight" ? "knightess" : "knight";
            markSelectedCard(); buildSkinList();
        } else if (e.code === "Enter" && !e.repeat) { e.preventDefault(); confirmCharacter(); }
        return;
    }
    if (gameState !== "playing") return;

    const labelMap = {
        ArrowLeft: "KIRI", KeyA: "KIRI", ArrowRight: "KANAN", KeyD: "KANAN",
        ArrowUp: "LOMPAT / NAIK", KeyW: "LOMPAT / NAIK", Space: "LOMPAT",
        ArrowDown: "TURUN", KeyS: "TURUN", KeyZ: "SERANG", KeyJ: "SERANG", KeyX: "SERANG", Enter: "SERANG",
        KeyE: "BUKA PETI", KeyQ: "GUNAKAN POTION"
    };
    if (!e.repeat && labelMap[e.code]) showControlFeedback(labelMap[e.code]);
    const uiMap = { ArrowLeft: "ui-kiri", KeyA: "ui-kiri", ArrowRight: "ui-kanan", KeyD: "ui-kanan", ArrowDown: "ui-turun", KeyS: "ui-turun", ArrowUp: "ui-lompat", KeyW: "ui-lompat", Space: "ui-lompat", KeyZ: "ui-serang", KeyJ: "ui-serang", KeyX: "ui-serang", Enter: "ui-serang" };
    if (uiMap[e.code]) $(uiMap[e.code])?.classList.add("pressed");
    if ((e.code === "Enter" || e.code === "Space") && document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur(); e.preventDefault();
    }
    keys[e.code] = true;
    if (!e.repeat && ["KeyZ", "KeyJ", "KeyX", "Enter"].includes(e.code)) attack();
    if (!e.repeat && ["ArrowUp", "KeyW"].includes(e.code)) pressUp();
    if (!e.repeat && e.code === "Space") jump();
    if (!e.repeat && ["ArrowDown", "KeyS"].includes(e.code)) tryClimb(1);
    if (!e.repeat && e.code === "KeyE") interactNearby();
    if (!e.repeat && e.code === "KeyQ") consumePotion();
});
window.addEventListener("keyup", e => {
    keys[e.code] = false;
    const uiMap = { ArrowLeft: "ui-kiri", KeyA: "ui-kiri", ArrowRight: "ui-kanan", KeyD: "ui-kanan", ArrowDown: "ui-turun", KeyS: "ui-turun", ArrowUp: "ui-lompat", KeyW: "ui-lompat", Space: "ui-lompat", KeyZ: "ui-serang", KeyJ: "ui-serang", KeyX: "ui-serang", Enter: "ui-serang" };
    if (uiMap[e.code]) $(uiMap[e.code])?.classList.remove("pressed");
});
window.addEventListener("blur", clearKeys);

function bindHoldButton(id, code, label) {
    const b = $(id);
    if (!b) return;
    b.addEventListener("pointerdown", e => {
        e.preventDefault(); keys[code] = true; b.classList.add("pressed");
        if (label) showControlFeedback(label);
        b.setPointerCapture?.(e.pointerId);
    });
    const release = () => { keys[code] = false; b.classList.remove("pressed"); };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("lostpointercapture", release);
}
bindHoldButton("ui-kiri", "ArrowLeft", "KIRI");
bindHoldButton("ui-kanan", "ArrowRight", "KANAN");
$("ui-lompat")?.addEventListener("pointerdown", e => { e.preventDefault(); keys["ArrowUp"] = true; $("ui-lompat").classList.add("pressed"); showControlFeedback("LOMPAT"); pressUp(); });
$("ui-lompat")?.addEventListener("pointerup", () => { keys["ArrowUp"] = false; $("ui-lompat").classList.remove("pressed"); });
$("ui-lompat")?.addEventListener("pointercancel", () => { keys["ArrowUp"] = false; $("ui-lompat").classList.remove("pressed"); });
$("ui-turun")?.addEventListener("pointerdown", e => { e.preventDefault(); keys["ArrowDown"] = true; $("ui-turun").classList.add("pressed"); showControlFeedback("TURUN"); tryClimb(1); });
$("ui-turun")?.addEventListener("pointerup", () => { keys["ArrowDown"] = false; $("ui-turun").classList.remove("pressed"); });
$("ui-turun")?.addEventListener("pointercancel", () => { keys["ArrowDown"] = false; $("ui-turun").classList.remove("pressed"); });
$("ui-serang")?.addEventListener("pointerdown", e => { e.preventDefault(); $("ui-serang").classList.add("pressed"); showControlFeedback("SERANG"); attack(); });
$("ui-serang")?.addEventListener("pointerup", () => $("ui-serang").classList.remove("pressed"));
$("ui-serang")?.addEventListener("pointercancel", () => $("ui-serang").classList.remove("pressed"));
$("ui-potion")?.addEventListener("pointerdown", e => { e.preventDefault(); $("ui-potion").classList.add("pressed"); consumePotion(); });
$("ui-potion")?.addEventListener("pointerup", () => $("ui-potion").classList.remove("pressed"));
$("ui-potion")?.addEventListener("pointercancel", () => $("ui-potion").classList.remove("pressed"));

/* =========================================================
   DAMAGE & KEMATIAN
========================================================= */
function damagePlayer(amount, fromX, lift) {
    if (player.invul > 0 || player.dead || gameState !== "playing") return false;
    player.hp -= amount;
    run.stats.taken += amount;
    player.invul = 1000; player.stun = 260; player.attackT = 0;
    player.climbing = false; player.ladder = null;
    player.knock = ((player.x + player.w / 2) < fromX ? -1 : 1) * 6;
    if (lift) { player.vy = -lift; player.grounded = false; }
    sfx("hurt");
    burst(player.x + player.w / 2, player.y + player.h / 2, 10, "#ff4a4a", 3);
    popup(player.x + player.w / 2, player.y - 6, "-" + amount, "#ff6b6b");
    if (player.hp <= 0) { player.hp = 0; player.dead = true; player.deathT = 0; player.animT = 0; }
    return true;
}

function onEnemyKilled(e) {       // dipanggil EnemyAI saat musuh mati
    sfx("kill");
    const col = e.type === "golem" ? "#9fd0ff" : e.type === "ghost" ? "#ff9bd0" : "#58e6ff";
    burst(e.x + e.w / 2, e.y + e.h / 2, e.type === "golem" ? 22 : 14, col, 3.4);
    const chance = e.type === "golem" ? 0.45 : e.type === "ghost" ? 0.3 : 0.15;
    if (Math.random() < chance) pickups.push({ kind: "heart", x: e.x + e.w / 2, y: e.y + e.h / 2 - 20, taken: false, t: 0 });
}

/* =========================================================
   UPDATE
========================================================= */
function updateMovers() {
    const t = frameCount * STEP;
    for (let i = 0; i < movers.length; i++) {
        const p = movers[i];
        const ny = p.baseY + Math.sin(t / p.period * Math.PI * 2 + p.phase) * p.amp;
        p.dy = ny - p.y; p.y = ny;
        if (player.standing === p) player.y += p.dy;
        for (let j = 0; j < enemies.length; j++) if (enemies[j].standing === p) enemies[j].y += p.dy;
    }
}

function updatePlayer() {
    const H = heroDef();
    if (player.invul > 0) player.invul -= STEP;
    if (player.stun > 0) player.stun -= STEP;
    let buffChanged = false;
    if (player.atkBuffT > 0) { player.atkBuffT = Math.max(0, player.atkBuffT - STEP); if (!player.atkBuffT) buffChanged = true; }
    if (player.spdBuffT > 0) { player.spdBuffT = Math.max(0, player.spdBuffT - STEP); if (!player.spdBuffT) buffChanged = true; }
    if (buffChanged) applyBuffs();
    if (player.attackT > 0) player.attackT -= STEP;
    player.animT += STEP;

    if (player.dead) {
        player.deathT += STEP;
        player.x += player.knock; player.knock *= 0.88;
        moveEntity(player);
        if (player.deathT > 1500 && gameState === "playing") onPlayerDeath();
        return;
    }

    if (player.climbing) {
        updateClimb();
        if (player.jumpBuffer > 0) player.jumpBuffer--;
        updatePickups(); updateChests(); updateDoor();
        return;
    }

    let move = 0;
    if (player.stun <= 0) {
        if (keys["ArrowLeft"] || keys["KeyA"]) move -= 1;
        if (keys["ArrowRight"] || keys["KeyD"]) move += 1;
    }
    const speed = player.attackT > 0 ? player.speed * 0.45 : player.speed;
    player.x += move * speed;
    if (move) player.facing = move;
    if (Math.abs(player.knock) > 0.3) { player.x += player.knock; player.knock *= 0.84; } else player.knock = 0;
    player.x = clamp(player.x, 0, level.width - player.w);

    if ((keys["ArrowDown"] || keys["KeyS"]) && player.grounded && player.standing && player.standing.kind !== "ground" && !findLadder()) {
        player.ignore = player.standing; player.ignoreTimer = 16;
    }
    if (player.ignoreTimer > 0 && --player.ignoreTimer <= 0) player.ignore = null;

    if (player.grounded) player.coyote = 6; else if (player.coyote > 0) player.coyote--;
    if (player.jumpBuffer > 0) {
        player.jumpBuffer--;
        if (player.coyote > 0 && player.stun <= 0) {
            player.vy = player.jumpPower; player.grounded = false; player.coyote = 0; player.jumpBuffer = 0;
            sfx("jump");
        }
    }
    if (player.vy < -4 && !(keys["ArrowUp"] || keys["KeyW"] || keys["Space"]) && !isTouchDevice()) player.vy += 0.6;

    moveEntity(player, player.ignore);

    // jendela serangan
    if (player.attackT > 0) {
        const f = Math.floor(player.animT / H.atkMs);
        if (f >= H.hit[0] && f <= H.hit[1]) {
            const box = { x: player.facing > 0 ? player.x + player.w - 6 : player.x - 92, y: player.y - 8, w: 98, h: player.h + 12 };
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.dead || player.attackHit.has(e) || !overlap(box, e)) continue;
                player.attackHit.add(e);
                run.stats.dealt += player.damage;
                popup(e.x + e.w / 2, e.y - 6, "-" + player.damage, "#ffe28a");
                sfx("hit");
                burst(e.x + e.w / 2, e.y + e.h / 2, 6, "#9ff4ff", 2.4);
                EnemyAI.takeHit(e, player.damage, player.facing);
            }
        }
    }

    let st;
    if (player.stun > 0 && player.invul > 600) st = "hurt";
    else if (player.attackT > 0) st = "attack";
    else if (!player.grounded) st = "air";
    else if (move) st = "run";
    else st = "idle";
    if (st !== player.state) { player.state = st; if (st !== "attack") player.animT = 0; }

    // duri
    if (player.invul <= 0) {
        const hb = { x: player.x + 6, y: player.y + 10, w: player.w - 12, h: player.h - 10 };
        for (let i = 0; i < hazards.length; i++) {
            const h = hazards[i];
            if (h.x > player.x + 200 || h.x + h.w < player.x - 200) continue;
            if (overlap(hb, h.hit)) { damagePlayer(Math.round(10 * getDifficulty() * (1 + 0.04 * (run.stage - 1))), h.x + h.w / 2, 11); break; }
        }
    }

    updatePickups();
    updateChests();
    updateDoor();
}

function updatePickups() {
    for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i];
        if (p.taken) continue;
        if (Math.abs(p.x - (player.x + player.w / 2)) < 38 && Math.abs(p.y - (player.y + player.h / 2)) < 58) {
            p.taken = true;
            sfx("pickup");
            if (p.kind === "heart") {
                const heal = Math.min(25, player.maxHp - player.hp);
                player.hp += heal;
                burst(p.x, p.y, 10, "#ff5a6a", 2.6);
                popup(p.x, p.y - 14, heal > 0 ? "+" + heal + " HP" : "HP penuh", "#7dffb0");
            } else {
                run.inventory[p.kind] = (run.inventory[p.kind] || 0) + 1;
                run.potionQueue.push(p.kind);
                updateBuffBar();
                const txt = { atk: "POTION DAMAGE", spd: "POTION SPEED", hp: "POTION HEALING" }[p.kind];
                burst(p.x, p.y, 14, { atk: "#d5d5e2", spd: "#6ab4ff", hp: "#ff737d" }[p.kind], 3);
                popup(p.x, p.y - 20, txt + " · TEKAN Q", "#ffe28a");
            }
        }
    }
}

function updateChests() {
    let nearby = false;
    for (let i = 0; i < chests.length; i++) {
        const c = chests[i];
        if (c.opened) { c.t += STEP; c.frame = c.t > 380 ? 2 : c.t > 140 ? 1 : 0; continue; }
        const closeX = Math.abs(c.x - (player.x + player.w / 2)) < 68;
        const closeY = Math.abs(c.y - (player.y + player.h)) < 42;
        if (closeX && closeY) { nearby = true; c.near = true; }
        else c.near = false;
    }
    const prompt = $("interact-prompt");
    if (prompt) {
        prompt.classList.toggle("show", nearby && gameState === "playing");
        prompt.setAttribute("aria-hidden", nearby && gameState === "playing" ? "false" : "true");
    }
}

function interactNearby() {
    if (gameState !== "playing" || !player || player.dead) return false;
    const c = chests.find(item => !item.opened && item.near);
    if (!c) return false;
    c.opened = true; c.t = 0; c.frame = 0; c.near = false;
    sfx("chest");
    burst(c.x, c.y - 26, 18, "#ffd34e", 3.4);
    const kind = ["atk", "spd", "hp"][randInt(0, 2)];
    pickups.push({ kind, x: c.x, y: c.y - 62, taken: false, t: 0 });
    if (Math.random() < 0.5) pickups.push({ kind: "heart", x: c.x + 36, y: c.y - 44, taken: false, t: 1 });
    showControlFeedback("PETI DIBUKA");
    updateChests();
    return true;
}

function consumePotion() {
    if (!run || gameState !== "playing" || player.dead) return false;
    const kind = run.potionQueue.shift();
    if (!kind) { showControlFeedback("TIDAK ADA POTION"); return false; }
    run.inventory[kind] = Math.max(0, (run.inventory[kind] || 0) - 1);
    run.buffs[kind] = (run.buffs[kind] || 0) + 1;
    if (kind === "hp") {
        const heal = Math.min(40, player.maxHp - player.hp);
        player.hp += heal;
        burst(player.x + player.w / 2, player.y + player.h / 2, 20, "#ff707c", 3.5);
        popup(player.x + player.w / 2, player.y - 18, heal ? `+${heal} HP` : "HP PENUH", "#8dffb0");
    } else if (kind === "atk") {
        player.atkBuffT = 15000;
        applyBuffs();
        burst(player.x + player.w / 2, player.y + 20, 18, "#d6d6e6", 3.4);
        popup(player.x + player.w / 2, player.y - 18, "DAMAGE +50% · 15s", "#ffe28a");
    } else {
        player.spdBuffT = 12000;
        applyBuffs();
        burst(player.x + player.w / 2, player.y + 20, 18, "#67baff", 3.4);
        popup(player.x + player.w / 2, player.y - 18, "SPEED +35% · 12s", "#9bd9ff");
    }
    sfx("pickup");
    updateBuffBar();
    showControlFeedback(kind === "hp" ? "HEALING POTION" : kind === "atk" ? "DAMAGE BOOST" : "SPEED BOOST");
    return true;
}

function updateDoor() {
    const d = level.door;
    const near = Math.abs((player.x + player.w / 2) - (d.x + d.w / 2)) < 520;
    if (near && !d.isOpen) {
        d.openT = Math.min(1200, (d.openT || 0) + STEP);
        d.frame = Math.min(7, Math.floor(d.openT / 150));
        if (d.openT >= 1200) { d.isOpen = true; sfx("door"); }
    }
    if (d.isOpen && player.grounded && !player.dead &&
        Math.abs((player.x + player.w / 2) - (d.x + d.w / 2)) < d.w * 0.34) {
        onStageClear();
    }
}

function updateEnemies() {
    const lo = camera.x - 900, hi = camera.x + view.w + 900;
    let removed = false;
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.x + e.w < lo || e.x > hi) continue;
        EnemyAI.update(e);
        if (e.remove) removed = true;
    }
    if (removed) enemies = enemies.filter(e => !e.remove);
}

function updateCamera(instant) {
    const target = clamp(player.x + player.w / 2 - view.w * 0.40, 0, Math.max(0, level.width - view.w));
    if (instant) { camera.x = target; camera.px = target; } else camera.x += (target - camera.x) * 0.14;
    camera.x = clamp(camera.x, 0, Math.max(0, level.width - view.w));
}

function snapshotForRender() {
    player.px = player.x; player.py = player.y; camera.px = camera.x;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; e.px = e.x; e.py = e.y; }
}

function step() {
    snapshotForRender();
    run.stats.time += STEP;
    updateMovers();
    updatePlayer();
    if (gameState === "playing") updateEnemies();
    updateFx();
    updateCamera(false);
    frameCount++;
}

/* =========================================================
   ALUR RUN / STAGE  (tanpa pilih level; kalah = ulang dari I-1)
========================================================= */
function newRun(heroId) {
    return {
        stage: 1, hero: heroId, skin: selectedSkin, startHp: 100,
        buffs: { atk: 0, spd: 0, hp: 0 },
        inventory: { atk: 0, spd: 0, hp: 0 }, potionQueue: [],
        stats: { dealt: 0, taken: 0, time: 0 }
    };
}

async function startRun(heroId) {
    if (gameState === "loading") return;
    run = newRun(heroId);
    await loadStage(1, 9999);
}

async function loadStage(n, hp) {
    if (gameState === "loading") return;
    gameState = "loading";
    clearKeys();
    showScreen(null); setPauseScreen(false);
    showEndScreen("clear-screen", false); showEndScreen("death-screen", false);
    $("stage-banner").classList.remove("show");
    $("interact-prompt")?.classList.remove("show");
    document.body.classList.remove("game-active");
    updateMobileUI();

    showLoading("STAGE I-" + n);
    const S = await prepareStage(n);
    await nextTick();

    run.stage = n;
    run.stats = { dealt: 0, taken: 0, time: 0 };
    level = WorldGen.generate(n);
    platforms = level.platforms; hazards = level.hazards; pickups = level.pickups;
    chests = level.chests; torches = level.torches; structures = level.structures; movers = level.movers;
    ladders = level.ladders; decor = level.decor;
    addBoundWalls();
    enemies = level.spawns.map(sp => EnemyAI.create(sp, S, getDifficulty()));
    particles.length = 0; popups.length = 0; effects.length = 0;
    setLoad(0.97, "Menyusun bangunan");
    await nextTick();
    composeStructures();
    resetPlayer(hp);
    run.startHp = player.hp;
    mmDirty = true;
    resizeCanvas();
    updateCamera(true);
    setLoad(1, "Siap!");
    await hideLoading();

    document.body.classList.add("game-active");
    layoutSprites(); updateBuffBar();
    $("stage-label").textContent = "STAGE " + S.id;
    $("sb-title").textContent = "STAGE " + S.id;
    $("sb-note").textContent = S.note;
    const b = $("stage-banner");
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    gameState = "intro"; introT = 0;
    updateMobileUI();
    lastTime = performance.now();
}

function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function onStageClear() {
    if (gameState !== "playing") return;
    gameState = "stageexit";
    clearKeys();
    saveBest(run.stage);
    sfx("door");
    stageExitT = 0;
    stageExitStartX = player.x;
    stageExitTargetX = level.door.x + level.door.w / 2 - player.w / 2;
    player.state = "run";
    player.animT = 0;
    $("interact-prompt")?.classList.remove("show");
    updateMobileUI();
}

function updateStageExit(delta) {
    stageExitT += Math.min(delta, 100);
    const p = clamp(stageExitT / 820, 0, 1);
    const ease = p * p * (3 - 2 * p);
    player.x = stageExitStartX + (stageExitTargetX - stageExitStartX) * ease;
    player.facing = 1;
    player.state = stageExitT < 820 ? "run" : "idle";
    player.animT += delta;
    updateFx();
    frameCount++;
    if (stageExitT >= 1480) finishStageClear();
}

function finishStageClear() {
    if (gameState !== "stageexit") return;
    gameState = "stageclear";
    const last = run.stage >= CFG.MAX_STAGE;
    // Judul "STAGE CLEAR" sudah menjadi bagian dari victory.webp; tidak menimpanya dengan label HTML.
    $("cl-v0").textContent = Math.round(run.stats.dealt);
    $("cl-v1").textContent = Math.round(run.stats.taken);
    $("cl-v2").textContent = fmtTime(run.stats.time);
    $("cl-next").style.display = last ? "none" : "";
    updateMobileUI();
    showEndScreen("clear-screen", true);
}

function onPlayerDeath() {
    gameState = "gameover";
    clearKeys();
    saveBest(run.stage);
    // Judul FAILED sudah menjadi bagian dari lose.webp.
    $("dt-v0").textContent = Math.round(run.stats.dealt);
    $("dt-v1").textContent = Math.round(run.stats.taken);
    $("dt-v2").textContent = fmtTime(run.stats.time);
    updateMobileUI();
    setTimeout(() => { if (gameState === "gameover") showEndScreen("death-screen", true); }, 450);
}

function nextStage() {
    if (gameState !== "stageclear" || run.stage >= CFG.MAX_STAGE) return;
    const hp = Math.min(player.maxHp, player.hp + Math.round(player.maxHp * 0.3));   // pulih 30% antar stage
    loadStage(run.stage + 1, hp);
}
function retryStage() { if (gameState === "stageclear") loadStage(run.stage, run.startHp); }
function restartRun() { if (gameState === "gameover") startRun(run.hero); }

function updateBuffBar() {
    if (!run) return;
    document.querySelectorAll(".buff").forEach(b => {
        const n = run.inventory[b.dataset.buff] || 0;
        b.style.display = n > 0 ? "" : "none";
        b.querySelector("b").textContent = "x" + n;
    });
    const total = run.potionQueue.length;
    const count = $("potion-count");
    const button = $("potion-button");
    if (count) count.textContent = total;
    if (button) button.disabled = total === 0;
    layoutBuffs();
}

/* tembok tepi: dinding kiri di titik awal & rangka bangunan di sekitar pintu keluar */
function addBoundWalls() {
    const tw = WALL_TILE.w * WorldGen.WALL_SC, th = WALL_TILE.h * WorldGen.WALL_SC;
    const mk = (x, tiles) => ({ x: Math.round(x), cols: tiles[0].length, rows: tiles.length, tw, th, tiles,
        w: tiles[0].length * tw, h: tiles.length * th });
    structures.push(mk(-24, [[100, 101, 2], [100, 101, -1]]));
    const d = level.door;
    structures.push(mk(d.x + d.w / 2 - 3 * tw, [[1, 5, 6, 7, 3, 103], [-1, 2, 8, 9, 3, -1]]));
}
function wallTile(idx) {
    if (idx >= 100) return SPR.side?.[["leftCap", "leftIvy", "rightIvy", "rightCap"][idx - 100]];
    return SPR.wall?.[idx];
}

/* bangunan besar: tile dinding digabung jadi satu kanvas per bangunan */
function composeStructures() {
    const Z = 1.4;
    for (const st of structures) {
        const c = document.createElement("canvas");
        c.width = Math.ceil(st.w * Z); c.height = Math.ceil(st.h * Z);
        const g = c.getContext("2d");
        g.imageSmoothingQuality = "high";
        for (let r = 0; r < st.rows; r++) {
            for (let col = 0; col < st.cols; col++) {
                const idx = st.tiles[r][col];
                const tcv = idx < 0 ? null : wallTile(idx);
                if (!tcv) continue;
                g.drawImage(tcv, col * st.tw * Z, (st.rows - 1 - r) * st.th * Z, st.tw * Z + 1, st.th * Z + 1);
            }
        }
        g.globalCompositeOperation = "source-atop";
        g.fillStyle = "rgba(6,10,26,0.30)";
        g.fillRect(0, 0, c.width, c.height);
        st.canvas = c;
    }
}

/* =========================================================
   RENDER
========================================================= */
/* background: dua tile (normal + cermin) dirender SEKALI per ukuran layar menjadi satu strip,
   lalu tiap frame hanya disalin 1:1 (jauh lebih ringan daripada scale ulang tiap frame) */
let bgStrip = null, bgStripKey = "", bgStripW = 0;
function ensureBgStrip() {
    if (!SPR.bg) return false;
    const key = canvas.height + "x" + SPR.bg.width;
    if (bgStrip && bgStripKey === key) return true;
    const bgLogicalW = SPR.bg.width * (VIEW_H / SPR.bg.height);
    const tw = Math.ceil(bgLogicalW * view.scale);
    bgStrip = document.createElement("canvas");
    bgStrip.width = tw * 2; bgStrip.height = canvas.height;
    const g = bgStrip.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(SPR.bg, 0, 0, tw, canvas.height);
    g.save(); g.translate(tw * 2, 0); g.scale(-1, 1);          // tile kedua dicermin -> tanpa sambungan
    g.drawImage(SPR.bg, 0, 0, tw, canvas.height);
    g.restore();
    bgStripKey = key; bgStripW = tw * 2;
    return true;
}

function drawBackground() {
    if (!ensureBgStrip()) { ctx.fillStyle = "#0b1020"; ctx.fillRect(0, 0, view.w, VIEW_H); return; }
    const off = Math.floor((camera.rx * 0.45 * view.scale) % bgStripW);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgStrip, -off, 0);
    if (bgStripW - off < canvas.width) ctx.drawImage(bgStrip, bgStripW - off, 0);
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
}

function drawCeiling() {
    if (!level.stage.ceiling || !SPR.ceil) return;
    const sc = 0.42 / 0.5, cw = SPR.ceil.width * sc, ch = SPR.ceil.height * sc;
    const off = camera.rx * 0.8;
    ctx.globalAlpha = 0.92;
    for (let x = -(off % cw) - cw; x < view.w; x += cw - 2) ctx.drawImage(SPR.ceil, x, -34, cw, ch);
    ctx.globalAlpha = 1;
}

function drawStructures(camX) {
    for (const st of structures) {
        const sx = st.x - camX;
        if (sx > view.w || sx + st.w < 0 || !st.canvas) continue;
        ctx.drawImage(st.canvas, sx, GROUND_Y - st.h + 6, st.w, st.h);
    }
}

function drawGlow(x, y, size, alpha) {
    if (!Q.glow) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.drawImage(SPR.glow, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
}

function drawTorches(camX) {
    let any = false;
    for (const t of torches) {                            // pass 1: sprite obor
        const sx = t.x - camX;
        if (sx < -60 || sx > view.w + 60) continue;
        const f = Math.floor(frameCount / 6 + t.phase) % 5;
        const wall = t.kind === "wall";
        const cv = (wall ? SPR.wtorch : SPR.storch)?.[f];
        if (!cv) continue;
        const k = (wall ? 0.22 : 0.24) / 0.6, dw = cv.width * k, dh = cv.height * k;
        ctx.drawImage(cv, sx - dw / 2, t.y - dh, dw, dh);
        t._dh = dh; t._vis = true; any = true;
    }
    if (!any || !Q.glow) { for (const t of torches) t._vis = false; return; }
    ctx.globalCompositeOperation = "lighter";            // pass 2: cahaya (satu kali ganti mode)
    for (const t of torches) {
        if (!t._vis) continue;
        t._vis = false;
        const sx = t.x - camX, wall = t.kind === "wall";
        const flick = (0.75 + Math.sin(frameCount * 0.3 + t.phase * 3) * 0.12) * 0.7;
        ctx.globalAlpha = flick;
        ctx.drawImage(SPR.glow, sx + (wall ? 5 : 0) - 85, t.y - t._dh * (wall ? 0.78 : 0.85) - 85, 170, 170);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
}

function drawGround(camX) {
    // Massa gelap di bawah jalur menjaga area jatuh tetap terbaca.
    const under = ctx.createLinearGradient(0, GROUND_Y - 8, 0, VIEW_H + 40);
    under.addColorStop(0, "#14202a");
    under.addColorStop(0.32, "#0a121b");
    under.addColorStop(1, "#03060b");
    ctx.fillStyle = under;
    ctx.fillRect(0, GROUND_Y - 8, view.w, VIEW_H - GROUND_Y + 48);

    // road.webp adalah satu jalur panjang dengan permukaan rumput/batu dan akar di bawahnya.
    // Ulangi dengan pola cermin agar jalan bawah kontinu tanpa sambungan vertikal yang mencolok.
    if (SPR.road) {
        const tileW = SPR.road.width;
        const tileH = SPR.road.height;
        const roadTop = GROUND_Y - 38; // permukaan horizontal road tepat bertemu garis collision lantai
        const first = Math.floor(camX / tileW) - 1;
        const last = Math.ceil((camX + view.w) / tileW) + 1;
        for (let i = first; i <= last; i++) {
            const sx = i * tileW - camX;
            if (Math.abs(i % 2) === 1) {
                ctx.save();
                ctx.translate(sx + tileW, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(SPR.road, 0, roadTop, tileW, tileH);
                ctx.restore();
            } else {
                ctx.drawImage(SPR.road, sx, roadTop, tileW, tileH);
            }
        }
        // garis bayangan tipis tepat di bawah permukaan agar pijakan karakter jelas.
        ctx.fillStyle = "rgba(2,7,12,.5)";
        ctx.fillRect(0, GROUND_Y + 9, view.w, 5);
        return;
    }

    // Fallback ketika aset jalan gagal dimuat.
    if (SPR.gtile) {
        const GTW = 100, GTH = GROUND_TILE.h * (GTW / GROUND_TILE.w);
        const first = Math.max(0, Math.floor(camX / GTW));
        const last = Math.min(Math.ceil(level.width / GTW) - 1, Math.ceil((camX + view.w) / GTW));
        for (let i = first; i <= last; i++) {
            const n = i === 0 ? 0 : i === Math.ceil(level.width / GTW) - 1 ? 11 : 2 + ((i * 7 + 3) % 8);
            ctx.drawImage(SPR.gtile[n], i * GTW - camX, GROUND_Y - 12, GTW + 1, GTH);
        }
    }
}

function drawPortalAt(x, camX, frame, mode, width = 180, alpha = 1) {
    const frames = mode === "open" ? SPR.portalOpen : mode === "close" ? SPR.portalClose : SPR.portalActive;
    const cv = frames?.[clamp(frame, 0, 7)];
    if (!cv) return;
    const sx = x - camX, h = width * PORTAL_CELL.h / PORTAL_CELL.w;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(cv, sx, GROUND_Y - h + 8, width, h);
    if (mode === "active" && Q.glow) drawGlow(sx + width / 2, GROUND_Y - h * 0.48, width * 1.6, 0.45 + Math.sin(frameCount * 0.12) * 0.16);
    ctx.restore();
}

function drawEntryPortal(camX) {
    if (gameState !== "intro") return;
    const frame = introT < 1180 ? Math.floor(introT / 150) : Math.floor(frameCount / 8) % 8;
    const mode = introT < 1180 ? "open" : "active";
    drawPortalAt(34, camX, frame, mode, 172, 1);
}

function drawDoor(camX) {
    const d = level.door;
    let mode = "open", frame = d.frame || 0;
    if (gameState === "stageexit") {
        if (stageExitT < 650) {
            mode = "active";
            frame = Math.floor(frameCount / 8) % 8;
        } else {
            mode = "close";
            // Baris penutupan pada atlas mulai redup dari frame 4 hingga portal kosong di frame 7.
            frame = clamp(4 + Math.floor((stageExitT - 650) / 180), 4, 7);
        }
    } else if (d.isOpen) {
        mode = "active";
        frame = Math.floor(frameCount / 8) % 8;
    }
    const sx = d.x - camX;
    if (sx > view.w + 180 || sx + d.w < -180) return;
    drawPortalAt(d.x, camX, frame, mode, d.w, 1);
    if (d.isOpen && gameState !== "stageexit") {
        ctx.fillStyle = "#e8fff6"; ctx.font = "bold 14px Segoe UI, Arial"; ctx.textAlign = "center";
        ctx.fillText("MASUK", sx + d.w / 2, GROUND_Y - d.w * PORTAL_CELL.h / PORTAL_CELL.w - 6);
    }
}

function drawPlatforms(camX) {
    for (let i = 1; i < platforms.length; i++) {
        const p = platforms[i];
        const sx = p.x + p.dx - camX;
        if (sx > view.w + 40 || sx + p.dw < -40) continue;
        if (p.kind === "stone" || p.kind === "block") {
            const cv = (p.kind === "block" ? SPR.block : SPR.plat)?.[p.spr];
            if (cv) ctx.drawImage(cv, sx, p.y - p.surfOff, p.dw, p.drawH);
        } else if (p.kind === "chain") {
            const bob = Math.sin(frameCount * 0.04 + p.phase) * 2;
            ctx.save();
            ctx.strokeStyle = "#78849b"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(sx + 18, p.y - 82 + bob); ctx.lineTo(sx + 18, p.y - 4 + bob);
            ctx.moveTo(sx + p.dw - 18, p.y - 82 + bob); ctx.lineTo(sx + p.dw - 18, p.y - 4 + bob); ctx.stroke();
            for (let x = sx + 18; x < sx + p.dw - 18; x += 24) {
                ctx.fillStyle = "#46516a"; ctx.fillRect(x, p.y - 13 + bob, 22, 12);
                ctx.fillStyle = "#9aa6bb"; ctx.fillRect(x + 2, p.y - 14 + bob, 18, 3);
            }
            ctx.restore();
        } else if (p.kind === "magic") {
            const pulse = 0.55 + Math.sin(frameCount * 0.09 + p.phase) * 0.18;
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.shadowColor = "#59c9ff"; ctx.shadowBlur = 18;
            const grad = ctx.createLinearGradient(sx, p.y - 18, sx, p.y + 5);
            grad.addColorStop(0, "rgba(180,250,255,.95)"); grad.addColorStop(.45, "rgba(68,154,255,.9)"); grad.addColorStop(1, "rgba(30,55,160,.75)");
            ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(sx + p.dw / 2, p.y - 5, p.dw / 2, 14, 0, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(205,250,255,.9)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(sx + p.dw / 2, p.y - 8, p.dw / 2 - 3, 7, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();
        }
    }
}

function drawHazards(camX) {
    for (const h of hazards) {
        const sx = h.x - camX;
        if (sx > view.w + 40 || sx + h.w < -40) continue;
        if (h.type === "icicle") {
            const seg = SPR.chainSeg;
            if (seg) for (let y = h.y; y > -46; y -= 44) {            // rantai penggantung
                ctx.drawImage(seg, sx + 8, y - 46, 10, 46);
                ctx.drawImage(seg, sx + h.w - 18, y - 46, 10, 46);
            }
            const cv = SPR.icicle?.[h.variant];
            if (cv) ctx.drawImage(cv, sx, h.y, h.w, h.h);
        } else {
            const cv = SPR.spike?.[h.variant];
            if (cv) ctx.drawImage(cv, sx, h.y, h.w, h.h);
        }
    }
}

function drawLadders(camX) {
    for (const l of ladders) {
        const sx = l.cx - camX;
        if (sx < -60 || sx > view.w + 60) continue;
        const cv = SPR.ladder?.[l.variant];
        if (!cv) continue;
        const R = LADDER_RECTS[l.variant], pw = R.sw / R.sh * l.pieceH;
        for (let i = 0; i < l.n; i++) ctx.drawImage(cv, sx - pw / 2, l.top + i * l.pieceH - 1, pw, l.pieceH + 2);
    }
}

function drawDecor(camX, pass) {                      // pass 0 = atap, pass 1 = dekor tanah
    for (const d of decor) {
        if ((d.kind === "hang") !== (pass === 0)) continue;
        if (d.kind === "hang" && !Q.decor) continue;
        const sx = d.x - camX;
        if (sx > view.w + 80 || sx < -300) continue;
        if (d.kind === "hang") {
            const R = HANG_RECTS[d.variant], cv = SPR.hang?.[d.variant];
            if (cv) ctx.drawImage(cv, sx, -14, R.sw * d.sc, R.sh * d.sc);
        } else {
            const R = (d.kind === "gate" ? GATE_RECTS : RUIN_RECTS)[d.variant], cv = SPR[d.kind]?.[d.variant];
            if (cv) ctx.drawImage(cv, sx, GROUND_Y - R.sh * d.sc + 4, R.sw * d.sc, R.sh * d.sc);
        }
    }
}

function drawChests(camX) {
    for (const c of chests) {
        const sx = c.x - camX;
        if (sx < -60 || sx > view.w + 60) continue;
        const cv = SPR.chest?.[c.frame];
        if (!cv) continue;
        const dw = 72, dh = 72;
        ctx.drawImage(cv, sx - dw / 2, c.y - dh + 2, dw, dh);
        if (!c.opened) drawGlow(sx, c.y - dh * 0.6, 120, 0.35 + Math.sin(frameCount * 0.1) * 0.12);
    }
}

function drawPickups(camX) {
    for (const p of pickups) {
        if (p.taken) continue;
        const sx = p.x - camX;
        if (sx > view.w + 40 || sx < -40) continue;
        const bob = Math.sin(p.t) * 5, y = p.y + bob;
        if (p.kind === "heart") {
            drawGlow(sx, y, 70, 0.55);
            if (SPR.heart) ctx.drawImage(SPR.heart, sx - 15, y - 14.5, 30, 29);
        } else {
            const cv = SPR.potion?.[p.kind];
            drawGlow(sx, y, 80, 0.45);
            if (cv) ctx.drawImage(cv, sx - 17, y - 23, 34, 46);
        }
    }
}

/* posisi hasil interpolasi antar tick fisika (halus di monitor 60/120/144 Hz) */
let renderAlpha = 1;
function lerpPos(e, key, pkey) {
    const p = e[pkey];
    if (p === undefined) return e[key];
    const d = e[key] - p;
    return Math.abs(d) > 120 ? e[key] : p + d * renderAlpha;       // lompatan besar (teleport) tidak di-interpolasi
}

/* menggambar satu frame dari sheet yang di-bake; x,y,w,h = kotak hitbox di dunia */
function drawSheetFrame(sheet, row, col, x, y, w, h, scale, flip) {
    const cv = SPR.sheets[sheet]?.[row]?.[col];
    if (!cv) return;
    const d = SHEETS[sheet], k = scale / (SHEET_BAKE[sheet] || 0.5);
    const dw = cv.width * k, dh = cv.height * k;
    const cx = x - camera.rx + w / 2;
    const dx = cx - d.cx[row][col] * scale;
    const foot = Array.isArray(d.foot) ? d.foot[row] : d.foot;
    const dy = y + h - foot * scale;
    if (flip) { ctx.save(); ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); ctx.drawImage(cv, dx, dy, dw, dh); ctx.restore(); }
    else ctx.drawImage(cv, dx, dy, dw, dh);
}

function drawEnemies() {
    for (const e of enemies) {
        const ex = lerpPos(e, "x", "px"), ey = lerpPos(e, "y", "py");
        const sx = ex - camera.rx;
        if (sx > view.w + 120 || sx + e.w < -120) continue;
        const def = e.def, cx = sx + e.w / 2;

        // zona bahaya / penanda target
        if (e.tele && !e.dead) {
            const pulse = 0.5 + Math.sin(frameCount * 0.4) * 0.3;
            if (e.type === "golem") {
                ctx.fillStyle = `rgba(255,70,60,${0.10 + pulse * 0.10})`;
                ctx.beginPath(); ctx.ellipse(cx, ey + e.h - 2, 215, 15, 0, 0, 7); ctx.fill();
                ctx.fillStyle = `rgba(255,70,60,${0.14 + pulse * 0.12})`;
                ctx.beginPath(); ctx.ellipse(cx, ey + e.h - 2, 150, 11, 0, 0, 7); ctx.fill();
            } else if (e.type === "ghost") {
                const tx = e.tx - camera.rx;
                ctx.strokeStyle = `rgba(130,240,255,${0.5 + pulse * 0.4})`; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.ellipse(tx, e.ty - 2, 46, 12, 0, 0, 7); ctx.stroke();
                ctx.fillStyle = `rgba(130,240,255,${0.10 + pulse * 0.12})`; ctx.fill();
            }
        }
        if (!def.flying && Q.shadows) {
            ctx.fillStyle = "rgba(0,0,0,0.28)";
            ctx.beginPath(); ctx.ellipse(cx, ey + e.h, e.w * 0.5, 5, 0, 0, 7); ctx.fill();
        }

        const a = def.anims[e.anim];
        const row = a.row, col = a.frames[Math.min(e.frame, a.frames.length - 1)];
        const flip = def.flipLeft && e.facing < 0;
        if (e.dead) ctx.globalAlpha = clamp(1 - Math.max(0, e.animT - a.ms * a.frames.length) / 350, 0, 1);
        else if (e.type === "ghost") ctx.globalAlpha = 0.92;
        drawSheetFrame(def.sheet, row, col, ex, ey, e.w, e.h, def.scale, flip);
        if (e.flash > 0) {                           // kilatan putih (murah, tanpa ctx.filter)
            ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55;
            drawSheetFrame(def.sheet, row, col, ex, ey, e.w, e.h, def.scale, flip);
            ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = 1;

        if (!e.dead && e.hp < e.maxHp) {
            const bw = e.type === "golem" ? 64 : 40, bx = cx - bw / 2, by = ey - 14 - (e.type === "ghost" ? 8 : 0);
            ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
            ctx.fillStyle = "#e84a4a"; ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 4);
        }
    }
}

function drawPlayer() {
    if (player.invul > 0 && !player.dead && Math.floor(player.invul / 80) % 2 === 0) return;
    const H = heroDef();
    let px = lerpPos(player, "x", "px"), py = lerpPos(player, "y", "py"), alpha = 1;
    if (gameState === "intro") {
        const emerge = clamp((introT - 450) / 850, 0, 1);
        alpha = emerge;
        px -= (1 - emerge) * 58;
    } else if (gameState === "stageexit") {
        alpha = 1 - clamp((stageExitT - 760) / 360, 0, 1);
    }
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    if (Q.shadows) {
        ctx.fillStyle = "rgba(0,0,0,0.30)";
        ctx.beginPath(); ctx.ellipse(px - camera.rx + player.w / 2, player.standing ? player.standing.y : GROUND_Y, 24, 5, 0, 0, 7); ctx.fill();
    }
    const name = player.dead ? "death" : player.state;
    const a = H.anims[name];
    const idx = Math.floor(player.animT / a.ms);
    const f = a.loop ? idx % a.frames.length : Math.min(idx, a.frames.length - 1);
    drawSheetFrame(H.sheet, a.row, a.frames[f], px, py, player.w, player.h, H.scale, player.facing < 0);
    ctx.restore();
}

function drawEffects(camX) {
    for (const f of effects) {
        const p = f.t / f.life;
        if (f.type === "shock") {
            const sx = f.x - camX, r = f.range * (0.25 + p * 0.75);
            ctx.globalAlpha = 1 - p;
            ctx.strokeStyle = "#8fe8ff"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.ellipse(sx, f.y - 4, r, 8 + 10 * p, 0, 0, 7); ctx.stroke();
            ctx.fillStyle = "rgba(120,220,255,0.18)"; ctx.fill();
            ctx.globalAlpha = 1;
        } else if (f.type === "bolt") {
            const x1 = f.x1 - camX, x2 = f.x2 - camX, seed = f.seed + Math.floor(f.t / 45) * 7.1;
            const pts = [[x1, f.y1]];
            const N = 7;
            for (let i = 1; i < N; i++) {
                const k = i / N, off = Math.sin(seed * 12.9898 + i * 78.233) * 22;
                pts.push([x1 + (x2 - x1) * k + off, f.y1 + (f.y2 - f.y1) * k + Math.cos(seed + i * 3.1) * 10]);
            }
            pts.push([x2, f.y2]);
            ctx.globalAlpha = 1 - p;
            ctx.lineJoin = "round";
            ctx.strokeStyle = "rgba(90,200,255,0.55)"; ctx.lineWidth = 9;
            ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
            ctx.strokeStyle = "#f4ffff"; ctx.lineWidth = 3;
            ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }
}

function drawFx(camX) {
    for (const p of particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - camX, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    if (popups.length) {
        ctx.textAlign = "center"; ctx.font = "bold 16px Segoe UI, Arial"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.8)";
        for (const p of popups) {
            ctx.globalAlpha = clamp(1 - p.t / 800, 0, 1);
            ctx.strokeText(p.text, p.x - camX, p.y);
            ctx.fillStyle = p.color; ctx.fillText(p.text, p.x - camX, p.y);
        }
        ctx.globalAlpha = 1;
    }
}

function drawLowHpVignette() {
    if (!Q.vignette || player.hp / player.maxHp > 0.3 || player.dead || !vignetteCv) return;
    ctx.globalAlpha = 0.20 + Math.sin(frameCount * 0.12) * 0.08;
    ctx.drawImage(vignetteCv, 0, 0, view.w, VIEW_H);
    ctx.globalAlpha = 1;
}

function render() {
    if (!level) return;
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    camera.rx = camera.px === undefined ? camera.x : camera.px + (camera.x - camera.px) * renderAlpha;
    const camX = camera.rx;
    drawBackground();
    drawGround(camX);
    drawCeiling();
    drawDecor(camX, 0);
    drawStructures(camX);
    drawDecor(camX, 1);
    drawTorches(camX);
    drawEntryPortal(camX);
    drawDoor(camX);
    drawLadders(camX);
    drawPlatforms(camX);
    drawHazards(camX);
    drawChests(camX);
    drawPickups(camX);
    drawEnemies();
    drawPlayer();
    drawEffects(camX);
    drawFx(camX);
    drawLowHpVignette();
}

/* =========================================================
   HUD
========================================================= */
const hpCanvas = $("hpCanvas"), hpCtx = hpCanvas.getContext("2d");
let hpShown = 100, hpDrawn = -1;
const HP_FRAME = { sx: 79, sy: 950, sw: 2595, sh: 244 };
const HP_FILL  = { sx: 923, sy: 1284, sw: 923, sh: 126 };
const HP_INNER = { x0: 265, x1: 2500, y0: 64, y1: 172 };
const HEART_SRC = { sx: 170, sy: 120, sw: 150, sh: 140 };
let mmStatic = null, mmDirty = true;

function resizeHud() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round((hpCanvas.clientWidth || 360) * dpr), h = Math.round(w * HP_FRAME.sh / HP_FRAME.sw);
    if (hpCanvas.width !== w || hpCanvas.height !== h) { hpCanvas.width = w; hpCanvas.height = h; hpDrawn = -1; }
    const mm = $("minimapCanvas");
    if (mm.clientWidth) {
        const mw = Math.round(mm.clientWidth * dpr), mh = Math.round(mm.clientHeight * dpr);
        if (mm.width !== mw || mm.height !== mh) { mm.width = mw; mm.height = mh; mmDirty = true; }
    }
}

function drawHpBar() {
    if (!IMG.hp || !run) return;
    hpShown += (player.hp - hpShown) * 0.12;
    if (Math.abs(player.hp - hpShown) < 0.2) hpShown = player.hp;
    const pulse = player.hp > 0 && player.hp / player.maxHp <= 0.25 ? Math.round((Math.sin(frameCount * 0.15) * 0.5 + 0.5) * 10) : 0;
    const key = Math.round(hpShown * 10) + pulse * 10000 + player.maxHp * 1e5 + hpCanvas.width * 1e7;
    if (key === hpDrawn) return;
    hpDrawn = key;
    const W = hpCanvas.width, H = hpCanvas.height, k = W / HP_FRAME.sw, g = hpCtx;
    g.clearRect(0, 0, W, H);
    g.imageSmoothingQuality = "high";
    const iw = (HP_INNER.x1 - HP_INNER.x0) * clamp(hpShown / player.maxHp, 0, 1) * k;
    if (iw > 1) g.drawImage(IMG.hp, HP_FILL.sx, HP_FILL.sy, HP_FILL.sw, HP_FILL.sh, HP_INNER.x0 * k, HP_INNER.y0 * k, iw, (HP_INNER.y1 - HP_INNER.y0) * k);
    g.drawImage(IMG.hp, HP_FRAME.sx, HP_FRAME.sy, HP_FRAME.sw, HP_FRAME.sh, 0, 0, W, H);
    if (player.hp > 0) {
        g.globalAlpha = pulse ? 0.55 + pulse * 0.045 : 1;
        g.drawImage(IMG.hp, HEART_SRC.sx, HEART_SRC.sy, HEART_SRC.sw, HEART_SRC.sh,
            (HEART_SRC.sx - HP_FRAME.sx) * k, (HEART_SRC.sy + 878 - HP_FRAME.sy) * k, HEART_SRC.sw * k, HEART_SRC.sh * k);
        g.globalAlpha = 1;
    }
    g.font = `bold ${Math.round(H * 0.34)}px "Segoe UI", Arial, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    const label = `HP ${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`;
    const tx = ((HP_INNER.x0 + HP_INNER.x1) / 2) * k, ty = ((HP_INNER.y0 + HP_INNER.y1) / 2 + 2) * k;
    g.lineWidth = Math.max(2, H * 0.06); g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(label, tx, ty);
    g.fillStyle = "#fff"; g.fillText(label, tx, ty);
}

/* minimap: lapisan statis dirender sekali, hanya titik dinamis tiap beberapa frame */
function renderMinimapStatic(w, h) {
    mmStatic = document.createElement("canvas");
    mmStatic.width = w; mmStatic.height = h;
    const g = mmStatic.getContext("2d");
    const sx = w / level.width, groundM = h * 0.80, yScale = (h * 0.62) / (TIER[3] + 40);
    const yOf = wy => groundM - (GROUND_Y - wy) * yScale, dot = Math.max(2, h * 0.045);
    g.fillStyle = "#050a14"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#6b5a2a"; g.fillRect(0, groundM, w, Math.max(2, h * 0.04));
    g.fillStyle = "#86b6b8";
    for (let i = 1; i < platforms.length; i++) { const p = platforms[i]; g.fillRect(p.x * sx, yOf(p.baseY || p.y), Math.max(2, p.w * sx), Math.max(2, h * 0.035)); }
    g.fillStyle = "#ff5252";
    for (const hz of hazards) g.fillRect(hz.x * sx, yOf(hz.y + hz.h) - dot, Math.max(1.5, hz.w * sx), dot);
    g.fillStyle = "#58ffb4";
    g.fillRect(level.door.x * sx, groundM - h * 0.3, Math.max(3, level.door.w * sx), h * 0.3);
    mmDirty = false;
}

function drawMinimap() {
    const mm = $("minimapCanvas"), w = mm.width, h = mm.height;
    if (!level || !w || !h) return;
    if (mmDirty || !mmStatic || mmStatic.width !== w) renderMinimapStatic(w, h);
    const g = mm.getContext("2d");
    const sx = w / level.width, groundM = h * 0.80, yScale = (h * 0.62) / (TIER[3] + 40);
    const yOf = wy => groundM - (GROUND_Y - wy) * yScale, dot = Math.max(2, h * 0.045);
    g.drawImage(mmStatic, 0, 0);
    for (const e of enemies) {
        if (e.dead) continue;
        g.fillStyle = e.type === "golem" ? "#ff8a3a" : e.type === "ghost" ? "#ff7ad0" : "#ffb04a";
        g.fillRect(e.x * sx, yOf(e.y + e.h) - dot, e.type === "golem" ? dot * 1.5 : dot, dot);
    }
    g.fillStyle = "#ff7a8a";
    for (const p of pickups) if (!p.taken) g.fillRect(p.x * sx, yOf(p.y), dot, dot);
    g.fillStyle = "#ffd34e";
    for (const c of chests) if (!c.opened) g.fillRect(c.x * sx, yOf(c.y) - dot, dot, dot);
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 1;
    g.strokeRect(camera.x * sx, 1, view.w * sx, h - 2);
    g.fillStyle = "#ffe34d";
    g.beginPath(); g.arc((player.x + player.w / 2) * sx, yOf(player.y + player.h) - dot * 1.5, dot * 1.3, 0, 7); g.fill();
    const progress = clamp(Math.floor(player.x / level.door.x * 100), 0, 100);
    g.font = `bold ${Math.round(h * 0.17)}px "Segoe UI", Arial`;
    g.textAlign = "right"; g.textBaseline = "top"; g.lineWidth = 3; g.strokeStyle = "#000";
    g.strokeText(progress + "%", w - 6, 4); g.fillStyle = "#ffe18a"; g.fillText(progress + "%", w - 6, 4);
}

function updateHud() {
    drawHpBar();
    if (frameCount % 4 === 0 || gameState !== "playing") drawMinimap();
}

/* =========================================================
   LOOP & INIT
========================================================= */
function frame(ts) {
    requestAnimationFrame(frame);
    let delta = Math.min(ts - lastTime || STEP, 100);
    lastTime = ts;
    tickFps(ts);

    if ($("char-select").classList.contains("active")) drawCharPreviews();

    switch (gameState) {
        case "playing": {
            // rapatkan delta ke kelipatan 16.67 ms bila nyaris tepat (menghilangkan jitter rAF di 60 Hz)
            const n = Math.round(delta / STEP);
            if (n >= 1 && Math.abs(delta - n * STEP) < 1.1) delta = n * STEP;
            accumulator += delta;
            let guard = 0;
            while (accumulator >= STEP && guard++ < 5) { step(); accumulator -= STEP; if (gameState !== "playing") break; }
            if (guard >= 5) accumulator = 0;
            renderAlpha = clamp(accumulator / STEP, 0, 1);
            render(); updateHud();
            break;
        }
        case "intro":
            introT += delta;
            renderAlpha = 1;
            updateFx(); frameCount++;
            render(); updateHud();
            if (introT > 2700) { gameState = "playing"; accumulator = 0; updateMobileUI(); }
            break;
        case "stageexit":
            renderAlpha = 1;
            updateStageExit(delta);
            render(); updateHud();
            break;
        case "stageclear":
        case "gameover":
            renderAlpha = 1;
            updateFx(); frameCount++;
            render(); updateHud();
            break;
        case "paused":
            renderAlpha = 1;
            if (dirty) { render(); updateHud(); dirty = false; }
            break;
    }
}

(function init() {
    initUiSprites();
    const qs = $("quality-select"); if (qs) qs.value = qualityName;
    setQuality(qualityName);
    refreshBest();
    showScreen("main-menu");
    // pemuatan latar belakang agar tombol PLAY terasa instan
    setTimeout(() => { loadImage("bg"); loadImage("heroM"); loadImage("heroF"); loadImage("slime"); }, 300);
    requestAnimationFrame(t => { lastTime = t; frame(t); });
})();
