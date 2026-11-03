import Phaser from 'phaser';
import { HEROES } from '../data/sprites.js';
import { SettingsPanel, loadKeyBindings } from '../ui/SettingsPanel.js';
import { getLanguage, t } from '../data/i18n.js';
import { playSfx, startMusic } from '../systems/AudioLibrary.js';

const W = 1280, H = 720;

function readStorage(key, fallback) {
  try { return globalThis.localStorage?.getItem(key) || fallback; }
  catch { return fallback; }
}
function writeStorage(key, value) {
  try { globalThis.localStorage?.setItem(key, String(value)); }
  catch { /* Browser storage is optional. */ }
}

export class MainMenuScene extends Phaser.Scene {
  constructor() { super('MainMenuScene'); }

  create() {
    this.language = getLanguage(this.registry);
    startMusic(this, 'menu_theme', { volume: 0.70, fadeMs: 650 });
    this.registry.set('language', this.language);
    if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = this.language;
    this.add.image(W / 2, H / 2, 'bg_dungeon').setDisplaySize(W, H).setTint(0x71839a).setAlpha(0.62);
    this.add.rectangle(W / 2, H / 2, W, H, 0x030711, 0.72);

    this.selectedHero = this.registry.get('selectedHero') || readStorage('rs_hero', 'knightess');
    if (!HEROES[this.selectedHero]) this.selectedHero = 'knightess';
    this.selectedSkin = this.registry.get('selectedSkin') || readStorage('rs_skin', 'default');
    this.difficulty = this.registry.get('difficulty') || readStorage('rs_difficulty', 'normal');
    if (!['easy', 'normal', 'hard'].includes(this.difficulty)) this.difficulty = 'normal';

    this.homeContainer = this.add.container(0, 0);
    this.selectContainer = this.add.container(0, 0).setVisible(false);
    this.createHomeScreen();
    this.createCharacterScreen();
    this.input.once('pointerdown', () => { if (this.sound?.locked) this.sound.unlock?.(); });
    this.settingsPanel = new SettingsPanel(this, {
      onClose: () => { this.selectContainer.setVisible(false); this.homeContainer.setVisible(true); },
      onDifficultyChange: id => { this.difficulty = id; },
      onLanguageChange: language => this.rebuildLocalizedScreens(language),
      depth: 900
    });
    this.refreshHeroSelection();
    this.refreshSkinSelection();
  }

  tr(key, vars) { return t(key, this.language, vars); }

  text(x, y, value, size, color = '#f4e7c4', extra = {}) {
    const text = this.add.text(x, y, value, {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: `${size}px`, color,
      stroke: '#080b12', strokeThickness: 1, ...extra
    }).setOrigin(0.5);
    text.setResolution?.(6);
    return text;
  }

  createHomeScreen() {
    const c = this.homeContainer;
    c.add(this.text(W / 2, 112, this.tr('tagline'), 15, '#e8bb3d', { letterSpacing: 1.4 }));
    c.add(this.text(W / 2, 218, 'THE UNIVERSE', 76, '#f7f1e9', {
      fontStyle: 'bold', stroke: '#1d1720', strokeThickness: 8, letterSpacing: 0.4
    }));
    c.add(this.text(W / 2, 306, this.tr('subtitle'), 17, '#c5ceda', { letterSpacing: 0.2 }));

    this.createButton(c, 500, 392, 236, 58, this.tr('menuPlay'), () => this.openCharacterSelect(), true);
    this.createButton(c, 780, 392, 236, 58, this.tr('settings'), () => this.openSettings(), false);

    const guideBg = this.add.rectangle(W / 2, 578, 900, 194, 0x05080e, 0.88)
      .setStrokeStyle(1, 0x987326, 0.92);
    const guideTitle = this.text(W / 2, 500, this.tr('controlGuide'), 15, '#ffdf76', { fontStyle: 'bold', letterSpacing: 1.2 });
    const bindings = { ...loadKeyBindings(), ...(this.registry.get('keyBindings') || {}) };
    const prettyKey = key => ({ SPACE: 'SPACE', ESC: 'ESC', LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓' }[key] || key);
    const withAlias = (key, alias) => key === alias ? prettyKey(key) : `${prettyKey(key)} / ${prettyKey(alias)}`;
    const leftText = [
      `${prettyKey(bindings.left)} / ${prettyKey(bindings.right)}  ·  ${this.tr('move')}`,
      `${withAlias(bindings.attack, 'ENTER')}  ·  ${this.tr('attack')}`,
      `${prettyKey(bindings.interact)}  ·  ${this.tr('interact')}`,
      `${withAlias(bindings.pause, 'P')}  ·  ${this.tr('pause')}`
    ].join('\n');
    const rightText = [
      `${prettyKey(bindings.jump)} / ${prettyKey(bindings.climb)}  ·  ${this.tr('jump')}`,
      `${prettyKey(bindings.down)}  ·  ${this.tr('descend')}`,
      `${prettyKey(bindings.potion)}  ·  ${this.tr('usePotion')}`,
      `${prettyKey(bindings.fullscreen)}  ·  ${this.tr('fullscreen')}`
    ].join('\n');
    const guideLeft = this.text(275, 548, leftText, 16, '#fff2d7', { align: 'left', lineSpacing: 8 }).setOrigin(0, 0);
    const guideRight = this.text(690, 548, rightText, 16, '#fff2d7', { align: 'left', lineSpacing: 8 }).setOrigin(0, 0);
    const guideFoot = this.text(W / 2, 656, this.tr('collectPotionHint'), 14, '#d6d0c3');
    c.add([guideBg, guideTitle, guideLeft, guideRight, guideFoot]);
  }

  createCharacterScreen() {
    const c = this.selectContainer;
    const panel = this.add.rectangle(W / 2, H / 2, 1040, 640, 0x100d0b, 0.97)
      .setStrokeStyle(3, 0xd9a92f, 1);
    c.add(panel);
    c.add(this.text(W / 2, 70, this.tr('newAdventure'), 14, '#ffbd00', { letterSpacing: 1.8 }));
    c.add(this.text(W / 2, 124, this.tr('chooseCharacter'), 32, '#ffe29a', { fontStyle: 'bold', letterSpacing: 0.6 }));

    this.heroCards = {};
    this.createHeroCard('knight', 470);
    this.createHeroCard('knightess', 810);

    c.add(this.text(W / 2, 506, this.tr('skins'), 17, '#ffcf43', { letterSpacing: 1.1 }));
    this.skinButtons = {};
    this.createSkinButton('default', this.tr('defaultSkin'), 480, true);
    this.createSkinButton('locked-1', `🔒 ${this.tr('comingSoon')}`, 640, false);
    this.createSkinButton('locked-2', `🔒 ${this.tr('comingSoon')}`, 800, false);

    // Keep the skin selector visually centered with a dedicated gap before the actions.
    this.createButton(c, 500, 610, 236, 54, this.tr('mainMenu'), () => this.showHomeScreen(), true);
    this.createButton(c, 780, 610, 236, 54, this.tr('startGame'), () => this.startRun(), true);
    c.add(this.text(W / 2, 672, this.tr('skinSoonHint'), 14, '#f2e7ce'));  
  }

  createHeroCard(id, x) {
    const hero = HEROES[id];
    const isKnightess = id === 'knightess';
    const card = this.add.rectangle(x, 342, 300, 282, 0x100d0b, 0.96)
      .setStrokeStyle(2, 0x70551e, 1).setInteractive({ useHandCursor: true });
    const sprite = this.add.sprite(x, 300, hero.sheet, 0)
      .setScale(isKnightess ? 0.235 : 0.265).setOrigin(0.5, 0.5);
    sprite.play(`${hero.sheet}-idle`);
    const title = this.text(x, 378, this.tr(id), 18, '#ffe29a', { fontStyle: 'bold' });
    const description = this.text(x, 406, this.tr(id === 'knightess' ? 'knightessDesc' : 'knightDesc'), 15, '#e7ddc9');
    const stats = this.text(x, 436, this.tr('damageSpeed', {
      damage: hero.damage, speed: Number(hero.speed).toFixed(1)
    }), 14, '#f1c64f');
    const selected = this.text(x, 464, this.tr('selected'), 14, '#75e4a0', { fontStyle: 'bold' }).setVisible(false);
    const choose = () => {
      playSfx(this, 'ui_click', { volume: 0.28 });
      this.selectedHero = id;
      const validSkins = hero.skins?.map(skin => skin.id) || ['default'];
      if (!validSkins.includes(this.selectedSkin)) this.selectedSkin = validSkins[0] || 'default';
      writeStorage('rs_hero', id);
      this.registry.set('selectedHero', id);
      this.refreshHeroSelection();
      this.refreshSkinSelection();
    };
    card.on('pointerdown', choose);
    this.heroCards[id] = { card, sprite, title, description, stats, selected, choose };
    this.selectContainer.add([card, sprite, title, description, stats, selected]);
  }

  createSkinButton(id, label, x, available) {
    const box = this.add.rectangle(x, 542, 150, 44, available ? 0x3b2b10 : 0x15120f, 0.98)
      .setStrokeStyle(2, available ? 0xd7aa37 : 0x51452e, 1);
    const text = this.text(x, 542, label, 16, available ? '#ffe8a0' : '#c7b99e', { fontStyle: 'bold' });
    if (available) {
      box.setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => {
        this.selectedSkin = id;
        writeStorage('rs_skin', id);
        this.registry.set('selectedSkin', id);
        this.refreshSkinSelection();
      });
    }
    this.skinButtons[id] = { box, text, available };
    this.selectContainer.add([box, text]);
  }

  refreshHeroSelection() {
    Object.entries(this.heroCards || {}).forEach(([id, item]) => {
      const active = id === this.selectedHero;
      item.card.setStrokeStyle(active ? 4 : 2, active ? 0xffc62e : 0x70551e, 1);
      item.card.setFillStyle(active ? 0x2a200f : 0x100d0b, 0.98);
      item.selected.setVisible(active);
      item.sprite.setAlpha(active ? 1 : 0.60);
    });
  }

  refreshSkinSelection() {
    Object.entries(this.skinButtons || {}).forEach(([id, item]) => {
      const active = id === this.selectedSkin && item.available;
      if (item.available) {
        item.box.setFillStyle(active ? 0x614515 : 0x30230e, 0.98);
        item.box.setStrokeStyle(active ? 3 : 2, active ? 0xffd65b : 0x9a7730, 1);
        item.text.setColor(active ? '#fff0b0' : '#d7ddef');
      }
    });
  }

  createButton(container, x, y, width, height, label, callback, primary = false) {
    const fill = primary ? 0xffbd00 : 0x17130f;
    const stroke = primary ? 0xffd55a : 0x967323;
    const bg = this.add.rectangle(x, y, width, height, fill, 1)
      .setStrokeStyle(2, stroke, 1).setInteractive({ useHandCursor: true });
    const inner = this.add.rectangle(x, y, width - 8, height - 8,
      primary ? 0xffd34a : 0x21180c, primary ? 1 : 0.98);
    const text = this.text(x, y, label, 16, primary ? '#1c1304' : '#fff0c9', {
      fontStyle: 'bold', letterSpacing: 0.4, wordWrap: { width: width - 22 }
    });
    bg.on('pointerover', () => { bg.setFillStyle(primary ? 0xffd34e : 0x493314); text.setColor(primary ? '#160f04' : '#ffe7a0'); });
    bg.on('pointerout', () => { bg.setFillStyle(fill); text.setColor(primary ? '#1c1304' : '#fff0c9'); });
    bg.on('pointerdown', () => { playSfx(this, 'ui_click', { volume: 0.26 }); bg.setScale(0.985); callback?.(); });
    bg.on('pointerup', () => bg.setScale(1));
    bg.on('pointerupoutside', () => bg.setScale(1));
    container.add([bg, inner, text]);
    return bg;
  }

  openCharacterSelect() {
    this.homeContainer.setVisible(false);
    this.selectContainer.setVisible(true);
    this.settingsPanel?.setVisible(false);
    this.refreshHeroSelection();
    this.refreshSkinSelection();
  }

  showHomeScreen() {
    this.selectContainer.setVisible(false);
    this.settingsPanel?.setVisible(false);
    this.homeContainer.setVisible(true);
  }

  openSettings() {
    this.homeContainer.setVisible(false);
    this.selectContainer.setVisible(false);
    this.settingsPanel?.setVisible(true);
  }

  rebuildLocalizedScreens(language) {
    const homeWasVisible = Boolean(this.homeContainer?.visible);
    const selectWasVisible = Boolean(this.selectContainer?.visible);
    this.language = language;
    this.homeContainer?.destroy(true);
    this.selectContainer?.destroy(true);
    this.homeContainer = this.add.container(0, 0).setVisible(homeWasVisible);
    this.selectContainer = this.add.container(0, 0).setVisible(selectWasVisible);
    this.createHomeScreen();
    this.createCharacterScreen();
    this.refreshHeroSelection();
    this.refreshSkinSelection();
  }

  startRun() {
    this.registry.set('selectedHero', this.selectedHero);
    this.registry.set('selectedSkin', this.selectedSkin);
    this.registry.set('difficulty', this.difficulty);
    this.registry.set('language', this.language);
    writeStorage('rs_hero', this.selectedHero);
    writeStorage('rs_skin', this.selectedSkin);
    writeStorage('rs_difficulty', this.difficulty);
    this.scene.start('GameScene', {
      heroId: this.selectedHero, skinId: this.selectedSkin,
      difficulty: this.difficulty, language: this.language, stage: 1
    });
  }
}
