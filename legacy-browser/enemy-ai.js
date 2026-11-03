/* =========================================================
   ENEMY AI
   Setiap tipe musuh punya perilaku & serangan sendiri:
     - SLIME : patroli -> mengejar (melompat) -> menerjang jarak dekat
     - GOLEM : lambat -> telegraf -> HANTAM TANAH (gelombang kejut area,
               hanya mengenai pemain yang masih menapak tanah => LOMPAT!)
     - HANTU : melayang menjaga jarak -> mengunci target -> sengatan listrik
               jarak jauh (bisa dihindari dengan bergerak)

   Bergantung pada fungsi/variabel global dari main.js:
   player, damagePlayer(), moveEntity(), burst(), popup(), sfx(), effects[]
========================================================= */
"use strict";

const EnemyAI = (() => {
    const STEP = CFG.STEP;
    const rand = (a, b) => Math.random() * (b - a) + a;
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    /* ---------------- definisi tipe ---------------- */
    const TYPES = {
        slime: {
            sheet: "slime", scale: 0.27, w: 44, h: 42, flipLeft: true,
            hp: 50, dmg: 8, speed: [0.9, 1.4], flying: false, armor: false,
            anims: {
                idle:   { row: 0, frames: [0,1,2,3,4,5,6,7], ms: 110, loop: true },
                move:   { row: 1, frames: [0,1,2,3,4,5,6,7], ms: 90,  loop: true },
                attack: { row: 2, frames: [0,1,2,3,4,5],     ms: 95,  loop: false },
                hurt:   { row: 3, frames: [1,2],             ms: 120, loop: false },
                death:  { row: 3, frames: [3,4,5,6,7],       ms: 100, loop: false }
            }
        },
        golem: {
            sheet: "golem", scale: 0.40, w: 76, h: 118, flipLeft: true,
            hp: 170, dmg: 20, speed: [0.6, 0.85], flying: false, armor: true,
            anims: {
                idle:   { row: 0, frames: [0,1,2,3,4,5,6,7], ms: 140, loop: true },
                move:   { row: 1, frames: [0,1,2,3,4,5,6,7], ms: 115, loop: true },
                attack: { row: 2, frames: [0,1,2,3,4,5,6,7], ms: 130, loop: false },
                hurt:   { row: 3, frames: [0,1],             ms: 130, loop: false },
                death:  { row: 3, frames: [2,3,4,5,6,7],     ms: 140, loop: false }
            }
        },
        ghost: {
            sheet: "ghost", scale: 0.22, w: 40, h: 66, flipLeft: false,
            hp: 55, dmg: 14, speed: [1.8, 2.3], flying: true, armor: false,
            anims: {
                idle:    { row: 0, frames: [0,1,2,3,4,5,6,7], ms: 120, loop: true },
                move:    { row: 1, frames: [0,1,2,3,4,5,6,7], ms: 100, loop: true },
                charge:  { row: 2, frames: [0,1],             ms: 140, loop: true },
                zap:     { row: 2, frames: [2,3,4,5],         ms: 90,  loop: false },
                recover: { row: 2, frames: [6,7],             ms: 100, loop: false },
                hurt:    { row: 3, frames: [0,1],             ms: 120, loop: false },
                death:   { row: 3, frames: [2,3,4,5,6],       ms: 130, loop: false }
            }
        }
    };

    /* ---------------- pembuatan ---------------- */
    function create(spawn, stageCfg, difficulty) {
        const def = TYPES[spawn.type];
        const hard = difficulty >= 1.75;
        const hpMul = stageCfg.hpMul * difficulty * (hard ? 1.12 : 1);
        const dmgMul = stageCfg.dmgMul * difficulty * (hard ? 1.16 : 1);
        return {
            type: spawn.type, def,
            x: spawn.x, y: spawn.y - (def.flying ? def.h / 2 : def.h), w: def.w, h: def.h,
            vx: 0, vy: 0, gravity: 0.7, grounded: false, standing: null,
            hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul),
            damage: Math.max(1, Math.round(def.dmg * dmgMul)),
            speed: rand(def.speed[0], def.speed[1]) * (0.85 + 0.15 * difficulty) * (hard ? 1.38 : 1),
            hard, aggroRange: hard ? 1.55 : 1,
            minX: spawn.minX, maxX: spawn.maxX, homeY: spawn.y,
            dir: Math.random() < 0.5 ? -1 : 1, facing: -1,
            state: "idle", stateT: rand(300, 1200),
            anim: "idle", animT: rand(0, 600), frame: 0,
            attackCd: hard ? rand(180, 520) : rand(600, 1400), attackDone: false, attackDone2: false,
            tx: 0, ty: 0, bob: rand(0, 6.28),
            knock: 0, flash: 0, dead: false, remove: false, tele: 0
        };
    }

    function setAnim(e, name) {
        if (e.anim !== name) { e.anim = name; e.animT = 0; e.frame = 0; }
    }

    function stepAnim(e) {
        e.animT += STEP;
        const a = e.def.anims[e.anim];
        const idx = Math.floor(e.animT / a.ms);
        e.frame = a.loop ? idx % a.frames.length : Math.min(idx, a.frames.length - 1);
    }
    const animDone = e => e.animT >= e.def.anims[e.anim].ms * e.def.anims[e.anim].frames.length;

    /* ---------------- menerima serangan ---------------- */
    // mengembalikan true bila musuh mati
    function takeHit(e, dmg, dir) {
        if (e.dead) return false;
        e.hp -= dmg;
        e.flash = 140;
        if (e.hp <= 0) { kill(e); return true; }
        const busy = e.state === "attack" || e.state === "charge" || e.state === "zap";
        if (e.def.armor && busy) return false;                 // golem tidak goyah saat menyerang
        e.knock = dir * (e.def.armor ? 1.2 : e.def.flying ? 3.5 : 4.5);
        e.state = "hurt";
        e.stateT = e.def.armor ? 220 : 280;
        e.tele = 0;
        setAnim(e, "hurt");
        e.animT = 0;
        return false;
    }

    function kill(e) {
        e.dead = true;
        e.state = "dead";
        e.tele = 0;
        setAnim(e, "death");
        e.animT = 0;
        if (typeof onEnemyKilled === "function") onEnemyKilled(e);
    }

    /* ---------------- util ---------------- */
    function playerCenterX() { return player.x + player.w / 2; }
    function patrolBounds(e) {
        if (e.x < e.minX) { e.x = e.minX; e.dir = 1; }
        if (e.x + e.w > e.maxX) { e.x = e.maxX - e.w; e.dir = -1; }
    }

    /* =========================================================
       SLIME
    ========================================================= */
    function updateSlime(e) {
        const pcx = playerCenterX(), ecx = e.x + e.w / 2;
        const dx = pcx - ecx;
        const dy = (player.y + player.h) - (e.y + e.h);
        const near = Math.abs(dx) < 340 * e.aggroRange && Math.abs(dy) < 120 && !player.dead;
        let vx = 0;

        if (e.attackCd > 0) e.attackCd -= STEP;

        if (e.state === "hurt") {
            e.stateT -= STEP;
            vx = e.knock; e.knock *= 0.9;
            if (e.stateT <= 0) e.state = "idle";
        } else if (e.state === "attack") {
            setAnim(e, "attack");
            // terjang: frame 3+ meluncur ke depan, serangan mengenai di frame 4
            if (!e.attackDone && e.frame >= 4) {
                e.attackDone = true;
                const box = { x: e.facing > 0 ? e.x + e.w - 4 : e.x - 34, y: e.y - 6, w: 38, h: e.h + 6 };
                if (overlap(box, player) || overlap(e, player)) damagePlayer(e.damage, ecx, 6);
            }
            vx = e.facing * 1.8 * (e.frame >= 3 ? 1 : 0);
            if (animDone(e)) { e.state = "idle"; e.stateT = rand(120, 320); e.attackCd = e.hard ? rand(420, 760) : rand(900, 1500); }
        } else if (near) {
            e.facing = dx < 0 ? -1 : 1;
            if (Math.abs(dx) < (e.hard ? 78 : 62) && Math.abs(dy) < 55 && e.attackCd <= 0) {
                e.state = "attack"; e.attackDone = false; e.animT = 0;
            } else if (Math.abs(dx) > 40) {
                vx = e.facing * e.speed * (e.hard ? 1.65 : 1.25);
                setAnim(e, "move");
            } else setAnim(e, "idle");
        } else {
            e.stateT -= STEP;
            if (e.state !== "walk") {
                setAnim(e, "idle");
                if (e.stateT <= 0) { e.state = "walk"; e.stateT = rand(1200, 2800); e.dir = pick([-1, 1]); }
            } else {
                vx = e.dir * e.speed * 0.6;
                e.facing = e.dir;
                setAnim(e, "move");
                if (e.stateT <= 0) { e.state = "idle"; e.stateT = rand(500, 1400); }
            }
        }
        e.x += vx;
        patrolBounds(e);
        moveEntity(e);
    }

    /* =========================================================
       GOLEM  -  hantam tanah
    ========================================================= */
    const GOLEM_RANGE_1 = 150, GOLEM_RANGE_2 = 215;

    function golemShock(e, range, hitFlag) {
        const cx = e.x + e.w / 2;
        effects.push({ type: "shock", x: cx, y: e.y + e.h, range, t: 0, life: 420 });
        // hanya mengenai pemain yang masih menapak permukaan yang sama
        const sameLevel = Math.abs((player.y + player.h) - (e.y + e.h)) < 26;
        const inRange = Math.abs(playerCenterX() - cx) < range;
        if (sameLevel && inRange && !player.dead) {
            damagePlayer(e.damage, cx, 8);
            return true;
        }
        return hitFlag;
    }

    function updateGolem(e) {
        const pcx = playerCenterX(), ecx = e.x + e.w / 2;
        const dx = pcx - ecx;
        const dy = (player.y + player.h) - (e.y + e.h);
        const near = Math.abs(dx) < 560 * e.aggroRange && Math.abs(dy) < 165 && !player.dead;
        let vx = 0;

        if (e.attackCd > 0) e.attackCd -= STEP;

        if (e.state === "hurt") {
            e.stateT -= STEP;
            vx = e.knock; e.knock *= 0.88;
            if (e.stateT <= 0) e.state = "idle";
        } else if (e.state === "attack") {
            setAnim(e, "attack");
            e.tele = e.frame < 4 ? 1 : 0;                      // zona bahaya tampil saat aba-aba
            if (!e.attackDone && e.frame >= 4) {
                e.attackDone = true;
                e.hit1 = golemShock(e, GOLEM_RANGE_1, false);
                sfx("slam");
                burst(ecx, e.y + e.h, 14, "#7fe3ff", 4);
            }
            if (!e.attackDone2 && e.frame >= 5) {
                e.attackDone2 = true;
                if (!e.hit1) golemShock(e, GOLEM_RANGE_2, false);
                else effects.push({ type: "shock", x: ecx, y: e.y + e.h, range: GOLEM_RANGE_2, t: 0, life: 420 });
            }
            if (animDone(e)) {
                e.state = "idle"; e.stateT = rand(300, 700);
                e.attackCd = e.hard ? rand(850, 1350) : rand(1700, 2600); e.tele = 0;
            }
        } else if (near) {
            e.facing = dx < 0 ? -1 : 1;
            if (Math.abs(dx) < (e.hard ? 190 : 140) && Math.abs(dy) < 70 && e.attackCd <= 0) {
                e.state = "attack"; e.attackDone = false; e.attackDone2 = false; e.hit1 = false; e.animT = 0;
                sfx("charge");
            } else if (Math.abs(dx) > 110) {
                vx = e.facing * e.speed * (e.hard ? 1.28 : 1);
                setAnim(e, "move");
            } else setAnim(e, "idle");
        } else {
            e.stateT -= STEP;
            if (e.state !== "walk") {
                setAnim(e, "idle");
                if (e.stateT <= 0) { e.state = "walk"; e.stateT = rand(1500, 3200); e.dir = pick([-1, 1]); }
            } else {
                vx = e.dir * e.speed * 0.55;
                e.facing = e.dir;
                setAnim(e, "move");
                if (e.stateT <= 0) { e.state = "idle"; e.stateT = rand(700, 1600); }
            }
        }
        e.x += vx;
        patrolBounds(e);
        moveEntity(e);
    }

    /* =========================================================
       HANTU  -  sengatan listrik jarak jauh
    ========================================================= */
    function updateGhost(e) {
        e.bob += 0.045;
        const pcx = playerCenterX();
        const pfeet = player.y + player.h;
        const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
        const dist = Math.abs(pcx - ecx);
        const awake = dist < 760 * e.aggroRange && !player.dead;

        if (e.attackCd > 0) e.attackCd -= STEP;
        let goalX = (e.minX + e.maxX) / 2, goalY = e.homeY;

        if (e.state === "hurt") {
            e.stateT -= STEP;
            e.x += e.knock; e.knock *= 0.88;
            if (e.stateT <= 0) e.state = "float";
        } else if (e.state === "charge") {
            setAnim(e, "charge");
            e.stateT -= STEP;
            e.tele = 1;
            if (e.stateT <= 0) {                               // sengat!
                e.state = "zap"; e.animT = 0; e.attackDone = false; e.tele = 0;
                setAnim(e, "zap");
            }
        } else if (e.state === "zap") {
            setAnim(e, "zap");
            if (!e.attackDone && e.frame >= 0) {
                e.attackDone = true;
                effects.push({
                    type: "bolt", x1: ecx, y1: ecy, x2: e.tx, y2: e.ty, t: 0, life: 260,
                    seed: Math.random() * 1000
                });
                sfx("zap");
                burst(e.tx, e.ty, 10, "#9ff4ff", 3.2);
                // kena hanya bila pemain masih di titik yang dikunci
                if (!player.dead &&
                    Math.abs(playerCenterX() - e.tx) < 46 &&
                    Math.abs((player.y + player.h / 2) - (e.ty - 38)) < 70) {
                    damagePlayer(e.damage, e.tx, 7);
                }
            }
            if (animDone(e)) { e.state = "recover"; e.animT = 0; setAnim(e, "recover"); }
        } else if (e.state === "recover") {
            setAnim(e, "recover");
            if (animDone(e)) { e.state = "float"; e.attackCd = e.hard ? rand(1100, 1750) : rand(2200, 3400); }
        } else {
            // melayang: jaga jarak dari pemain di ketinggian kepala
            if (awake) {
                const side = ecx < pcx ? -1 : 1;
                goalX = pcx + side * 240;
                goalY = pfeet - 100 + Math.sin(e.bob) * 20;
                e.facing = pcx < ecx ? -1 : 1;
                if (e.attackCd <= 0 && dist < (e.hard ? 850 : 620) && dist > 70) {
                    e.state = "charge"; e.stateT = e.hard ? 390 : 650;
                    e.tx = pcx; e.ty = pfeet;                   // kunci target SAAT aba-aba dimulai
                    sfx("charge");
                }
            } else {
                goalX += Math.sin(e.bob * 0.7) * 90;
                goalY = e.homeY + Math.sin(e.bob) * 16;
            }
            goalX = clamp(goalX, e.minX, e.maxX);
            goalY = clamp(goalY, 130, CFG.GROUND_Y - e.h);
            const flightSpeed = e.speed * (e.hard ? 1.22 : 1);
            const mx = clamp((goalX - e.x) * (e.hard ? 0.045 : 0.03), -flightSpeed, flightSpeed);
            const my = clamp((goalY - e.y) * (e.hard ? 0.065 : 0.05), -flightSpeed, flightSpeed);
            e.x += mx; e.y += my;
            setAnim(e, Math.abs(mx) > 0.6 ? "move" : "idle");
        }
        e.y += Math.sin(e.bob * 2) * 0.12;
    }

    /* ---------------- update umum ---------------- */
    function update(e) {
        stepAnim(e);
        if (e.flash > 0) e.flash -= STEP;

        if (e.dead) {
            if (e.def.flying) { e.y -= 0.35; }
            else moveEntity(e);
            const a = e.def.anims.death;
            if (e.animT > a.ms * a.frames.length + 350) e.remove = true;
            return;
        }
        if (e.type === "slime") updateSlime(e);
        else if (e.type === "golem") updateGolem(e);
        else if (e.type === "ghost") updateGhost(e);
    }

    return { TYPES, create, update, takeHit, kill, setAnim };
})();
