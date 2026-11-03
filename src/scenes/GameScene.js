import Phaser from 'phaser';
import { CFG, getStageConfig } from '../data/config.js';
import { HEROES, SHEETS, PLATFORM_SPRITES, BLOCK_RECTS, SPIKE_SPRITES, LADDER_RECTS } from '../data/sprites.js';
import { WorldGen } from '../data/worldgen.js';
import { loadKeyBindings, normalizeKeyEvent } from '../ui/SettingsPanel.js';
import { getLanguage, t } from '../data/i18n.js';
import { playSfx, startMusic } from '../systems/AudioLibrary.js';

const W = 1280;
const H = CFG.VIEW_H;
const G = CFG.GROUND_Y;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
const hardMultiplier = difficulty => difficulty === 'hard' ? 1.18 : difficulty === 'easy' ? 0.82 : 1;

const ENEMY_DEFS = {
  // Physics bodies follow the visible silhouette, not the transparent sprite-sheet padding.
  slime: { texture: 'slime', scale: 0.27, bodyW: 54, bodyH: 46, hp: 50, damage: 8, speed: 95 },
  golem: { texture: 'golem', scale: 0.40, bodyW: 106, bodyH: 118, hp: 170, damage: 20, speed: 58 },
  ghost: { texture: 'ghost', scale: 0.22, bodyW: 50, bodyH: 62, hp: 55, damage: 14, speed: 125 }
};

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data = {}) {
    this.heroId = data.heroId || this.registry.get('selectedHero') || 'knightess';
    const availableSkins = HEROES[this.heroId]?.skins?.map(skin => skin.id) || ['default'];
    const requestedSkin = data.skinId || this.registry.get('selectedSkin') || 'default';
    this.skinId = availableSkins.includes(requestedSkin) ? requestedSkin : (availableSkins[0] || 'default');
    this.difficulty = data.difficulty || this.registry.get('difficulty') || 'normal';
    this.language = data.language || getLanguage(this.registry);
    this.registry.set('language', this.language);
    this.keyBindings = { ...loadKeyBindings(), ...(this.registry.get('keyBindings') || {}) };
    this.graphicsQuality = this.registry.get('graphicsQuality') || 'medium';
    this.stageNumber = clamp(Number(data.stage || 1), 1, CFG.MAX_STAGE);
    this.startHp = data.hp ?? 100;
    this.runStats = { damageDone: 0, damageTaken: 0, startedAt: 0 };
    this.touchState = { left: false, right: false, up: false, jump: false, down: false, attack: false, potion: false };
    this.potionInventory = Array.isArray(data.potions) ? [...data.potions] : [];
    this.selectedPotionType = this.potionInventory[0] || 'hp';
    this.buffTimers = { atk: 0, spd: 0 };
    this.playerInvulnerableUntil = 0;
    this.attackUntil = 0;
    this.attackHit = new Set();
    this.gameMode = 'intro';
    this.entrySequenceReleased = false;
    this.onRamp = false;
    this.exitStarted = false;
    this.lastLadderExit = null;
    this.lastLadderExitEnd = null;
    this.playerClimbing = false;
    this.stageResultEmitted = false;
    this.timeAliveMs = 0;
    this.lastDamageTime = 0;
    this.ghostBolts = [];
    this.ghostBoltFx = null;
  }

  create() {
    this.level = WorldGen.generate(this.stageNumber);
    startMusic(this, 'gameplay_theme', { volume: 0.72, fadeMs: 700 });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearAllGhostBolts();
    });
    this.stageConfig = getStageConfig(this.stageNumber);
    this.physics.world.setBounds(0, 0, this.level.width, H + 320);
    this.cameras.main.setBounds(0, 0, this.level.width, H);
    this.createBackground();
    this.createWorld();
    this.createPortals();
    this.createPlayer();
    this.startEntrySequence();
    this.createEnemies();
    this.createPickups();
    this.createChests();
    this.setupInput();

    this.cameraOffset = 0;
    this.cameras.main.startFollow(this.player, true, 0.09, 0.08, -150, 25);
    this.cameras.main.setDeadzone(420, 260);
    this.runStats.startedAt = this.time.now;
    this.player.setAlpha(0.35);

    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene');
    this.scene.bringToTop('UIScene');
    this.events.emit('stagechange', { stage: this.stageNumber, maxStage: CFG.MAX_STAGE, difficulty: this.difficulty });
  }

  createBackground() {
    // Palet latar berubah per kelompok dimensi agar perjalanan terasa berpindah dunia
    // walaupun fondasi dungeon dan aset utama tetap dipakai bersama.
    const palette = this.stageNumber <= 3
      ? { tint: 0x8da9c6, shade: 0x06101b, alpha: 0.18 }
      : this.stageNumber <= 7
        ? { tint: 0xb98a6b, shade: 0x241007, alpha: 0.24 }
        : { tint: 0xa49bd6, shade: 0x110b2b, alpha: 0.24 };
    this.background = this.add.tileSprite(0, 0, W, H, 'bg_dungeon')
      .setOrigin(0).setScrollFactor(0).setDepth(-100).setTint(palette.tint);
    this.background.setTileScale(W / 2752, H / 1536);
    this.add.rectangle(W / 2, H / 2, W, H, palette.shade, palette.alpha)
      .setScrollFactor(0).setDepth(-99);
  }

  createWorld() {
    const levelWidth = this.level.width;
    this.add.rectangle(levelWidth / 2, G + 120, levelWidth, 260, 0x040a11, 1).setOrigin(0.5).setDepth(1);
    this.road = this.add.tileSprite(0, G - 38, levelWidth, 220, 'road_ground')
      .setOrigin(0, 0).setTileScale(0.5, 0.5).setDepth(5);

    this.staticPlatforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({ allowGravity: false, immovable: true });
    this.hazardZones = this.physics.add.staticGroup();
    this.torchGlows = [];

    // Platform ditampilkan menggunakan sprite batu sungguhan. Setiap platform
    // tinggi diberi pilar batu di titik tumpu yang mencapai lantai/platform bawah.
    for (const platform of this.level.platforms) {
      if (platform.kind === 'ground') continue;
      const x = platform.x + (platform.dx || 0);
      const surfaceY = platform.y - (platform.surfOff || 0);
      const drawH = Math.max(42, platform.drawH || 54);
      const texture = platform.kind === 'block' ? `block_${platform.spr}` : `platform_${platform.spr ?? 0}`;
      const visual = this.add.image(x + platform.dw / 2, surfaceY + drawH / 2, texture)
        .setDisplaySize(platform.dw, drawH).setDepth(16);
      platform._visual = visual;

      if (surfaceY < G - 24) {
        const edgeInset = Math.min(28, platform.dw * 0.14);
        const supportXs = [x + edgeInset, ...(platform.dw > 250 ? [x + platform.dw / 2] : []), x + platform.dw - edgeInset];
        for (const supportX of supportXs) {
          const lowerSurfaces = this.level.platforms
            .filter(other => other !== platform && other.kind !== 'ground' &&
              supportX >= other.x + 10 && supportX <= other.x + other.w - 10)
            .map(other => other.y - (other.surfOff || 0))
            .filter(otherSurface => otherSurface > surfaceY + drawH * 0.55 + 10);
          const supportBottom = Math.min(G, ...(lowerSurfaces.length ? lowerSurfaces : [G]));
          const supportTop = surfaceY + Math.max(22, drawH * 0.60);
          const supportH = supportBottom - supportTop;
          if (supportH >= 12) {
            this.add.tileSprite(supportX, supportTop + supportH / 2, 38, supportH, 'wall_7')
              .setTileScale(0.42, 0.42).setDepth(14).setAlpha(0.98);
            this.add.image(supportX, supportBottom - 7, 'block_0')
              .setDisplaySize(48, 26).setDepth(15).setAlpha(0.98);
          }
        }
      }

      // Collider mengikuti garis permukaan visual (termasuk surfOff sprite).
      const collider = this.add.zone(platform.x + platform.w / 2, surfaceY + 7, platform.w, 14);
      this.physics.add.existing(collider, true);
      this.staticPlatforms.add(collider);
    }

    // Lantai utama menggunakan StaticImage dengan texture solid khusus.
    // StaticImage + refreshBody lebih konsisten untuk Arcade Physics daripada
    // Rectangle/Zone besar, terutama setelah canvas di-scale dan kamera bergerak.
    if (!this.textures.exists('__the_universe_ground')) {
      const groundTexture = this.make.graphics({ x: 0, y: 0, add: false });
      groundTexture.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 8);
      groundTexture.generateTexture('__the_universe_ground', 8, 8);
      groundTexture.destroy();
    }
    this.groundCollider = this.physics.add.staticImage(levelWidth / 2, G + 12, '__the_universe_ground');
    this.groundCollider.setOrigin(0.5, 0.5).setDisplaySize(levelWidth + 3200, 24);
    this.groundCollider.refreshBody();
    this.groundCollider.setVisible(false);

    // Permukaan miring diikuti player dengan mode grounded khusus, bukan snap vertikal
    // setiap frame yang menyebabkan karakter bergetar saat menanjak.
    this.rampLandingZones = [];
    this.rampAccessLadders = [];
    for (const ramp of (this.level.ramps || [])) {
      const isDescending = ramp.direction === 'down';
      this.add.image(ramp.x + ramp.w / 2, G, 'slope_ground')
        .setOrigin(0.5, 1).setDisplaySize(ramp.w, ramp.h).setFlipX(!isDescending).setDepth(15);
      const landingX = isDescending
        ? ramp.x - ramp.landingW / 2 + 8
        : ramp.x + ramp.w + ramp.landingW / 2 - 8;
      this.add.image(landingX, G - ramp.rise, 'platform_0')
        .setOrigin(0.5, 0).setDisplaySize(ramp.landingW + 16, 62).setDepth(16);
      // Landing batu pada ujung slope tidak dibiarkan menggantung: tambahkan dua pilar
      // yang mencapai lantai atau permukaan platform terdekat di bawahnya.
      const landingSurfaceY = G - ramp.rise;
      for (const supportX of [landingX - ramp.landingW * 0.36, landingX + ramp.landingW * 0.36]) {
        const lower = this.level.platforms
          .filter(other => other.kind !== 'ground' && supportX >= other.x + 8 && supportX <= other.x + other.w - 8)
          .map(other => other.y - (other.surfOff || 0))
          .filter(y => y > landingSurfaceY + 36);
        const supportBottom = Math.min(G, ...(lower.length ? lower : [G]));
        const supportTop = landingSurfaceY + 46;
        const supportH = supportBottom - supportTop;
        if (supportH > 12) {
          this.add.tileSprite(supportX, supportTop + supportH / 2, 36, supportH, 'wall_7')
            .setTileScale(0.42, 0.42).setDepth(14);
          this.add.image(supportX, supportBottom - 7, 'block_0')
            .setDisplaySize(46, 24).setDepth(15);
        }
      }
      const landing = this.add.zone(landingX, G - ramp.rise + 7, ramp.landingW, 14);
      this.physics.add.existing(landing, true);
      this.staticPlatforms.add(landing);
      this.rampLandingZones.push({ x: landingX - ramp.landingW / 2, w: ramp.landingW, y: G - ramp.rise, direction: ramp.direction });
      if (isDescending) {
        // Landing sisi tinggi pada lereng turun harus dapat dicapai dari tanah.
        // Tangga akses ditempatkan di tepi kiri landing, tidak memotong bidang slope.
        const cx = landingX - ramp.landingW / 2 + 28;
        const ladder = {
          cx, x: cx - 18, w: 36, top: G - ramp.rise, bottom: G,
          n: Math.max(1, Math.round(ramp.rise / 110)),
          pieceH: ramp.rise / Math.max(1, Math.round(ramp.rise / 110)),
          variant: 0, rampAccess: true
        };
        this.rampAccessLadders.push(ladder);
        const ladderSource = LADDER_RECTS[ladder.variant] || LADDER_RECTS[0];
        for (let i = 0; i < ladder.n; i++) {
          this.add.image(ladder.cx, ladder.top + i * ladder.pieceH + ladder.pieceH / 2, `ladder_${ladder.variant}`)
            .setDisplaySize(Math.min(42, ladder.pieceH * ladderSource.sw / ladderSource.sh), ladder.pieceH + 2)
            .setDepth(13).setAlpha(0.92);
        }
      }
    }

    for (const hazard of this.level.hazards) {
      const isSpike = hazard.type === 'spike';
      const key = `${isSpike ? 'spike' : 'icicle'}_${hazard.variant}`;
      if (!isSpike) {
        // Icicle selalu diberi dudukan logam dan rantai yang menyambung ke plafon.
        const anchorY = hazard.anchorY ?? 74;
        const cx = hazard.x + hazard.w / 2;
        const chain = this.add.graphics().setDepth(12);
        chain.lineStyle(5, 0x171d25, 0.98).lineBetween(cx, anchorY + 8, cx, hazard.y - 3);
        chain.lineStyle(2, 0x87929c, 0.9).lineBetween(cx, anchorY + 8, cx, hazard.y - 3);
        for (let linkY = anchorY + 14; linkY < hazard.y - 5; linkY += 18) {
          chain.strokeEllipse(cx + (Math.floor(linkY / 18) % 2 ? 1 : -1), linkY, 7, 12);
        }
        this.add.rectangle(cx, anchorY + 3, Math.max(42, hazard.w * 0.72), 12, 0x3b444d, 1)
          .setStrokeStyle(2, 0x9aa5aa, 1).setDepth(13);
        this.add.circle(cx - hazard.w * 0.30, anchorY + 3, 3, 0xe1bd69, 1).setDepth(14);
        this.add.circle(cx + hazard.w * 0.30, anchorY + 3, 3, 0xe1bd69, 1).setDepth(14);
      }
      this.add.image(hazard.x + hazard.w / 2, hazard.y + hazard.h / 2, key)
        .setDisplaySize(hazard.w, hazard.h).setDepth(isSpike ? 18 : 14);
      const hit = hazard.hit || hazard;
      const zone = this.add.zone(hit.x + hit.w / 2, hit.y + hit.h / 2, hit.w, hit.h);
      this.physics.add.existing(zone, true);
      this.hazardZones.add(zone);
    }

    for (const ladder of this.level.ladders) {
      const source = LADDER_RECTS[ladder.variant] || LADDER_RECTS[0];
      const segmentH = ladder.pieceH;
      for (let i = 0; i < ladder.n; i++) {
        this.add.image(ladder.cx, ladder.top + i * segmentH + segmentH / 2, `ladder_${ladder.variant}`)
          .setDisplaySize(Math.min(42, segmentH * source.sw / source.sh), segmentH + 2).setDepth(13).setAlpha(0.88);
      }
    }

    for (const torch of this.level.torches) {
      const y = torch.kind === 'wall' ? torch.y - 22 : G - 34;
      const glow = this.add.circle(torch.x, y - 16, 32, 0xffa642, 0.10).setDepth(10);
      this.torchGlows.push(glow);
      this.tweens.add({ targets: glow, alpha: { from: 0.06, to: 0.18 }, scale: { from: 0.86, to: 1.12 },
        duration: 680 + Math.random() * 400, yoyo: true, repeat: -1 });
      this.add.circle(torch.x, y, 5, 0xffd36f, 0.88).setDepth(11);
    }
    this.setGraphicsQuality(this.graphicsQuality);
  }

  createPortals() {
    // Portal masuk hanya aktif selama intro. Setelah karakter keluar, portal menutup
    // lalu disembunyikan sehingga tidak terus berdiri di belakang player.
    this.entryPortal = this.add.sprite(132, G, 'portalSheet', 0).setOrigin(0.5, 1)
      .setDisplaySize(170, 253).setDepth(22).setVisible(false);
    this.entryPortal.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_animation, frame) => {
      this.alignPortalToGround(this.entryPortal, frame.index);
    });

    const exitX = this.level.door.x + this.level.door.w / 2;
    this.exitX = exitX;
    this.exitRevealX = exitX - 720;
    this.exitPortal = this.add.sprite(exitX, G, 'portalSheet', 8).setOrigin(0.5, 1)
      .setDisplaySize(188, 280).setDepth(22).setVisible(false);
    this.exitPortal.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_animation, frame) => {
      this.alignPortalToGround(this.exitPortal, frame.index);
    });
    this.exitLabel = this.add.text(exitX, G - 292, t('exit', this.language), {
      fontFamily: 'Consolas, monospace', fontSize: '13px', color: '#ffe6a0',
      stroke: '#07111d', strokeThickness: 4, fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(23).setVisible(false);
    this.exitPortalReady = false;
  }

  startEntrySequence() {
    const portal = this.entryPortal;
    const player = this.player;
    player.setPosition(132, G).setAlpha(0.24);
    player.setVelocity(0, 0);
    player.body.moves = false;
    player.body.allowGravity = false;
    player.body.checkCollision.none = true;
    this.gameMode = 'intro';
    this.entrySequenceReleased = false;
    Object.keys(this.touchState || {}).forEach(key => { this.touchState[key] = false; });

    const release = () => this.releaseEntrySequence();
    // Failsafe mencegah stage terkunci jika animasi aset gagal memancarkan completion.
    this.time.delayedCall(5200, release);
    this.time.delayedCall(180, () => {
      if (!portal?.active || !player?.active || this.entrySequenceReleased) return;
      portal.setVisible(true).setFrame(0).play('portal-open');
      playSfx(this, 'portal_open', { volume: 0.38 });
      portal.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (!portal.active || !player.active || this.entrySequenceReleased) return;
        portal.play('portal-active');
        this.tweens.add({
          targets: player, x: 244, alpha: 1, duration: 960, ease: 'Sine.easeOut',
          onComplete: () => {
            if (!portal.active || this.entrySequenceReleased) return;
            portal.play('portal-close');
            portal.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
              portal.setVisible(false);
              release();
            });
          }
        });
      });
    });
  }

  releaseEntrySequence() {
    if (this.entrySequenceReleased || !this.player?.active) return;
    this.entrySequenceReleased = true;
    Object.keys(this.touchState || {}).forEach(key => { this.touchState[key] = false; });
    for (const key of Object.values(this.keys || {})) key?.reset?.();
    this.tweens.killTweensOf(this.player);
    this.entryPortal?.stop();
    this.entryPortal?.setVisible(false);
    this.player.setAlpha(1);
    // UIScene menutup overlay intro terlebih dahulu; kontrol baru dilepas sesudahnya.
    this.events.emit('introcomplete');
    this.time.delayedCall(180, () => this.enablePlayerControl());
  }

  enablePlayerControl() {
    if (!this.entrySequenceReleased || this.gameMode !== 'intro' || !this.player?.active) return;
    const body = this.player.body;
    body.moves = true;
    body.allowGravity = true;
    body.checkCollision.none = false;
    body.updateFromGameObject();
    body.setVelocity(0, 0);
    this.player.setAlpha(1);
    this.gameMode = 'playing';
  }

  // Portal spritesheet mempunyai padding transparan yang berbeda pada tiap baris.
  // Geser anchor berdasarkan batas alpha frame agar kaki portal selalu menyentuh lantai.
  alignPortalToGround(portal, frameIndex) {
    if (!portal) return;
    const row = Math.floor(frameIndex / 8);
    const col = frameIndex % 8;
    const visibleBottomByRow = [
      [446, 446, 446, 446, 446, 446, 446, 446],
      [475, 475, 482, 476, 476, 476, 477, 475],
      [505, 505, 505, 506, 507, 505, 505, 505]
    ];
    const visibleBottom = visibleBottomByRow[row]?.[col] ?? 475;
    const sourceHeight = 512;
    const displayScaleY = portal.displayHeight / sourceHeight;
    portal.y = G + (sourceHeight - visibleBottom) * displayScaleY;
  }

  transitionToStage(data) {
    // ScenePlugin memproses operasi secara berurutan: hentikan UI, lalu restart
    // GameScene dengan data stage berikutnya. UIScene akan dibuat ulang dari awal.
    this.registry.set('selectedHero', data.heroId || this.heroId);
    this.registry.set('selectedSkin', data.skinId || this.skinId);
    this.registry.set('difficulty', data.difficulty || this.difficulty);
    this.registry.set('language', data.language || this.language);
    this.scene.stop('UIScene');
    this.scene.restart(data);
  }

  transitionToMainMenu() {
    this.registry.set('selectedHero', this.heroId);
    this.registry.set('selectedSkin', this.skinId);
    this.registry.set('difficulty', this.difficulty);
    this.scene.stop('UIScene');
    this.scene.start('MainMenuScene');
  }

  applyKeyBindings(bindings = {}) {
    const validActions = ['left', 'right', 'jump', 'attack', 'interact', 'potion', 'climb', 'down', 'pause', 'fullscreen'];
    this.keyBindings = { ...this.keyBindings, ...bindings };
    this.registry.set('keyBindings', { ...this.keyBindings });
    try { globalThis.localStorage?.setItem('rs_keybinds', JSON.stringify(this.keyBindings)); } catch { /* storage opsional */ }
    const keyboard = this.input?.keyboard;
    if (!keyboard || !this.keys) return;
    const keyCodes = Phaser.Input.Keyboard.KeyCodes;
    const specialCodes = { SPACE: 32, ESC: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACKSPACE: 8, TAB: 9, SHIFT: 16, CTRL: 17, ALT: 18 };
    const toCode = name => keyCodes[name] ?? specialCodes[name] ?? (String(name).length === 1 ? String(name).toUpperCase().charCodeAt(0) : name);
    for (const action of validActions) {
      if (this.keys[action]) keyboard.removeKey(this.keys[action]);
      this.keys[action] = keyboard.addKey(toCode(this.keyBindings[action]));
    }
  }

  configureEnemyDifficulty(enemy, difficulty = this.difficulty, keepHealth = true) {
    const tuning = {
      easy:   { hp: 0.88, damage: 0.76, speed: 0.80, chase: 0.96, alert: 560, cooldown: 1.24 },
      normal: { hp: 1.00, damage: 1.00, speed: 1.00, chase: 1.00, alert: 380, cooldown: 1.00 },
      hard:   { hp: 1.22, damage: 1.30, speed: 1.42, chase: 1.08, alert: 220, cooldown: 0.72 }
    }[difficulty] || null;
    if (!tuning) return;
    const previousRatio = keepHealth && enemy.maxHp ? Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1) : 1;
    enemy.maxHp = Math.max(1, Math.round(enemy.baseMaxHp * tuning.hp));
    enemy.hp = Math.max(1, Math.round(enemy.maxHp * previousRatio));
    enemy.damage = Math.max(1, Math.round(enemy.baseDamage * tuning.damage));
    enemy.speed = enemy.baseSpeed * tuning.speed;
    enemy.detectRange = Math.round(enemy.rangeByDifficulty.detect[difficulty]);
    enemy.chaseRange = Math.round(enemy.rangeByDifficulty.chase[difficulty] * tuning.chase);
    enemy.alertMs = tuning.alert;
    enemy.attackCooldownScale = tuning.cooldown;
    enemy.difficulty = difficulty;
  }

  setLanguage(language) {
    if (!['id', 'en'].includes(language)) return false;
    this.language = language;
    this.registry.set('language', language);
    if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = language;
    try { globalThis.localStorage?.setItem('tu_language', language); } catch { /* storage opsional */ }
    this.exitLabel?.setText(t('exit', language));
    return true;
  }

  setDifficulty(difficulty) {
    if (!['easy', 'normal', 'hard'].includes(difficulty)) return false;
    if (this.difficulty === difficulty) return true;
    this.difficulty = difficulty;
    this.registry.set('difficulty', difficulty);
    try { globalThis.localStorage?.setItem('rs_difficulty', difficulty); } catch { /* storage opsional */ }
    for (const enemy of this.enemies || []) {
      if (!enemy.dead) this.configureEnemyDifficulty(enemy, difficulty, true);
    }
    this.events.emit('stagechange', { stage: this.stageNumber, maxStage: CFG.MAX_STAGE, difficulty });
    return true;
  }

  setGraphicsQuality(quality) {
    if (!['low', 'medium', 'high'].includes(quality)) quality = 'medium';
    this.graphicsQuality = quality;
    this.registry.set('graphicsQuality', quality);
    try { globalThis.localStorage?.setItem('rs_quality', quality); } catch { /* storage opsional */ }
    const glowVisible = quality !== 'low';
    for (const glow of this.torchGlows || []) glow.setVisible(glowVisible);
    this.particleBudget = quality === 'low' ? 4 : quality === 'high' ? 14 : 8;
    return true;
  }

  createPlayer() {
    const hero = HEROES[this.heroId] || HEROES.knightess;
    const startX = 132;
    this.player = this.physics.add.sprite(startX, G, hero.sheet, 0).setOrigin(0.5, 1)
      .setScale(hero.scale).setDepth(35);
    const frame = SHEETS[hero.sheet];
    const bodyW = Math.round(34 / hero.scale);
    const bodyH = Math.round(88 / hero.scale);
    this.player.body.setSize(bodyW, bodyH);
    this.player.body.setOffset(Math.round((frame.cw - bodyW) / 2), Math.round(frame.ch - bodyH));
    this.player.body.setMaxVelocity(360, 1100);
    this.player.body.setCollideWorldBounds(true);
    this.player.body.setDragX(1800);
    this.player.body.moves = false;
    this.player.setData('hp', this.startHp);
    this.player.setData('maxHp', 100);
    this.player.setData('damage', hero.damage);
    this.player.setData('speed', hero.speed * 60);
    this.player.setData('facing', 1);
    this.player.setData('heroId', this.heroId);
    this.player.setData('skinId', this.skinId);
    this.physics.add.collider(this.player, this.staticPlatforms);
    this.physics.add.collider(this.player, this.groundCollider);
    this.physics.add.collider(this.player, this.movingPlatforms);
    this.physics.add.overlap(this.player, this.hazardZones, () => this.damagePlayer(14));
    this.player.play(`${hero.sheet}-idle`);
  }

  createEnemies() {
    this.enemies = [];
    this.ghostBolts = this.ghostBolts || [];
    this.ghostBoltFx = null;
    this.groundEnemies = this.physics.add.group({ allowGravity: true });
    this.flyingEnemies = this.physics.add.group({ allowGravity: false });

    for (const spawn of this.level.spawns) {
      const def = ENEMY_DEFS[spawn.type] || ENEMY_DEFS.slime;
      const isGhost = spawn.type === 'ghost';
      const sheetMeta = SHEETS[def.texture];
      const foot = sheetMeta?.foot ?? sheetMeta?.ch ?? 384;
      const originY = isGhost ? 0.5 : foot / (sheetMeta?.ch || 384);
      const sprite = this.physics.add.sprite(spawn.x, isGhost ? spawn.y - 70 : spawn.y, def.texture, 0)
        .setOrigin(0.5, originY).setScale(def.scale).setDepth(29);
      const width = Math.round(def.bodyW / def.scale);
      const height = Math.round(def.bodyH / def.scale);
      sprite.body.setSize(width, height);
      sprite.body.setOffset(Math.round(((sheetMeta?.cw || 344) - width) / 2),
        isGhost ? Math.round(((sheetMeta?.ch || 384) - height) / 2) : Math.round(foot - height));
      sprite.body.setMaxVelocity(spawn.type === 'golem' ? 480 : 300, 1100);
      sprite.body.setCollideWorldBounds(true);
      if (isGhost) sprite.body.setAllowGravity(false);
      if (isGhost) this.flyingEnemies.add(sprite); else this.groundEnemies.add(sprite);
      const stageFactor = 1 + (this.stageNumber - 1) * 0.07;
      const ranges = {
        slime: { detect: { easy: 430, normal: 560, hard: 720 }, chase: { easy: 620, normal: 790, hard: 1040 } },
        golem: { detect: { easy: 650, normal: 850, hard: 1080 }, chase: { easy: 930, normal: 1190, hard: 1510 } },
        ghost: { detect: { easy: 820, normal: 1060, hard: 1320 }, chase: { easy: 1160, normal: 1480, hard: 1840 } }
      }[spawn.type];
      const enemy = {
        sprite, type: spawn.type,
        baseMaxHp: def.hp * stageFactor,
        baseDamage: def.damage * stageFactor,
        baseSpeed: def.speed,
        rangeByDifficulty: ranges,
        minX: spawn.minX ?? spawn.x - 240,
        maxX: spawn.maxX ?? spawn.x + 240,
        facing: Math.random() < 0.5 ? -1 : 1,
        attackAt: this.time.now,
        nextAttackAt: this.time.now + Phaser.Math.Between(900, 1800),
        state: 'patrol', stateUntil: 0, hitUntil: 0, dead: false,
        slamDone: false, aimGraphic: null, aimMarker: null, bolt: null, leapStartedAt: 0, leapDir: 1,
        hpBar: this.add.graphics().setDepth(50), hpBarWidth: Math.max(44, def.bodyW + 8)
      };
      this.configureEnemyDifficulty(enemy, this.difficulty, false);
      sprite.play(`${spawn.type}-idle`);
      this.enemies.push(enemy);
    }
    this.physics.add.collider(this.groundEnemies, this.staticPlatforms);
    this.physics.add.collider(this.groundEnemies, this.groundCollider);
    this.physics.add.collider(this.groundEnemies, this.movingPlatforms);
  }

  createPickups() {
    this.pickups = [];
    for (const pickup of this.level.pickups) {
      if (pickup.kind === 'heart') {
        const sprite = this.add.image(pickup.x, pickup.y, 'hp_heart').setDisplaySize(25, 24).setDepth(27);
        this.pickups.push({ type: 'heart', sprite, baseY: sprite.y, bob: Math.random() * 6, taken: false });
      }
    }
  }

  createChests() {
    this.chests = this.level.chests.map(chest => ({
      data: chest,
      sprite: this.add.image(chest.x, chest.y - 36, 'chest_0').setDisplaySize(72, 72).setDepth(28),
      opened: false
    }));
  }

  setupInput() {
    const keyboard = this.input.keyboard;
    const keyCodes = Phaser.Input.Keyboard.KeyCodes;
    const specialCodes = { SPACE: 32, ESC: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACKSPACE: 8, TAB: 9, SHIFT: 16, CTRL: 17, ALT: 18 };
    const toCode = name => keyCodes[name] ?? specialCodes[name] ?? (String(name).length === 1 ? String(name).toUpperCase().charCodeAt(0) : name);
    this.keys = {};
    for (const action of ['left', 'right', 'jump', 'attack', 'interact', 'potion', 'climb', 'down', 'pause', 'fullscreen']) {
      this.keys[action] = keyboard.addKey(toCode(this.keyBindings[action]));
    }
    // Panah dan Enter tetap tersedia sebagai tombol alternatif selain mapping utama.
    this.keys.leftArrow = keyboard.addKey(keyCodes.LEFT);
    this.keys.rightArrow = keyboard.addKey(keyCodes.RIGHT);
    this.keys.upArrow = keyboard.addKey(keyCodes.UP);
    this.keys.downArrow = keyboard.addKey(keyCodes.DOWN);
    this.keys.enterAlias = keyboard.addKey(keyCodes.ENTER);

    this.keyHandlers = {
      any: event => {
        if (this.gameMode !== 'playing') return;
        const key = normalizeKeyEvent(event);
        const b = this.keyBindings;
        if (key === b.jump) this.jump();
        else if (key === b.climb) { if (!this.tryClimb(-1)) this.jump(); }
        else if (key === b.down) this.tryClimb(1);
        else if (key === b.attack || key === 'ENTER') this.beginAttack();
        else if (key === b.interact) this.openNearbyChest();
        else if (key === b.potion) this.consumePotion();
        else if (key === b.fullscreen) this.events.emit('fullscreen-request');
      }
    };
    keyboard.on('keydown', this.keyHandlers.any);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupInput, this);
  }

  cleanupInput() {
    const keyboard = this.input?.keyboard;
    if (!keyboard || !this.keyHandlers) return;
    keyboard.off('keydown', this.keyHandlers.any);
    this.keyHandlers = null;
  }

  update(time, delta) {
    if (!this.player || !this.player.active) return;
    this.background.tilePositionX = this.cameras.main.scrollX * 0.20;
    this.updateMovingPlatforms(time);

    // Watchdog lantai berjalan sebelum early return agar player tetap dipulihkan
    // jika state intro/pause mengunci input ketika collider gagal pada tepi lereng.
    if (!['exiting', 'stageclear', 'gameover'].includes(this.gameMode) && this.player.y > G + 56) {
      this.recoverPlayerToGround();
    }

    // Intro portal dan exit animation tidak boleh dihajar AI saat player belum
    // bisa mengontrol karakter / sedang masuk portal. Timer run dimulai saat bermain.
    if (this.gameMode === 'intro') {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.gameMode !== 'playing') return;

    this.timeAliveMs += delta;
    this.updateBuffTimers(delta);
    this.updateEnemies(time, delta);
    this.updateGhostProjectiles(delta);
    this.updatePickups(time);
    this.updatePlayer(time);
    this.updateExit();

    if (this.player.y > G + 56 || this.player.body.bottom > G + 46) this.recoverPlayerToGround();
  }

  recoverPlayerToGround() {
    const player = this.player;
    if (!player?.active || !player.body) return;
    const x = clamp(player.x, 36, Math.max(36, (this.level?.width || W) - 36));
    player.setPosition(x, G - 1);
    const body = player.body;
    body.updateFromGameObject();
    body.setVelocity(0, 0);
    body.moves = this.gameMode === 'playing';
    body.enable = true;
    body.allowGravity = true;
    body.checkCollision.none = false;
    this.playerClimbing = false;
    this.playerClimbDirection = 0;
    this.onRamp = false;
    this.lastLadderExit = null;
    this.lastLadderExitEnd = null;
    if (this.gameMode === 'playing') this.playerInvulnerableUntil = Math.max(this.playerInvulnerableUntil, this.time.now + 500);
  }

  updateMovingPlatforms(time) {
    for (const platform of this.level.movers) {
      const y = platform.baseY + Math.sin(time / platform.period * Math.PI * 2 + platform.phase) * platform.amp;
      if (platform._bodyObject) platform._bodyObject.setPosition(platform.x + platform.w / 2, y + 7);
      if (platform._visual) platform._visual.y = y - 6;
    }
  }

  updateBuffTimers(delta) {
    this.buffTimers.atk = Math.max(0, this.buffTimers.atk - delta);
    this.buffTimers.spd = Math.max(0, this.buffTimers.spd - delta);
  }

  tryClimb(direction) {
    if (this.gameMode !== 'playing' || !this.player) return false;
    const px = this.player.x;
    const feet = this.player.y;
    const availableLadders = [...(this.level.ladders || []), ...(this.rampAccessLadders || [])];
    const ladder = availableLadders.find(item =>
      !(this.lastLadderExit === item &&
        ((direction < 0 && this.lastLadderExitEnd === 'top' && feet <= item.top + 6) ||
         (direction > 0 && this.lastLadderExitEnd === 'bottom' && feet >= item.bottom - 6))) &&
      Math.abs(item.cx - px) < 42 && feet <= item.bottom + 12 && feet >= item.top - 50
    );
    if (!ladder) return false;
    this.player.x = Phaser.Math.Linear(this.player.x, ladder.cx, 0.28);
    const enteringClimb = !this.playerClimbing || this.playerClimbDirection !== direction;
    this.playerClimbing = true;
    this.playerClimbDirection = direction;
    this.player.body.allowGravity = false;
    // Collision AABB dimatikan hanya selama benar-benar memanjat. Generator
    // juga menjaga koridor tangga tetap bersih dari batu/platform lain.
    this.player.body.checkCollision.none = true;
    this.player.setVelocity(0, direction * 215);
    this.player.y = clamp(this.player.y, ladder.top - 18, ladder.bottom);
    if (direction < 0 && this.player.y <= ladder.top - 14) {
      this.lastLadderExit = ladder;
      this.lastLadderExitEnd = 'top';
      this.finishClimb(ladder.top - 2);
    }
    if (direction > 0 && this.player.y >= ladder.bottom - 2) {
      this.lastLadderExit = ladder;
      this.lastLadderExitEnd = 'bottom';
      this.finishClimb(ladder.bottom - 1);
    }
    return true;
  }

  finishClimb(footY = this.player?.y) {
    if (!this.player?.body) return;
    this.playerClimbing = false;
    this.playerClimbDirection = 0;
    this.player.body.checkCollision.none = false;
    this.player.body.allowGravity = true;
    this.player.setVelocity(0, 0);
    // Atur anchor sprite (origin bawah); biarkan Arcade Physics menyinkronkan
    // offset body pada langkah fisika berikutnya agar tidak tersangkut di batu.
    this.player.y = footY;
  }

  applyRampSurface(direction = 0) {
    const player = this.player;
    if (!player?.body) return;
    const centerX = player.body.center.x;
    const ramp = (this.level.ramps || []).find(item => centerX >= item.x - 4 && centerX <= item.x + item.w + 4);
    if (!ramp) {
      if (this.onRamp) {
        this.onRamp = false;
        player.body.allowGravity = true;
        player.body.setVelocityY(0);
        player.body.updateFromGameObject();
      }
      return;
    }
    const t = Phaser.Math.Clamp((centerX - ramp.x) / ramp.w, 0, 1);
    const descending = ramp.direction === 'down';
    const surfaceY = descending ? G - ramp.rise + t * ramp.rise : G - t * ramp.rise;
    const startY = descending ? G - ramp.rise : G;
    const endY = descending ? G : G - ramp.rise;
    const wasOnRamp = this.onRamp;
    const feetY = player.body.bottom;
    const movingUpward = player.body.velocity.y < -80;
    const grounded = player.body.velocity.y >= -30 || player.body.blocked.down || player.body.touching.down;
    const nearSurface = feetY >= surfaceY - 34 && feetY <= surfaceY + 30;
    const enteringAtEnd =
      (Math.abs(centerX - ramp.x) < 28 && Math.abs(feetY - startY) < 40) ||
      (Math.abs(centerX - (ramp.x + ramp.w)) < 28 && Math.abs(feetY - endY) < 40);
    if (!wasOnRamp && !(grounded && (nearSurface || enteringAtEnd))) return;
    this.onRamp = true;
    player.body.allowGravity = false;
    if (!wasOnRamp) {
      player.setY(surfaceY);
      player.body.updateFromGameObject();
    }
    const gradient = (descending ? ramp.rise : -ramp.rise) / Math.max(1, ramp.w);
    player.body.setVelocityY(gradient * player.body.velocity.x);
    player.body.blocked.down = true;
    player.body.touching.down = true;
  }

  updatePlayer(time) {
    if (this.gameMode === 'intro') {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.gameMode !== 'playing') return;

    const left = this.keys.left.isDown || this.keys.leftArrow.isDown || this.touchState.left;
    const right = this.keys.right.isDown || this.keys.rightArrow.isDown || this.touchState.right;
    const direction = (left ? -1 : 0) + (right ? 1 : 0);
    const baseSpeed = this.player.getData('speed') || 300;
    const speed = baseSpeed * (this.buffTimers.spd > 0 ? 1.35 : 1);
    const vertical = (this.keys.climb.isDown || this.keys.upArrow.isDown || this.touchState.up) ? -1 :
      (this.keys.down.isDown || this.keys.downArrow.isDown || this.touchState.down) ? 1 : 0;
    if (vertical !== 0 && this.tryClimb(vertical)) {
      this.player.setFlipX((this.player.getData('facing') || 1) < 0);
      this.playHeroAnimation('run');
      return;
    }
    if (this.playerClimbing || this.player.body.checkCollision.none) {
      // Gravity hanya dimatikan ketika memanjat tangga; mode tanjakan punya
      // pengendali permukaan sendiri dan tidak boleh diputus setiap frame.
      this.finishClimb(this.player.y);
    }

    if (direction !== 0) {
      this.lastLadderExit = null;
      this.lastLadderExitEnd = null;
      this.player.setVelocityX(direction * speed);
      this.player.setData('facing', direction);
      this.player.setFlipX(direction < 0);
      if (this.time.now > this.attackUntil) this.playHeroAnimation('run');
    } else {
      this.player.setVelocityX(0);
      if (this.time.now > this.attackUntil && (this.player.body.blocked.down || this.onRamp)) this.playHeroAnimation('idle');
    }

    if (this.player.body.blocked.down === false && !this.onRamp && this.time.now > this.attackUntil) this.playHeroAnimation('jump');

    if (this.time.now < this.attackUntil) {
      this.playHeroAnimation('attack');
      this.checkAttackHits();
    } else if (this.player.anims.currentAnim?.key?.endsWith('-attack')) {
      this.playHeroAnimation(direction ? 'run' : 'idle');
    }

    this.applyRampSurface(direction);

    if (this.playerInvulnerableUntil > time) {
      this.player.setAlpha(Math.floor(time / 85) % 2 ? 0.48 : 1);
    } else {
      this.player.setAlpha(1);
    }
  }

  playHeroAnimation(state) {
    const hero = HEROES[this.heroId] || HEROES.knightess;
    const key = `${hero.sheet}-${state}`;
    if (this.anims.exists(key) && this.player.anims.currentAnim?.key !== key) this.player.play(key, true);
  }

  jump() {
    if (this.gameMode !== 'playing' || (!this.player.body.blocked.down && !this.onRamp)) return;
    this.onRamp = false;
    this.player.body.allowGravity = true;
    this.player.setVelocityY(-1030);
    playSfx(this, 'sword_swing', { volume: 0.10, rate: 1.3 });
    this.playHeroAnimation('jump');
  }

  beginAttack() {
    if (this.gameMode !== 'playing' || this.time.now < this.attackUntil - 70) return;
    this.attackUntil = this.time.now + 310;
    this.attackHit = new Set();
    playSfx(this, 'sword_swing', { volume: 0.32, rate: Phaser.Math.FloatBetween(0.92, 1.08) });
    this.playHeroAnimation('attack');
    this.checkAttackHits();
  }

  checkAttackHits() {
    if (this.time.now > this.attackUntil) return;
    const facing = this.player.getData('facing') || 1;
    const playerBody = this.player.body;
    const hitbox = new Phaser.Geom.Rectangle(
      facing > 0 ? playerBody.right - 2 : playerBody.x - 86,
      playerBody.y + playerBody.height * 0.16,
      88,
      playerBody.height * 0.72
    );
    for (const enemy of this.enemies) {
      if (enemy.dead || this.attackHit.has(enemy) || !enemy.sprite.body?.enable) continue;
      const body = enemy.sprite.body;
      const target = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(hitbox, target)) {
        this.attackHit.add(enemy);
        const base = this.player.getData('damage') || 22;
        const dealt = Math.round(base * (this.buffTimers.atk > 0 ? 1.5 : 1));
        enemy.hp -= dealt;
        playSfx(this, enemy.type === 'golem' ? 'sword_hit' : 'slime_hit', { volume: 0.28 });
        this.runStats.damageDone += dealt;
        enemy.hitUntil = this.time.now + 180;
        enemy.sprite.setTint(0xffffff);
        this.time.delayedCall(110, () => { if (enemy.sprite?.active) enemy.sprite.clearTint(); });
        const popup = this.add.text(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.65,
          `-${dealt}`, { fontFamily: 'Consolas, monospace', fontSize: '16px', color: '#ffe18a',
            stroke: '#170b08', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5).setDepth(60);
        this.tweens.add({ targets: popup, y: popup.y - 35, alpha: 0, duration: 520, onComplete: () => popup.destroy() });
        if (enemy.hp <= 0) this.killEnemy(enemy);
      }
    }
  }

  killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    enemy.sprite.body.enable = false;
    enemy.hpBar?.clear();
    enemy.hpBar?.destroy();
    this.clearGhostAim(enemy);
    this.removeGhostBoltsForEnemy(enemy);
    enemy.sprite.play(`${enemy.type}-death`);
    this.tweens.add({ targets: enemy.sprite, alpha: 0, y: enemy.sprite.y - 24, duration: 650,
      onComplete: () => enemy.sprite.destroy() });
  }

  updateEnemies(time, delta) {
    for (const enemy of this.enemies) {
      if (enemy.dead || !enemy.sprite.active) continue;
      if (enemy.type === 'slime') this.updateSlimeAI(enemy, time, delta);
      else if (enemy.type === 'golem') this.updateGolemAI(enemy, time, delta);
      else if (enemy.type === 'ghost') this.updateGhostAI(enemy, time, delta);
      this.updateEnemyHealthBar(enemy);
    }
  }

  updateEnemyHealthBar(enemy) {
    const body = enemy.sprite.body;
    if (!body?.enable || enemy.dead || !enemy.hpBar?.active) return;
    const width = enemy.hpBarWidth || 42;
    const height = 6;
    const x = body.center.x - width / 2;
    // Anchor the bar above the visible sprite rather than the often-trimmed physics body.
    const spriteTop = enemy.sprite.y - enemy.sprite.displayHeight * (enemy.sprite.originY ?? 0.95);
    const y = Math.min(body.y - 10, spriteTop - 9);
    const ratio = Phaser.Math.Clamp(enemy.hp / Math.max(1, enemy.maxHp), 0, 1);
    enemy.hpBar.clear();
    enemy.hpBar.fillStyle(0x11151c, 0.92).fillRoundedRect(x - 1, y - 1, width + 2, height + 2, 2);
    enemy.hpBar.fillStyle(0x6c171e, 1).fillRoundedRect(x, y, width, height, 2);
    enemy.hpBar.fillStyle(ratio < 0.3 ? 0xff5353 : 0x75d889, 1).fillRoundedRect(x, y, width * ratio, height, 2);
  }

  playerBodyOverlapsEnemy(enemy, paddingX = 18, paddingY = 10) {
    const a = this.player?.body;
    const b = enemy?.sprite?.body;
    if (!a || !b || !b.enable) return false;
    const padded = new Phaser.Geom.Rectangle(b.x - paddingX, b.y - paddingY, b.width + paddingX * 2, b.height + paddingY * 2);
    return Phaser.Geom.Intersects.RectangleToRectangle(
      new Phaser.Geom.Rectangle(a.x, a.y, a.width, a.height), padded
    );
  }

  getEnemyTarget(enemy) {
    const dx = this.player.x - enemy.sprite.x;
    const dy = (this.player.y - 46) - enemy.sprite.y;
    return { dx, dy, absX: Math.abs(dx), absY: Math.abs(dy), dist: Math.hypot(dx, dy), dir: dx < 0 ? -1 : 1 };
  }

  setEnemyAnimation(enemy, state) {
    // Impact animation for a golem must not be overwritten by the generic
    // recover/idle state during its visible ground-slam window.
    if (enemy.type === 'golem' && state !== 'slam' && this.time.now < (enemy.slamAnimUntil || 0)) return;
    const key = `${enemy.type}-${state}`;
    if (this.anims.exists(key) && enemy.sprite.anims.currentAnim?.key !== key) enemy.sprite.play(key, true);
  }

  updateSlimeAI(enemy, time) {
    const sprite = enemy.sprite;
    const target = this.getEnemyTarget(enemy);
    const canSee = target.dist <= enemy.detectRange && target.absY < 250;
    // Kontak langsung selalu dicek, termasuk saat slime masih patrol/alert,
    // supaya damage tidak bergantung pada state chase yang bisa terlambat.
    const contactRange = target.absX <= 62 && target.absY <= 86;
    if ((this.playerBodyOverlapsEnemy(enemy, 10, 8) || contactRange) && time >= enemy.attackAt) {
      enemy.attackAt = time + (this.difficulty === 'hard' ? 680 : this.difficulty === 'easy' ? 1500 : 980) * (enemy.attackCooldownScale || 1);
      enemy.state = 'attack';
      enemy.stateUntil = time + 300;
      sprite.setVelocityX(0);
      this.damagePlayer(enemy.damage);
      this.setEnemyAnimation(enemy, 'attack');
      return;
    }
    if (enemy.state === 'patrol' && canSee) {
      enemy.state = 'alert';
      enemy.stateUntil = time + enemy.alertMs;
      enemy.facing = target.dir;
    }
    if (enemy.state === 'alert') {
      sprite.setVelocityX(0);
      if (!canSee && target.dist > enemy.detectRange * 1.15) enemy.state = 'patrol';
      else if (time >= enemy.stateUntil && target.dist <= enemy.detectRange) enemy.state = 'chase';
    }
    if (enemy.state === 'chase') {
      if (target.dist > enemy.chaseRange) enemy.state = 'patrol';
      else {
        enemy.facing = target.dir;
        sprite.setVelocityX(target.dir * enemy.speed * (this.difficulty === 'hard' ? 1.25 : 1));
        if ((sprite.body.blocked.right || sprite.body.blocked.left) && sprite.body.blocked.down) sprite.setVelocityY(-500);

      }
    }
    if (enemy.state === 'attack') {
      sprite.setVelocityX(0);
      this.setEnemyAnimation(enemy, 'attack');
      if (time >= enemy.stateUntil) enemy.state = 'chase';
    }
    if (enemy.state === 'patrol') {
      if (sprite.x <= enemy.minX + 18) enemy.facing = 1;
      if (sprite.x >= enemy.maxX - 18) enemy.facing = -1;
      sprite.setVelocityX(enemy.facing * enemy.speed * 0.42);
    }
    sprite.setFlipX((enemy.state === 'patrol' ? enemy.facing : target.dir) < 0);
    if (enemy.state === 'alert') this.setEnemyAnimation(enemy, 'idle');
    else if (enemy.state === 'attack') this.setEnemyAnimation(enemy, 'attack');
    else if (enemy.state !== 'chase' || Math.abs(sprite.body.velocity.x) < 12) this.setEnemyAnimation(enemy, 'idle');
    else this.setEnemyAnimation(enemy, 'move');
  }

  updateGolemAI(enemy, time) {
    const sprite = enemy.sprite;
    const target = this.getEnemyTarget(enemy);
    const hard = this.difficulty === 'hard';
    const grounded = Boolean(sprite.body?.blocked.down || sprite.body?.touching.down);
    const canSee = target.dist <= enemy.detectRange && target.absY < 300;

    if (enemy.state === 'patrol') {
      if (canSee) {
        enemy.state = 'alert';
        enemy.stateUntil = time + enemy.alertMs;
        enemy.facing = target.dir;
        sprite.setVelocityX(0);
      } else {
        if (sprite.x <= enemy.minX + 18) enemy.facing = 1;
        if (sprite.x >= enemy.maxX - 18) enemy.facing = -1;
        sprite.setVelocityX(enemy.facing * enemy.speed * 0.38);
        sprite.setFlipX(enemy.facing < 0);
        this.setEnemyAnimation(enemy, 'move');
      }
      return;
    }

    if (enemy.state === 'alert') {
      sprite.setVelocityX(0);
      sprite.setFlipX(target.dir < 0);
      this.setEnemyAnimation(enemy, 'idle');
      if (!canSee && target.dist > enemy.detectRange * 1.2) enemy.state = 'patrol';
      else if (time >= enemy.stateUntil) enemy.state = 'chase';
      return;
    }

    if (enemy.state === 'chase') {
      if (target.dist > enemy.chaseRange) {
        enemy.state = 'patrol';
        sprite.setVelocityX(0);
        return;
      }
      enemy.facing = target.dir;
      sprite.setFlipX(target.dir < 0);
      const nearRange = hard ? 235 : this.difficulty === 'easy' ? 185 : 210;
      const leapRange = hard ? 760 : this.difficulty === 'easy' ? 520 : 650;
      if (time >= enemy.nextAttackAt && grounded && target.absY < 190 && target.absX <= nearRange) {
        // Jarak dekat: langsung menghantam tanah, tanpa lompat.
        enemy.state = 'windup';
        enemy.attackMode = 'slam';
        enemy.stateUntil = time + (hard ? 250 : this.difficulty === 'easy' ? 410 : 330);
        enemy.slamDone = false;
        enemy.slamFacing = target.dir;
        sprite.setVelocityX(0);
        this.setEnemyAnimation(enemy, 'slam');
        return;
      }
      if (time >= enemy.nextAttackAt && grounded && target.absY < 230 && target.absX > nearRange && target.absX <= leapRange) {
        // Jarak menengah/jauh: lompat menerjang lokasi player saat serangan dimulai.
        enemy.state = 'leap';
        enemy.attackMode = 'leap';
        enemy.leapStartedAt = time;
        enemy.leapDir = target.dir;
        enemy.leapTargetX = this.player.body.center.x;
        enemy.slamDone = false;
        sprite.setFlipX(enemy.leapDir < 0);
        sprite.setVelocity(enemy.leapDir * (hard ? 570 : 500), hard ? -820 : -760);
        this.setEnemyAnimation(enemy, 'attack');
        return;
      }
      sprite.setVelocityX(target.dir * enemy.speed * (hard ? 1.42 : 1.15));
      if (grounded) this.setEnemyAnimation(enemy, 'move');
      return;
    }

    if (enemy.state === 'windup') {
      sprite.setVelocityX(0);
      sprite.setFlipX(enemy.slamFacing < 0);
      this.setEnemyAnimation(enemy, 'slam');
      if (time >= enemy.stateUntil && !enemy.slamDone) {
        enemy.slamDone = true;
        this.createGolemImpact(enemy, { leap: false });
        enemy.state = 'recover';
        enemy.stateUntil = time + (hard ? 470 : this.difficulty === 'easy' ? 820 : 640);
        enemy.nextAttackAt = time + (hard ? 1250 : this.difficulty === 'easy' ? 2500 : 1900) * (enemy.attackCooldownScale || 1);
        sprite.setVelocityX(0);
        // Keep the slam frames visible through the impact portion of recovery.
      }
      return;
    }

    if (enemy.state === 'leap') {
      sprite.setFlipX(enemy.leapDir < 0);
      // Sedikit koreksi horizontal menjaga arah terjangan, tanpa homing yang tidak adil.
      if (time - enemy.leapStartedAt < 540) {
        sprite.setVelocityX(enemy.leapDir * (hard ? 570 : 500));
      }
      const landed = grounded && time - enemy.leapStartedAt > 220;
      const timedOutOnGround = time - enemy.leapStartedAt > 1900 && grounded;
      if ((landed || timedOutOnGround) && !enemy.slamDone) {
        enemy.slamDone = true;
        this.createGolemImpact(enemy, { leap: true });
        enemy.state = 'recover';
        enemy.stateUntil = time + (hard ? 600 : this.difficulty === 'easy' ? 1050 : 820);
        enemy.nextAttackAt = time + (hard ? 1650 : this.difficulty === 'easy' ? 3000 : 2300) * (enemy.attackCooldownScale || 1);
        sprite.setVelocityX(0);
        // Keep impact animation; recover switches to idle after slamAnimUntil.
      }
      return;
    }

    if (enemy.state === 'recover') {
      sprite.setVelocityX(0);
      if (time < (enemy.slamAnimUntil || 0)) this.setEnemyAnimation(enemy, 'slam');
      else this.setEnemyAnimation(enemy, 'idle');
      if (time >= enemy.stateUntil) enemy.state = 'chase';
    }
  }

  createGolemImpact(enemy, { leap = false } = {}) {
    const sprite = enemy.sprite;
    enemy.slamAnimUntil = this.time.now + (leap ? 560 : 520);
    if (sprite?.active && this.anims.exists('golem-slam')) sprite.play('golem-slam', true);
    const impactX = sprite.x;
    const impactY = sprite.body?.bottom ?? (sprite.y - 8);
    const hard = this.difficulty === 'hard';
    const radius = leap ? (hard ? 232 : this.difficulty === 'easy' ? 176 : 205) : (hard ? 188 : this.difficulty === 'easy' ? 112 : 150);
    playSfx(this, 'golem_slam', { volume: leap ? 0.62 : 0.52, rate: leap ? 0.88 : 1 });
    const qualityScale = this.graphicsQuality === 'low' ? 0.55 : this.graphicsQuality === 'high' ? 1 : 0.78;

    this.cameras.main.shake(180, this.graphicsQuality === 'high' ? 0.007 : 0.004);
    const shockwave = this.add.ellipse(impactX, impactY - 2, 34, 12, 0xffc36a, 0.22)
      .setStrokeStyle(3, 0xffdba0, 0.9).setDepth(44);
    this.tweens.add({ targets: shockwave, width: radius * 2, height: 34, alpha: 0,
      duration: 420, ease: 'Cubic.Out', onComplete: () => shockwave.destroy() });

    const dust = this.add.ellipse(impactX, impactY - 6, 54, 22, 0x9aa4a8, 0.32).setDepth(43);
    this.tweens.add({ targets: dust, width: radius * 1.55, height: 46, alpha: 0, y: impactY - 24,
      duration: 480, ease: 'Sine.Out', onComplete: () => dust.destroy() });

    const fragments = Math.max(3, Math.round((this.particleBudget || 8) * qualityScale));
    for (let i = 0; i < fragments; i++) {
      const angle = Math.PI + (Math.PI * (i + 0.5)) / fragments;
      const speed = Phaser.Math.Between(42, 130);
      const shard = this.add.rectangle(impactX, impactY - 4, Phaser.Math.Between(5, 10), Phaser.Math.Between(4, 8),
        i % 2 ? 0x75818a : 0xaaa49a, 0.95).setDepth(45).setRotation(Math.random() * 0.6);
      this.tweens.add({ targets: shard,
        x: impactX + Math.cos(angle) * speed,
        y: impactY + Math.sin(angle) * speed - Phaser.Math.Between(8, 28),
        alpha: 0, rotation: shard.rotation + (Math.random() * 2 - 1),
        duration: Phaser.Math.Between(280, 470), ease: 'Quad.Out', onComplete: () => shard.destroy()
      });
    }

    // Hantaman tanah memberi damage area. Damage hanya dicoba sekali untuk satu lompatan.
    const playerBody = this.player.body;
    const playerCenterX = playerBody.center.x;
    const playerFeetY = playerBody.bottom;
    const enemyFeetY = sprite.body?.bottom ?? G;
    const dx = Math.abs(playerCenterX - impactX);
    const dy = Math.abs(playerFeetY - enemyFeetY);
    // Gelombang mengikuti bidang pijakan golem, sehingga pemain di platform
    // dengan elevasi serupa tetap menerima damage secara konsisten.
    if (dx <= radius && dy <= 176) {
      const falloff = 1 - (dx / radius) * 0.28;
      this.damagePlayer(Math.max(1, Math.round(enemy.damage * (hard ? 1.18 : 1) * falloff)));
    }
  }

  updateGhostAI(enemy, time) {
    const sprite = enemy.sprite;
    const target = this.getEnemyTarget(enemy);
    const hard = this.difficulty === 'hard';
    if (enemy.state === 'patrol' && target.dist <= enemy.detectRange) {
      enemy.state = 'chase';
    }
    if (enemy.state === 'chase') {
      if (target.dist > enemy.chaseRange) {
        enemy.state = 'patrol';
      } else {
        // Hantu menjaga jarak pendek dan langsung menembak posisi player saat itu.
        const desired = 300;
        const goalX = this.player.x - target.dir * desired;
        const goalY = this.player.y - 112;
        sprite.body.setVelocityX(clamp((goalX - sprite.x) * 1.55, -enemy.speed * 1.35, enemy.speed * 1.35));
        sprite.body.setVelocityY(clamp((goalY - sprite.y) * 1.35, -enemy.speed, enemy.speed));
        if (target.dist < (hard ? 850 : 720) && target.dist > 145 && time >= enemy.nextAttackAt) {
          this.fireGhostBolt(enemy, time);
        }
      }
    }
    if (enemy.state === 'cooldown') {
      const holdX = this.player.x - target.dir * 300;
      sprite.body.setVelocityX(clamp((holdX - sprite.x) * 1.05, -enemy.speed, enemy.speed));
      sprite.body.setVelocityY(clamp((this.player.y - 112 - sprite.y) * 1.05, -enemy.speed, enemy.speed));
      if (time >= enemy.stateUntil) enemy.state = 'chase';
    }
    if (enemy.state === 'patrol') {
      sprite.body.setVelocityX(Math.sin(time / 700 + sprite.x) * enemy.speed * 0.24);
      sprite.body.setVelocityY(Math.sin(time / 450 + sprite.x) * 18);
      this.setEnemyAnimation(enemy, 'idle');
    } else if (enemy.state === 'chase') {
      this.setEnemyAnimation(enemy, 'move');
    }
    sprite.setFlipX(target.dir < 0);
  }

  fireGhostBolt(enemy, time) {
    if (!this.ghostBolts) this.ghostBolts = [];
    // Batas proyektil global mencegah penumpukan objek/Graphics ketika beberapa hantu aktif.
    if (this.ghostBolts.length >= 2 || enemy.bolt?.active || this.gameMode !== 'playing' || !this.player?.body?.enable) {
      enemy.nextAttackAt = time + 420;
      return;
    }
    const sprite = enemy.sprite;
    const startX = Number(sprite.x);
    const startY = Number(sprite.y);
    const targetX = Number(this.player.body.center.x);
    const targetY = Number(this.player.body.center.y);
    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = this.difficulty === 'hard' ? 610 : this.difficulty === 'easy' ? 440 : 520;
    const bolt = this.add.circle(startX, startY, 8, 0x65e9ff, 1)
      .setStrokeStyle(2, 0xe0fbff, 1).setDepth(52);
    enemy.bolt = bolt;
    this.ghostBolts.push({
      owner: enemy, sprite: bolt, vx: dx / length * speed, vy: dy / length * speed,
      life: 0, maxLife: 1350, prevX: startX, prevY: startY, x: startX, y: startY
    });
    playSfx(this, 'ghost_zap', { volume: 0.38 });
    enemy.state = 'cooldown';
    enemy.stateUntil = time + (this.difficulty === 'hard' ? 640 : this.difficulty === 'easy' ? 1080 : 840);
    enemy.nextAttackAt = time + (this.difficulty === 'hard' ? 1450 : this.difficulty === 'easy' ? 2550 : 1900) * (enemy.attackCooldownScale || 1);
    this.setEnemyAnimation(enemy, 'attack');
  }

  updateGhostProjectiles(delta) {
    if (!this.ghostBolts?.length || this.gameMode !== 'playing' || !this.player?.active) return;
    // Lightweight projectile simulation: no per-frame Graphics/Rectangle allocation.
    // This avoids renderer stalls on mobile when several ghosts fire in one combat.
    const frameMs = Phaser.Math.Clamp(Number.isFinite(delta) ? delta : 16.67, 0, 32);
    const dt = frameMs / 1000;
    const body = this.player?.body;
    for (let i = this.ghostBolts.length - 1; i >= 0; i--) {
      const projectile = this.ghostBolts[i];
      const owner = projectile.owner;
      const sprite = projectile.sprite;
      if (!sprite?.active || owner?.dead || !owner?.sprite?.active ||
          !Number.isFinite(projectile.x) || !Number.isFinite(projectile.y) ||
          !Number.isFinite(projectile.vx) || !Number.isFinite(projectile.vy)) {
        this.removeGhostBoltAt(i, false);
        continue;
      }
      projectile.prevX = projectile.x;
      projectile.prevY = projectile.y;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life += frameMs;
      sprite.setPosition(projectile.x, projectile.y);

      if (body?.enable) {
        // Swept axis-aligned bounds catch fast projectiles without allocating Phaser rectangles.
        const minX = Math.min(projectile.prevX, projectile.x) - 10;
        const maxX = Math.max(projectile.prevX, projectile.x) + 10;
        const minY = Math.min(projectile.prevY, projectile.y) - 10;
        const maxY = Math.max(projectile.prevY, projectile.y) + 10;
        const hitX = maxX >= body.x - 3 && minX <= body.right + 3;
        const hitY = maxY >= body.y - 3 && minY <= body.bottom + 3;
        if (hitX && hitY) {
          this.damagePlayer(owner.damage * hardMultiplier(this.difficulty));
          this.removeGhostBoltAt(i, true);
          continue;
        }
      }
      if (projectile.life >= (projectile.maxLife || 1350) || projectile.x < -40 ||
          projectile.x > this.level.width + 40 || projectile.y < -40 || projectile.y > H + 80) {
        this.removeGhostBoltAt(i, true);
      }
    }
  }

  removeGhostBoltAt(index, burst = false) {
    const projectile = this.ghostBolts?.[index];
    if (!projectile) return;
    this.ghostBolts.splice(index, 1);
    const { sprite, owner } = projectile;
    if (owner?.bolt === sprite) owner.bolt = null;
    if (burst && sprite?.active) {
      const impact = this.add.circle(sprite.x, sprite.y, 10, 0x70eaff, 0.38)
        .setStrokeStyle(2, 0xc8faff, 0.9).setDepth(53);
      this.tweens.add({ targets: impact, alpha: 0, scale: 1.45, duration: 120,
        onComplete: () => impact.destroy() });
    }
    sprite?.destroy?.();
  }

  removeGhostBoltsForEnemy(enemy) {
    if (!this.ghostBolts) return;
    for (let i = this.ghostBolts.length - 1; i >= 0; i--) {
      if (this.ghostBolts[i].owner === enemy) this.removeGhostBoltAt(i, false);
    }
  }

  clearAllGhostBolts() {
    if (this.ghostBolts) {
      for (let i = this.ghostBolts.length - 1; i >= 0; i--) this.removeGhostBoltAt(i, false);
    }
    this.ghostBoltFx = null;
  }

  clearGhostAim(enemy) {
    enemy.aimGraphic?.destroy();
    enemy.aimGraphic = null;
    enemy.aimMarker?.destroy();
    enemy.aimMarker = null;
    this.removeGhostBoltsForEnemy(enemy);
  }

  showPlayerNotice(message, color = '#ffe18a') {
    if (!this.player?.active) return;
    const notice = this.add.text(this.player.x, this.player.y - this.player.displayHeight * 0.82, message, {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '15px', color,
      fontStyle: 'bold', stroke: '#080c14', strokeThickness: 4,
      backgroundColor: 'rgba(5,9,16,0.66)', padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setDepth(70).setResolution(3);
    this.tweens.add({ targets: notice, y: notice.y - 46, alpha: 0, duration: 1100, ease: 'Sine.Out',
      onComplete: () => notice.destroy() });
  }

  updatePickups(time) {
    for (const pickup of this.pickups) {
      if (pickup.taken || !pickup.sprite?.active) continue;
      pickup.sprite.y = pickup.baseY + Math.sin(time / 190 + pickup.bob) * 5;
      const playerBody = this.player.body;
      const pickupRect = new Phaser.Geom.Rectangle(pickup.sprite.x - 18, pickup.sprite.y - 20, 36, 40);
      const playerRect = new Phaser.Geom.Rectangle(playerBody.x, playerBody.y, playerBody.width, playerBody.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(playerRect, pickupRect)) {
        pickup.taken = true;
        pickup.sprite.destroy();
        if (pickup.type === 'heart') {
          const before = this.player.getData('hp');
          const after = Math.min(100, before + 20);
          this.player.setData('hp', after);
          if (after > before) {
            this.showPlayerNotice(t('heartCollected', this.language, { amount: after - before }), '#8cffaf');
            playSfx(this, 'heart_pickup', { volume: 0.42 });
          }
        } else {
          this.potionInventory.push(pickup.type);
          if (!this.selectedPotionType || !this.potionInventory.includes(this.selectedPotionType)) this.selectedPotionType = pickup.type;
          // Jumlah inventori pada HUD bertambah; pop-up hanya untuk konsumsi potion.
          this.events.emit('potioninventorychange');
        }
      }
    }
  }

  selectPotion(kind) {
    if (!['hp', 'atk', 'spd'].includes(kind) || !this.potionInventory.includes(kind)) return false;
    this.selectedPotionType = kind;
    this.events.emit('potioninventorychange');
    return true;
  }

  openNearbyChest() {
    if (this.gameMode !== 'playing') return;
    let target = null;
    let best = 100;
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y - 25, chest.sprite.x, chest.sprite.y);
      if (d < best) { best = d; target = chest; }
    }
    if (!target) return;
    target.opened = true;
    playSfx(this, 'chest_open', { volume: 0.45 });
    target.sprite.setTexture('chest_1');
    this.time.delayedCall(170, () => { if (target.sprite.active) target.sprite.setTexture('chest_2'); });
    const kind = Phaser.Utils.Array.GetRandom(['hp', 'atk', 'spd']);
    const potion = this.add.image(target.sprite.x, target.sprite.y - 62, `potion_${kind}`)
      .setDisplaySize(34, 48).setDepth(32);
    this.tweens.add({ targets: potion, y: potion.y - 14, duration: 250, yoyo: false, ease: 'Back.Out' });
    this.pickups.push({ type: kind, sprite: potion, baseY: potion.y, bob: Math.random() * 6, taken: false });
  }

  consumePotion(kind = this.selectedPotionType) {
    if (this.gameMode !== 'playing') return false;
    const index = this.potionInventory.indexOf(kind);
    if (index < 0) return false;
    playSfx(this, 'potion_use', { volume: 0.42 });
    this.potionInventory.splice(index, 1);
    if (kind === 'hp') {
      const before = this.player.getData('hp');
      const after = Math.min(100, before + 40);
      this.player.setData('hp', after);
      this.showPlayerNotice(t('potionHeal', this.language, { amount: after - before }), '#8cffaf');
    } else if (kind === 'atk') {
      this.buffTimers.atk = 15000;
      this.showPlayerNotice(t('potionDamage', this.language), '#ffbd75');
    } else if (kind === 'spd') {
      this.buffTimers.spd = 12000;
      this.showPlayerNotice(t('potionSpeed', this.language), '#85e3ff');
    }
    if (!this.potionInventory.includes(this.selectedPotionType)) this.selectedPotionType = this.potionInventory[0] || 'hp';
    this.events.emit('potioninventorychange');
    return true;
  }

  damagePlayer(amount) {
    if (this.gameMode !== 'playing' || this.time.now < this.playerInvulnerableUntil) return false;
    const hp = Math.max(0, this.player.getData('hp') - amount);
    playSfx(this, 'sword_hit', { volume: 0.30, rate: 0.78 });
    this.player.setData('hp', hp);
    this.playerInvulnerableUntil = this.time.now + 850;
    this.runStats.damageTaken += amount;
    this.lastDamageTime = this.time.now;
    this.onRamp = false;
    this.player.body.allowGravity = true;
    this.player.setVelocityY(-190);
    if (hp <= 0) this.finishGameOver();
    return true;
  }

  updateExit() {
    if (this.gameMode !== 'playing' || this.exitStarted) return;
    if (!this.exitPortalReady && this.player.x >= this.exitRevealX) {
      this.exitPortalReady = true;
      this.exitPortal.setVisible(true).setFrame(16).play('portal-open');
      this.exitLabel.setVisible(true);
      this.exitPortal.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (this.exitPortal?.active && this.gameMode === 'playing') this.exitPortal.play('portal-active');
      });
    }
    if (this.player.x >= this.exitX - 88) {
      this.exitStarted = true;
      this.gameMode = 'exiting';
      this.clearAllGhostBolts();
      if (!this.exitPortalReady) {
        this.exitPortalReady = true;
        this.exitPortal.setVisible(true).play('portal-active');
        this.exitLabel.setVisible(true);
      }
      this.exitPortal.play('portal-close');
      this.player.setVelocity(0, 0);
      const targetX = this.exitX;
      this.tweens.add({ targets: this.player, x: targetX, alpha: 0, duration: 1250, ease: 'Sine.InOut',
        onComplete: () => {
          const stats = {
            stage: this.stageNumber,
            damageDone: this.runStats.damageDone,
            damageTaken: this.runStats.damageTaken,
            time: this.timeAliveMs,
            hp: this.player.getData('hp')
          };
          this.gameMode = 'stageclear';
          playSfx(this, 'stage_clear', { volume: 0.48 });
          if (!this.stageResultEmitted) {
            this.stageResultEmitted = true;
            this.events.emit('stageclear', stats);
          }
        }
      });
    }
  }

  finishGameOver() {
    if (this.gameMode === 'gameover') return;
    this.gameMode = 'gameover';
    this.clearAllGhostBolts();
    this.player.setVelocity(0, 0);
    this.player.play(`${HEROES[this.heroId].sheet}-death`, true);
    playSfx(this, 'game_over', { volume: 0.52 });
    this.time.delayedCall(550, () => this.events.emit('gameover', {
      stage: this.stageNumber,
      damageDone: this.runStats.damageDone,
      damageTaken: this.runStats.damageTaken,
      time: this.timeAliveMs
    }));
  }


}
