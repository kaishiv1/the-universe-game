/* Dihasilkan otomatis dari analisis piksel aset.
   cx[baris][kolom] = titik tumpu horizontal tiap frame, foot = garis kaki (piksel sumber). */
const SHEETS = {
    heroM: { file: "player/hero_cowo.png", cols: 8, rows: 4, cw: 344, ch: 384, ox: 0, foot: 372,
        cx: [[161,162,163,163,164,163,162,161],[166,164,157,169,166,169,167,162],[150,164,157,152,172,152,150,146],[164,156,148,161,163,202,202,202]] },
    heroF: { file: "player/hero_cewe.png", cols: 8, rows: 4, cw: 300, ch: 448, ox: 0, foot: [440, 416, 412, 418],
        cx: [[170,163,155,147,139,131,122,114],[150,150,150,150,150,150,150,150],[150,150,150,150,150,150,150,150],[150,150,150,150,150,150,150,150]] },
    slime: { file: "enemy/musuh.png", cols: 8, rows: 4, cw: 344, ch: 384, ox: 0, foot: 371,
        cx: [[168,169,169,169,170,171,171,172],[168,170,170,170,170,171,172,172],[169,170,170,190,198,207,167,172],[169,171,171,167,175,177,175,174]] },
    golem: { file: "enemy/musuh2.png", cols: 8, rows: 4, cw: 344, ch: 384, ox: 0, foot: 366,
        cx: [[177,174,171,169,166,164,161,159],[179,175,173,169,166,166,162,161],[177,155,133,199,174,181,163,152],[177,181,183,181,176,172,171,171]] },
    ghost: { file: "enemy/musuh3.png", cols: 8, rows: 4, cw: 344, ch: 384, ox: 0, foot: 383,
        cx: [[168,169,169,171,171,173,173,173],[176,174,177,179,180,180,180,180],[176,174,171,176,179,177,179,177],[175,177,174,175,176,170,197,148]] }
};

/* =========================================================
   SPRITES - definisi atlas/koordinat potongan aset
   (koordinat dalam piksel sumber file PNG)
========================================================= */

/* ---- platform batu (platform.png) ---- */
const PLATFORM_SPRITES = [
    { sx: 86,   sy: 596, sw: 429,  sh: 197, surf: 3  },  // A kecil
    { sx: 774,  sy: 595, sw: 682,  sh: 277, surf: 3  },  // B sedang
    { sx: 1638, sy: 594, sw: 955,  sh: 279, surf: 4  },  // C lumut besar (tinggi dikoreksi: sebelumnya ikut memotong deretan duri di bawahnya)
    { sx: 86,   sy: 934, sw: 601,  sh: 235, surf: 3  },  // D
    { sx: 775,  sy: 934, sw: 773,  sh: 256, surf: 5  },  // E
    { sx: 85,   sy: 51,  sw: 1252, sh: 266, surf: 33 }   // F jembatan lebar (tinggi dikoreksi: sebelumnya ikut memotong blok batu di bawahnya)
];
const SPIKE_SPRITES = [
    { sx: 2282, sy: 847, sw: 170, sh: 140 },
    { sx: 2494, sy: 846, sw: 173, sh: 139 },
    { sx: 1857, sy: 853, sw: 150, sh: 131 },       // varian 3
    { sx: 1612, sy: 1335, sw: 202, sh: 156 },      // kelompok besar kiri (lorong duri)
    { sx: 1835, sy: 1352, sw: 201, sh: 139 }       // kelompok besar kanan
];

/* ---- platform.png: aset tambahan ---- */
const BLOCK_RECTS = [                              // blok batu (platform kecil)
    { sx: 86,   sy: 342, sw: 167, sh: 167 }, { sx: 299,  sy: 337, sw: 172, sh: 170 },
    { sx: 514,  sy: 342, sw: 178, sh: 166 }, { sx: 729,  sy: 342, sw: 176, sh: 164 },
    { sx: 944,  sy: 342, sw: 184, sh: 164 }, { sx: 1158, sy: 342, sw: 177, sh: 164 },
    { sx: 1376, sy: 342, sw: 173, sh: 166 }
];
const LADDER_RECTS = [
    { sx: 1661, sy: 1037, sw: 121, sh: 233 },
    { sx: 1856, sy: 1035, sw: 119, sh: 231 }
];
const ICICLE_RECTS = [                             // jebakan es menggantung
    { sx: 2069, sy: 1024, sw: 175, sh: 138 },
    { sx: 2284, sy: 1024, sw: 167, sh: 138 },
    { sx: 2495, sy: 1025, sw: 171, sh: 134 }
];
const GATE_RECTS = [                               // lengkung gerbang besi (dekor)
    { sx: 2110, sy: 1196, sw: 252, sh: 290 },
    { sx: 2410, sy: 1194, sw: 257, sh: 293 }
];
const RUIN_RECTS = [                               // reruntuhan & tangga batu (dekor)
    { sx: 80,   sy: 1237, sw: 255, sh: 255 },
    { sx: 389,  sy: 1237, sw: 257, sh: 256 },
    { sx: 692,  sy: 1243, sw: 254, sh: 247 },
    { sx: 993,  sy: 1365, sw: 125, sh: 125 },
    { sx: 1198, sy: 1178, sw: 332, sh: 313 }
];
const HANG_RECTS = [                               // bongkahan batu menggantung (dekor atap)
    { sx: 1373, sy: 83, sw: 174, sh: 193 }, { sx: 1633, sy: 39, sw: 194, sh: 231 },
    { sx: 1846, sy: 45, sw: 171, sh: 247 }, { sx: 2058, sy: 84, sw: 136, sh: 212 },
    { sx: 2278, sy: 84, sw: 171, sh: 212 }
];
const SIDE_WALL_RECTS = {                          // construction.png (tembok kiri / kanan)
    leftCap:  { sx: 87,   sy: 373, sw: 191, sh: 357 },
    leftIvy:  { sx: 318,  sy: 358, sw: 178, sh: 371 },
    rightIvy: { sx: 2255, sy: 374, sw: 179, sh: 356 },
    rightCap: { sx: 2475, sy: 374, sw: 191, sh: 357 }
};
const BUFF_FRAME = { sx: 713, sy: 1225, sw: 177, sh: 271 };      // hp_bar.png (rangka kecil)


/* ---- construction.png ---- */
const GROUND_TILE_X = [90, 313, 526, 743, 962, 1179, 1397, 1615, 1834, 2051, 2263, 2483];
const GROUND_TILE = { y: 1290, w: 176, h: 205 };            // ujung kiri = idx 0, ujung kanan = idx 11
const WALL_TILE_X = [90, 315, 526, 744, 968, 1180, 1399, 1615, 1834, 2052, 2270, 2483];
const WALL_TILE = { y: 818, w: 172, h: 377 };
// indeks tile dinding: 1 = pilar kiri, 10 = pilar kanan, 5-7 = lengkung, 8-9 = jendela berteralis
const WALL_MID = [2, 3, 5, 6, 7, 2, 3, 8, 9, 4];
const CEILING_RECT = { sx: 85, sy: 21, sw: 1263, sh: 307 };

/* ---- platform bergerak: metadata visual sederhana (tanpa atlas lama) ---- */
const CHAIN_SEGMENT = { sx: 0, sy: 0, sw: 32, sh: 150 };
const MAGIC_FRAMES = Array.from({ length: 5 }, (_, i) => ({ sx: 0, sy: 0, sw: 443, sh: 82 + (i % 2) * 8, surf: 24 }));
const CHAIN_FRAMES = Array.from({ length: 5 }, (_, i) => ({ sx: 0, sy: 0, sw: 415, sh: 130, surf: 22 + (i % 2) * 2 }));

/* ---- portal.png: sheet 8 kolom x 3 baris ---- */
const PORTAL_CELL = { w: 344, h: 512 };
const PORTAL_OPEN_FRAMES = Array.from({ length: 8 }, (_, i) => ({ sx: i * 344, sy: 0, sw: 344, sh: 512 }));
const PORTAL_ACTIVE_FRAMES = Array.from({ length: 8 }, (_, i) => ({ sx: i * 344, sy: 512, sw: 344, sh: 512 }));
const PORTAL_CLOSE_FRAMES = Array.from({ length: 8 }, (_, i) => ({ sx: i * 344, sy: 1024, sw: 344, sh: 512 }));

/* ---- chest_potion.png ---- */
const CHEST_FRAMES = [
    { sx: 32, sy: 70, sw: 180, sh: 190 },
    { sx: 226, sy: 66, sw: 180, sh: 190 },
    { sx: 420, sy: 64, sw: 180, sh: 190 }
];
const POTION_RECTS = {
    hp:  { sx: 252, sy: 338, sw: 118, sh: 166 },  // botol merah: healing
    spd: { sx: 458, sy: 338, sw: 118, sh: 166 },  // botol biru: speed
    atk: { sx: 668, sy: 338, sw: 118, sh: 166 }   // botol abu: damage
};
const WALL_TORCH_FRAMES = [
    { sx: 108,  sy: 724, sw: 161, sh: 344 },
    { sx: 473,  sy: 736, sw: 162, sh: 335 },
    { sx: 837,  sy: 747, sw: 163, sh: 322 },
    { sx: 1202, sy: 741, sw: 170, sh: 329 },
    { sx: 1565, sy: 740, sw: 193, sh: 328 }
];
const STAND_TORCH_FRAMES = [
    { sx: 151,  sy: 1128, sw: 105, sh: 351 },
    { sx: 510,  sy: 1122, sw: 112, sh: 357 },
    { sx: 881,  sy: 1138, sw: 105, sh: 341 },
    { sx: 1248, sy: 1127, sw: 105, sh: 352 },
    { sx: 1611, sy: 1114, sw: 105, sh: 365 }
];

/* ---- UI atlas (dipotong lewat CSS) ---- */
const UI_RECTS = {
    pause: { x: 366, y: 475, w: 714, h: 738 },
    fullscreen: { x: 1320, y: 475, w: 714, h: 738 },
    touch: {
        "ui-kiri":   { x: 129,  y: 143, w: 473, h: 493 },
        "ui-kanan":  { x: 795,  y: 143, w: 474, h: 493 },
        "ui-atas":   { x: 1483, y: 143, w: 475, h: 493 },
        "ui-turun":  { x: 2151, y: 143, w: 473, h: 494 },
        "ui-lompat": { x: 409,  y: 832, w: 494, h: 493 },
        "ui-potion": { x: 1139, y: 832, w: 474, h: 492 },
        "ui-serang": { x: 1828, y: 832, w: 474, h: 492 }
    }
};

/* ---- pahlawan ---- */
const HEROES = {
    knight: {
        id: "knight", name: "KSATRIA", desc: "Seimbang. Tebasan kuat.",
        sheet: "heroM", scale: 0.30, w: 34, h: 88,
        damage: 25, speed: 5.0, atkMs: 65, hit: [3, 5],
        anims: {
            idle:   { row: 0, frames: [0,1,2,3,4,5,6,7], ms: 110, loop: true },
            run:    { row: 1, frames: [0,1,2,3,4,5,6,7], ms: 70,  loop: true },
            air:    { row: 1, frames: [4],               ms: 100, loop: true },
            attack: { row: 2, frames: [0,1,2,3,4,5,6,7], ms: 65,  loop: false },
            hurt:   { row: 3, frames: [2],               ms: 100, loop: true },
            death:  { row: 3, frames: [3,4,5,6,7],       ms: 150, loop: false }
        },
        skins: [{ id: "default", name: "DEFAULT" }]
    },
    knightess: {
        id: "knightess", name: "KSATRIA PUTRI", desc: "Gesit. Serangan cepat.",
        sheet: "heroF", scale: 0.25, w: 34, h: 88,
        damage: 22, speed: 5.5, atkMs: 56, hit: [4, 6],
        anims: {
            idle:   { row: 0, frames: [0,1,2,3,4,5,6,7], ms: 110, loop: true },
            run:    { row: 1, frames: [0,1,2,3,4,5,6,7], ms: 65,  loop: true },
            air:    { row: 1, frames: [4],               ms: 100, loop: true },
            attack: { row: 2, frames: [0,1,2,3,4,5,6,7], ms: 56,  loop: false },
            hurt:   { row: 3, frames: [2],               ms: 100, loop: true },
            death:  { row: 3, frames: [4,5,6],           ms: 190, loop: false }
        },
        skins: [{ id: "default", name: "DEFAULT" }]
    }
};

/* Skala bake per sheet (makin besar = makin tajam, makin boros memori) */
const SHEET_BAKE = { heroM: 0.5, heroF: 0.5, slime: 0.5, golem: 0.6, ghost: 0.5 };
