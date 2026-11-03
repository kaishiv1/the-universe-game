// Audio system for The Universe.
// Menu/gameplay music is an original, locally bundled ambient loop; no remote audio is requested.

const DEFAULTS = Object.freeze({ master: 0.82, music: 0.48, sfx: 0.86, muted: false });
const STORAGE = {
  master: 'tu_audio_master', music: 'tu_audio_music', sfx: 'tu_audio_sfx', muted: 'tu_audio_muted'
};

let musicSound = null;
let musicOwner = null;
let musicBaseVolume = 0.72;
const activeSfx = new Set();

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

function storageNumber(key, fallback) {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    if (stored == null || stored === '') return fallback;
    const value = Number(stored);
    return Number.isFinite(value) ? clamp01(value) : fallback;
  } catch { return fallback; }
}
function storageBoolean(key, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value == null ? fallback : value === 'true';
  } catch { return fallback; }
}

export function getAudioSettings(registry = null) {
  const stored = registry?.get?.('audioSettings') || {};
  return {
    master: clamp01(stored.master ?? storageNumber(STORAGE.master, DEFAULTS.master)),
    music: clamp01(stored.music ?? storageNumber(STORAGE.music, DEFAULTS.music)),
    sfx: clamp01(stored.sfx ?? storageNumber(STORAGE.sfx, DEFAULTS.sfx)),
    muted: typeof stored.muted === 'boolean' ? stored.muted : storageBoolean(STORAGE.muted, DEFAULTS.muted)
  };
}

function applyAudioMix(registry = null) {
  const settings = getAudioSettings(registry);
  const enabled = !settings.muted;
  if (musicSound?.setVolume) {
    musicSound.setVolume(enabled ? musicBaseVolume * settings.master * settings.music : 0);
  }
  for (const sound of [...activeSfx]) {
    if (!sound?.setVolume) { activeSfx.delete(sound); continue; }
    const base = sound.__tuBaseVolume ?? 1;
    sound.setVolume(enabled ? base * settings.master * settings.sfx : 0);
  }
}

export function setAudioSettings(registry, patch = {}) {
  const current = getAudioSettings(registry);
  const next = {
    master: clamp01(patch.master ?? current.master),
    music: clamp01(patch.music ?? current.music),
    sfx: clamp01(patch.sfx ?? current.sfx),
    muted: typeof patch.muted === 'boolean' ? patch.muted : current.muted
  };
  registry?.set?.('audioSettings', next);
  registry?.set?.('soundEnabled', !next.muted);
  try {
    globalThis.localStorage?.setItem(STORAGE.master, String(next.master));
    globalThis.localStorage?.setItem(STORAGE.music, String(next.music));
    globalThis.localStorage?.setItem(STORAGE.sfx, String(next.sfx));
    globalThis.localStorage?.setItem(STORAGE.muted, String(next.muted));
  } catch { /* Settings still work for the current session without storage. */ }
  applyAudioMix(registry);
  return next;
}

export function playSfx(scene, key, options = {}) {
  if (!scene?.sound || !scene.cache?.audio?.exists?.(key)) return null;
  const settings = getAudioSettings(scene.registry);
  if (settings.muted || settings.master <= 0 || settings.sfx <= 0) return null;
  try {
    if (scene.sound.locked) {
      if (!scene.__pendingSfxUnlock) {
        scene.__pendingSfxUnlock = true;
        scene.sound.once('unlocked', () => {
          scene.__pendingSfxUnlock = false;
          if (scene.sys?.isActive?.() !== false) playSfx(scene, key, options);
        });
      }
      return null;
    }
    const sound = scene.sound.add(key);
    const base = clamp01(options.volume ?? 0.32);
    sound.__tuBaseVolume = base;
    sound.once('complete', () => { activeSfx.delete(sound); sound.destroy(); });
    sound.once('destroy', () => activeSfx.delete(sound));
    activeSfx.add(sound);
    sound.play({
      volume: sound.__tuBaseVolume * settings.master * settings.sfx,
      rate: options.rate ?? 1,
      detune: options.detune ?? 0
    });
    return sound;
  } catch {
    return null;
  }
}

export function stopMusic() {
  const old = musicSound;
  musicSound = null;
  musicOwner = null;
  if (!old) return;
  try { old.stop(); old.destroy(); } catch { /* ignore scene shutdown races */ }
}

export function startMusic(scene, key, { volume = 0.72, fadeMs = 500 } = {}) {
  if (!scene?.sound || !scene.cache?.audio?.exists?.(key)) return null;
  stopMusic(150);
  musicOwner = scene;
  musicBaseVolume = clamp01(volume);
  try {
    const settings = getAudioSettings(scene.registry);
    musicSound = scene.sound.add(key, { loop: true, volume: settings.muted ? 0 : musicBaseVolume * settings.master * settings.music });
    const sound = musicSound;
    const begin = () => {
      if (musicOwner !== scene || musicSound !== sound || !scene.sys?.isActive?.()) return;
      try {
        sound.play();
        if (fadeMs > 0) {
          sound.setVolume(0);
          applyAudioMix(scene.registry);
        }
      } catch { /* The browser can still reject autoplay before a gesture. */ }
    };
    if (scene.sound.locked) scene.sound.once('unlocked', begin);
    else begin();
    scene.events?.once?.('shutdown', () => {
      if (musicOwner === scene) stopMusic(120);
    });
    return sound;
  } catch {
    musicSound = null;
    musicOwner = null;
    return null;
  }
}

// Kept for older call sites: use the gameplay ambient loop as a fallback.
export function startAmbience(scene) {
  return startMusic(scene, 'gameplay_theme', { volume: 0.64, fadeMs: 450 });
}

export function getCurrentMusicKey() {
  return musicSound?.key || null;
}
