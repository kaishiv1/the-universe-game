import { CFG, getStageConfig } from './config.js';
import { CHAIN_FRAMES, MAGIC_FRAMES, BLOCK_RECTS, PLATFORM_SPRITES, SPIKE_SPRITES, ICICLE_RECTS, LADDER_RECTS } from './sprites.js';

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

export const WorldGen = (() => {
    const G = CFG.GROUND_Y;
    const TIER = CFG.TIER;
    const SPIKE_SC = 0.42;
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
        for (const l of L.ladders) {
            const shaft = { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top };
            const landing = { x: l.cx - 42, y: l.top - 112, w: 84, h: 112 };
            if (hit(r, shaft, 4) || hit(r, landing, 4)) return false;
        }
        // Platform yang dibuat setelah ramp tidak boleh menutup ruang kepala,
        // bidang lereng, atau landing ramp yang sudah ditempatkan lebih dulu.
        for (const ramp of L.ramps) {
            const rampRect = { x: ramp.x, y: G - ramp.rise, w: ramp.w, h: ramp.rise };
            const landing = ramp.direction === 'up'
                ? { x: ramp.x + ramp.w - 8, y: G - ramp.rise - 116, w: ramp.landingW + 24, h: 116 }
                : { x: ramp.x - ramp.landingW + 8, y: G - ramp.rise - 116, w: ramp.landingW + 24, h: 116 };
            if (hit(r, rampRect, 10) || hit(r, landing, 8)) return false;
        }
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
        // Platform gameplay memakai batu solid. Platform bergerak berbentuk garis
        // tanpa penyangga visual dihapus agar tidak tampak melayang / tidak realistis.
        const kind = opts.block ? "block" : "stone";

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
        if (!cands.length) {
            // Fallback ke platform batu terkecil; jangan membuat collider garis transparan.
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
            if (L.ladders.some(l => px < l.cx + 52 && px + w > l.cx - 52)) continue;
            if (L.ramps.some(r => px < r.x + r.w + 40 && px + w > r.x - 40)) continue;
            if (L.torches.some(t => t.x > px - 50 && t.x < px + w + 50) || L.chests.some(c => c.x > px - 60 && c.x < px + w + 60)) continue;
            let hx = px;
            for (const v of vars) {
                const s = SPIKE_SPRITES[v], sw = s.sw * SPIKE_SC, sh = s.sh * SPIKE_SC;
                L.hazards.push({
                    type: "spike", variant: v,
                    x: hx, y: G - sh + 1, w: sw, h: sh,                  // ujung dasar bertumpu pada tanah
                    support: 'ground',
                    hit: { x: hx + sw * 0.2, y: G - sh * 0.82, w: sw * 0.6, h: sh * 0.8 }
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
        if (L.ladders.some(l => cx > l.cx - 52 && cx < l.cx + 52)) return null;
        if (L.ramps.some(r => cx > r.x - 40 && cx < r.x + r.w + 40)) return null;
        if (L.hazards.some(q => q.type === "icicle" && Math.abs(q.x - box.x) < 260)) return null;
        const ic = {
            type: "icicle", variant: idx, x: box.x, y: top, w, h, chainTop: 0, anchorY: 24,
            hit: { x: box.x + w * 0.16, y: top + h * 0.38, w: w * 0.68, h: h * 0.62 }
        };
        L.hazards.push(ic);
        return ic;
    }

    /* ---------------- tangga ---------------- */
    function addLadder(p) {
        if (!S.ladders || p.kind === "chain") return null;
        const top = p.y - (p.surfOff || 0), bottom = G, height = bottom - top;
        if (height < 90) return null;
        const side = Math.random() < 0.5 ? 0 : 1;
        for (const s of [side, 1 - side]) {
            const cx = s === 0 ? p.x + 20 : p.x + p.w - 20;
            const rect = { x: cx - 34, y: top + 8, w: 68, h: height - 8 };
            if (L.prects.some(q => q !== p.vr && hit(rect, q, 6))) continue;
            if (L.ramps.some(r => hit(rect, { x: r.x, y: G - r.rise, w: r.w, h: r.rise }, 10))) continue;
            const landingClear = { x: cx - 42, y: top - 112, w: 84, h: 112 };
            if (L.prects.some(q => q !== p.vr && hit(landingClear, q, 4))) continue;
            if (L.hazards.some(h => hit(rect, h, 8) || hit(landingClear, h, 6))) continue;
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
        const blocked = [
            ...L.hazards
                .filter(h => h.type === "spike" && h.x + h.w > x0 && h.x < x1)
                .map(h => [h.x - 48, h.x + h.w + 48]),
            // Spawn ground tidak boleh berada pada/di bawah bidang tanjakan.
            ...L.ramps
                .filter(r => r.x + r.w > x0 && r.x < x1)
                .map(r => [r.x - 100, r.x + r.w + 100])
        ].sort((a, b) => a[0] - b[0]);
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
        const surfaceY = p.y - (p.surfOff || 0);
        if (!spawnFree(ex, surfaceY, type)) return;
        L.spawns.push({ type, x: ex, y: surfaceY, minX: p.x + 6, maxX: p.x + p.w - 6 });
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

        ramp(x, progress) {
            // Jalur lereng diperpanjang dan arah diselang-seling. Lereng menurun
            // dapat dilalui dari sisi tanah (kanan) menuju landing tinggi (kiri).
            const rampX = Math.round(x + 72);
            const rampW = 520;
            const rise = randInt(172, 198);
            const landingW = 224;
            const direction = L.ramps.filter(r => r.direction === 'up').length <=
                L.ramps.filter(r => r.direction === 'down').length ? 'up' : 'down';
            const rampRect = { x: rampX, y: G - rise, w: rampW, h: rise };
            const landingX = direction === 'up' ? rampX + rampW - 8 : rampX - landingW + 8;
            const landingClear = { x: landingX, y: G - rise - 116, w: landingW + 24, h: 116 };
            if (L.prects.some(q => hit(rampRect, q, 12) || hit(landingClear, q, 8)) ||
                L.ladders.some(l => hit(rampRect, { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }, 12)) ||
                L.hazards.some(h => hit(rampRect, h, 12) || hit(landingClear, h, 8)) ||
                L.chests.some(c => c.x > landingClear.x - 30 && c.x < rampX + rampW + 30)) return x + 360;
            const rampData = { x: rampX, y: G - rise, w: rampW, h: rise, rise, landingW, direction };
            L.ramps.push(rampData);
            L.prects.push(rampRect, landingClear);
            placeGroundEnemies(x, rampX - 120, Math.min(budget(progress), 2));
            maybePickup(rampX + rampW * 0.5, G - rise * 0.65, 0.22);
            return rampX + rampW + randInt(190, 260);
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

    function relocateGroundChestsToElevatedSurfaces() {
        const elevated = L.platforms.filter(p => p.kind !== "ground" && p.kind !== "chain" && p.dw >= 150);
        const ramps = [...L.ramps].sort((a, b) => a.x - b.x);
        let elevatedIndex = 0;
        for (const chest of L.chests) {
            // Chest bottom is anchored to a walkable elevated surface; never leave it on the road.
            if (ramps.length) {
                const ramp = ramps[elevatedIndex % ramps.length];
                const progress = [0.38, 0.56, 0.72][elevatedIndex % 3];
                const riseAtPoint = ramp.rise * (ramp.direction === "up" ? progress : 1 - progress);
                chest.x = Math.round(ramp.x + ramp.w * progress);
                chest.y = Math.round(G - riseAtPoint - 2);
                chest.surface = "ramp";
                chest.rampDirection = ramp.direction;
            } else if (elevated.length) {
                const platform = elevated[elevatedIndex % elevated.length];
                chest.x = Math.round(platform.x + platform.w / 2);
                chest.y = Math.round(platform.y - (platform.surfOff || 0) - 2);
                chest.surface = "platform";
            } else {
                // The stage builder guarantees ramps; this fallback keeps a chest off the road
                // if a future custom stage omits them.
                chest.x = Math.round(900 + (elevatedIndex % 3) * 180);
                chest.y = G - 150;
                chest.surface = "fallback-platform";
            }
            elevatedIndex++;
        }
    }

    /* ---------------- dekorasi (hanya di tempat kosong) ---------------- */
    const groundBusy = (x, pad) =>
        L.hazards.some(h => h.type === "spike" && x > h.x - pad && x < h.x + h.w + pad) ||
        L.ramps.some(r => x > r.x - pad && x < r.x + r.w + pad) ||
        L.chests.some(c => Math.abs(c.x - x) < pad + 20) ||
        L.ladders.some(l => Math.abs(l.cx - x) < pad) ||
        Math.abs(x - (L.door.x + L.door.w / 2)) < 200;

    function overlapsPlatformsCount(x, w) {
        let n = 0;
        for (const q of L.prects) if (q.x < x + w && q.x + q.w > x) n++;
        return n;
    }

    // Struktur dinding acak dinonaktifkan. Background dungeon statis sudah berisi
    // seluruh arsitektur belakang; generator hanya membuat jalur gameplay.

    // Tidak ada generasi tembok/ruin acak: background dungeon sudah menjadi backdrop utama.


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
            torches: [], movers: [], ladders: [], ramps: [], grid: [],
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
                // Variasikan rute: tangga, zig-zag, dan tanjakan pada titik yang berbeda.
                if (routeIndex % 6 === 5) name = "ramp";
                else if (routeIndex % 4 === 1) name = "stairs";
                else if (routeIndex % 4 === 3) name = "zigzag";
                else name = pickPattern(last);
                routeIndex++;
            }
            x = PATTERNS[name](x, x / S.width) + randInt(170, 300);
            last = name;
        }

        // Pastikan setiap stage memiliki lereng naik dan turun yang dapat dilalui.
        // Area landing dibuat sebagai bagian dari jalur; tidak ada musuh/tanaman duri
        // yang boleh muncul di bawah atau di dalam bidang lereng.
        const insertGuaranteedRamp = (direction) => {
            const rampW = 520, rise = 182, landingW = 224;
            for (let candidateX = 900; candidateX < L.clearX - rampW - landingW - 260; candidateX += 48) {
                const rampRect = { x: candidateX, y: G - rise, w: rampW, h: rise };
                const landingX = direction === 'up' ? candidateX + rampW - 8 : candidateX - landingW + 8;
                const landingRect = { x: landingX, y: G - rise - 116, w: landingW + 24, h: 116 };
                const blocked = L.prects.some(q => hit(rampRect, q, 10) || hit(landingRect, q, 8)) ||
                    L.hazards.some(h => hit(rampRect, h, 12) || hit(landingRect, h, 8)) ||
                    L.ladders.some(l => hit(rampRect, { x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }, 10)) ||
                    L.chests.some(c => c.x >= landingRect.x - 30 && c.x <= candidateX + rampW + 30);
                if (blocked) continue;
                L.ramps.push({ x: candidateX, y: G - rise, w: rampW, h: rise, rise, landingW, direction });
                L.prects.push(rampRect, landingRect);
                return true;
            }
            return false;
        };
        if (!L.ramps.length) insertGuaranteedRamp('up');
        if (!L.ramps.some(r => r.direction === 'up')) insertGuaranteedRamp('up');
        if (!L.ramps.some(r => r.direction === 'down')) insertGuaranteedRamp('down');
        // Fallback paling akhir untuk stage yang sangat padat: buat dua ramp di
        // ujung area aman dengan menghapus platform/hazard yang memotong koridornya.
        for (const direction of ['up', 'down']) {
            if (L.ramps.some(r => r.direction === direction)) continue;
            const candidateX = direction === 'up' ? 1100 : Math.max(2600, L.clearX - 1600);
            const rampW = 520, rise = 182, landingW = 224;
            const rampRect = { x: candidateX, y: G - rise, w: rampW, h: rise };
            const landingX = direction === 'up' ? candidateX + rampW - 8 : candidateX - landingW + 8;
            const landingRect = { x: landingX, y: G - rise - 116, w: landingW + 24, h: 116 };
            const intersects = rect => hit(rampRect, rect, 8) || hit(landingRect, rect, 8);
            const removedPlatforms = new Set(L.platforms.filter(p => p.kind !== 'ground' && p.vr && intersects(p.vr)));
            L.platforms = L.platforms.filter(p => !removedPlatforms.has(p));
            L.movers = L.movers.filter(p => !removedPlatforms.has(p));
            L.prects = L.prects.filter(q => !intersects(q));
            L.hazards = L.hazards.filter(h => !intersects(h));
            L.ladders = L.ladders.filter(l => !intersects({ x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }));
            L.chests = L.chests.filter(c => c.x < landingRect.x - 40 || c.x > candidateX + rampW + 40);
            L.ramps.push({ x: candidateX, y: G - rise, w: rampW, h: rise, rise, landingW, direction });
            L.prects.push(rampRect, landingRect);
        }

        // area gerbang akhir dikosongkan
        const cx = L.clearX;
        const keepP = new Set(L.platforms.filter(p => p.kind === "ground" || p.x + p.w < cx));
        L.platforms = L.platforms.filter(p => keepP.has(p));
        L.movers = L.movers.filter(p => keepP.has(p));
        L.hazards = L.hazards.filter(h => h.x + h.w < cx);
        L.ladders = L.ladders.filter(l => keepP.has(l.plat));
        const ladderCorridor = l => ({ x: l.x - 4, y: l.top - 112, w: l.w + 8, h: l.bottom - l.top + 116 });
        L.hazards = L.hazards.filter(h => !L.ladders.some(l => hit(ladderCorridor(l), h, 6)));
        L.pickups = L.pickups.filter(p => p.x < cx);
        L.chests = L.chests.filter(c => c.x < cx);
        L.torches = L.torches.filter(t => t.x < cx);
        L.ramps = L.ramps.filter(r => r.x + r.w < cx - 100);

        // Pastikan dua arah ramp tetap tersedia setelah cleanup pintu keluar.
        // Pilih koridor aman mendekati bagian akhir stage dan kosongkan hanya
        // objek yang benar-benar memotong ramp/landing, bukan seluruh segmen.
        const ensureFinalRamp = direction => {
            if (L.ramps.some(r => r.direction === direction)) return true;
            const rampW = 520, rise = 182, landingW = 224;
            const desired = direction === 'up' ? cx - 3100 : cx - 1400;
            const candidates = [];
            for (let offset = 0; offset <= 1400; offset += 64) {
                candidates.push(desired - offset, desired + offset);
            }
            for (const rawX of candidates) {
                const candidateX = Math.round(clamp(rawX, 900, cx - rampW - landingW - 240));
                if (candidateX < 900 || candidateX + rampW >= cx - 100) continue;
                const rampRect = { x: candidateX, y: G - rise, w: rampW, h: rise };
                const landingX = direction === 'up' ? candidateX + rampW - 8 : candidateX - landingW + 8;
                const landingRect = { x: landingX, y: G - rise - 116, w: landingW + 24, h: 116 };
                const corridorHit = rect => hit(rampRect, rect, 8) || hit(landingRect, rect, 8);
                if (L.ramps.some(r => {
                    const existingRamp = { x: r.x, y: G - r.rise, w: r.w, h: r.rise };
                    const existingLandingX = r.direction === 'up' ? r.x + r.w - 8 : r.x - r.landingW + 8;
                    const existingLanding = { x: existingLandingX, y: G - r.rise - 116, w: r.landingW + 24, h: 116 };
                    return corridorHit(existingRamp) || corridorHit(existingLanding);
                })) continue;

                const removed = new Set(L.platforms.filter(p => p.kind !== 'ground' && p.vr && corridorHit(p.vr)));
                L.platforms = L.platforms.filter(p => !removed.has(p));
                L.movers = L.movers.filter(p => !removed.has(p));
                L.prects = L.prects.filter(rect => !corridorHit(rect));
                L.hazards = L.hazards.filter(h => !corridorHit(h));
                L.ladders = L.ladders.filter(l => !corridorHit({ x: l.x, y: l.top, w: l.w, h: l.bottom - l.top }));
                L.chests = L.chests.filter(c => c.x < landingRect.x - 36 || c.x > landingRect.x + landingRect.w + 36);
                L.pickups = L.pickups.filter(p => p.x < candidateX - 20 || p.x > candidateX + rampW + 20);
                L.torches = L.torches.filter(t => t.x < candidateX - 50 || t.x > candidateX + rampW + 50);
                L.ramps.push({ x: candidateX, y: G - rise, w: rampW, h: rise, rise, landingW, direction });
                L.prects.push(rampRect, landingRect);
                return true;
            }
            return false;
        };
        ensureFinalRamp('up');
        ensureFinalRamp('down');

        L.spawns = L.spawns
            .filter(e => e.x + 80 < cx)
            .filter(e => e.type === 'ghost' || e.y < G - 35 || !L.ramps.some(r =>
                e.x >= r.x - 120 && e.x <= r.x + r.w + 120))
            .map(e => ({ ...e, maxX: Math.min(e.maxX, cx) }));

        ensureGolems();
        addGhosts();
        // Semua tipe musuh (termasuk ghost) dilarang spawn di bawah bidang slope.
        // Ghost boleh terbang di atas lereng, tetapi tidak muncul terjebak di rongga bawahnya.
        L.spawns = L.spawns.filter(spawn => !L.ramps.some(ramp => {
            const inRampLane = spawn.x >= ramp.x - 230 && spawn.x <= ramp.x + ramp.w + 230;
            const belowRampLip = spawn.y >= G - ramp.rise - 112;
            return inRampLane && belowRampLip;
        }));
        relocateGroundChestsToElevatedSurfaces();
        buildStandTorches();

        L.platforms.sort((a, b) => a.x - b.x);
        const gi = L.platforms.findIndex(p => p.kind === "ground");
        if (gi > 0) L.platforms.unshift(L.platforms.splice(gi, 1)[0]);
        buildGrid();
        return L;
    }

    return { generate, SPIKE_SC };
})();
