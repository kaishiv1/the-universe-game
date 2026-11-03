# The Universe — Dimension Adventure (2.4.0)

**The Universe** adalah game 2D high-energy hack-and-slash platformer tentang petualangan melintasi dimensi. Pemain memilih ksatria atau ksatria putri, menjelajahi reruntuhan dan dunia lain, mengalahkan monster, mengumpulkan potion, dan membuka gerbang menuju dimensi berikutnya.

Runtime utama dibangun menggunakan **Phaser 4.2.1 + Vite 8.3.5**. Proyek Canvas lama tetap disimpan di `legacy-browser/` sebagai arsip referensi; deployment utama hanya menggunakan runtime Phaser dari root proyek.

## Persyaratan

- Node.js **20.19+** atau **22.12+**
- npm 10+
- Browser modern (Chrome, Edge, Firefox, Safari) dengan WebGL atau Canvas 2D

## Instalasi dan menjalankan

```bash
npm install
npm run dev
```

Buka alamat yang dicetak Vite, biasanya `http://localhost:5173/`.

Di Windows, `RUN_GAME.bat` dapat digunakan untuk memeriksa Node.js, memasang dependency jika belum ada, dan menjalankan server development.

## Pemeriksaan dan build produksi

```bash
npm run check
npm run build
npm run preview
```

- `npm run check` memvalidasi import lokal, kategori aset, spritesheet, dictionary bahasa, konfigurasi deploy, serta validasi 300 variasi world generator (30 peta untuk masing-masing dari 10 stage), termasuk posisi chest, jalur ramp, spawn musuh, dan hazard. Kandidat rilis 2.4.0 juga telah menjalani stress test terpisah pada 10.000 peta acak lintas 10 stage.
- `npm run build` menjalankan validasi terlebih dahulu, kemudian membuat hasil Vite di `dist/`.
- `npm run preview` menjalankan build produksi secara lokal.

`vercel.json` sudah menggunakan `npm run build` dan output directory `dist`. Untuk Vercel, framework preset dapat menggunakan Vite atau Other dengan build command dan output directory tersebut.

## Bahasa dan pengaturan

Dari Main Menu atau Pause, buka **Pengaturan / Settings**.

- **Umum / General:** tingkat kesulitan Easy/Normal/Hard dengan keterangan perilaku musuh, serta pilihan bahasa Indonesia/English. Bahasa mengganti teks di menu, HUD, stage intro, pause, hasil stage, item, dan panduan.
- **Kontrol / Controls:** panduan PC dan Android, pemetaan ulang 10 aksi keyboard, deteksi konflik tombol, reset default, serta toggle kontrol sentuh.
- **Video:** kualitas grafis Rendah/Sedang/Tinggi, fullscreen, dan penghitung FPS.

## Gameplay

- **Karakter:** Ksatria dan Ksatria Putri, dengan atribut damage dan kecepatan yang berbeda.
- **Combat:** serangan jarak dekat dengan hitbox berbasis physics body musuh dan angka damage.
- **Slime:** mendeteksi pemain, memberi waktu alert, mengejar, lalu memberi damage saat body bersentuhan.
- **Golem:** mendekat dan melakukan wind-up sebelum menghantam tanah. Hantaman menghasilkan gelombang kejut, debu, serpihan batu, camera shake, dan damage area; golem tidak melompat ke pemain.
- **Ghost:** menjaga jarak dan langsung menembakkan proyektil listrik ke posisi pemain saat serangan dimulai, tanpa garis bidik atau fase target-lock.
- **Enemy HUD:** setiap musuh memiliki health bar; ukuran physics body dipakai konsisten untuk serangan, damage, dan health bar.
- **Potion:** ambil potion dari peti atau dunia, pilih slot Healing/Damage/Speed di HUD, lalu gunakan dengan tombol yang dipetakan (default Q) atau tombol sentuh. Healing memulihkan HP; Damage memberi +50% selama 15 detik; Speed memberi +35% selama 12 detik. Sisa durasi buff aktif terlihat pada HUD.
- **Heart pickup:** memulihkan HP dan menampilkan notifikasi ringkas di atas karakter. Notifikasi serupa hanya muncul saat potion dikonsumsi; popup penjelasan aksi generik telah dihilangkan.
- **World:** 10 tahap dalam tiga kelompok dimensi, dungeon background statis, lantai `road_ground`, tanjakan naik dan turun, tangga, platform batu dengan pilar penyangga, peti, hazard yang menempel pada lantai, dan portal.
- **Stage transition:** karakter keluar dari portal ketika tahap dimulai; kontrol terkunci sampai intro selesai. Di akhir tahap, pemain memasuki portal untuk berpindah ke tahap/dimensi selanjutnya.

## Kontrol default

| Aksi | Keyboard | Sentuh |
|---|---|---|
| Bergerak | A/D atau ←/→ | Kiri/kanan |
| Lompat | Space | Lompat |
| Naik tangga | W atau ↑ | Atas |
| Turun tangga / jatuh | S atau ↓ | Bawah |
| Serang | Z | Serang |
| Buka peti / interaksi | E | Dekati peti |
| Pilih dan gunakan potion | Q (gunakan slot terpilih) | Pilih slot HUD, lalu Potion |
| Jeda | Escape | Ikon Pause |
| Fullscreen | F | Ikon Fullscreen |

Key mapping bisa diubah di Settings → Controls.

## Struktur proyek

```text
public/assets/img/
  player/     # spritesheet karakter
  enemy/      # spritesheet slime, golem, ghost
  map/        # background, tanah, platform, wall, ladder, slope, hazard
  objects/    # portal, peti, potion, pickup
  ui/         # HP, frame minimap, tombol, panel dan kontrol sentuh
src/
  main.js
  scenes/     # Boot, Main Menu, Game, UI
  data/       # konfigurasi, spritesheet, world generator, i18n
  ui/         # SettingsPanel dan key mapping
scripts/
  validate-project.mjs
legacy-browser/ # versi Canvas lama untuk referensi, tidak dipakai oleh build utama
```

Semua path texture Phaser dimuat dari kategori `public/assets/img/{player,enemy,map,objects,ui}/`. Jika menambah aset, masukkan ke kategori terkait dan daftarkan di `src/scenes/BootScene.js`.

## Deployment

1. Push isi folder proyek (bukan folder induknya) ke GitHub.
2. Import repository ke Vercel.
3. Gunakan build command `npm run build` dan output directory `dist`.
4. Deploy. Vite akan menyalin semua isi `public/` ke output produksi.

Jangan commit `node_modules/` atau `dist/`; keduanya sudah masuk `.gitignore`.

## Catatan pengujian

`npm run check` adalah pemeriksaan source, aset dan generator, bukan pengganti playtest browser. Sebelum rilis publik, uji desktop dan smartphone (landscape), terutama: pergantian bahasa, key remapping, kontrol sentuh, gerakan di kedua arah slope, akses ladder pada ramp turun, damage kontak slime, ground slam golem, proyektil ghost, potion dan buff timer, portal intro/exit, serta transisi 10 tahap.

## Patch 2.4.0 — Audio, floor physics, and settings readability

- Settings panel uses a higher-contrast warm amber/brown palette with clearer selected tabs, text, and audio controls.
- Added original locally bundled chill ambient loops for the main menu and gameplay, with persistent master/music/SFX volume and mute settings.
- Replaced the broad floor Rectangle with a refreshed Arcade static-image collider and added a player fall-recovery guard.
- Golem impact animation is held through the slam recovery window rather than being immediately replaced by idle.
- Character-selection descriptions, stats, skin labels, and helper text use more readable sizes and contrast.
