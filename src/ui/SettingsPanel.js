import { getLanguage, t } from '../data/i18n.js';
import { playSfx, getAudioSettings, setAudioSettings } from '../systems/AudioLibrary.js';

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  left: 'A', right: 'D', jump: 'SPACE', attack: 'Z', interact: 'E',
  potion: 'Q', climb: 'W', down: 'S', pause: 'ESC', fullscreen: 'F'
});

const STORAGE = {
  difficulty: 'rs_difficulty', quality: 'rs_quality', touch: 'rs_touch_controls',
  showFps: 'rs_show_fps', keyBindings: 'rs_keybinds', language: 'tu_language'
};

function safeGet(key, fallback = null) {
  try { return globalThis.localStorage?.getItem(key) ?? fallback; }
  catch { return fallback; }
}
function safeSet(key, value) {
  try { globalThis.localStorage?.setItem(key, String(value)); }
  catch { /* Settings remain usable when storage is unavailable. */ }
}

export function loadKeyBindings() {
  try {
    const stored = JSON.parse(safeGet(STORAGE.keyBindings, '{}'));
    return { ...DEFAULT_KEY_BINDINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

export function normalizeKeyEvent(event) {
  const code = event?.code || '';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  const aliases = {
    ' ': 'SPACE', Space: 'SPACE', Escape: 'ESC', Esc: 'ESC',
    ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
    Enter: 'ENTER', Backspace: 'BACKSPACE', Tab: 'TAB',
    ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL',
    AltLeft: 'ALT', AltRight: 'ALT'
  };
  return aliases[event?.key] || String(event?.key || '').toUpperCase();
}

const ACTION_KEYS = {
  left: 'moveLeft', right: 'moveRight', jump: 'jump', attack: 'attack',
  interact: 'interact', potion: 'usePotion', climb: 'climb', down: 'down',
  pause: 'pause', fullscreen: 'fullscreen'
};

export class SettingsPanel {
  constructor(scene, {
    onClose = () => {}, onDifficultyChange = () => {}, onQualityChange = () => {},
    onTouchChange = () => {}, onFpsChange = () => {}, onKeyBindingsChange = () => {},
    onLanguageChange = () => {}, depth = 2100
  } = {}) {
    this.scene = scene;
    this.onClose = onClose;
    this.onDifficultyChange = onDifficultyChange;
    this.onQualityChange = onQualityChange;
    this.onTouchChange = onTouchChange;
    this.onFpsChange = onFpsChange;
    this.onKeyBindingsChange = onKeyBindingsChange;
    this.onLanguageChange = onLanguageChange;
    this.depth = depth;
    this.activeTab = 'game';
    this.waitingAction = null;
    this.keyBindings = loadKeyBindings();
    this.language = getLanguage(scene.registry);
    this.difficulty = safeGet(STORAGE.difficulty, scene.registry.get('difficulty') || 'normal');
    if (!['easy', 'normal', 'hard'].includes(this.difficulty)) this.difficulty = 'normal';
    this.quality = safeGet(STORAGE.quality, scene.registry.get('graphicsQuality') || 'medium');
    if (!['low', 'medium', 'high'].includes(this.quality)) this.quality = 'medium';
    this.touchEnabled = safeGet(STORAGE.touch, scene.registry.get('touchControls') === false ? 'false' : 'true') !== 'false';
    this.showFps = safeGet(STORAGE.showFps, scene.registry.get('showFps') ? 'true' : 'false') === 'true';
    this.audioSettings = getAudioSettings(scene.registry);
    this.waitingSlider = null;
    this.onSliderPointerMove = this.onSliderPointerMove.bind(this);
    this.onSliderPointerUp = this.onSliderPointerUp.bind(this);
    this.build();
    scene.registry.set('keyBindings', this.keyBindings);
    scene.registry.set('difficulty', this.difficulty);
    scene.registry.set('graphicsQuality', this.quality);
    scene.registry.set('touchControls', this.touchEnabled);
    scene.registry.set('showFps', this.showFps);
    scene.registry.set('language', this.language);
  }

  tr(key, vars) { return t(key, this.language, vars); }

  text(x, y, value, size = 16, color = '#eee3c7', extra = {}) {
    const text = this.scene.add.text(x, y, value, {
      fontFamily: 'Arial, Segoe UI, sans-serif', fontSize: `${Math.max(17, size)}px`,
      color: color || '#fff6e8', stroke: '#080501', strokeThickness: 1,
      ...extra
    }).setOrigin(0.5);
    text.setResolution?.(6);
    return text;
  }

  build() {
    const s = this.scene;
    this.container = s.add.container(0, 0).setDepth(this.depth).setScrollFactor(0).setVisible(false);
    const shade = s.add.rectangle(640, 360, 1280, 720, 0x02040a, 0.88).setInteractive();
    const panel = s.add.rectangle(640, 360, 1000, 620, 0x100b05, 1).setStrokeStyle(3, 0xffcf4d, 1);
    const inner = s.add.rectangle(640, 360, 980, 600, 0x191108, 1).setStrokeStyle(1, 0xb88b2d, 1);
    const eyebrow = this.text(640, 70, this.tr('settingsEyebrow'), 12, '#c99b2d', { letterSpacing: 1.1 });
    const title = this.text(640, 112, this.tr('settingsTitle'), 34, '#ffe18a', { fontStyle: 'bold', letterSpacing: 1.3 });
    const close = this.button(1090, 82, 48, 40, '×', () => this.close(), false);
    this.container.add([shade, panel, inner, eyebrow, title, ...close]);

    this.tabButtons = {};
    const tabDefs = [['game', 'general', 355], ['controls', 'controls', 545], ['video', 'video', 735], ['audio', 'audio', 925]];
    for (const [id, key, x] of tabDefs) {
      const nodes = this.button(x, 166, 170, 44, this.tr(key), () => this.showTab(id), id === this.activeTab);
      this.container.add(nodes);
      this.tabButtons[id] = nodes;
    }

    this.pages = {
      game: s.add.container(0, 0),
      controls: s.add.container(0, 0),
      video: s.add.container(0, 0),
      audio: s.add.container(0, 0)
    };
    Object.values(this.pages).forEach(page => this.container.add(page));
    this.buildGamePage();
    this.buildControlsPage();
    this.buildVideoPage();
    this.buildAudioPage();
    this.showTab(this.activeTab);
  }

  button(x, y, w, h, label, callback, primary = false) {
    const s = this.scene;
    const bg = s.add.rectangle(x, y, w, h, primary ? 0xffc83d : 0x2a1c0b, 1)
      .setStrokeStyle(primary ? 2 : 1, primary ? 0xffe27b : 0xc39a43, 1)
      .setInteractive({ useHandCursor: true });
    const baseFill = primary ? 0xffc83d : 0x2a1c0b;
    const txt = this.text(x, y, label, 18, primary ? '#211300' : '#fff7e7', {
      fontStyle: 'bold', wordWrap: { width: w - 16 }
    });
    bg.on('pointerover', () => { bg.setFillStyle(primary ? 0xffdc66 : 0x604718, 1); txt.setColor(primary ? '#1c1200' : '#fff2c9'); });
    bg.on('pointerout', () => { bg.setFillStyle(baseFill, 1); txt.setColor(primary ? '#1c1200' : '#fff7e8'); });
    bg.on('pointerdown', () => { playSfx(s, 'ui_click', { volume: 0.25 }); callback?.(); });
    return [bg, txt];
  }

  addSectionTitle(page, x, y, label) {
    page.add(this.text(x, y, label, 15, '#ffd76b', { fontStyle: 'bold', letterSpacing: 1 }).setOrigin(0, 0.5));
  }

  buildGamePage() {
    const page = this.pages.game;
    this.addSectionTitle(page, 250, 230, this.tr('difficulty'));
    page.add(this.text(640, 257, this.tr('difficultyHint'), 16, '#fff4df')); 
    this.difficultyCards = {};
    const cards = [
      ['easy', 'easyDesc', 410], ['normal', 'normalDesc', 640], ['hard', 'hardDesc', 870]
    ];
    for (const [id, descKey, x] of cards) {
      const bg = this.scene.add.rectangle(x, 365, 208, 158, 0x33220b, 1)
        .setStrokeStyle(2, 0xb18a39, 1).setInteractive({ useHandCursor: true });
      const heading = this.text(x, 318, this.tr(id), 20, '#ffe18a', { fontStyle: 'bold' });
      const detail = this.text(x, 371, this.tr(descKey), 16, '#fffaf0', {
        align: 'center', wordWrap: { width: 176 }, lineSpacing: 4
      });
      const state = this.text(x, 425, this.tr('choose'), 15, '#fff0d4', { fontStyle: 'bold' });
      bg.on('pointerdown', () => this.setDifficulty(id));
      this.difficultyCards[id] = { bg, heading, detail, state };
      page.add([bg, heading, detail, state]);
    }
    this.difficultySummary = this.text(640, 461, '', 15, '#fff4c9', { align: 'center', wordWrap: { width: 820 } });
    page.add(this.difficultySummary);

    this.addSectionTitle(page, 250, 524, this.tr('language'));
    page.add(this.text(640, 550, this.tr('languageDescription'), 16, '#fff4df')); 
    this.languageButtons = {};
    for (const [id, key, x] of [['id', 'indonesian', 550], ['en', 'english', 730]]) {
      const nodes = this.button(x, 594, 154, 38, this.tr(key), () => this.setLanguage(id), id === this.language);
      page.add(nodes);
      this.languageButtons[id] = nodes;
    }
    this.refreshDifficulty();
    this.refreshLanguage();
  }

  buildControlsPage() {
    const page = this.pages.controls;
    this.addSectionTitle(page, 250, 224, this.tr('controlsPc'));
    page.add(this.text(640, 252, this.tr('controlsPcHint'), 16, '#fff4df')); 
    const actions = [
      ['left', 'moveLeft'], ['right', 'moveRight'], ['jump', 'jump'], ['attack', 'attack'], ['interact', 'interact'],
      ['potion', 'usePotion'], ['climb', 'climb'], ['down', 'down'], ['pause', 'pause'], ['fullscreen', 'fullscreen']
    ];
    this.keyRows = {};
    const left = actions.slice(0, 5), right = actions.slice(5);
    const makeRows = (items, baseX) => items.forEach(([id, labelKey], index) => {
      const y = 300 + index * 42;
      const label = this.text(baseX, y, this.tr(labelKey), 17, '#fff4df', { align: 'left' }).setOrigin(0, 0.5);
      const keyBg = this.scene.add.rectangle(baseX + 218, y, 78, 32, 0x0c0905, 1).setStrokeStyle(1, 0xb68b36, 1);
      const keyText = this.text(baseX + 218, y, this.keyBindings[id], 16, '#ffdf79', { fontStyle: 'bold' });
      const bind = this.button(baseX + 306, y, 72, 32, this.tr('remap'), () => this.beginRemap(id), false);
      page.add([label, keyBg, keyText, ...bind]);
      this.keyRows[id] = { label, keyText, bindBg: bind[0], bindText: bind[1], labelKey };
    });
    makeRows(left, 245);
    makeRows(right, 680);

    page.add(this.scene.add.rectangle(640, 524, 850, 1, 0x6b5425, 0.8));
    this.androidNote = this.text(640, 550, this.tr('controlsAndroid'), 17, '#fff4df', {
      align: 'center', wordWrap: { width: 840 }, lineSpacing: 3
    });
    page.add(this.androidNote);
    this.touchToggle = this.button(535, 612, 240, 40, '', () => this.toggleTouch(), true);
    page.add(this.touchToggle);
    const reset = this.button(790, 612, 190, 40, this.tr('resetKeys'), () => this.resetKeys(), false);
    page.add(reset);
    this.captureText = this.text(640, 657, '', 14, '#ffe18a', { fontStyle: 'bold' });
    page.add(this.captureText);
    this.refreshKeyRows();
  }

  buildVideoPage() {
    const page = this.pages.video;
    this.addSectionTitle(page, 250, 230, this.tr('videoQuality'));
    page.add(this.text(640, 259, this.tr('videoHint'), 16, '#f0eee7')); 
    this.qualityCards = {};
    const options = [['low', 'lowDesc', 410], ['medium', 'mediumDesc', 640], ['high', 'highDesc', 870]];
    for (const [id, descKey, x] of options) {
      const bg = this.scene.add.rectangle(x, 374, 208, 148, 0x33220b, 1)
        .setStrokeStyle(2, 0xb18a39, 1).setInteractive({ useHandCursor: true });
      const heading = this.text(x, 333, this.tr(id), 19, '#ffe18a', { fontStyle: 'bold' });
      const detail = this.text(x, 383, this.tr(descKey), 16, '#fffaf0', {
        align: 'center', wordWrap: { width: 178 }, lineSpacing: 4
      });
      const state = this.text(x, 431, this.tr('choose'), 15, '#fff0d4', { fontStyle: 'bold' });
      bg.on('pointerdown', () => this.setQuality(id));
      this.qualityCards[id] = { bg, heading, detail, state };
      page.add([bg, heading, detail, state]);
    }
    this.qualitySummary = this.text(640, 478, '', 15, '#fff4c9');
    page.add(this.qualitySummary);
    const fullscreen = this.button(500, 574, 230, 48, this.tr('toggleFullscreen'), () => this.toggleFullscreen(), true);
    const fps = this.button(780, 574, 230, 48, '', () => this.toggleFps(), false);
    page.add([...fullscreen, ...fps]);
    this.fpsButton = fps;
    this.refreshQuality();
    this.refreshFps();
  }

  buildAudioPage() {
    const page = this.pages.audio;
    this.addSectionTitle(page, 250, 230, this.tr('audioSettings'));
    page.add(this.text(640, 260, this.tr('audioHint'), 16, '#fff4df'));
    this.audioSliders = {};
    this.createAudioSlider(page, 'master', 'masterVolume', 330);
    this.createAudioSlider(page, 'music', 'musicVolume', 410);
    this.createAudioSlider(page, 'sfx', 'sfxVolume', 490);
    this.muteButton = this.button(640, 590, 330, 48, '', () => {
      this.audioSettings = setAudioSettings(this.scene.registry, { muted: !this.audioSettings.muted });
      this.refreshAudioPage();
    }, true);
    page.add(this.muteButton);
    this.audioStatus = this.text(640, 635, this.tr('audioHint'), 16, '#fff3d8');
    page.add(this.audioStatus);
    this.scene.input.on('pointermove', this.onSliderPointerMove, this);
    this.scene.input.on('pointerup', this.onSliderPointerUp, this);
    this.refreshAudioPage();
  }

  createAudioSlider(page, id, labelKey, y) {
    const label = this.text(280, y, this.tr(labelKey), 18, '#fff2d8', { fontStyle: 'bold', align: 'left' }).setOrigin(0, 0.5);
    const left = 540, width = 430;
    const track = this.scene.add.rectangle(left + width / 2, y, width, 12, 0x090805, 1)
      .setStrokeStyle(2, 0xb98d36, 1);
    const fill = this.scene.add.rectangle(left, y, 1, 6, 0xffc83e, 1).setOrigin(0, 0.5);
    const knob = this.scene.add.circle(left, y, 12, 0xffd45a, 1).setStrokeStyle(2, 0xffefae, 1);
    const value = this.text(1035, y, '0%', 17, '#ffe49b', { fontStyle: 'bold' });
    const hitArea = this.scene.add.rectangle(left + width / 2, y, width + 30, 38, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', pointer => {
      this.waitingSlider = id;
      this.updateAudioSliderFromPointer(id, pointer);
    });
    page.add([label, track, fill, knob, value, hitArea]);
    this.audioSliders[id] = { label, track, fill, knob, value, hitArea, left, width, y, labelKey };
  }

  updateAudioSliderFromPointer(id, pointer) {
    const slider = this.audioSliders?.[id];
    if (!slider || !pointer) return;
    const value = Math.max(0, Math.min(1, (pointer.x - slider.left) / slider.width));
    this.audioSettings = setAudioSettings(this.scene.registry, { [id]: value });
    this.refreshAudioPage();
  }

  onSliderPointerMove(pointer) {
    if (this.waitingSlider && pointer?.isDown) this.updateAudioSliderFromPointer(this.waitingSlider, pointer);
  }

  onSliderPointerUp() { this.waitingSlider = null; }

  onSliderPointerOut() { this.waitingSlider = null; }

  refreshAudioPage() {
    if (!this.audioSliders) return;
    for (const [id, slider] of Object.entries(this.audioSliders)) {
      const value = this.audioSettings[id] ?? 0;
      slider.fill.width = Math.max(1, slider.width * value);
      slider.knob.x = slider.left + slider.width * value;
      slider.value.setText(`${Math.round(value * 100)}%`);
      slider.label.setText(this.tr(slider.labelKey));
    }
    if (this.muteButton) {
      const muted = this.audioSettings.muted;
      this.muteButton[0].setFillStyle(muted ? 0x4a330d : 0xffc83d, 1);
      this.muteButton[0].setStrokeStyle(2, muted ? 0xffdc66 : 0xffe69a, 1);
      this.muteButton[1].setText(this.tr('muteAudio', { state: this.tr(muted ? 'on' : 'off') }));
      this.muteButton[1].setColor(muted ? '#fff4d8' : '#211300');
    }
    this.audioStatus?.setText(this.audioSettings.muted ? this.tr('audioMutedHint') : this.tr('audioEnabledHint'));
  }

  showTab(id) {
    if (!this.pages?.[id]) return;
    this.activeTab = id;
    if (id === 'audio') {
      this.audioSettings = getAudioSettings(this.scene.registry);
      this.refreshAudioPage();
    }
    Object.entries(this.pages).forEach(([key, page]) => page.setVisible(key === id));
    Object.entries(this.tabButtons).forEach(([key, nodes]) => {
      const selected = key === id;
      nodes[0].setFillStyle(selected ? 0x67450b : 0x2a1c0b, 1);
      nodes[0].setStrokeStyle(selected ? 3 : 1, selected ? 0xffdf79 : 0xc49a35, 1);
      nodes[1].setColor(selected ? '#fff0b8' : '#fff7e7');
      nodes[1].setFontStyle('bold');
    });
  }

  setLanguage(language) {
    if (!['id', 'en'].includes(language) || language === this.language) return;
    const visible = this.container.visible;
    const tab = this.activeTab;
    this.cancelRemap();
    this.scene.input.off('pointermove', this.onSliderPointerMove, this);
    this.scene.input.off('pointerup', this.onSliderPointerUp, this);
    this.language = language;
    safeSet(STORAGE.language, language);
    this.scene.registry.set('language', language);
    if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = language;
    globalThis.window?.dispatchEvent?.(new CustomEvent('theuniverse:languagechange', { detail: { language } }));
    this.onLanguageChange(language);
    this.container.destroy(true);
    this.build();
    this.container.setVisible(visible);
    this.showTab(tab);
  }

  refreshLanguage() {
    Object.entries(this.languageButtons || {}).forEach(([id, nodes]) => {
      const selected = id === this.language;
      nodes[0].setFillStyle(selected ? 0x67450b : 0x2a1c0b, 1);
      nodes[0].setStrokeStyle(selected ? 3 : 1, selected ? 0xffdf79 : 0xc49a35, 1);
      nodes[1].setColor(selected ? '#fff0b8' : '#fff7e7');
    });
  }

  setDifficulty(id) {
    if (!['easy', 'normal', 'hard'].includes(id)) return;
    this.difficulty = id;
    safeSet(STORAGE.difficulty, id);
    this.scene.registry.set('difficulty', id);
    this.onDifficultyChange(id);
    this.refreshDifficulty();
  }

  refreshDifficulty() {
    const descriptions = {
      easy: this.tr('easyDesc'), normal: this.tr('normalDesc'), hard: this.tr('hardDesc')
    };
    Object.entries(this.difficultyCards || {}).forEach(([id, item]) => {
      const selected = id === this.difficulty;
      item.bg.setStrokeStyle(selected ? 4 : 2, selected ? 0xffdf79 : 0xc49a35, 1);
      item.bg.setFillStyle(selected ? 0x62420b : 0x33220b, 1);
      item.state.setText(selected ? this.tr('picked') : this.tr('choose')).setColor(selected ? '#ffe08a' : '#fff3dd');
    });
    this.difficultySummary?.setText(`${this.tr(this.difficulty)}: ${descriptions[this.difficulty] || ''}`);
  }

  setQuality(id) {
    if (!['low', 'medium', 'high'].includes(id)) return;
    this.quality = id;
    safeSet(STORAGE.quality, id);
    this.scene.registry.set('graphicsQuality', id);
    this.onQualityChange(id);
    this.refreshQuality();
  }

  refreshQuality() {
    const descriptions = {
      low: this.tr('qualityLowActive'), medium: this.tr('qualityMediumActive'), high: this.tr('qualityHighActive')
    };
    Object.entries(this.qualityCards || {}).forEach(([id, item]) => {
      const selected = id === this.quality;
      item.bg.setStrokeStyle(selected ? 4 : 2, selected ? 0xffdf79 : 0xc49a35, 1);
      item.bg.setFillStyle(selected ? 0x62420b : 0x33220b, 1);
      item.state.setText(selected ? this.tr('picked') : this.tr('choose')).setColor(selected ? '#ffe08a' : '#fff3dd');
    });
    this.qualitySummary?.setText(descriptions[this.quality] || '');
  }

  toggleTouch() {
    this.touchEnabled = !this.touchEnabled;
    safeSet(STORAGE.touch, this.touchEnabled);
    this.scene.registry.set('touchControls', this.touchEnabled);
    this.onTouchChange(this.touchEnabled);
    this.refreshKeyRows();
  }

  toggleFps() {
    this.showFps = !this.showFps;
    safeSet(STORAGE.showFps, this.showFps);
    this.scene.registry.set('showFps', this.showFps);
    this.onFpsChange(this.showFps);
    this.refreshFps();
  }

  refreshFps() {
    if (this.fpsButton) {
      this.fpsButton[0].setFillStyle(this.showFps ? 0x67450b : 0x2a1c0b, 1);
      this.fpsButton[1].setColor('#fff7e7');
      this.fpsButton[1].setText(this.tr('showFps', { state: this.tr(this.showFps ? 'on' : 'off') }));
    }
  }

  toggleFullscreen() {
    if (this.scene.scale.isFullscreen) this.scene.scale.stopFullscreen();
    else this.scene.scale.startFullscreen();
  }

  refreshKeyRows() {
    Object.entries(this.keyRows || {}).forEach(([id, row]) => {
      row.label.setText(this.tr(row.labelKey));
      row.keyText.setText(this.keyBindings[id] || '?');
    });
    if (this.touchToggle) {
      this.touchToggle[0].setFillStyle(this.touchEnabled ? 0x67450b : 0x2a1c0b, 1);
      this.touchToggle[1].setColor('#fff7e7');
      this.touchToggle[1].setText(this.tr('touchButtons', { state: this.tr(this.touchEnabled ? 'on' : 'off') }));
    }
  }

  beginRemap(action) {
    if (this.waitingAction) this.cancelRemap();
    this.waitingAction = action;
    this.keyRows[action]?.keyText.setText('…').setColor('#ffcf4a');
    this.captureText?.setText(this.tr('pressNewKey'));
    this.scene.input.keyboard?.on('keydown', this.onCaptureKey, this);
  }

  onCaptureKey(event) {
    if (!this.waitingAction) return;
    const key = normalizeKeyEvent(event);
    event.preventDefault?.();
    if (key === 'ESC') { this.cancelRemap(); return; }
    if (!key || key.length > 12 || ['SHIFT', 'CTRL', 'ALT', 'TAB', 'BACKSPACE'].includes(key)) return;
    const duplicate = Object.entries(this.keyBindings).find(([action, value]) => action !== this.waitingAction && value === key);
    const aliasOwners = { LEFT: 'left', RIGHT: 'right', UP: 'climb', DOWN: 'down', ENTER: 'attack', P: 'pause' };
    const aliasOwner = aliasOwners[key];
    if (duplicate || (aliasOwner && aliasOwner !== this.waitingAction)) {
      this.captureText?.setText(this.tr('keyInUse', { key }));
      return;
    }
    const action = this.waitingAction;
    this.keyBindings[action] = key;
    safeSet(STORAGE.keyBindings, JSON.stringify(this.keyBindings));
    this.scene.registry.set('keyBindings', { ...this.keyBindings });
    this.onKeyBindingsChange({ ...this.keyBindings });
    this.waitingAction = null;
    this.scene.input.keyboard?.off('keydown', this.onCaptureKey, this);
    this.captureText?.setText(this.tr('keyChanged', { action: this.tr(ACTION_KEYS[action]), key }));
    this.refreshKeyRows();
  }

  cancelRemap() {
    if (!this.waitingAction) return;
    this.scene.input.keyboard?.off('keydown', this.onCaptureKey, this);
    this.waitingAction = null;
    this.captureText?.setText(this.tr('keyCancelled'));
    this.refreshKeyRows();
  }

  resetKeys() {
    this.cancelRemap();
    this.keyBindings = { ...DEFAULT_KEY_BINDINGS };
    safeSet(STORAGE.keyBindings, JSON.stringify(this.keyBindings));
    this.scene.registry.set('keyBindings', { ...this.keyBindings });
    this.onKeyBindingsChange({ ...this.keyBindings });
    this.captureText?.setText(this.tr('keysReset'));
    this.refreshKeyRows();
  }

  setVisible(value) {
    if (!value) this.cancelRemap();
    this.container.setVisible(value);
    if (value) {
      this.difficulty = this.scene.registry.get('difficulty') || this.difficulty;
      this.quality = this.scene.registry.get('graphicsQuality') || this.quality;
      this.language = getLanguage(this.scene.registry);
      this.refreshDifficulty();
      this.refreshQuality();
      this.refreshFps();
      this.refreshAudioPage();
      this.refreshKeyRows();
      this.refreshLanguage();
      this.showTab(this.activeTab || 'game');
    }
  }

  close() {
    this.cancelRemap();
    this.setVisible(false);
    this.onClose();
  }

  destroy() {
    this.cancelRemap();
    this.scene.input.off('pointermove', this.onSliderPointerMove, this);
    this.scene.input.off('pointerup', this.onSliderPointerUp, this);
    this.container?.destroy(true);
  }
}
