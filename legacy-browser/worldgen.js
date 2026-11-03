/* =========================================================
   WORLD GENERATOR  (versi 2: penempatan tervalidasi)
   WorldGen.generate(stageNumber) -> level

   Aturan agar dunia tidak acak-acakan:
     - platform tidak boleh menimpa platform lain / duri / tangga
     - duri tidak boleh berada di bawah gambar platform (kecuali batu pijakan lorong duri,
       yang dijamin punya jarak aman di atas ujung duri)
     - obor / peti / dekor hanya di tempat kosong (tidak di atas duri, tidak saling tumpuk)
     - peti hanya di "ruang harta" atau puncak platform, bukan acak
   Bergantung pada: config.js, sprites.js
========================================================= */
"use strict";

const WorldGen = (() => {
    const G = CFG.GROUND_Y;
    const TIER = CFG.TIER;
    const SPIKE_SC = 0.42;
    const WALL_SC = 0.46;
    const SPIKE_TOP = 62;                      // tinggi duri (untuk jarak aman platform)

    const rand = (a, b) => Math.random() * (b - a) + a;
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    let L = null, S = null, chestsLeft = 0;

    /* ---------------- util tumpang-tindih ---------------- */
    const hit = (a, b, m = 0) =>
        a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

    function visualRect(p) {                    // area gambar platform di dunia
        if (p.kind === "chain") {
            const F = CHAIN_FRAMES[0];
            return { x: p.x + p.dx, y: p.y - F.surf * p.sc - p.amp, w: p.dw, h: F.sh * p.sc + p.amp * 2 };
        }
        if (p.kind === "magic") {
            return { x: p.x, y: p.y - 83 * p.sc, w: p.dw, h: (151 - 24) * p.sc + 83 * p.sc };
        }
        return { x: p.x, y: p.y - p.surfOff, w: p.dw, h: p.drawH };
    }

    function groundHazardRects() {
        return L.hazards.filter(h => h.type === "spike").map(h => ({ x: h.x, y: h.y, w: h.w, h: h.h }));
    }

    function platformFree(r, opts) {
        for (const q of L.prects) if (hit(r, q, 14)) return false;
        for (const l of L.ladders) if (hit(r, { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }, 4)) return false;
        for (const ic of L.hazards) if (ic.type === "icicle" && hit(r, ic, 10)) return false;
        const bottom = r.y + r.h;
        for (const h of groundHazardRects()) {
            if (r.x < h.x + h.w + 10 && r.x + r.w + 10 > h.x) {
                const limit = opts.overSpikes ? G - SPIKE_TOP : -1e9;   // di luar lorong duri: dilarang total
                if (!opts.overSpikes || bottom > limit) return false;
            }
        }
        return true;
    }

    /* ---------------- platform ---------------- */
    function buildPlatform(x, y, w, opts) {
        let kind = "stone";
        if (opts.forceMagic) kind = "magic";
        else if (opts.block) kind = "block";
        else if (S.movers && !opts.noChain && w < 240 && Math.random() < 0.22) kind = "chain";
        else if (S.magic && w < 260 && Math.random() < 0.20) kind = "magic";

        if (kind === "chain") {
            const f = CHAIN_FRAMES[0], wd = Math.max(150, w) / 0.88, sc = wd / f.sw;
            return { kind, sc, x: Math.round(x), y: Math.round(y), w: Math.round(wd * 0.88), h: 14,
                dx: -wd * 0.06, dw: wd, drawH: f.sh * sc,
                baseY: Math.round(y), amp: 24, period: rand(2800, 4200), phase: rand(0, 6.28), dy: 0 };
        }
        if (kind === "magic") {
            const f = MAGIC_FRAMES[0], sc = Math.max(150, w) / f.sw;
            return { kind, sc, x: Math.round(x), y: Math.round(y), w: Math.round(f.sw * sc), h: 14,
                dx: 0, dw: Math.round(f.sw * sc), phase: rand(0, 5) };
        }
        if (kind === "block") {
            const idx = randInt(2, 5), r = BLOCK_RECTS[idx];                // hanya blok bata (bukan batu bulat)
            const sc = clamp(w / r.sw, 0.4, 0.62);
            return { kind: "block", spr: idx, sc, x: Math.round(x), y: Math.round(y), w: Math.round(r.sw * sc), h: 14,
                dx: 0, dw: Math.round(r.sw * sc), drawH: r.sh * sc, surfOff: 9 * sc };
        }
        const cands = [];
        PLATFORM_SPRITES.forEach((s, i) => {
            if (i === 5 && !opts.allowBig) return;
            if (i === 2 && w < 280) return;
            if (w < s.sw * 0.27 || w > s.sw * 0.46) return;
            const sc = clamp(w / s.sw, 0.26, 0.48);
            if (opts.maxHang && (s.sh - s.surf) * sc > opts.maxHang) return;
            cands.push(i);
        });
        if (!cands.length) {                         // tidak ada sprite yang cukup tipis -> platform sihir (tipis)
            if (opts.maxHang) return buildPlatform(x, y, w, { ...opts, maxHang: 0, forceMagic: true, noChain: true });
            cands.push(0);
        }
        const idx = pick(cands), s = PLATFORM_SPRITES[idx], sc = clamp(w / s.sw, 0.26, 0.48);
        return { kind: "stone", spr: idx, sc, x: Math.round(x), y: Math.round(y), w: Math.round(s.sw * sc), h: 14,
            dx: 0, dw: Math.round(s.sw * sc), drawH: s.sh * sc, surfOff: s.surf * sc };
    }

    // mengembalikan platform atau null bila tidak ada tempat kosong
    function makePlatform(x, y, minW, maxW, opts = {}) {
        const w = rand(minW, maxW);
        for (const shift of [0, 50, -50, 100]) {
            const p = buildPlatform(x + shift, y, w, opts);
            if (p.x < 40) continue;
            const r = visualRect(p);
            if (!platformFree(r, opts)) continue;
            p.vr = r;
            L.platforms.push(p);
            L.prects.push(r);
            if (p.kind === "chain") L.movers.push(p);
            return p;
        }
        return null;
    }

    /* ---------------- duri ---------------- */
    function spikeBlockedByPlatform(x0, x1) {
        for (const q of L.prects) {
            if (q.x < x1 + 10 && q.x + q.w > x0 - 10 && q.y + q.h > G - SPIKE_TOP - 4) return true;
        }
        return false;
    }

    function addSpikePatch(x, count, opts = {}) {
        for (const shift of [0, 70, 140, -70]) {
            const px = x + shift;
            let w = 0;
            const vars = [];
            for (let i = 0; i < count; i++) {
                const v = opts.big ? 3 + (i % 2) : (Math.random() < 0.18 ? 2 : (i + randInt(0, 1)) % 2);
                vars.push(v); w += SPIKE_SPRITES[v].sw * SPIKE_SC * 0.78;
            }
            w += 14;
            if (px < 700) continue;
            if (!opts.overlayPit && spikeBlockedByPlatform(px, px + w)) continue;
            if (L.hazards.some(h => h.type === "spike" && h.x < px + w + 110 && h.x + h.w > px - 110) && !opts.force) continue;
            if (L.torches.some(t => t.x > px - 50 && t.x < px + w + 50) || L.chests.some(c => c.x > px - 60 && c.x < px + w + 60)) continue;
            let hx = px;
            for (const v of vars) {
                const s = SPIKE_SPRITES[v], sw = s.sw * SPIKE_SC, sh = s.sh * SPIKE_SC;
                L.hazards.push({
                    type: "spike", variant: v,
                    x: hx, y: G + 3 - sh, w: sw, h: sh,                  // sedikit terbenam di tanah
                    hit: { x: hx + sw * 0.2, y: G + 3 - sh * 0.82, w: sw * 0.6, h: sh * 0.8 }
                });
                hx += sw * 0.78;
            }
            return { x: px, w };
        }
        return null;
    }

    /* ---------------- jebakan es menggantung ---------------- */
    function addIcicle(cx) {
        const idx = randInt(0, ICICLE_RECTS.length - 1), r = ICICLE_RECTS[idx], sc = 0.55;
        const w = r.sw * sc, h = r.sh * sc, tipY = G - 224, top = tipY - h;
        const box = { x: cx - w / 2, y: 0, w, h: tipY };
        if (L.prects.some(q => hit(box, q, 8))) return null;
        if (L.hazards.some(q => q.type === "icicle" && Math.abs(q.x - box.x) < 260)) return null;
        const ic = {
            type: "icicle", variant: idx, x: box.x, y: top, w, h, chainTop: 0,
            hit: { x: box.x + w * 0.16, y: top + h * 0.38, w: w * 0.68, h: h * 0.62 }
        };
        L.hazards.push(ic);
        return ic;
    }

    /* ---------------- tangga ---------------- */
    function addLadder(p) {
        if (!S.ladders || p.kind === "chain") return null;
        const top = p.y, bottom = G, height = bottom - top;
        if (height < 90) return null;
        const side = Math.random() < 0.5 ? 0 : 1;
        for (const s of [side, 1 - side]) {
            const cx = s === 0 ? p.x + 20 : p.x + p.w - 20;
            const rect = { x: cx - 24, y: top + 10, w: 48, h: height - 10 };
            if (L.prects.some(q => q !== p.vr && hit(rect, q, 6))) continue;
            if (L.hazards.some(h => h.type === "spike" && cx > h.x - 40 && cx < h.x + h.w + 40)) continue;
            if (L.ladders.some(l => Math.abs(l.cx - cx) < 120)) continue;
            if (L.torches.some(t => Math.abs(t.x - cx) < 50)) continue;
            const n = Math.max(1, Math.round(height / 110));
            const lad = { cx, x: cx - 18, w: 36, top, bottom, plat: p, n, pieceH: height / n,
                variant: randInt(0, LADDER_RECTS.length - 1) };
            L.ladders.push(lad);
            return lad;
        }
        return null;
    }

    /* ---------------- musuh ---------------- */
    function groundSegments(x0, x1) {
        const blocked = L.hazards
            .filter(h => h.type === "spike" && h.x + h.w > x0 && h.x < x1)
            .map(h => [h.x - 40, h.x + h.w + 40]).sort((a, b) => a[0] - b[0]);
        const segs = [];
        let cur = x0;
        for (const [a, b] of blocked) { if (a - cur > 150) segs.push([cur, a]); cur = Math.max(cur, b); }
        if (x1 - cur > 150) segs.push([cur, x1]);
        return segs;
    }
    function groundType(segLen) {
        if (S.hasGolem && segLen >= 300 && Math.random() < 0.10 + 0.045 * (S.n - S.golemFrom)) return "golem";
        return "slime";
    }
    const budget = progress => Math.max(1, Math.round((1 + progress * 2.2) * S.density * 0.75));
    const spawnFree = (x, y, type) => !L.spawns.some(s =>
        Math.abs(s.y - y) < 60 && Math.abs(s.x - x) < ((s.type === "golem" || type === "golem") ? 340 : 150));

    function placeGroundEnemies(x0, x1, count) {
        const segs = groundSegments(x0, x1);
        if (!segs.length) return;
        for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
            const seg = pick(segs);
            const type = groundType(seg[1] - seg[0]);
            const ex = rand(seg[0] + 30, Math.max(seg[0] + 31, seg[1] - 90));
            if (!spawnFree(ex, G, type)) continue;
            L.spawns.push({ type, x: ex, y: G, minX: seg[0], maxX: seg[1] });
            i++;
        }
    }
    function placePlatformEnemy(p) {
        if (!p || p.w < 140 || p.kind === "chain") return;
        const type = (S.hasGolem && p.w >= 330 && Math.random() < 0.25) ? "golem" : "slime";
        const ex = rand(p.x + 14, p.x + p.w - 90);
        if (!spawnFree(ex, p.y, type)) return;
        L.spawns.push({ type, x: ex, y: p.y, minX: p.x + 6, maxX: p.x + p.w - 6 });
    }
    function maybePickup(x, y, chance) {
        if (Math.random() < chance) L.pickups.push({ kind: "heart", x, y: y - 46, taken: false, t: rand(0, 6) });
    }

    /* ---------------- pola chunk (mengembalikan x akhir) ---------------- */
    const PATTERNS = {
        arena(x, progress) {
            const len = randInt(580, 840);
            if (Math.random() < 0.7) {
                const p = makePlatform(x + len * 0.35, G - TIER[1], 170, 290);
                if (p) { if (Math.random() < 0.6) placePlatformEnemy(p); maybePickup(p.x + p.w / 2, p.y, 0.3); }
            }
            placeGroundEnemies(x, x + len, Math.min(budget(progress) + randInt(0, 1), 5));
            return x + len;
        },

        spikeRun(x, progress) {
            let cx = x + 80;
            const patches = randInt(1, 3);
            for (let i = 0; i < patches; i++) {
                const big = S.n >= 3 && Math.random() < 0.3;
                const pr = addSpikePatch(cx, big ? 1 : randInt(1, 2), { big });
                if (!pr) { cx += 260; continue; }
                if (S.icicle && Math.random() < 0.5) addIcicle(pr.x + pr.w / 2);
                cx = pr.x + pr.w + randInt(230, 340);
            }
            placeGroundEnemies(x, cx, Math.min(budget(progress), 3));
            return cx;
        },

        stairs(x, progress) {
            // Jalur bertingkat yang naik-turun, bukan tangga satu arah.
            const maxTier = S.ladders ? 3 : 2;
            let cx = x + 34, tier = Math.min(2, maxTier), firstHigh = null;
            const n = randInt(4, 7);
            for (let i = 0; i < n; i++) {
                const useBlock = S.blocks && Math.random() < 0.20;
                const p = useBlock
                    ? makePlatform(cx, G - TIER[tier], 82, 112, { block: true })
                    : makePlatform(cx, G - TIER[tier], 155, 280, { allowBig: i === 0 && Math.random() < 0.2 });
                if (!p) { cx += randInt(70, 110); tier = clamp(tier + pick([-1, 1]), 1, maxTier); continue; }
                if (!firstHigh && tier >= 2) firstHigh = p;
                if (i > 0 && Math.random() < 0.48) placePlatformEnemy(p);
                if (tier >= 2) maybePickup(p.x + p.w / 2, p.y, 0.22);
                if (tier >= 2 && Math.random() < 0.72) addLadder(p);
                const nextTier = clamp(tier + pick([-1, 0, 1, 1]), 1, maxTier);
                cx = p.x + p.w + randInt(28, nextTier > tier ? 78 : 110);
                tier = nextTier;
            }
            if (!firstHigh) {
                const p = makePlatform(cx, G - TIER[2], 170, 220);
                if (p) { firstHigh = p; addLadder(p); }
            }
            if (Math.random() < 0.45) addSpikePatch(x + 180 + randInt(0, 180), randInt(1, 2));
            placeGroundEnemies(x, cx + 120, Math.min(budget(progress), 3));
            return cx + 80;
        },

        zigzag(x, progress) {
            // Jalur zig-zag dengan elevasi berubah acak dan akses tangga di titik tinggi.
            const maxTier = S.ladders ? 3 : 2;
            let cx = x + 24, tier = Math.min(2, maxTier);
            const count = randInt(5, 8);
            let placed = 0;
            for (let i = 0; i < count; i++) {
                const wMin = tier === 3 ? 170 : 145;
                const p = makePlatform(cx, G - TIER[tier], wMin, tier === 3 ? 250 : 270,
                    { allowBig: tier === 1 && Math.random() < 0.18 });
                if (!p) {
                    cx += randInt(75, 125);
                    tier = clamp(tier + pick([-1, 1]), 1, maxTier);
                    continue;
                }
                placed++;
                if (tier >= 2 && Math.random() < 0.85) addLadder(p);
                if (Math.random() < 0.38) placePlatformEnemy(p);
                if (tier >= 2) maybePickup(p.x + p.w * rand(0.35, 0.65), p.y, 0.24);
                // Kadang naik dua tingkat setelah lintasan datar, tetapi tetap dalam jangkauan ladder.
                let deltaTier = pick([-1, 0, 1]);
                if (tier === 1) deltaTier = Math.random() < 0.72 ? 1 : 0;
                if (tier === maxTier) deltaTier = Math.random() < 0.72 ? -1 : 0;
                const nextTier = clamp(tier + deltaTier, 1, maxTier);
                cx = p.x + p.w + randInt(22, 92);
                tier = nextTier;
            }
            if (!placed) {
                const p = makePlatform(cx, G - TIER[1], 190, 240);
                if (p) { cx = p.x + p.w; placePlatformEnemy(p); }
            }
            if (S.ladders) {
                const high = L.platforms.filter(p => p.x >= x && p.x < cx && p.y <= G - TIER[2] + 2 && p.kind !== 'chain');
                if (high.length && !L.ladders.some(l => l.plat === high[0])) addLadder(high[0]);
            }
            placeGroundEnemies(x, cx + 110, Math.min(budget(progress) + 1, 4));
            return cx + 90;
        },

        spikePit(x, progress) {
            const len = randInt(560, 700);
            const count = Math.floor(len / (SPIKE_SPRITES[0].sw * SPIKE_SC * 0.78));
            const pit = addSpikePatch(x + 70, count, { force: true, overlayPit: true });
            if (!pit) return x + 300;
            let cx = x + 20, placed = 0;
            const end = pit.x + pit.w + 60;
            while (cx < end) {
                const p = makePlatform(cx, G - TIER[1] - randInt(0, 6), 150, 200, { overSpikes: true, noChain: true, maxHang: 72 });
                if (!p) { cx += 60; if (cx > end + 100) break; continue; }
                placed++;
                if (Math.random() < 0.3) placePlatformEnemy(p);
                cx = p.x + p.w + randInt(30, 75);
            }
            maybePickup(x + len / 2, G - TIER[1], 0.5);
            return Math.max(cx, pit.x + pit.w + 120);
        },

        bridge(x, progress) {
            const p = makePlatform(x + 60, G - TIER[2], 340, 440, { allowBig: true });
            if (!p) return x + 400;
            placePlatformEnemy(p);
            if (p.w > 360) placePlatformEnemy(p);
            makePlatform(p.x - 150, G - TIER[1], 150, 200);
            const s2 = makePlatform(p.x + p.w + 20, G - TIER[1], 150, 200);
            addLadder(p);
            if (chestsLeft > 0 && Math.random() < 0.5) { L.chests.push({ x: Math.round(p.x + p.w / 2), y: p.y, opened: false, t: 0, frame: 0 }); chestsLeft--; }
            else maybePickup(p.x + p.w / 2, p.y, 0.5);
            placeGroundEnemies(x, p.x + p.w + 260, Math.min(budget(progress), 3));
            return (s2 ? s2.x + s2.w : p.x + p.w) + 60;
        },

        treasure(x) {                                  // ruang harta: tenang, dijaga obor
            const cx = x + 260;
            L.chests.push({ x: cx, y: G, opened: false, t: 0, frame: 0 }); chestsLeft--;
            L.torches.push({ kind: "stand", x: cx - 92, y: G, phase: rand(0, 5) });
            L.torches.push({ kind: "stand", x: cx + 92, y: G, phase: rand(0, 5) });
            L.decor.push({ kind: "gate", variant: randInt(0, 1), x: cx - 60, y: G, sc: 0.52 });
            L.pickups.push({ kind: "heart", x: cx + 140, y: G - 60, taken: false, t: 0 });
            placeGroundEnemies(x - 200, x, 1);
            return x + 520;
        }
    };

    function pickPattern(last) {
        const pool = Object.entries(S.weights).filter(([n, w]) => n !== last && n !== "treasure" && w > 0);
        const total = pool.reduce((s, [, w]) => s + w, 0);
        let r = Math.random() * total;
        for (const [n, w] of pool) { r -= w; if (r <= 0) return n; }
        return pool[0][0];
    }

    /* ---------------- dekorasi (hanya di tempat kosong) ---------------- */
    const groundBusy = (x, pad) =>
        L.hazards.some(h => h.type === "spike" && x > h.x - pad && x < h.x + h.w + pad) ||
        L.chests.some(c => Math.abs(c.x - x) < pad + 20) ||
        L.ladders.some(l => Math.abs(l.cx - x) < pad) ||
        Math.abs(x - (L.door.x + L.door.w / 2)) < 200;

    function overlapsPlatformsCount(x, w) {
        let n = 0;
        for (const q of L.prects) if (q.x < x + w && q.x + q.w > x) n++;
        return n;
    }

    function buildStructures() {
        const tw = WALL_TILE.w * WALL_SC, th = WALL_TILE.h * WALL_SC;
        let x = rand(240, 520);
        while (x < L.width - 700) {
            const cols = randInt(3, 6), rows = randInt(1, 3);
            // pilih posisi dengan platform paling sedikit di depannya
            let best = x, bestN = 1e9;
            for (let k = 0; k < 6; k++) {
                const cand = x + k * 90, n = overlapsPlatformsCount(cand, cols * tw);
                if (n < bestN) { bestN = n; best = cand; }
            }
            x = best;
            const tiles = [];
            let left = 0, right = cols;
            for (let r = 0; r < rows; r++) {
                if (r > 0) { if (Math.random() < 0.6) left++; if (Math.random() < 0.6) right--; }
                if (right - left < 2) left = Math.max(0, right - 2);
                const row = [];
                for (let c = 0; c < cols; c++) {
                    if (c < left || c >= right) { row.push(-1); continue; }
                    if (c === left) row.push(r === rows - 1 && rows > 1 ? 0 : 1);
                    else if (c === right - 1) row.push(r === rows - 1 && rows > 1 ? 11 : 10);
                    else row.push(pick(WALL_MID));
                }
                tiles.push(row);
            }
            const st = { x: Math.round(x), cols, rows, tw, th, tiles, w: cols * tw, h: rows * th };
            L.structures.push(st);
            if (cols >= 3 && Math.random() < 0.8) {          // obor terpasang di dinding bangunan
                const tx = st.x + tw * (1 + Math.floor(Math.random() * (cols - 2))) + tw / 2;
                if (!groundBusy(tx, 20)) L.torches.push({ kind: "wall", x: tx, y: G - 70 - randInt(0, 36), phase: rand(0, 5) });
            }
            x += st.w + rand(380, 900) / S.structures;
        }
    }

    function buildGroundDecor() {
        let x = rand(500, 800);
        let ruinCount = 0;
        while (x < L.clearX - 200) {
            const kind = Math.random() < 0.28 ? "gate" : "ruin";
            const sc = kind === "gate" ? 0.5 : 0.52;
            const w = (kind === "gate" ? GATE_RECTS[0].sw : RUIN_RECTS[0].sw) * sc;
            if (!groundBusy(x + w / 2, w / 2 + 30)) {
                L.decor.push({ kind, variant: randInt(0, (kind === "gate" ? GATE_RECTS : RUIN_RECTS).length - 1), x, y: G, sc });
                ruinCount++;
            }
            x += rand(520, 1000);
        }
    }

    function buildStandTorches() {
        for (let x = rand(500, 800); x < L.width - 450; x += rand(650, 1100)) {
            if (groundBusy(x, 70)) continue;
            if (L.torches.some(t => Math.abs(t.x - x) < 200)) continue;
            L.torches.push({ kind: "stand", x: Math.round(x), y: G, phase: rand(0, 5) });
        }
        const d = L.door;                                     // obor mengapit pintu keluar
        L.torches.push({ kind: "stand", x: d.x - 70, y: G, phase: 1 });
        L.torches.push({ kind: "stand", x: d.x + d.w + 70, y: G, phase: 3 });
    }

    function buildHangDecor() {
        if (S.n < 3) return;
        for (let x = rand(200, 500); x < L.width; x += rand(420, 800)) {
            L.decor.push({ kind: "hang", variant: randInt(0, HANG_RECTS.length - 1), x, sc: rand(0.36, 0.5) });
        }
    }

    /* ---------------- target golem & hantu ---------------- */
    function ensureGolems() {
        if (!S.hasGolem) return;
        const target = S.n - 2;
        let count = L.spawns.filter(s => s.type === "golem").length;
        const cand = L.spawns.filter(s => s.type === "slime" && s.y === G && s.maxX - s.minX >= 300);
        while (count < target && cand.length) {
            const c = pick(cand); cand.splice(cand.indexOf(c), 1);
            if (L.spawns.some(o => o !== c && o.type === "golem" && Math.abs(o.x - c.x) < 340)) continue;
            c.type = "golem"; count++;
        }
        for (let g = 0; count < target && g < 40; g++) {
            const x = rand(1300, L.clearX - 300);
            const segs = groundSegments(x - 160, x + 160);
            if (!segs.length || segs[0][1] - segs[0][0] < 300 || !spawnFree(x, G, "golem")) continue;
            L.spawns.push({ type: "golem", x, y: G, minX: segs[0][0], maxX: segs[0][1] });
            count++;
        }
    }
    function addGhosts() {
        if (!S.hasGhost) return;
        const count = 4 + 2 * (S.n - S.ghostFrom), span = (L.clearX - 1300) / count;
        for (let i = 0; i < count; i++) {
            const x = 1300 + span * i + rand(0, span * 0.8);
            L.spawns.push({ type: "ghost", x, y: G - rand(130, 210), minX: x - 380, maxX: x + 380 });
        }
    }

    function buildGrid() {
        const B = CFG.BUCKET;
        L.grid = [];
        for (const p of L.platforms) {
            if (p.kind === "ground") continue;
            for (let b = Math.floor(p.x / B); b <= Math.floor((p.x + p.w) / B); b++) (L.grid[b] = L.grid[b] || []).push(p);
        }
    }

    /* ---------------- API ---------------- */
    function generate(stageNumber) {
        S = getStageConfig(stageNumber);
        chestsLeft = S.chests;
        L = {
            stage: S, width: S.width,
            platforms: [], prects: [], hazards: [], spawns: [], pickups: [], chests: [],
            torches: [], structures: [], movers: [], ladders: [], decor: [], grid: [],
            door: { x: S.width - 420, w: 180, state: 0, frame: 0, open: false, openT: 0, isOpen: false },
            clearX: S.width - 620
        };
        L.platforms.push({ kind: "ground", x: 0, y: G, w: S.width, h: 200, dx: 0, dw: S.width });

        let x = 760, last = "", routeIndex = 0;
        const endX = S.width - 1250;
        const treasureAt = [];
        for (let k = 1; k <= S.chests; k++) treasureAt.push(760 + (endX - 760) * (k / (S.chests + 1)));
        while (x < endX) {
            let name;
            if (chestsLeft > 0 && treasureAt.length && x > treasureAt[0]) {
                name = "treasure";
                treasureAt.shift();
            } else {
                // Pastikan setiap stage memiliki lintasan vertikal naik-turun.
                // Dua slot khusus ini tidak bergantung pada bobot acak stage.
                if (routeIndex % 4 === 1) name = "stairs";
                else if (routeIndex % 4 === 3) name = "zigzag";
                else name = pickPattern(last);
                routeIndex++;
            }
            x = PATTERNS[name](x, x / S.width) + randInt(170, 300);
            last = name;
        }

        // area gerbang akhir dikosongkan
        const cx = L.clearX;
        const keepP = new Set(L.platforms.filter(p => p.kind === "ground" || p.x + p.w < cx));
        L.platforms = L.platforms.filter(p => keepP.has(p));
        L.movers = L.movers.filter(p => keepP.has(p));
        L.hazards = L.hazards.filter(h => h.x + h.w < cx);
        L.ladders = L.ladders.filter(l => keepP.has(l.plat));
        L.pickups = L.pickups.filter(p => p.x < cx);
        L.chests = L.chests.filter(c => c.x < cx);
        L.torches = L.torches.filter(t => t.x < cx);
        L.spawns = L.spawns.filter(e => e.x + 80 < cx).map(e => ({ ...e, maxX: Math.min(e.maxX, cx) }));
        L.decor = L.decor.filter(d => d.kind === "hang" || d.x < cx);

        ensureGolems();
        addGhosts();
        buildStandTorches();
        buildGroundDecor();
        buildStructures();
        buildHangDecor();

        L.platforms.sort((a, b) => a.x - b.x);
        const gi = L.platforms.findIndex(p => p.kind === "ground");
        if (gi > 0) L.platforms.unshift(L.platforms.splice(gi, 1)[0]);
        buildGrid();
        return L;
    }

    return { generate, WALL_SC, SPIKE_SC };
})();
