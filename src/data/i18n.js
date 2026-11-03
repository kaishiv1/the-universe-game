const TEXT = {
  id: {
    tagline: 'PETUALANGAN AKSI LINTAS DIMENSI',
    rotateHint: 'Putar perangkat ke mode landscape untuk pengalaman terbaik.',
    subtitle: 'Jelajahi dimensi. Kalahkan monster di baliknya.',
    menuPlay: 'MULAI PERMAINAN', settings: 'PENGATURAN', controlGuide: 'PANDUAN KONTROL',
    move: 'Bergerak', attack: 'Menyerang', jump: 'Lompat / naik tangga', descend: 'Turun / jatuh dari platform',
    interact: 'Buka peti / interaksi', usePotion: 'Gunakan potion', pause: 'Jeda permainan', fullscreen: 'Layar penuh',
    collectPotionHint: 'Kumpulkan potion terlebih dahulu, lalu pilih dan gunakan dari HUD.',
    newAdventure: 'PETUALANGAN BARU', chooseCharacter: 'PILIH KARAKTER',
    knight: 'KSATRIA', knightDesc: 'Seimbang. Tebasan kuat.', knightess: 'KSATRIA PUTRI', knightessDesc: 'Gesit. Serangan cepat.',
    damageSpeed: 'DAMAGE {damage} · SPEED {speed}', selected: '✓ DIPILIH', skins: 'KOSTUM', defaultSkin: 'BAWAAN', comingSoon: 'SEGERA',
    mainMenu: 'MENU UTAMA', startGame: 'MULAI PERMAINAN', skinSoonHint: 'Kostum tambahan akan hadir pada pembaruan berikutnya.',
    settingsEyebrow: 'THE UNIVERSE / PENGATURAN', settingsTitle: 'PENGATURAN', general: 'UMUM', controls: 'KONTROL', video: 'VIDEO', audio: 'AUDIO', close: 'TUTUP',
    language: 'BAHASA', languageDescription: 'Pilih bahasa untuk seluruh antarmuka permainan.', indonesian: 'INDONESIA', english: 'INGGRIS',
    difficulty: 'TINGKAT KESULITAN', difficultyHint: 'Pilih tantangan yang sesuai. Perubahan dapat diterapkan saat permainan dijeda.',
    easy: 'MUDAH', normal: 'NORMAL', hard: 'SULIT',
    easyDesc: 'Musuh lebih lambat, jarak deteksi pendek, dan serangan lebih ringan.',
    normalDesc: 'Tantangan seimbang untuk kecepatan, deteksi, dan damage musuh.',
    hardDesc: 'Musuh agresif, mendeteksi dari jauh, mengejar cepat, dan memberi damage besar.',
    picked: '✓ DIPILIH', choose: 'PILIH',
    controlsPc: 'KONTROL PC / PEMETAAN TOMBOL',
    controlsPcHint: 'Pilih UBAH, lalu tekan tombol baru. Satu tombol hanya dapat dipakai untuk satu aksi.',
    controlsAndroid: 'ANDROID: Gunakan mode landscape. Gerak di kiri layar; lompat, serang, arah, dan potion di kanan.',
    moveLeft: 'Gerak kiri', moveRight: 'Gerak kanan', climb: 'Naik tangga', down: 'Turun tangga',
    remap: 'UBAH', resetKeys: 'RESET TOMBOL', touchButtons: 'TOMBOL SENTUH: {state}',
    pressNewKey: 'TEKAN TOMBOL BARU · ESC UNTUK BATAL', keyInUse: 'TOMBOL {key} SUDAH DIGUNAKAN',
    keyChanged: '{action} DIUBAH KE {key}', keyCancelled: 'PEMETAAN TOMBOL DIBATALKAN', keysReset: 'KONTROL DIKEMBALIKAN KE AWAL',
    videoQuality: 'KUALITAS GRAFIS', videoHint: 'Sesuaikan efek visual dengan kemampuan perangkat.',
    low: 'RENDAH', medium: 'SEDANG', high: 'TINGGI',
    lowDesc: 'Mengurangi efek dekoratif dan partikel agar lebih ringan.',
    mediumDesc: 'Kualitas seimbang untuk sebagian besar laptop dan ponsel.',
    highDesc: 'Mengaktifkan seluruh efek dekoratif dan partikel.',
    qualityLowActive: 'Rendah: efek dekoratif dikurangi untuk menjaga performa.',
    qualityMediumActive: 'Sedang: direkomendasikan untuk keseimbangan kualitas dan performa.',
    qualityHighActive: 'Tinggi: seluruh efek visual diaktifkan.',
    toggleFullscreen: 'GANTI LAYAR PENUH', showFps: 'TAMPILKAN FPS: {state}', on: 'AKTIF', off: 'NONAKTIF',
    audioSettings: 'PENGATURAN AUDIO', audioHint: 'Atur musik dan efek suara sesuai kenyamanan.', masterVolume: 'VOLUME UTAMA', musicVolume: 'VOLUME MUSIK', sfxVolume: 'EFEK SUARA',
    muteAudio: 'BISUKAN SEMUA AUDIO: {state}', audioMutedHint: 'Semua musik dan efek suara sedang dibisukan.', audioEnabledHint: 'Musik dan efek suara aktif sesuai volume pilihanmu.',
    hp: 'HP', map: 'PETA DIMENSI', stage: 'DIMENSI {dimension} · TAHAP {stage}',
    potionHp: 'Penyembuh', potionAtk: 'Penguat serangan', potionSpd: 'Penguat kecepatan',
    potionHpShort: 'HP', potionAtkShort: 'ATK', potionSpdShort: 'SPD',
    potionSelect: 'PILIH POTION', selectedPotion: 'DIPILIH', potionSelectHint: 'PILIH SLOT · {key} UNTUK GUNAKAN', use: 'GUNAKAN',
    buffAtk: 'SERANG {seconds}d', buffSpd: 'CEPAT {seconds}d',
    paused: 'PERMAINAN DIJEDA', resume: 'LANJUTKAN',
    stageIntro: 'DIMENSI {dimension} · TAHAP {stage}', preparing: 'Menyiapkan dunia...', stageStart: 'PETUALANGAN DIMULAI',
    tipStart: 'TIPS: Kalah berarti mengulang dari tahap ini. Kumpulkan hati dan potion untuk bertahan.',
    tipRamp: 'TIPS: Gunakan jalur menanjak dan menurun untuk menjangkau area berbeda.',
    tipGolem: 'TIPS: Golem menghantam tanah dari jarak dekat. Hindari gelombang hantamannya.',
    tipGhost: 'TIPS: Hantu menembakkan listrik langsung ke arahmu. Terus bergerak.',
    exit: 'GERBANG DIMENSI', victory: 'DIMENSI DITAKLUKKAN!', defeat: 'PETUALANGAN BERAKHIR',
    victorySubtitle: 'Gerbang dimensi terbuka. Petualangan berikutnya menantimu.',
    defeatSubtitle: 'Kamu tumbang di dimensi ini. Perkuat strategi dan coba lagi.',
    finishRun: 'SELESAIKAN PETUALANGAN', remainingHp: 'SISA KESEHATAN',
    damageDone: 'DAMAGE DIBERIKAN', damageTaken: 'DAMAGE DITERIMA', timePlayed: 'WAKTU BERMAIN',
    nextStage: 'LANJUT KE DIMENSI BERIKUTNYA', retry: 'ULANGI PETUALANGAN', backToMenu: 'KEMBALI KE MENU', useHint: 'Q / GUNAKAN', restart: 'ULANGI',
    potionCollected: '{potion} DIDAPATKAN', heartCollected: '+{amount} HP',
    potionHeal: 'PEMULIHAN +{amount} HP', potionDamage: 'SERANGAN +50% · 15 DETIK', potionSpeed: 'KECEPATAN +35% · 12 DETIK',
    stageNoteSlime: 'Slime menjaga area ini.', stageNoteGolem: 'MUSUH BARU: GOLEM · Hantaman tanahnya berbahaya.',
    stageNoteGhost: 'MUSUH BARU: HANTU · Waspadai serangan listriknya.',
    dimensionOne: 'RERUNTUHAN TERLUPAKAN', dimensionTwo: 'KEDALAMAN MEMBARA', dimensionThree: 'CELAH ASTRAL',
  },
  en: {
    tagline: 'HIGH-ENERGY ADVENTURE ACROSS DIMENSIONS',
    rotateHint: 'Rotate your device to landscape for the best experience.',
    subtitle: 'Explore the dimensions. Defeat the monsters beyond.',
    menuPlay: 'START ADVENTURE', settings: 'SETTINGS', controlGuide: 'CONTROL GUIDE',
    move: 'Move', attack: 'Attack', jump: 'Jump / climb', descend: 'Descend / drop through platforms',
    interact: 'Open chest / interact', usePotion: 'Use potion', pause: 'Pause game', fullscreen: 'Fullscreen',
    collectPotionHint: 'Collect potions first, then select and use them from the HUD.',
    newAdventure: 'NEW ADVENTURE', chooseCharacter: 'CHOOSE YOUR HERO',
    knight: 'KNIGHT', knightDesc: 'Balanced fighter. Powerful strikes.', knightess: 'KNIGHTESS', knightessDesc: 'Agile fighter. Fast attacks.',
    damageSpeed: 'DAMAGE {damage} · SPEED {speed}', selected: '✓ SELECTED', skins: 'OUTFITS', defaultSkin: 'DEFAULT', comingSoon: 'COMING SOON',
    mainMenu: 'MAIN MENU', startGame: 'START ADVENTURE', skinSoonHint: 'More outfits will arrive in a future update.',
    settingsEyebrow: 'THE UNIVERSE / CONFIGURATION', settingsTitle: 'SETTINGS', general: 'GENERAL', controls: 'CONTROLS', video: 'VIDEO', audio: 'AUDIO', close: 'CLOSE',
    language: 'LANGUAGE', languageDescription: 'Choose the language used throughout the game.', indonesian: 'INDONESIAN', english: 'ENGLISH',
    difficulty: 'DIFFICULTY', difficultyHint: 'Choose your challenge. Changes can be applied while the game is paused.',
    easy: 'EASY', normal: 'NORMAL', hard: 'HARD',
    easyDesc: 'Enemies move slower, detect you at shorter range, and deal less damage.',
    normalDesc: 'Balanced enemy speed, detection range, and damage.',
    hardDesc: 'Aggressive enemies detect from farther away, chase faster, and hit harder.',
    picked: '✓ SELECTED', choose: 'SELECT',
    controlsPc: 'PC CONTROLS / KEY MAPPING',
    controlsPcHint: 'Choose BIND, then press a new key. Each key can only be assigned to one action.',
    controlsAndroid: 'ANDROID: Play in landscape. Movement is on the left; jump, attack, directions, and potions are on the right.',
    moveLeft: 'Move left', moveRight: 'Move right', climb: 'Climb', down: 'Descend',
    remap: 'BIND', resetKeys: 'RESET KEYS', touchButtons: 'TOUCH CONTROLS: {state}',
    pressNewKey: 'PRESS A NEW KEY · ESC TO CANCEL', keyInUse: 'KEY {key} IS ALREADY IN USE',
    keyChanged: '{action} CHANGED TO {key}', keyCancelled: 'KEY BINDING CANCELLED', keysReset: 'CONTROLS RESTORED TO DEFAULT',
    videoQuality: 'GRAPHICS QUALITY', videoHint: 'Adjust visual effects to match your device.',
    low: 'LOW', medium: 'MEDIUM', high: 'HIGH',
    lowDesc: 'Reduces decorative effects and particles for better performance.',
    mediumDesc: 'Balanced quality for most laptops and phones.',
    highDesc: 'Enables all decorative effects and particles.',
    qualityLowActive: 'Low: decorative effects are reduced for performance.',
    qualityMediumActive: 'Medium: recommended balance of quality and performance.',
    qualityHighActive: 'High: all visual effects are enabled.',
    toggleFullscreen: 'TOGGLE FULLSCREEN', showFps: 'SHOW FPS: {state}', on: 'ON', off: 'OFF',
    audioSettings: 'AUDIO SETTINGS', audioHint: 'Adjust music and sound effects to your preference.', masterVolume: 'MASTER VOLUME', musicVolume: 'MUSIC VOLUME', sfxVolume: 'SOUND EFFECTS',
    muteAudio: 'MUTE ALL AUDIO: {state}', audioMutedHint: 'All music and sound effects are muted.', audioEnabledHint: 'Music and sound effects are active at your chosen levels.',
    hp: 'HP', map: 'DIMENSION MAP', stage: 'DIMENSION {dimension} · STAGE {stage}',
    potionHp: 'Healing', potionAtk: 'Damage boost', potionSpd: 'Speed boost',
    potionHpShort: 'HP', potionAtkShort: 'DMG', potionSpdShort: 'SPD',
    potionSelect: 'SELECT POTION', selectedPotion: 'SELECTED', potionSelectHint: 'SELECT SLOT · PRESS {key} TO USE', use: 'USE',
    buffAtk: 'DMG {seconds}s', buffSpd: 'SPD {seconds}s',
    paused: 'PAUSED', resume: 'RESUME',
    stageIntro: 'DIMENSION {dimension} · STAGE {stage}', preparing: 'Preparing the world...', stageStart: 'ADVENTURE BEGINS',
    tipStart: 'TIP: Defeat means restarting this stage. Collect hearts and potions to survive.',
    tipRamp: 'TIP: Use ascending and descending paths to explore different areas.',
    tipGolem: 'TIP: Golems slam the ground at close range. Avoid the shockwave.',
    tipGhost: 'TIP: Ghosts fire electric bolts directly at you. Keep moving.',
    exit: 'DIMENSION GATE', victory: 'DIMENSION CONQUERED!', defeat: 'ADVENTURE OVER',
    victorySubtitle: 'The dimension gate is open. Your next adventure awaits.',
    defeatSubtitle: 'You fell in this dimension. Adjust your strategy and try again.',
    finishRun: 'FINISH ADVENTURE', remainingHp: 'HEALTH REMAINING',
    damageDone: 'DAMAGE DEALT', damageTaken: 'DAMAGE TAKEN', timePlayed: 'TIME PLAYED',
    nextStage: 'ENTER NEXT DIMENSION', retry: 'RESTART ADVENTURE', backToMenu: 'BACK TO MENU', useHint: 'Q / USE', restart: 'RESTART',
    potionCollected: 'COLLECTED: {potion}', heartCollected: '+{amount} HP',
    potionHeal: 'HEALED +{amount} HP', potionDamage: 'DAMAGE +50% · 15 SECONDS', potionSpeed: 'SPEED +35% · 12 SECONDS',
    stageNoteSlime: 'Slimes guard this area.', stageNoteGolem: 'NEW ENEMY: GOLEM · Beware its ground slam.',
    stageNoteGhost: 'NEW ENEMY: GHOST · Watch out for electric attacks.',
    dimensionOne: 'THE FORGOTTEN RUINS', dimensionTwo: 'THE EMBER DEPTHS', dimensionThree: 'THE ASTRAL RIFT',
  }
};

export function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'id';
}

export function getLanguage(registry) {
  try {
    return normalizeLanguage(registry?.get?.('language') || globalThis.localStorage?.getItem('tu_language') || 'id');
  } catch {
    return 'id';
  }
}

export function t(key, language = 'id', vars = {}) {
  const lang = normalizeLanguage(language);
  let value = TEXT[lang][key] ?? TEXT.id[key] ?? TEXT.en[key] ?? key;
  for (const [name, replacement] of Object.entries(vars || {})) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

export function getDimensionKey(stage = 1) {
  const n = Math.max(1, Number(stage) || 1);
  if (n <= 3) return 'dimensionOne';
  if (n <= 7) return 'dimensionTwo';
  return 'dimensionThree';
}
