import Phaser from 'phaser';
import { HEROES } from '../data/sprites.js';
import { getLanguage, t } from '../data/i18n.js';

const ASSETS = {
  map: [
    'bg_dungeon', 'platform', 'construction', 'road_ground', 'road', 'slope_ground',
    'wall_0','wall_1','wall_2','wall_3','wall_4','wall_5','wall_6','wall_7','wall_8','wall_9','wall_10','wall_11'
  ],
  player: ['hero_cowo', 'hero_cewe'],
  enemy: ['musuh', 'musuh2', 'musuh3'],
  objects: [
    'portal', 'chest_potion', 'chest_0', 'chest_1', 'chest_2',
    'potion_hp', 'potion_spd', 'potion_atk',
    'portal_active_0','portal_active_1','portal_active_2','portal_active_3','portal_active_4','portal_active_5','portal_active_6','portal_active_7',
    'portal_open_0','portal_open_1','portal_open_2','portal_open_3','portal_open_4','portal_open_5','portal_open_6','portal_open_7',
    'portal_close_0','portal_close_1','portal_close_2','portal_close_3','portal_close_4','portal_close_5','portal_close_6','portal_close_7'
  ],
  ui: [
    'hp_bar','hp_fill','hp_frame','hp_heart','frame_minimap','victory','lose',
    'UI_button','pause_fullscreen','ui_pause','ui_fullscreen','ui_main_menu','ui_retry_stage',
    'ui_left','ui_right','ui_up','ui_down','ui_jump','ui_potion','ui_attack'
  ]
};
const CROP_GROUPS = { platform: 6, spike: 5, block: 7, ladder: 2, icicle: 3 };
const AUDIO_FILES = [
  'ui_click', 'sword_swing', 'sword_hit', 'slime_hit', 'golem_slam', 'ghost_zap',
  'potion_use', 'heart_pickup', 'chest_open', 'portal_open', 'stage_clear', 'game_over', 'dungeon_ambience'
];

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const base = `${import.meta.env.BASE_URL}assets/img/`;
    const width = 1280, height = 720;
    const language = getLanguage(this.registry);
    this.add.rectangle(width / 2, height / 2, width, height, 0x050913, 1);
    this.add.text(width / 2, 306, 'THE UNIVERSE', {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '46px', color: '#ffe29a',
      fontStyle: 'bold', stroke: '#241606', strokeThickness: 7
    }).setOrigin(0.5).setResolution(3);
    this.add.text(width / 2, 365, t('preparing', language), {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: '16px', color: '#c9d5eb'
    }).setOrigin(0.5).setResolution(3);
    this.add.rectangle(width / 2, 412, 320, 8, 0x35435a).setOrigin(0.5);
    const fill = this.add.rectangle(width / 2 - 160, 412, 1, 5, 0xffc94a).setOrigin(0, 0.5);
    this.load.on('progress', value => { fill.width = 318 * value; });

    for (const [folder, files] of Object.entries(ASSETS)) {
      for (const key of files) this.load.image(key, `${base}${folder}/${key}.webp`);
    }
    for (const [prefix, count] of Object.entries(CROP_GROUPS)) {
      for (let i = 0; i < count; i++) this.load.image(`${prefix}_${i}`, `${base}map/${prefix}_${i}.webp`);
    }

    this.load.spritesheet('heroM', `${base}player/hero_cowo.webp`, { frameWidth: 344, frameHeight: 384 });
    this.load.spritesheet('heroF', `${base}player/hero_cewe.webp`, { frameWidth: 300, frameHeight: 448 });
    this.load.spritesheet('slime', `${base}enemy/musuh.webp`, { frameWidth: 344, frameHeight: 384 });
    this.load.spritesheet('golem', `${base}enemy/musuh2.webp`, { frameWidth: 344, frameHeight: 384 });
    this.load.spritesheet('ghost', `${base}enemy/musuh3.webp`, { frameWidth: 344, frameHeight: 384 });
    this.load.spritesheet('portalSheet', `${base}objects/portal.webp`, { frameWidth: 344, frameHeight: 512 });
    const audioBase = `${import.meta.env.BASE_URL}assets/audio/`;
    for (const key of AUDIO_FILES) this.load.audio(key, `${audioBase}${key}.wav`);
    this.load.audio('menu_theme', `${audioBase}menu_theme.ogg`);
    this.load.audio('gameplay_theme', `${audioBase}gameplay_theme.ogg`);
    this.load.on('loaderror', file => console.warn('[The Universe] Asset failed to load:', file.key, file.src));
  }

  create() {
    this.createAnimations();
    const readStorage = (key, fallback) => {
      try { return globalThis.localStorage?.getItem(key) || fallback; }
      catch { return fallback; }
    };
    const savedHero = readStorage('rs_hero', 'knightess');
    const savedDifficulty = readStorage('rs_difficulty', 'normal');
    const language = getLanguage(this.registry);
    this.registry.set('language', language);
    this.registry.set('selectedHero', HEROES[savedHero] ? savedHero : 'knightess');
    this.registry.set('selectedSkin', readStorage('rs_skin', 'default'));
    this.registry.set('difficulty', ['easy', 'normal', 'hard'].includes(savedDifficulty) ? savedDifficulty : 'normal');
    this.registry.set('stage', 1);
    this.scene.start('MainMenuScene');
  }

  createAnimations() {
    const make = (key, texture, row, start, end, rate, repeat = -1) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: row * 8 + start, end: row * 8 + end }),
        frameRate: rate,
        repeat
      });
    };

    for (const hero of Object.values(HEROES)) {
      const texture = hero.sheet;
      make(`${texture}-idle`, texture, 0, 0, 7, 8, -1);
      make(`${texture}-run`, texture, 1, 0, 7, 12, -1);
      make(`${texture}-attack`, texture, 2, 0, 7, 15, 0);
      make(`${texture}-hurt`, texture, 3, 0, 1, 10, 0);
      make(`${texture}-death`, texture, 3, 3, 7, 7, 0);
      make(`${texture}-jump`, texture, 1, 4, 4, 1, 0);
    }

    const enemyRows = {
      slime: { idle: [0, 7, 7], move: [8, 15, 12], attack: [16, 21, 12], death: [27, 31, 8] },
      golem: { idle: [0, 7, 6], move: [8, 15, 9], attack: [16, 23, 8], death: [26, 31, 7] },
      ghost: { idle: [0, 7, 7], move: [8, 15, 10], attack: [18, 21, 12], death: [26, 30, 8] }
    };
    for (const [texture, animations] of Object.entries(enemyRows)) {
      for (const [name, [start, end, rate]] of Object.entries(animations)) {
        const key = `${texture}-${name}`;
        if (!this.anims.exists(key)) this.anims.create({
          key, frames: this.anims.generateFrameNumbers(texture, { start, end }), frameRate: rate,
          repeat: name === 'death' || name === 'attack' ? 0 : -1
        });
      }
    }
    // Close-range ground slam has its own readable impact animation instead of idling.
    if (!this.anims.exists('golem-slam')) this.anims.create({
      key: 'golem-slam',
      frames: this.anims.generateFrameNumbers('golem', { start: 16, end: 23 }),
      frameRate: 16,
      repeat: 0
    });
    for (const [name, row] of [['open', 0], ['active', 1], ['close', 2]]) {
      const key = `portal-${name}`;
      if (!this.anims.exists(key)) this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('portalSheet', { start: row * 8, end: row * 8 + 7 }),
        frameRate: 10,
        repeat: name === 'active' ? -1 : 0
      });
    }
  }
}
