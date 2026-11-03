/* =========================================================
   CONFIG - konstanta global + definisi stage I-1 .. I-10
   (dimuat paling awal, dipakai oleh semua file lain)
========================================================= */
"use strict";

const CFG = {
    VIEW_H: 720,                               // tinggi dunia logis (piksel)
    GROUND_Y: Math.round(720 * 0.83),          // garis lantai pada bg_dungeon.png
    STEP: 1000 / 60,                           // 1 tick fisika = 16.67 ms
    MAX_FALL: 17,
    TIER: [0, 135, 240, 345],                  // tinggi platform di atas lantai (terjangkau lompatan)
    JUMP_POWER: -17.2,                         // apex lompatan = 174 px
    PLAYER_GRAVITY: 0.85,
    MAX_STAGE: 10,
    BUCKET: 400                                // ukuran bucket grid collision
};

/* Konfigurasi satu stage. n = 1..10 */
function getStageConfig(n) {
    n = Math.max(1, Math.min(CFG.MAX_STAGE, n));
    const t = (n - 1) / (CFG.MAX_STAGE - 1);   // 0..1
    const cfg = {
        n,
        id: "I-" + n,
        width: Math.round(6800 + (n - 1) * 430),
        hpMul: 1 + 0.10 * (n - 1),
        dmgMul: 1 + 0.07 * (n - 1),
        density: 0.9 + 0.11 * n,               // pengali jumlah musuh per chunk
        golemFrom: 4,
        ghostFrom: 8,
        hasGolem: n >= 4,
        hasGhost: n >= 8,
        ceiling: n >= 6,
        movers: false,                        // platform bergerak dinonaktifkan: semua pijakan harus statis dan berpenyangga
        magic: n >= 5,                         // platform sihir
        spikePit: n >= 2,
        ladders: n >= 2,                       // tangga yang bisa dipanjat
        icicle: n >= 4,                        // jebakan es menggantung di atas duri
        blocks: n >= 2,                        // blok batu kecil sebagai pijakan
        chests: n < 6 ? 1 : 2,
        weights: {
            arena: 3,
            spikeRun: 2 + t * 2,
            stairs: 3,
            zigzag: n >= 2 ? 2 + t * 2 : 0,
            spikePit: n >= 2 ? 1 + t * 1.5 : 0,
            bridge: 2,
            ramp: 1.15
        },
        newEnemy: null,
        note: ""
    };
    if (n === 1) cfg.note = "stageNoteSlime";
    if (n === 4) { cfg.newEnemy = "golem"; cfg.note = "stageNoteGolem"; }
    if (n === 8) { cfg.newEnemy = "ghost"; cfg.note = "stageNoteGhost"; }
    return cfg;
}

export { CFG, getStageConfig };
