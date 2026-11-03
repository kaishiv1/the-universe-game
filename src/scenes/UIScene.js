import Phaser from 'phaser';
import { CFG } from '../data/config.js';
import { SettingsPanel, normalizeKeyEvent, loadKeyBindings } from '../ui/SettingsPanel.js';
import { getLanguage, getDimensionKey, t } from '../data/i18n.js';
import { playSfx } from '../systems/AudioLibrary.js';

const W = 1280, H = 720;

export class UIScene extends Phaser.Scene {
  constructor() { super('UIScene'); }

  addUiText(x, y, value, style = {}) {
    const text = this.add.text(x, y, value, { fontFamily: 'Arial, Segoe UI, sans-serif', ...style });
    text.setResolution?.(4);
    return text;
  }

  create() {
    this.gameScene = this.scene.get('GameScene');
    this.language = this.gameScene.language || getLanguage(this.registry);
    this.pauseVisible = false;
    this.resultActionLock = false;
    if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = this.language;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.hud = this.add.container(0, 0).setDepth(1000).setScrollFactor(0);
    this.createHud();
    this.createTouchControls();
    this.createPauseOverlay();
    this.settingsPanel = new SettingsPanel(this, {
      depth: 2100,
      onClose: () => this.pauseContainer?.setVisible(true),
      onDifficultyChange: id => this.gameScene.setDifficulty?.(id),
      onQualityChange: id => this.gameScene.setGraphicsQuality?.(id),
      onKeyBindingsChange: bindings => this.gameScene.applyKeyBindings?.(bindings),
      onTouchChange: enabled => this.touchControls?.setVisible(this.touchAvailable && enabled && !this.pauseVisible),
      onFpsChange: enabled => this.fpsText?.setVisible(enabled),
      onLanguageChange: language => this.applyLanguage(language)
    });
    this.touchControls.setVisible(this.touchAvailable && this.registry.get('touchControls') !== false);
    this.createResultOverlay();
    this.createStageIntro();
    this.fpsText = this.addUiText(1242, 696, '', { fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#d8e4f3',
      stroke: '#050913', strokeThickness: 2 }).setOrigin(1, 1).setDepth(1300).setVisible(Boolean(this.registry.get('showFps')));
    this.onIntroComplete = () => {
      if (this.stageIntro?.visible) {
        this.stageIntroStatus.setText(t('stageStart', this.language));
        this.stageIntroBarFill.width = 512;
        this.stageIntro.setVisible(false);
      }
      this.touchControls?.setVisible(this.touchAvailable && this.registry.get('touchControls') !== false);
    };
    this.gameScene.events.on('introcomplete', this.onIntroComplete);

    this.onFullscreenRequest = () => this.toggleFullscreen();
    this.onStageChange = data => this.updateStageLabel(data);
    this.onStageClear = stats => this.showResult('victory', stats);
    this.onGameOver = stats => this.showResult('lose', stats);
    this.gameScene.events.on('fullscreen-request', this.onFullscreenRequest);
    this.gameScene.events.on('stagechange', this.onStageChange);
    this.gameScene.events.on('stageclear', this.onStageClear);
    this.gameScene.events.on('gameover', this.onGameOver);
    // stagechange bisa dipancarkan sebelum UIScene selesai dibuat saat scene baru diluncurkan.
    // Sinkronkan label dari GameScene agar stage selain I-1 tidak menampilkan nilai default.
    this.updateStageLabel({
      stage: this.gameScene.stageNumber,
      difficulty: this.gameScene.difficulty
    });
    this.showStageIntro({ stage: this.gameScene.stageNumber, note: this.gameScene.stageConfig?.note || '' });
    this.pauseFromKeyboard = event => {
      if (event.repeat || this.resultContainer.visible || this.settingsPanel?.container?.visible) return;
      const key = normalizeKeyEvent(event);
      const bindings = this.registry.get('keyBindings') || loadKeyBindings();
      if (key === bindings.pause || key === 'P') this.togglePause();
    };
    this.input.keyboard?.on('keydown', this.pauseFromKeyboard);

    this.scale.on('resize', this.layout, this);
    this.layout();
  }

  createHud() {
    this.hpFrame = this.add.image(22, 16, 'hp_frame').setOrigin(0).setDisplaySize(400, 38);
    this.hpFill = this.add.graphics();
    this.hpText = this.addUiText(222, 35, 'HP 100/100', {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '14px', color: '#fff0c7',
      fontStyle: 'bold', stroke: '#1c0b0a', strokeThickness: 4
    }).setOrigin(0.5);
    this.stageText = this.addUiText(28, 64, '', {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '15px', color: '#ffe29a',
      fontStyle: 'bold', stroke: '#080d14', strokeThickness: 4
    });
    this.createPotionSlots();
    this.buffText = this.addUiText(28, 190, '', {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '12px', color: '#b6f1cc',
      stroke: '#081018', strokeThickness: 3
    });

    // Kontrol inti ditempatkan simetris di tengah atas, tidak menabrak HP atau minimap.
    this.pauseButton = this.add.image(606, 44, 'ui_pause').setDisplaySize(58, 58)
      .setInteractive({ useHandCursor: true });
    this.fullscreenButton = this.add.image(674, 44, 'ui_fullscreen').setDisplaySize(58, 58)
      .setInteractive({ useHandCursor: true });
    this.pauseButton.on('pointerdown', () => { playSfx(this, 'ui_click', { volume: 0.25 }); this.togglePause(); });
    this.fullscreenButton.on('pointerdown', () => { playSfx(this, 'ui_click', { volume: 0.25 }); this.toggleFullscreen(); });
    this.bindPressFeedback(this.pauseButton);
    this.bindPressFeedback(this.fullscreenButton);

    this.mapPanel = this.add.rectangle(1085, 88, 330, 148, 0x050b13, 0.80)
      .setStrokeStyle(3, 0xb18b35, 0.95);
    this.mapGraphics = this.add.graphics();
    this.mapLabel = this.addUiText(1234, 22, '0%', {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '17px', color: '#ffe29a',
      fontStyle: 'bold', stroke: '#050913', strokeThickness: 4
    }).setOrigin(1, 0);
    this.mapTitle = this.addUiText(948, 22, t('map', this.language), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '12px', color: '#a9bacd',
      stroke: '#050913', strokeThickness: 3
    });

    this.hud.add([
      this.hpFrame, this.hpFill, this.hpText, this.stageText,
      ...Object.values(this.potionSlots).flatMap(slot => [slot.frame, slot.icon, slot.count, slot.label, slot.selectedMark]),
      this.potionHint, this.buffText, this.pauseButton, this.fullscreenButton, this.mapPanel,
      this.mapGraphics, this.mapLabel, this.mapTitle
    ]);
  }

  createPotionSlots() {
    this.potionSlots = {};
    const slots = [
      ['hp', 42], ['atk', 112], ['spd', 182]
    ];
    for (const [kind, x] of slots) {
      const frame = this.add.rectangle(x, 133, 58, 60, 0x080d16, 0.88)
        .setStrokeStyle(2, 0x6e592e, 0.95).setInteractive({ useHandCursor: true });
      const icon = this.add.image(x, 128, `potion_${kind}`).setDisplaySize(24, 36);
      const count = this.addUiText(x + 19, 155, '0', {
        fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '12px', color: '#fff0bd',
        fontStyle: 'bold', stroke: '#080d14', strokeThickness: 3
      }).setOrigin(0.5);
      const label = this.addUiText(x, 178, t(`potion${kind[0].toUpperCase()}${kind.slice(1)}Short`, this.language), {
        fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '13px', color: '#e7d9bd',
        stroke: '#080d14', strokeThickness: 2
      }).setOrigin(0.5);
      const selectedMark = this.addUiText(x + 22, 106, '✓', {
        fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '12px', color: '#ffdc67',
        fontStyle: 'bold', stroke: '#080d14', strokeThickness: 3
      }).setOrigin(0.5).setVisible(false);
      frame.on('pointerdown', () => { playSfx(this, 'ui_click', { volume: 0.2 }); this.gameScene.selectPotion(kind); });
      this.potionSlots[kind] = { frame, icon, count, label, selectedMark };
    }
    this.potionHint = this.addUiText(230, 132, t('potionSelectHint', this.language, { key: (this.registry.get('keyBindings') || loadKeyBindings()).potion || 'Q' }), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '12px', color: '#ffe7a9',
      stroke: '#080d14', strokeThickness: 3
    }).setOrigin(0, 0.5);
  }

  createTouchControls() {
    this.touchControls = this.add.container(0, 0).setDepth(1100).setScrollFactor(0);
    this.touchButtons = {};
    this.touchAvailable = Boolean(this.sys.game.device.input.touch) || (globalThis.navigator?.maxTouchPoints || 0) > 0;
    const defs = [
      ['left', 'ui_left', 72, 622, 'KIRI'], ['right', 'ui_right', 160, 622, 'KANAN'],
      ['down', 'ui_down', 248, 622, 'TURUN'], ['up', 'ui_up', 336, 622, 'ATAS'], ['potion', 'ui_potion', 965, 622, 'POTION'],
      ['jump', 'ui_jump', 1070, 622, 'LOMPAT'], ['attack', 'ui_attack', 1175, 622, 'SERANG']
    ];
    defs.forEach(([prop, key, x, y, label]) => {
      const button = this.add.image(x, y, key).setDisplaySize(76, 78).setAlpha(0.78)
        .setInteractive({ useHandCursor: true });
      const baseScaleX = button.scaleX;
      const baseScaleY = button.scaleY;
      button.on('pointerdown', pointer => {
        pointer.event?.preventDefault?.();
        this.gameScene.touchState[prop] = true;
        button.setTint(0xffe7a5).setScale(baseScaleX * 0.94, baseScaleY * 0.94);
        if (prop === 'jump') this.gameScene.jump();
        if (prop === 'up' && !this.gameScene.tryClimb(-1)) this.gameScene.jump();
        if (prop === 'attack') this.gameScene.beginAttack();
        if (prop === 'potion') this.gameScene.consumePotion();
      });
      const release = () => {
        this.gameScene.touchState[prop] = false;
        button.clearTint().setScale(baseScaleX, baseScaleY);
      };
      button.on('pointerup', release);
      button.on('pointerupoutside', release);
      button.on('pointerout', release);
      this.touchButtons[prop] = button;
      this.touchControls.add(button);
    });
    this.touchControls.setVisible(this.touchAvailable && this.registry.get('touchControls') !== false);
  }

  createPauseOverlay() {
    this.pauseContainer = this.add.container(0, 0).setDepth(1500).setVisible(false).setScrollFactor(0);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x02050b, 0.78).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 430, 420, 0x100d0b, 0.97)
      .setStrokeStyle(3, 0xd8a52f, 1);
    const inset = this.add.rectangle(W / 2, H / 2, 414, 404, 0x0b0a09, 0.42)
      .setStrokeStyle(1, 0x60491c, 1);
    const title = this.addUiText(W / 2, 286, t('paused', this.language), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '38px', color: '#ffe29a',
      fontStyle: 'bold', stroke: '#251607', strokeThickness: 2
    }).setOrigin(0.5);
    title.setResolution?.(2);
    this.pauseMenuItems = this.add.container(0, 0);
    const resume = this.makePanelButton(W / 2, 370, 320, 52, t('resume', this.language), () => this.resumeGame(), true);
    const settings = this.makePanelButton(W / 2, 442, 320, 48, t('settings', this.language), () => this.openSettingsPanel());
    const menu = this.makePanelButton(W / 2, 514, 320, 48, t('mainMenu', this.language), () => this.goToMenu());
    this.pauseTitle = title;
    this.pauseButtonTexts = { resume: resume[1], settings: settings[1], menu: menu[1] };
    this.pauseMenuItems.add([...resume, ...settings, ...menu]);
    this.pauseContainer.add([shade, panel, inset, title, this.pauseMenuItems]);
    this.pauseVisible = false;
  }

  openSettingsPanel() {
    this.pauseContainer?.setVisible(false);
    this.settingsPanel?.setVisible(true);
  }

  createStageIntro() {
    this.stageIntro = this.add.container(0, 0).setDepth(1800).setScrollFactor(0).setVisible(false);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x03060c, 0.76).setInteractive();
    this.stageIntroTitle = this.addUiText(W / 2, 332, t('stageIntro', this.language, { dimension: 'I', stage: 1 }), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '38px', color: '#ffe29a',
      fontStyle: 'bold', stroke: '#241608', strokeThickness: 6
    }).setOrigin(0.5);
    this.stageIntroBarBg = this.add.rectangle(W / 2, 382, 520, 18, 0x090c12, 1)
      .setStrokeStyle(3, 0xd9a62d, 1);
    this.stageIntroBarFill = this.add.rectangle(382, 382, 1, 8, 0xffc72d, 1).setOrigin(0, 0.5);
    this.stageIntroStatus = this.addUiText(W / 2, 422, t('preparing', this.language), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '13px', color: '#f4d48a', letterSpacing: 2
    }).setOrigin(0.5);
    this.stageIntroTip = this.addUiText(W / 2, 470, t('tipStart', this.language), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '13px', color: '#aeb8c8',
      align: 'center', wordWrap: { width: 760 }
    }).setOrigin(0.5);
    this.stageIntro.add([shade, this.stageIntroTitle, this.stageIntroBarBg,
      this.stageIntroBarFill, this.stageIntroStatus, this.stageIntroTip]);
  }

  showStageIntro(data = {}) {
    if (!this.stageIntro) return;
    const stageNumber = data.stage || 1;
    this.stageIntroTitle.setText(t('stageIntro', this.language, { dimension: t(getDimensionKey(stageNumber), this.language), stage: stageNumber }));
    this.stageIntroStatus.setText(t('preparing', this.language));
    const stageNote = data.note ? t(data.note, this.language) : '';
    const tipKey = data.stage >= 8 ? 'tipGhost' : data.stage >= 4 ? 'tipGolem' : data.stage >= 2 ? 'tipRamp' : 'tipStart';
    this.stageIntroTip.setText([stageNote, t(tipKey, this.language)].filter(Boolean).join('\n'));
    this.stageIntro.setVisible(true);
    this.touchControls?.setVisible(false);
    this.stageIntroBarFill.width = 1;
    this.tweens.killTweensOf(this.stageIntroBarFill);
    this.tweens.add({ targets: this.stageIntroBarFill, width: 512, duration: 2600, ease: 'Sine.easeInOut' });
  }

  createResultOverlay() {
    this.resultContainer = this.add.container(0, 0).setDepth(1600).setVisible(false).setScrollFactor(0);
    this.resultNodes = [];
  }


  makePanelButton(x, y, width, height, label, callback, primary = false) {
    const rect = this.add.rectangle(x, y, width, height, primary ? 0xffbd00 : 0x17130f, 1)
      .setStrokeStyle(2, primary ? 0xffe078 : 0xb08b3d, 1).setInteractive({ useHandCursor: true });
    const fontSize = width < 220 ? 14 : 16;
    const text = this.addUiText(x, y, label, {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: `${fontSize}px`,
      color: primary ? '#171006' : '#fff4df', fontStyle: 'bold', letterSpacing: 0.35,
      align: 'center', wordWrap: { width: width - 24 }
    }).setOrigin(0.5);
    rect.on('pointerover', () => rect.setFillStyle(primary ? 0xffd24b : 0x3b2d19));
    rect.on('pointerout', () => rect.setFillStyle(primary ? 0xffbd00 : 0x17130f));
    rect.on('pointerdown', () => { playSfx(this, 'ui_click', { volume: 0.25 }); callback?.(); });
    return [rect, text];
  }

  bindPressFeedback(button, label) {
    // Simpan skala hasil setDisplaySize. setScale(1) akan mengembalikan ukuran asli
    // tekstur (714x738) dan membuat tombol membesar memenuhi layar.
    const baseScaleX = button.scaleX;
    const baseScaleY = button.scaleY;
    button.on('pointerdown', () => {
      button.setTint(0xffe8a0).setScale(baseScaleX * 0.95, baseScaleY * 0.95);
    });
    const release = () => button.clearTint().setScale(baseScaleX, baseScaleY);
    button.on('pointerup', release);
    button.on('pointerupoutside', release);
    button.on('pointerout', release);
  }

  layout() {
    // Semua elemen UI berada di UIScene dengan kamera tetap; tidak ikut bergeser bersama kamera dunia.
    this.hud?.setPosition(0, 0);
    this.touchControls?.setPosition(0, 0);
    this.stageIntro?.setPosition(0, 0);
  }

  update() {
    const game = this.gameScene;
    if (this.fpsText?.visible) this.fpsText.setText(`${Math.round(this.game.loop.actualFps || 0)} FPS`);
    if (!game || !game.player?.active) return;
    const hp = game.player.getData('hp') ?? 100;
    const maxHp = game.player.getData('maxHp') ?? 100;
    this.hpFill.clear();
    this.hpFill.fillStyle(0x6d171b, 0.85).fillRoundedRect(65, 27, 305, 14, 3);
    const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this.hpFill.fillStyle(pct < 0.25 ? 0xe44848 : 0x65d17d, 0.96).fillRoundedRect(65, 27, 305 * pct, 14, 3);
    this.hpText.setText(`${t('hp', this.language)} ${Math.ceil(hp)}/${maxHp}`);

    for (const [kind, slot] of Object.entries(this.potionSlots)) {
      const count = game.potionInventory?.filter(item => item === kind).length || 0;
      slot.count.setText(String(count));
      slot.frame.setStrokeStyle(game.selectedPotionType === kind ? 3 : 1,
        game.selectedPotionType === kind ? 0xffd65b : 0x6e592e, 0.95);
      slot.frame.setFillStyle(game.selectedPotionType === kind ? 0x30240f : 0x080d16,
        game.selectedPotionType === kind ? 0.98 : 0.88);
      slot.icon.setAlpha(count ? 1 : 0.42);
      slot.count.setColor(count ? '#fff0bd' : '#7f7a70');
      slot.selectedMark.setVisible(game.selectedPotionType === kind && count > 0);
    }
    const potionKey = (this.registry.get('keyBindings') || loadKeyBindings()).potion || 'Q';
    this.potionHint.setText(t('potionSelectHint', this.language, { key: potionKey }));
    const buffs = [];
    if (game.buffTimers.atk > 0) buffs.push(t('buffAtk', this.language, { seconds: Math.ceil(game.buffTimers.atk / 1000) }));
    if (game.buffTimers.spd > 0) buffs.push(t('buffSpd', this.language, { seconds: Math.ceil(game.buffTimers.spd / 1000) }));
    this.buffText.setText(buffs.join('   '));

    const progress = Math.floor(Phaser.Math.Clamp(game.player.x / game.exitX, 0, 1) * 100);
    this.mapLabel.setText(`${progress}%`);
    this.drawMiniMap(game, progress);
  }

  drawMiniMap(game, progress) {
    this.mapGraphics.clear();
    const left = 950, top = 42, width = 270, height = 94;
    this.mapGraphics.fillStyle(0x050913, 0.82).fillRect(left, top, width, height);
    const scaleX = width / game.level.width;
    this.mapGraphics.fillStyle(0x7a693f, 1).fillRect(left, top + height * 0.78, width, 3);
    this.mapGraphics.fillStyle(0x84b4c4, 0.9);
    for (const platform of game.level.platforms) {
      if (platform.kind === 'ground') continue;
      this.mapGraphics.fillRect(left + platform.x * scaleX, top + height * 0.78 - (game.level.stage ? Math.max(0, (CFG.GROUND_Y - platform.y) * 0.17) : 0),
        Math.max(2, platform.w * scaleX), 3);
    }
    this.mapGraphics.fillStyle(0xffd16b, 0.95);
    for (const ramp of (game.level.ramps || [])) {
      const x1 = left + ramp.x * scaleX;
      const x2 = left + (ramp.x + ramp.w) * scaleX;
      const baseY = top + height * 0.78;
      const highY = baseY - ramp.rise * 0.17;
      const y1 = ramp.direction === 'down' ? highY : baseY;
      const y2 = ramp.direction === 'down' ? baseY : highY;
      this.mapGraphics.lineStyle(2, 0xffd16b, 0.95).lineBetween(x1, y1, x2, y2);
    }
    this.mapGraphics.fillStyle(0xf4b74c, 1);
    for (const enemy of game.enemies) {
      if (!enemy.dead && enemy.sprite.active) this.mapGraphics.fillRect(left + enemy.sprite.x * scaleX, top + height * 0.72, 3, 3);
    }
    this.mapGraphics.fillStyle(0x6cf6c4, 1).fillCircle(left + game.exitX * scaleX, top + height * 0.68, 4);
    this.mapGraphics.fillStyle(0xffe16a, 1).fillCircle(left + game.player.x * scaleX, top + height * 0.65, 4);
  }

  updateStageLabel(data) {
    const dimension = t(getDimensionKey(data.stage), this.language);
    this.stageText?.setText(`${t('stage', this.language, { dimension, stage: data.stage })} · ${t(data.difficulty || 'normal', this.language)}`);
  }

  applyLanguage(language) {
    this.language = language;
    this.gameScene.setLanguage?.(language);
    this.registry.set('language', language);
    this.mapTitle?.setText(t('map', language));
    this.potionHint?.setText(t('potionSelectHint', language, { key: (this.registry.get('keyBindings') || loadKeyBindings()).potion || 'Q' }));
    for (const [kind, slot] of Object.entries(this.potionSlots || {})) {
      slot.label.setText(t(`potion${kind[0].toUpperCase()}${kind.slice(1)}Short`, language));
    }
    this.updateStageLabel({ stage: this.gameScene.stageNumber, difficulty: this.gameScene.difficulty });
    this.pauseTitle?.setText(t('paused', language));
    this.pauseButtonTexts?.resume.setText(t('resume', language));
    this.pauseButtonTexts?.settings.setText(t('settings', language));
    this.pauseButtonTexts?.menu.setText(t('mainMenu', language));
    if (this.stageIntro?.visible) this.showStageIntro({ stage: this.gameScene.stageNumber, note: this.gameScene.stageConfig?.note });
    if (this.resultContainer?.visible) {
      const type = this.lastResultType;
      const stats = this.lastResultStats;
      if (type && stats) { this.resultContainer.setVisible(false); this.showResult(type, stats); }
    }
  }

  togglePause() {
    if (this.resultContainer.visible || this.resultActionLock) return;
    if (this.pauseVisible) this.resumeGame();
    else {
      this.pauseVisible = true;
      this.stageIntro?.setVisible(false);
      this.settingsPanel?.setVisible(false);
      this.pauseContainer.setVisible(true);
      this.touchControls.setVisible(false);
      Object.keys(this.gameScene.touchState || {}).forEach(key => { this.gameScene.touchState[key] = false; });
      this.scene.pause('GameScene');
    }
  }

  resumeGame() {
    if (!this.pauseVisible || this.resultContainer.visible) return;
    this.pauseVisible = false;
    this.pauseContainer.setVisible(false);
    this.touchControls.setVisible(this.touchAvailable && this.registry.get('touchControls') !== false);
    Object.keys(this.gameScene.touchState || {}).forEach(key => { this.gameScene.touchState[key] = false; });
    this.scene.resume('GameScene');
  }

  toggleFullscreen() {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  showResult(type, stats) {
    this.lastResultType = type;
    this.lastResultStats = stats;
    if (this.resultContainer.visible || this.resultActionLock) return;
    this.scene.pause('GameScene');
    this.pauseVisible = false;
    this.pauseContainer.setVisible(false);
    this.hud.setVisible(false);
    this.touchControls.setVisible(false);
    Object.keys(this.gameScene.touchState || {}).forEach(key => { this.gameScene.touchState[key] = false; });
    this.stageIntro?.setVisible(false);
    this.resultContainer.removeAll(true);

    const panelW = 760, panelH = 548, cx = W / 2, cy = H / 2;
    const shade = this.add.rectangle(cx, cy, W, H, 0x01040a, 0.88).setInteractive();
    const panel = this.add.rectangle(cx, cy, panelW, panelH, 0x0b111b, 0.995).setStrokeStyle(3, 0xe0b23c, 1);
    const inset = this.add.rectangle(cx, cy, panelW - 18, panelH - 18, 0x111a27, 0.98).setStrokeStyle(1, 0x6e572b, 1);
    const topRule = this.add.rectangle(cx, cy - 250, 620, 3, type === 'victory' ? 0x66d99a : 0xe05a58, 1);
    const emblem = this.addUiText(cx, cy - 224, type === 'victory' ? '✦  ✦  ✦' : '✧  ✧  ✧', {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '18px', color: type === 'victory' ? '#8ff0b5' : '#ff9c8d',
      fontStyle: 'bold', letterSpacing: 4
    }).setOrigin(0.5);
    const titleKey = type === 'victory' ? 'victory' : 'defeat';
    const title = this.addUiText(cx, cy - 180, t(titleKey, this.language), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '34px', color: '#ffe29a',
      fontStyle: 'bold', stroke: '#251607', strokeThickness: 3, align: 'center', wordWrap: { width: 640 }
    }).setOrigin(0.5);
    const stage = this.addUiText(cx, cy - 139,
      t('stage', this.language, { dimension: t(getDimensionKey(stats.stage || this.gameScene.stageNumber), this.language), stage: stats.stage || this.gameScene.stageNumber }),
      { fontSize: '16px', color: '#e1d2ae', letterSpacing: 0.3, align: 'center' }).setOrigin(0.5);
    const subtitle = this.addUiText(cx, cy - 105, t(type === 'victory' ? 'victorySubtitle' : 'defeatSubtitle', this.language), {
      fontSize: '14px', color: '#c9d4e2', align: 'center', wordWrap: { width: 600 }
    }).setOrigin(0.5);
    this.resultContainer.add([shade, panel, inset, topRule, emblem, title, stage, subtitle]);

    const rows = [
      ['damageDone', String(stats.damageDone || 0)],
      ['damageTaken', String(stats.damageTaken || 0)],
      ['timePlayed', this.formatTime(stats.time || 0)],
      ['remainingHp', `${Math.max(0, Math.ceil(stats.hp ?? this.gameScene.player?.getData('hp') ?? 0))}/100`]
    ];
    rows.forEach(([key, value], index) => {
      const y = cy - 42 + index * 48;
      const rowBg = this.add.rectangle(cx, y, 560, 40, 0x172333, 0.98).setStrokeStyle(1, 0x53647a, 0.9);
      const label = this.addUiText(cx - 250, y, t(key, this.language), {
        fontSize: '15px', color: '#f0e4c9', fontStyle: 'bold'
      }).setOrigin(0, 0.5);
      const valueText = this.addUiText(cx + 250, y, value, {
        fontSize: '17px', color: '#fff1b6', fontStyle: 'bold'
      }).setOrigin(1, 0.5);
      this.resultContainer.add([rowBg, label, valueText]);
    });

    if (type === 'victory') {
      const finalStage = (stats.stage || this.gameScene.stageNumber) >= CFG.MAX_STAGE;
      const nextKey = finalStage ? 'finishRun' : 'nextStage';
      const next = this.makePanelButton(cx, cy + 220, 430, 56, t(nextKey, this.language), () => this.nextStage(), true);
      this.resultContainer.add(next);
    } else {
      const retry = this.makePanelButton(cx - 126, cy + 220, 236, 56, t('retry', this.language), () => this.restartRun(), true);
      const menu = this.makePanelButton(cx + 126, cy + 220, 236, 56, t('backToMenu', this.language), () => this.goToMenu(), false);
      this.resultContainer.add([...retry, ...menu]);
    }
    this.resultActionLock = false;
    this.resultContainer.setVisible(true);
  }

  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  nextStage() {
    if (this.resultActionLock) return;
    this.resultActionLock = true;
    const game = this.gameScene;
    if (game.stageNumber >= CFG.MAX_STAGE) {
      game.transitionToMainMenu();
      return;
    }
    game.transitionToStage({
      heroId: game.heroId,
      skinId: game.skinId,
      difficulty: game.difficulty,
      stage: game.stageNumber + 1,
      hp: Math.min(100, game.player.getData('hp') + 30),
      potions: [...game.potionInventory]
    });
  }

  restartCurrentStage() {
    if (this.resultActionLock) return;
    this.resultActionLock = true;
    const game = this.gameScene;
    game.transitionToStage({
      heroId: game.heroId, skinId: game.skinId, difficulty: game.difficulty,
      stage: game.stageNumber, hp: 100, potions: []
    });
  }

  restartRun() {
    if (this.resultActionLock) return;
    this.resultActionLock = true;
    const game = this.gameScene;
    game.transitionToStage({
      heroId: game.heroId, skinId: game.skinId, difficulty: game.difficulty,
      stage: 1, hp: 100, potions: []
    });
  }

  goToMenu() {
    if (this.resultActionLock) return;
    this.resultActionLock = true;
    this.gameScene.transitionToMainMenu();
  }

  shutdown() {
    this.settingsPanel?.destroy();
    this.scale.off('resize', this.layout, this);
    this.input.keyboard?.off('keydown', this.pauseFromKeyboard);
    if (this.gameScene?.events) {
      this.gameScene.events.off('fullscreen-request', this.onFullscreenRequest);
      this.gameScene.events.off('stagechange', this.onStageChange);
      this.gameScene.events.off('stageclear', this.onStageClear);
      this.gameScene.events.off('gameover', this.onGameOver);
      this.gameScene.events.off('introcomplete', this.onIntroComplete);
    }
  }

}
