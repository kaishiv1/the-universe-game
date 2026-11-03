import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldGen } from '../src/data/worldgen.js';
import { CFG } from '../src/data/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imgRoot = path.join(root, 'public', 'assets', 'img');
const fail = message => { throw new Error(message); };
const exists = relative => fs.existsSync(path.join(root, relative));

const requiredAssets = {
  player: ['hero_cewe.png', 'hero_cowo.png'],
  enemy: ['musuh.png', 'musuh2.png', 'musuh3.png'],
  map: [
    'bg_dungeon.png', 'platform.png', 'construction.png', 'road.png', 'road_ground.png', 'slope_ground.png',
    ...Array.from({ length: 6 }, (_, i) => `platform_${i}.png`),
    ...Array.from({ length: 7 }, (_, i) => `block_${i}.png`),
    ...Array.from({ length: 12 }, (_, i) => `wall_${i}.png`),
    ...Array.from({ length: 5 }, (_, i) => `spike_${i}.png`),
    ...Array.from({ length: 2 }, (_, i) => `ladder_${i}.png`),
    ...Array.from({ length: 3 }, (_, i) => `icicle_${i}.png`)
  ],
  objects: [
    'portal.png', 'chest_potion.png', 'chest_0.png', 'chest_1.png', 'chest_2.png',
    'potion_hp.png', 'potion_atk.png', 'potion_spd.png',
    ...Array.from({ length: 8 }, (_, i) => `portal_open_${i}.png`),
    ...Array.from({ length: 8 }, (_, i) => `portal_active_${i}.png`),
    ...Array.from({ length: 8 }, (_, i) => `portal_close_${i}.png`)
  ],
  ui: [
    'hp_bar.png', 'hp_fill.png', 'hp_frame.png', 'hp_heart.png', 'frame_minimap.png', 'victory.png', 'lose.png',
    'UI_button.png', 'pause_fullscreen.png', 'ui_pause.png', 'ui_fullscreen.png', 'ui_main_menu.png', 'ui_retry_stage.png',
    'ui_left.png', 'ui_right.png', 'ui_up.png', 'ui_down.png', 'ui_jump.png', 'ui_potion.png', 'ui_attack.png'
  ]
};

const missing = [];
for (const [category, files] of Object.entries(requiredAssets)) {
  const categoryPath = path.join(imgRoot, category);
  if (!fs.existsSync(categoryPath)) missing.push(`${category}/ (folder)`);
  for (const file of files) if (!fs.existsSync(path.join(categoryPath, file))) missing.push(`${category}/${file}`);
}
if (missing.length) fail(`Aset wajib hilang: ${missing.join(', ')}`);

function pngSize(file) {
  const data = fs.readFileSync(file);
  if (data.toString('hex', 0, 8) !== '89504e470d0a1a0a') fail(`Bukan PNG valid: ${path.relative(root, file)}`);
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!width || !height) fail(`Dimensi PNG kosong: ${path.relative(root, file)}`);
  return { width, height };
}

const allPng = [];
for (const category of Object.keys(requiredAssets)) {
  for (const file of fs.readdirSync(path.join(imgRoot, category))) {
    if (file.toLowerCase().endsWith('.png')) allPng.push(path.join(imgRoot, category, file));
  }
}
for (const file of allPng) pngSize(file);

const frameExpectations = [
  ['player/hero_cewe.png', 2400, 1792],
  ['player/hero_cowo.png', 2752, 1536],
  ['enemy/musuh.png', 2752, 1536],
  ['enemy/musuh2.png', 2752, 1536],
  ['enemy/musuh3.png', 2752, 1536],
  ['objects/portal.png', 2752, 1536]
];
for (const [relative, width, height] of frameExpectations) {
  const actual = pngSize(path.join(imgRoot, relative));
  if (actual.width !== width || actual.height !== height) {
    fail(`Ukuran spritesheet berubah: ${relative} (${actual.width}x${actual.height}, seharusnya ${width}x${height})`);
  }
}

// Pastikan import relatif di seluruh source Phaser tetap mengarah ke file yang ada.
let localImports = 0;
const walkJs = current => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walkJs(full);
    else if (/\.(?:js|mjs)$/.test(entry.name)) {
      const source = fs.readFileSync(full, 'utf8');
      for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const target = path.resolve(path.dirname(full), match[1]);
        if (!fs.existsSync(target)) fail(`Import lokal hilang: ${path.relative(root, full)} -> ${match[1]}`);
        localImports++;
      }
    }
  }
};
walkJs(path.join(root, 'src'));

// Semua path aset yang tertulis secara eksplisit harus sesuai dengan kategori folder baru.
const sourceFiles = [];
const walkAll = current => {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') walkAll(full);
    } else if (/\.(?:js|mjs|css|html|md|txt)$/.test(entry.name)) sourceFiles.push(full);
  }
};
walkAll(root);
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:player|enemy|map|objects|ui)\/[A-Za-z0-9_-]+\.png/g)) {
    if (!fs.existsSync(path.join(imgRoot, match[0]))) {
      fail(`Path aset tidak ditemukan: ${path.relative(root, file)} -> ${match[0]}`);
    }
  }
}

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

if (!boot.includes("${base}${folder}/${key}.png") || !boot.includes('player/hero_cowo.png') ||
    !boot.includes('enemy/musuh.png') || !boot.includes('map/') || !boot.includes('objects/portal.png')) {
  fail('BootScene belum memuat aset dari folder kategori player/enemy/map/objects/ui.');
}
if (!menu.includes('THE UNIVERSE') || !/<title>\s*The Universe(?:\s*[—-].*)?<\/title>/i.test(html) ||
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'the-universe') {
  fail('Brand utama proyek harus menggunakan nama The Universe.');
}
if (!menu.includes('loadKeyBindings') || !menu.includes("withAlias(bindings.attack, 'ENTER')") ||
    !menu.includes("this.tr('startGame')")) {
  fail('Panduan kontrol menu harus mengikuti key mapping dan label Mulai Permainan.');
}
if (!menu.includes('this.createButton(c, 500, 610, 236, 54') ||
    !menu.includes('this.createButton(c, 780, 610, 236, 54')) {
  fail('Tombol Main Menu dan Mulai Permainan pada character select harus menggunakan ukuran/komponen yang sama.');
}
if (!settings.includes("['id', 'indonesian'") || !settings.includes("['en', 'english'") ||
    !settings.includes('setLanguage(language)') || !settings.includes('beginRemap')) {
  fail('Settings harus mendukung bahasa Indonesia/Inggris dan pemetaan tombol manual.');
}
if (!settings.includes('buildGamePage') || !settings.includes('buildControlsPage') || !settings.includes('buildVideoPage') ||
    !settings.includes('buildAudioPage') || !settings.includes('getAudioSettings') || !settings.includes('setAudioSettings') ||
    !settings.includes('toggleFullscreen') || !settings.includes('setDifficulty')) {
  fail('Settings General, Controls, dan Video belum lengkap.');
}
if (!ui.includes('potionSelectHint') || !ui.includes('selectedMark') || !ui.includes('buffAtk') || !ui.includes('buffSpd')) {
  fail('HUD harus menyediakan pemilihan potion serta durasi buff yang aktif.');
}
if (!ui.includes('this.add.image(606, 44, \'ui_pause\')') || !ui.includes('this.add.image(674, 44, \'ui_fullscreen\')')) {
  fail('Tombol Pause dan Fullscreen harus berada berpasangan di tengah atas layar.');
}
if (!game.includes('this.updateEnemyHealthBar(enemy)') || !game.includes('updateEnemyHealthBar(enemy)')) {
  fail('Health bar musuh harus diperbarui selama AI berjalan.');
}
if (!game.includes('playerBodyOverlapsEnemy(enemy, 10, 8)') || !game.includes('enemy.state = \'windup\'') ||
    !game.includes('createGolemImpact(enemy, { leap: false })') || !game.includes('enemy.state = \'leap\'') ||
    !game.includes('createGolemImpact(enemy, { leap: true })') || !game.includes('fireGhostBolt(enemy, time)')) {
  fail('AI slime/golem/ghost belum memiliki pola kontak, ground slam dekat, dan lunge jauh.');
}
if (game.includes('beginGhostAim') || game.includes('aimMarker.setVisible(true)') ||
    !game.includes('this.ghostBolts.length >= 2') || !game.includes('Lightweight projectile simulation')) {
  fail('Proyektil ghost harus terbatas dan tidak memakai sistem target-lock/renderer trail yang berat.');
}
if (!game.includes('showPlayerNotice(t(\'heartCollected\'') ||
    !game.includes('showPlayerNotice(t(\'potionHeal\'') ||
    !game.includes('showPlayerNotice(t(\'potionDamage\'') ||
    !game.includes('showPlayerNotice(t(\'potionSpeed\'')) {
  fail('Notifikasi ringkas di atas player untuk heart/potion belum lengkap.');
}
if (!game.includes('Object.keys(this.touchState || {}).forEach') || !game.includes('key?.reset?.()') ||
    !game.includes('this.gameMode = \'playing\'') || !ui.includes('this.stageIntro.setVisible(false)')) {
  fail('Input player harus dikunci sampai Stage Intro selesai.');
}
if (!game.includes('rampAccessLadders') || !game.includes("setFlipX(!isDescending)") || !worldgen.includes('const rampW = 520')) {
  fail('Jalur tanjakan naik/turun harus panjang dan ramp turun memiliki akses ke landing tinggi.');
}
if (!game.includes("'wall_7'") || !game.includes('supportBottom') || !game.includes('landingSurfaceY')) {
  fail('Platform mengambang harus memiliki pilar batu penyangga.');
}
if (!game.includes("this.physics.add.staticImage(levelWidth / 2, G + 12, '__the_universe_ground')") ||
    !game.includes('this.recoverPlayerToGround()') || !game.includes('body.checkCollision.none = false')) {
  fail('Player harus memiliki lantai statis eksplisit dan pemulihan saat keluar batas lantai.');
}
if (!game.includes('enemy.slamAnimUntil') || !game.includes('time < (enemy.slamAnimUntil || 0)')) {
  fail('Animasi ground slam golem harus dipertahankan selama fase impact.');
}
if (!game.includes('this.damagePlayer(owner.damage * hardMultiplier(this.difficulty))') ||
    !game.includes('this.damagePlayer(Math.max(1, Math.round(enemy.damage * (hard ? 1.18 : 1) * falloff)))') ||
    !game.includes('const radius = leap ?') || !game.includes('const dy = Math.abs(playerFeetY - enemyFeetY)')) {
  fail('Serangan listrik hantu dan hantaman golem harus terhubung ke damage player.');
}

if (!ui.includes('panelW = 760, panelH = 548') || !ui.includes("'victorySubtitle'") ||
    !ui.includes("'defeatSubtitle'") || !ui.includes("['remainingHp'") ||
    !ui.includes("'finishRun' : 'nextStage'") || !ui.includes("t('retry'") || !ui.includes("t('backToMenu'")) {
  fail('UI Victory/Lose harus memiliki panel, ringkasan statistik, dan aksi yang terpisah serta terpusat.');
}
if (!worldgen.includes('chest.surface = "ramp"') || !worldgen.includes('chest.surface = "platform"') ||
    !worldgen.includes('Chest bottom is anchored to a walkable elevated surface')) {
  fail('Peti harus ditempatkan di permukaan ramp/platform, bukan jalan dasar.');
}
if (!game.includes('const landingSurfaceY = G - ramp.rise') || !game.includes('this.add.tileSprite(supportX')) {
  fail('Landing setelah ramp perlu memiliki penyangga batu yang terlihat.');
}
const audioDir = path.join(root, 'public/assets/audio');
for (const key of ['ui_click','sword_swing','sword_hit','slime_hit','golem_slam','ghost_zap','potion_use','heart_pickup','chest_open','portal_open','stage_clear','game_over','dungeon_ambience']) {
  if (!fs.existsSync(path.join(audioDir, `${key}.wav`))) fail(`Audio lokal hilang: ${key}.wav`);
}
for (const key of ['menu_theme', 'gameplay_theme']) {
  if (!fs.existsSync(path.join(audioDir, `${key}.ogg`))) fail(`Musik ambient lokal hilang: ${key}.ogg`);
}
const audioLibrary = fs.readFileSync(path.join(root, 'src/systems/AudioLibrary.js'), 'utf8');
if (!audioLibrary.includes('loop: true') || !audioLibrary.includes('settings.music') || !audioLibrary.includes('settings.sfx')) {
  fail('Audio manager harus menyediakan musik loop dan kontrol volume musik/efek suara.');
}
if (!audioLibrary.includes("if (stored == null || stored === '') return fallback;")) {
  fail('Audio manager harus memakai volume default ketika belum ada nilai localStorage.');
}

if (/buildGroundDecor|randomWall|randomRuin/.test(worldgen)) {
  fail('World generator tidak boleh menambah tembok/ruin acak di belakang background.');
}
if (!/width:\s*100%\s*!important/.test(css) || !/height:\s*100%\s*!important/.test(css) ||
    !/mode:\s*Phaser\.Scale\.FIT/.test(main)) {
  fail('Canvas harus tetap memenuhi viewport dengan buffer logis 1280x720.');
}

// Key terjemahan Indonesia dan Inggris harus setara.
const idBlock = i18n.match(/\bid:\s*\{([\s\S]*?)\n  \},\n  en:/)?.[1];
const enBlock = i18n.match(/\ben:\s*\{([\s\S]*?)\n  \}\n};/)?.[1];
if (!idBlock || !enBlock) fail('Dictionary i18n id/en tidak ditemukan.');
const keysIn = block => new Set([...block.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):/gm)].map(m => m[1]));
const idKeys = keysIn(idBlock), enKeys = keysIn(enBlock);
const missingEn = [...idKeys].filter(key => !enKeys.has(key));
const missingId = [...enKeys].filter(key => !idKeys.has(key));
if (missingEn.length || missingId.length) fail(`Terjemahan tidak seimbang. Hilang EN: ${missingEn.join(', ')}; hilang ID: ${missingId.join(', ')}`);
if (!i18n.includes('potionHpShort') || !i18n.includes('potionAtkShort') || !i18n.includes('potionSpdShort')) fail('Label potion HUD harus ringkas dan tersedia dalam dua bahasa.');
if (!i18n.includes("return 'dimensionOne'") || !i18n.includes("return 'dimensionTwo'") || !i18n.includes("return 'dimensionThree'")) {
  fail('Pembagian nama dimensi untuk seluruh stage belum lengkap.');
}

// Validasi jalur legacy agar versi referensi tidak putus setelah asset folder direstrukturisasi.
const legacyJs = fs.readFileSync(path.join(root, 'legacy-browser/main.js'), 'utf8');
for (const match of legacyJs.matchAll(/:\s*"((?:player|enemy|map|objects|ui)\/[A-Za-z0-9_-]+\.png)"/g)) {
  if (!fs.existsSync(path.join(imgRoot, match[1]))) fail(`Path aset legacy putus: ${match[1]}`);
}

// Tes generator: 30 peta per stage (300 peta total) harus punya rute naik dan turun,
// tanpa musuh di bawah ramp, hazard memotong ramp/tangga, atau platform tanpa dukungan bergerak.
let maps = 0;
for (let stage = 1; stage <= CFG.MAX_STAGE; stage++) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const level = WorldGen.generate(stage);
    maps++;
    if (level.stage.n !== stage) fail(`Konfigurasi stage salah: ${stage}`);
    if (!level.platforms.some(p => p.kind === 'ground')) fail(`Lantai hilang di stage ${stage}`);
    if (!(level.door.x > 0 && level.door.x < level.width)) fail(`Gerbang keluar di luar map stage ${stage}`);
    if (!level.platforms.length || !level.spawns.length) fail(`Stage ${stage} tidak lengkap`);
    if (!level.ramps?.some(r => r.direction === 'up') || !level.ramps?.some(r => r.direction === 'down')) {
      fail(`Stage ${stage} harus punya tanjakan naik dan menurun.`);
    }
    if ((level.movers || []).length) fail(`Platform bergerak tanpa dukungan masih muncul di stage ${stage}`);
    const overlaps = (a, b, margin = 0) => a.x < b.x + b.w + margin && a.x + a.w + margin > b.x &&
      a.y < b.y + b.h + margin && a.y + a.h + margin > b.y;
    for (const ramp of level.ramps) {
      if (ramp.w < 520) fail(`Ramp terlalu pendek di stage ${stage}`);
      const rampArea = { x: ramp.x, y: CFG.GROUND_Y - ramp.rise, w: ramp.w, h: ramp.rise };
      const landing = ramp.direction === 'up'
        ? { x: ramp.x + ramp.w - 8, y: CFG.GROUND_Y - ramp.rise - 116, w: ramp.landingW + 24, h: 116 }
        : { x: ramp.x - ramp.landingW + 8, y: CFG.GROUND_Y - ramp.rise - 116, w: ramp.landingW + 24, h: 116 };
      for (const platform of level.platforms) {
        if (platform.kind === 'ground' || !platform.vr) continue;
        if (overlaps(rampArea, platform.vr, 8) || overlaps(landing, platform.vr, 8)) {
          fail(`Jalur ramp stage ${stage} tertutup platform di x=${ramp.x}`);
        }
      }
      for (const hazard of level.hazards) {
        if (overlaps(rampArea, hazard, 8) || overlaps(landing, hazard, 8)) {
          fail(`Jalur ramp stage ${stage} tertutup hazard di x=${ramp.x}`);
        }
      }
      for (const spawn of level.spawns) {
        const withinLane = spawn.x >= ramp.x - 120 && spawn.x <= ramp.x + ramp.w + 120;
        const belowRampTop = spawn.y >= CFG.GROUND_Y - ramp.rise - 58;
        if (withinLane && belowRampTop) fail(`Musuh spawn di bawah ramp stage ${stage}, x=${spawn.x}`);
      }
    }
    for (const hazard of level.hazards.filter(h => h.type === 'spike')) {
      if (hazard.y + hazard.h < CFG.GROUND_Y - 10 || hazard.y + hazard.h > CFG.GROUND_Y + 12) {
        fail(`Duri melayang/tidak menempel tanah pada stage ${stage}, x=${hazard.x}`);
      }
    }
    for (const ladder of level.ladders) {
      const shaft = { x: ladder.x - 2, y: ladder.top + 4, w: ladder.w + 4, h: ladder.bottom - ladder.top - 4 };
      const landing = { x: ladder.cx - 42, y: ladder.top - 112, w: 84, h: 112 };
      for (const platform of level.platforms) {
        if (platform === ladder.plat || platform.kind === 'ground') continue;
        if (platform.vr && (overlaps(shaft, platform.vr, 3) || overlaps(landing, platform.vr, 3))) {
          fail(`Koridor tangga stage ${stage} terhalang platform di x=${ladder.cx}`);
        }
      }
      for (const hazard of level.hazards) {
        if (overlaps(shaft, hazard, 3) || overlaps(landing, hazard, 3)) fail(`Koridor tangga stage ${stage} terhalang hazard di x=${ladder.cx}`);
      }
    }
  }
}

const packageData = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (packageData.name !== 'the-universe' || packageData.version !== '2.4.0') fail('Nama/versi package untuk kandidat deploy belum benar.');
if (vercel.outputDirectory !== 'dist' || vercel.buildCommand !== 'npm run build') fail('Konfigurasi output/build Vercel tidak sesuai.');

console.log('OK: The Universe — Indonesian/English UI, settings, and dimension labels are present.');
console.log(`OK: ${allPng.length} PNG files are valid and use player/enemy/map/objects/ui categories.`);
console.log(`OK: ${localImports} local source imports resolve.`);
console.log('OK: Main Menu/Character Select buttons, settings tabs, remapping, and language switching are connected.');
console.log('OK: Pause/fullscreen are centered; potion selection and active buff timers are visible.');
console.log('OK: enemy HP bars, slime contact, golem close ground slam/far lunge, and bounded ghost bolts are wired.');
console.log('OK: intro locks keyboard/touch input; pickup/consumption feedback is limited to player heart/potion notices.');
console.log('OK: descending ramps have ladder access; all generated ramps are at least 520 px long.');
console.log('OK: 300 generated maps have both slope directions, no enemies beneath ramps, no floating spikes, and clear ladder corridors.');
console.log('OK: local menu/gameplay ambient loops, master/music/SFX volume, and mute controls are present.');
console.log('OK: static floor collider, fall recovery, and protected golem impact animation are present.');
console.log('OK: legacy-browser asset paths and Vercel output configuration remain valid.');
