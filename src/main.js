import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MainMenuScene } from './scenes/MainMenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { getLanguage, t } from './data/i18n.js';
import './style.css';

const config = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 1280,
  height: 720,
  backgroundColor: '#070b13',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    powerPreference: 'high-performance'
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
    parent: 'game-root'
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 3060 },
      debug: false,
      fps: 60
    }
  },
  input: {
    activePointers: 4,
    smoothFactor: 0
  },
  scene: [BootScene, MainMenuScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);
window.theUniverseGame = game;

const rotateHint = document.getElementById('rotate-hint');
const updateOrientationHint = () => {
  const language = getLanguage({ get: key => key === 'language' ? globalThis.localStorage?.getItem('tu_language') : null });
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  if (rotateHint) {
    rotateHint.textContent = t('rotateHint', language);
    rotateHint.classList.toggle('visible', portrait && window.innerWidth < 900);
  }
  document.documentElement.lang = language;
};
window.addEventListener('resize', updateOrientationHint, { passive: true });
window.addEventListener('orientationchange', updateOrientationHint, { passive: true });
window.addEventListener('theuniverse:languagechange', updateOrientationHint);
updateOrientationHint();
