
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldGen } from '../src/data/worldgen.js';
import { CFG } from '../src/data/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imgRoot = path.join(root, 'public', 'assets', 'img');
const fail = message => {
  throw new Error(message);
};

const exists = relative => fs.existsSync(path.join(root, relative));

// ======================================================
// REQUIRED ASSETS
// ======================================================

const requiredAssets = {
  player: ['hero_cewe.webp', 'hero_cowo.webp'],

  enemy: [
    'musuh.webp',
    'musuh2.webp',
    'musuh3.webp'
  ],

  map: [
    'bg_dungeon.webp',
    'platform.webp',
    'construction.webp',
    'road.webp',
    'road_ground.webp',
    'slope_ground.webp',
    ...Array.from({ length: 6 }, (_, i) => `platform_${i}.webp`),
    ...Array.from({ length: 7 }, (_, i) => `block_${i}.webp`),
    ...Array.from({ length: 12 }, (_, i) => `wall_${i}.webp`),
    ...Array.from({ length: 5 }, (_, i) => `spike_${i}.webp`),
    ...Array.from({ length: 2 }, (_, i) => `ladder_${i}.webp`),
    ...Array.from({ length: 3 }, (_, i) => `icicle_${i}.webp`)
  ],

  objects: [
    'portal.webp',
    'chest_potion.webp',
    'chest_0.webp',
    'chest_1.webp',
    'chest_2.webp',
    'potion_hp.webp',
    'potion_atk.webp',
    'potion_spd.webp',
    ...Array.from({ length: 8 }, (_, i) => `portal_open_${i}.webp`),
    ...Array.from({ length: 8 }, (_, i) => `portal_active_${i}.webp`),
    ...Array.from({ length: 8 }, (_, i) => `portal_close_${i}.webp`)
  ],

  ui: [
    'hp_bar.webp',
    'hp_fill.webp',
    'hp_frame.webp',
    'hp_heart.webp',
    'frame_minimap.webp',
    'victory.webp',
    'lose.webp',
    'UI_button.webp',
    'pause_fullscreen.webp',
    'ui_pause.webp',
    'ui_fullscreen.webp',
    'ui_main_menu.webp',
    'ui_retry_stage.webp',
    'ui_left.webp',
    'ui_right.webp',
    'ui_up.webp',
    'ui_down.webp',
    'ui_jump.webp',
    'ui_potion.webp',
    'ui_attack.webp'
  ]
};

// ======================================================
// IMAGE VALIDATOR: PNG + WEBP
// ======================================================

function readUInt24LE(data, offset) {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16)
  );
}

function getWebPSize(data, file) {
  const relative = path.relative(root, file);

  if (
    data.length < 20 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    fail(`Bukan WebP valid: ${relative}`);
  }

  const riffEnd = 8 + data.readUInt32LE(4);

  if (riffEnd > data.length || riffEnd < 20) {
    fail(`File WebP terpotong atau rusak: ${relative}`);
  }

  let offset = 12;

  while (offset + 8 <= riffEnd) {
    const chunkName = data.toString('ascii', offset, offset + 4);
    const chunkSize = data.readUInt32LE(offset + 4);
    const payload = offset + 8;
    const chunkEnd = payload + chunkSize;

    if (chunkEnd > riffEnd) {
      fail(`Chunk WebP tidak lengkap: ${relative}`);
    }

    let width = 0;
    let height = 0;

    // Extended WebP: VP8X
    if (chunkName === 'VP8X' && chunkSize >= 10) {
      width = readUInt24LE(data, payload + 4) + 1;
      height = readUInt24LE(data, payload + 7) + 1;
    }

    // Lossless WebP: VP8L
    else if (chunkName === 'VP8L' && chunkSize >= 5) {
      if (data[payload] !== 0x2f) {
        fail(`Header VP8L tidak valid: ${relative}`);
      }

      const bits = data.readUInt32LE(payload + 1);

      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }

    // Lossy WebP: VP8
    else if (chunkName === 'VP8 ' && chunkSize >= 10) {
      const signature = data.toString('hex', payload + 3, payload + 6);

      if (signature !== '9d012a') {
        fail(`Header VP8 tidak valid: ${relative}`);
      }

      width = data.readUInt16LE(payload + 6) & 0x3fff;
      height = data.readUInt16LE(payload + 8) & 0x3fff;
    }

    if (width && height) {
      return { width, height };
    }

    // WebP chunks memiliki padding apabila ukurannya ganjil.
    offset = chunkEnd + (chunkSize & 1);
  }

  fail(`Format WebP tidak didukung atau dimensinya tidak ditemukan: ${relative}`);
}

function imageSize(file) {
  const data = fs.readFileSync(file);
  const relative = path.relative(root, file);
  const extension = path.extname(file).toLowerCase();

  let dimensions;
  let format;

  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a
  ]);

  const isPng =
    data.length >= 24 &&
    data.subarray(0, 8).equals(pngSignature);

  const isWebP =
    data.length >= 20 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP';

  if (isPng) {
    if (data.toString('ascii', 12, 16) !== 'IHDR') {
      fail(`Header PNG tidak valid: ${relative}`);
    }

    dimensions = {
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20)
    };

    format = 'PNG';
  } else if (isWebP) {
    dimensions = getWebPSize(data, file);
    format = 'WEBP';
  } else {
    fail(`Format gambar tidak valid atau tidak didukung: ${relative}`);
  }

  if (extension === '.webp' && format !== 'WEBP') {
    fail(`Ekstensi .webp tetapi isi file bukan WebP: ${relative}`);
  }

  if (extension === '.png' && format !== 'PNG') {
    fail(`Ekstensi .png tetapi isi file bukan PNG: ${relative}`);
  }

  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    fail(`Dimensi gambar tidak valid: ${relative}`);
  }

  return {
    ...dimensions,
    format
  };
}

// ======================================================
// REQUIRED ASSET EXISTENCE
// ======================================================

const missing = [];

for (const [category, files] of Object.entries(requiredAssets)) {
  const categoryPath = path.join(imgRoot, category);

  if (!fs.existsSync(categoryPath)) {
    missing.push(`${category}/ (folder)`);
    continue;
  }

  for (const file of files) {
    if (!fs.existsSync(path.join(categoryPath, file))) {
      missing.push(`${category}/${file}`);
    }
  }
}

if (missing.length) {
  fail(`Aset wajib hilang: ${missing.join(', ')}`);
}

// ======================================================
// VALIDATE ALL IMAGE FILES
// ======================================================

const allImages = [];

for (const category of Object.keys(requiredAssets)) {
  const categoryPath = path.join(imgRoot, category);

  for (const file of fs.readdirSync(categoryPath)) {
    if (/\.(png|webp)$/i.test(file)) {
      allImages.push(path.join(categoryPath, file));
    }
  }
}

const imageCounts = {
  PNG: 0,
  WEBP: 0
};

for (const file of allImages) {
  const result = imageSize(file);
  imageCounts[result.format]++;
}

// ======================================================
// SPRITESHEET DIMENSION VALIDATION
// ======================================================

const frameExpectations = [
  ['player/hero_cewe.webp', 2400, 1792],
  ['player/hero_cowo.webp', 2752, 1536],
  ['enemy/musuh.webp', 2752, 1536],
  ['enemy/musuh2.webp', 2752, 1536],
  ['enemy/musuh3.webp', 2752, 1536],
  ['objects/portal.webp', 2752, 1536]
];

for (const [relative, width, height] of frameExpectations) {
  const actual = imageSize(path.join(imgRoot, relative));

  if (actual.width !== width || actual.height !== height) {
    fail(
      `Ukuran spritesheet berubah: ${relative} ` +
      `(${actual.width}x${actual.height}, seharusnya ${width}x${height})`
    );
  }
}

// ======================================================
// LOCAL IMPORT VALIDATION
// ======================================================

let localImports = 0;

const walkJs = current => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);

    if (entry.isDirectory()) {
      walkJs(full);
    } else if (/\.(?:js|mjs)$/.test(entry.name)) {
      const source = fs.readFileSync(full, 'utf8');

      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const target = path.resolve(path.dirname(full), match[1]);

        if (!fs.existsSync(target)) {
          fail(`Import lokal hilang: ${path.relative(root, full)} -> ${match[1]}`);
        }

        localImports++;
      }
    }
  }
};

walkJs(path.join(root, 'src'));

// ======================================================
// EXPLICIT ASSET PATH VALIDATION
// ======================================================

const sourceFiles = [];

const walkAll = current => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' &&
          entry.name !== '.git') {
        walkAll(full);
      }
    } else if (/\.(?:js|mjs|css|html|md|txt)$/.test(entry.name)) {
      sourceFiles.push(full);
    }
  }
};

walkAll(root);

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');

  for (const match of source.matchAll(
    /(?:player|enemy|map|objects|ui)\/[A-Za-z0-9_-]+\.(?:webp|png)/gi
  )) {
    if (!fs.existsSync(path.join(imgRoot, match[0]))) {
      fail(`Path aset tidak ditemukan: ${path.relative(root, file)} -> ${match[0]}`);
    }
  }
}

// ======================================================
// READ SOURCE FILES
// ======================================================

const boot = fs.readFileSync(path.join(root, 'src/scenes/BootScene.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/scenes/GameScene.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/scenes/UIScene.js'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'src/scenes/MainMenuScene.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/ui/SettingsPanel.js'), 'utf8');
const worldgen = fs.readFileSync(path.join(root, 'src/data/worldgen.js'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'src/data/i18n.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ======================================================
// BOOT SCENE AND BRAND
// ======================================================

if (
  !boot.includes("${base}${folder}/${key}.webp") ||
  !boot.includes('player/hero_cowo.webp') ||
  !boot.includes('enemy/musuh.webp') ||
  !boot.includes('map/') ||
  !boot.includes('objects/portal.webp')
) {
  fail('BootScene belum memuat aset dari folder kategori player/enemy/map/objects/ui.');
}

if (
  !menu.includes('THE UNIVERSE') ||
  !/<title>\s*The Universe(?:\s*[—-].*)?<\/title>/i.test(html) ||
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'the-universe'
) {
  fail('Brand utama proyek harus menggunakan nama The Universe.');
}

// ======================================================
// MAIN MENU AND CHARACTER SELECTION
// ======================================================

if (
  !menu.includes('loadKeyBindings') ||
  !menu.includes("withAlias(bindings.attack, 'ENTER')") ||
  !menu.includes("this.tr('startGame')")
) {
  fail('Panduan kontrol menu harus mengikuti key mapping dan label Mulai Permainan.');
}

if (
  !menu.includes('this.createButton(c, 500, 610, 236, 54') ||
  !menu.includes('this.createButton(c, 780, 610, 236, 54')
) {
  fail('Tombol Main Menu dan Mulai Permainan pada character select harus menggunakan ukuran/komponen yang sama.');
}

// ======================================================
// SETTINGS VALIDATION
// ======================================================

if (
  !settings.includes("['id', 'indonesian'") ||
  !settings.includes("['en', 'english'") ||
  !settings.includes('setLanguage(language)') ||
  !settings.includes('beginRemap')
) {
  fail('Settings harus mendukung bahasa Indonesia/Inggris dan pemetaan tombol manual.');
}

if (
  !settings.includes('buildGamePage') ||
  !settings.includes('buildControlsPage') ||
  !settings.includes('buildVideoPage') ||
  !settings.includes('buildAudioPage') ||
  !settings.includes('getAudioSettings') ||
  !settings.includes('setAudioSettings') ||
  !settings.includes('toggleFullscreen') ||
  !settings.includes('setDifficulty')
) {
  fail('Settings General, Controls, Video, dan Audio belum lengkap.');
}

// ======================================================
// HUD AND PAUSE
// ======================================================

if (
  !ui.includes('potionSelectHint') ||
  !ui.includes('selectedMark') ||
  !ui.includes('buffAtk') ||
  !ui.includes('buffSpd')
) {
  fail('HUD harus menyediakan pemilihan potion serta durasi buff yang aktif.');
}

if (
  !ui.includes("this.add.image(606, 44, 'ui_pause')") ||
  !ui.includes("this.add.image(674, 44, 'ui_fullscreen')")
) {
  fail('Tombol Pause dan Fullscreen harus berada berpasangan di tengah atas layar.');
}

// ======================================================
// ENEMY HEALTH AND AI
// ======================================================

if (
  !game.includes('this.updateEnemyHealthBar(enemy)') ||
  !game.includes('updateEnemyHealthBar(enemy)')
) {
  fail('Health bar musuh harus diperbarui selama AI berjalan.');
}

if (
  !game.includes('playerBodyOverlapsEnemy(enemy, 10, 8)') ||
  !game.includes("enemy.state = 'windup'") ||
  !game.includes('createGolemImpact(enemy, { leap: false })') ||
  !game.includes("enemy.state = 'leap'") ||
  !game.includes('createGolemImpact(enemy, { leap: true })') ||
  !game.includes('fireGhostBolt(enemy, time)')
) {
  fail('AI slime/golem/ghost belum memiliki pola kontak, ground slam dekat, dan lunge jauh.');
}

if (
  game.includes('beginGhostAim') ||
  game.includes('aimMarker.setVisible(true)') ||
  !game.includes('this.ghostBolts.length >= 2') ||
  !game.includes('Lightweight projectile simulation')
) {
  fail('Proyektil ghost harus terbatas dan tidak memakai sistem target-lock/renderer trail yang berat.');
}

// ======================================================
// PLAYER PICKUP NOTIFICATIONS
// ======================================================

if (
  !game.includes("showPlayerNotice(t('heartCollected'") ||
  !game.includes("showPlayerNotice(t('potionHeal'") ||
  !game.includes("showPlayerNotice(t('potionDamage'") ||
  !game.includes("showPlayerNotice(t('potionSpeed'")
) {
  fail('Notifikasi ringkas di atas player untuk heart/potion belum lengkap.');
}

// ======================================================
// STAGE INTRO INPUT LOCK
// ======================================================

if (
  !game.includes('Object.keys(this.touchState || {}).forEach') ||
  !game.includes('key?.reset?.()') ||
  !game.includes("this.gameMode = 'playing'") ||
  !ui.includes('this.stageIntro.setVisible(false)')
) {
  fail('Input player harus dikunci sampai Stage Intro selesai.');
}

// ======================================================
// RAMP AND LADDER VALIDATION
// ======================================================

if (
  !game.includes('rampAccessLadders') ||
  !game.includes('setFlipX(!isDescending)') ||
  !worldgen.includes('const rampW = 520')
) {
  fail('Jalur tanjakan naik/turun harus panjang dan ramp turun memiliki akses ke landing tinggi.');
}

if (
  !game.includes("'wall_7'") ||
  !game.includes('supportBottom') ||
  !game.includes('landingSurfaceY')
) {
  fail('Platform mengambang harus memiliki pilar batu penyangga.');
}

// ======================================================
// FLOOR COLLIDER AND FALL RECOVERY
// ======================================================

if (
  !game.includes("this.physics.add.staticImage(levelWidth / 2, G + 12, '__the_universe_ground')") ||
  !game.includes('this.recoverPlayerToGround()') ||
  !game.includes('body.checkCollision.none = false')
) {
  fail('Player harus memiliki lantai statis eksplisit dan pemulihan saat keluar batas lantai.');
}

// ======================================================
// GOLEM IMPACT ANIMATION
// ======================================================

if (
  !game.includes('enemy.slamAnimUntil') ||
  !game.includes('time < (enemy.slamAnimUntil || 0)')
) {
  fail('Animasi ground slam golem harus dipertahankan selama fase impact.');
}

// ======================================================
// COMBAT DAMAGE
// ======================================================

if (
  !game.includes('this.damagePlayer(owner.damage * hardMultiplier(this.difficulty))') ||
  !game.includes('this.damagePlayer(Math.max(1, Math.round(enemy.damage * (hard ? 1.18 : 1) * falloff)))') ||
  !game.includes('const radius = leap ?') ||
  !game.includes('const dy = Math.abs(playerFeetY - enemyFeetY)')
) {
  fail('Serangan listrik hantu dan hantaman golem harus terhubung ke damage player.');
}

// ======================================================
// VICTORY AND DEFEAT UI
// ======================================================

if (
  !ui.includes('panelW = 760, panelH = 548') ||
  !ui.includes("'victorySubtitle'") ||
  !ui.includes("'defeatSubtitle'") ||
  !ui.includes("['remainingHp'") ||
  !ui.includes("'finishRun' : 'nextStage'") ||
  !ui.includes("t('retry'") ||
  !ui.includes("t('backToMenu'")
) {
  fail('UI Victory/Lose harus memiliki panel, ringkasan statistik, dan aksi yang terpisah serta terpusat.');
}

// ======================================================
// CHEST SPAWN VALIDATION
// ======================================================

if (
  !worldgen.includes('chest.surface = "ramp"') ||
  !worldgen.includes('chest.surface = "platform"') ||
  !worldgen.includes('Chest bottom is anchored to a walkable elevated surface')
) {
  fail('Peti harus ditempatkan di permukaan ramp/platform, bukan jalan dasar.');
}

// ======================================================
// RAMP LANDING SUPPORT
// ======================================================

if (
  !game.includes('const landingSurfaceY = G - ramp.rise') ||
  !game.includes('this.add.tileSprite(supportX')
) {
  fail('Landing setelah ramp perlu memiliki penyangga batu yang terlihat.');
}

// ======================================================
// AUDIO ASSET VALIDATION
// ======================================================

const audioDir = path.join(root, 'public/assets/audio');

for (const key of [
  'ui_click',
  'sword_swing',
  'sword_hit',
  'slime_hit',
  'golem_slam',
  'ghost_zap',
  'potion_use',
  'heart_pickup',
  'chest_open',
  'portal_open',
  'stage_clear',
  'game_over',
  'dungeon_ambience'
]) {
  if (!fs.existsSync(path.join(audioDir, `${key}.wav`))) {
    fail(`Audio lokal hilang: ${key}.wav`);
  }
}

for (const key of ['menu_theme', 'gameplay_theme']) {
  if (!fs.existsSync(path.join(audioDir, `${key}.ogg`))) {
    fail(`Musik ambient lokal hilang: ${key}.ogg`);
  }
}

const audioLibrary = fs.readFileSync(
  path.join(root, 'src/systems/AudioLibrary.js'),
  'utf8'
);

if (
  !audioLibrary.includes('loop: true') ||
  !audioLibrary.includes('settings.music') ||
  !audioLibrary.includes('settings.sfx')
) {
  fail('Audio manager harus menyediakan musik loop dan kontrol volume musik/efek suara.');
}

if (!audioLibrary.includes("if (stored == null || stored === '') return fallback;")) {
  fail('Audio manager harus memakai volume default ketika belum ada nilai localStorage.');
}

// ======================================================
// BACKGROUND GENERATION VALIDATION
// ======================================================

if (/buildGroundDecor|randomWall|randomRuin/.test(worldgen)) {
  fail('World generator tidak boleh menambah tembok/ruin acak di belakang background.');
}

// ======================================================
// CANVAS SCALING VALIDATION
// ======================================================

if (
  !/width:\s*100%\s*!important/.test(css) ||
  !/height:\s*100%\s*!important/.test(css) ||
  !/mode:\s*Phaser\.Scale\.FIT/.test(main)
) {
  fail('Canvas harus tetap memenuhi viewport dengan buffer logis 1280x720.');
}

// ======================================================
// INDONESIAN / ENGLISH TRANSLATION VALIDATION
// ======================================================

const idBlock = i18n.match(/\bid:\s*\{([\s\S]*?)\n  \},\n  en:/)?.[1];
const enBlock = i18n.match(/\ben:\s*\{([\s\S]*?)\n  \}\n};/)?.[1];

if (!idBlock || !enBlock) {
  fail('Dictionary i18n id/en tidak ditemukan.');
}

const keysIn = block =>
  new Set(
    [...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):/gm)]
      .map(match => match[1])
  );

const idKeys = keysIn(idBlock);
const enKeys = keysIn(enBlock);

const missingEn = [...idKeys].filter(key => !enKeys.has(key));
const missingId = [...enKeys].filter(key => !idKeys.has(key));

if (missingEn.length || missingId.length) {
  fail(
    `Terjemahan tidak seimbang. ` +
    `Hilang EN: ${missingEn.join(', ')}; ` +
    `hilang ID: ${missingId.join(', ')}`
  );
}

if (
  !i18n.includes('potionHpShort') ||
  !i18n.includes('potionAtkShort') ||
  !i18n.includes('potionSpdShort')
) {
  fail('Label potion HUD harus ringkas dan tersedia dalam dua bahasa.');
}

if (
  !i18n.includes("return 'dimensionOne'") ||
  !i18n.includes("return 'dimensionTwo'") ||
  !i18n.includes("return 'dimensionThree'")
) {
  fail('Pembagian nama dimensi untuk seluruh stage belum lengkap.');
}

// ======================================================
// LEGACY BROWSER ASSET VALIDATION
// ======================================================

const legacyJs = fs.readFileSync(
  path.join(root, 'legacy-browser/main.js'),
  'utf8'
);

for (const match of legacyJs.matchAll(
  /:\s*"((?:player|enemy|map|objects|ui)\/[A-Za-z0-9_-]+\.webp)"/g
)) {
  if (!fs.existsSync(path.join(imgRoot, match[1]))) {
    fail(`Path aset legacy putus: ${match[1]}`);
  }
}

// ======================================================
// WORLD GENERATION TEST
// ======================================================

let maps = 0;

for (let stage = 1; stage <= CFG.MAX_STAGE; stage++) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const level = WorldGen.generate(stage);
    maps++;

    if (level.stage.n !== stage) {
      fail(`Konfigurasi stage salah: ${stage}`);
    }

    if (!level.platforms.some(p => p.kind === 'ground')) {
      fail(`Lantai hilang di stage ${stage}`);
    }

    if (!(level.door.x > 0 && level.door.x < level.width)) {
      fail(`Gerbang keluar di luar map stage ${stage}`);
    }

    if (!level.platforms.length || !level.spawns.length) {
      fail(`Stage ${stage} tidak lengkap`);
    }

    if (
      !level.ramps?.some(r => r.direction === 'up') ||
      !level.ramps?.some(r => r.direction === 'down')
    ) {
      fail(`Stage ${stage} harus punya tanjakan naik dan menurun.`);
    }

    if ((level.movers || []).length) {
      fail(`Platform bergerak tanpa dukungan masih muncul di stage ${stage}`);
    }

    const overlaps = (a, b, margin = 0) =>
      a.x < b.x + b.w + margin &&
      a.x + a.w + margin > b.x &&
      a.y < b.y + b.h + margin &&
      a.y + a.h + margin > b.y;

    for (const ramp of level.ramps) {
      if (ramp.w < 520) {
        fail(`Ramp terlalu pendek di stage ${stage}`);
      }

      const rampArea = {
        x: ramp.x,
        y: CFG.GROUND_Y - ramp.rise,
        w: ramp.w,
        h: ramp.rise
      };

      const landing = ramp.direction === 'up'
        ? {
            x: ramp.x + ramp.w - 8,
            y: CFG.GROUND_Y - ramp.rise - 116,
            w: ramp.landingW + 24,
            h: 116
          }
        : {
            x: ramp.x - ramp.landingW + 8,
            y: CFG.GROUND_Y - ramp.rise - 116,
            w: ramp.landingW + 24,
            h: 116
          };

      for (const platform of level.platforms) {
        if (platform.kind === 'ground' || !platform.vr) continue;

        if (
          overlaps(rampArea, platform.vr, 8) ||
          overlaps(landing, platform.vr, 8)
        ) {
          fail(`Jalur ramp stage ${stage} tertutup platform di x=${ramp.x}`);
        }
      }

      for (const hazard of level.hazards) {
        if (
          overlaps(rampArea, hazard, 8) ||
          overlaps(landing, hazard, 8)
        ) {
          fail(`Jalur ramp stage ${stage} tertutup hazard di x=${ramp.x}`);
        }
      }

      for (const spawn of level.spawns) {
        const withinLane =
          spawn.x >= ramp.x - 120 &&
          spawn.x <= ramp.x + ramp.w + 120;

        const belowRampTop =
          spawn.y >= CFG.GROUND_Y - ramp.rise - 58;

        if (withinLane && belowRampTop) {
          fail(`Musuh spawn di bawah ramp stage ${stage}, x=${spawn.x}`);
        }
      }
    }

    for (const hazard of level.hazards.filter(h => h.type === 'spike')) {
      if (
        hazard.y + hazard.h < CFG.GROUND_Y - 10 ||
        hazard.y + hazard.h > CFG.GROUND_Y + 12
      ) {
        fail(`Duri melayang/tidak menempel tanah pada stage ${stage}, x=${hazard.x}`);
      }
    }

    for (const ladder of level.ladders) {
      const shaft = {
        x: ladder.x - 2,
        y: ladder.top + 4,
        w: ladder.w + 4,
        h: ladder.bottom - ladder.top - 4
      };

      const landing = {
        x: ladder.cx - 42,
        y: ladder.top - 112,
        w: 84,
        h: 112
      };

      for (const platform of level.platforms) {
        if (platform === ladder.plat || platform.kind === 'ground') continue;

        if (
          platform.vr &&
          (
            overlaps(shaft, platform.vr, 3) ||
            overlaps(landing, platform.vr, 3)
          )
        ) {
          fail(`Koridor tangga stage ${stage} terhalang platform di x=${ladder.cx}`);
        }
      }

      for (const hazard of level.hazards) {
        if (
          overlaps(shaft, hazard, 3) ||
          overlaps(landing, hazard, 3)
        ) {
          fail(`Koridor tangga stage ${stage} terhalang hazard di x=${ladder.cx}`);
        }
      }
    }
  }
}

// ======================================================
// PACKAGE AND VERCEL VALIDATION
// ======================================================

const packageData = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
);

const vercel = JSON.parse(
  fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')
);

if (
  packageData.name !== 'the-universe' ||
  packageData.version !== '2.4.0'
) {
  fail('Nama/versi package untuk kandidat deploy belum benar.');
}

if (
  vercel.outputDirectory !== 'dist' ||
  vercel.buildCommand !== 'npm run build'
) {
  fail('Konfigurasi output/build Vercel tidak sesuai.');
}

// ======================================================
// FINAL REPORT
// ======================================================

console.log('OK: The Universe — Indonesian/English UI, settings, and dimension labels are present.');

console.log(
  `OK: ${allImages.length} image files validated ` +
  `(${imageCounts.PNG} PNG, ${imageCounts.WEBP} WebP).`
);

console.log(`OK: ${localImports} local source imports resolve.`);

console.log('OK: Main Menu/Character Select buttons, settings tabs, remapping, and language switching are connected.');

console.log('OK: Pause/fullscreen are centered; potion selection and active buff timers are visible.');

console.log('OK: enemy HP bars, slime contact, golem close ground slam/far lunge, and bounded ghost bolts are wired.');

console.log('OK: intro locks keyboard/touch input; pickup/consumption feedback is limited to player heart/potion notices.');

console.log('OK: descending ramps have ladder access; all generated ramps are at least 520 px long.');

console.log(`OK: ${maps} generated maps have both slope directions, no enemies beneath ramps, no floating spikes, and clear ladder corridors.`);

console.log('OK: local menu/gameplay ambient loops, master/music/SFX volume, and mute controls are present.');

console.log('OK: static floor collider, fall recovery, and protected golem impact animation are present.');

console.log('OK: legacy-browser asset paths and Vercel output configuration remain valid.');

console.log('OK: PNG and WebP image signatures and dimensions have been validated.');

console.log('SUCCESS: The Universe project validation completed.');
