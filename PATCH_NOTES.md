# The Universe — Pre-deploy release 2.4.0

## Identitas dan lokalisasi
- Nama proyek, title browser, Main Menu, preloader dan dokumentasi utama diganti menjadi **The Universe**.
- Tema diperbarui menjadi petualangan hack-and-slash lintas dimensi.
- Bahasa Indonesia dan English tersedia di Settings → General. Perubahan bahasa diterapkan ke menu, character select, Settings, stage intro, HUD, pause, stage result, nama dimensi, item, dan notifikasi pemain.
- Teks orientasi landscape di halaman juga mengikuti bahasa yang dipilih.

## UI dan navigasi
- Wordmark tunggal “THE UNIVERSE” berada di Main Menu; judul tidak diulang pada overlay gameplay.
- Tombol utama dan tombol Settings berada berkelompok di tengah. Tombol Menu Utama dan Mulai Permainan pada Character Select menggunakan komponen, ukuran, dan hierarki yang sama.
- Label “Mulai Run” diganti menjadi “Mulai Permainan”.
- Spasi huruf yang berlebihan dikurangi; teks dirender pada resolusi tekstur lebih tinggi dan ukuran label HUD kecil ditingkatkan.
- Ikon Pause dan Fullscreen diposisikan berpasangan tepat di tengah atas.
- Layar hasil menggunakan panel dan teks dinamis, bukan artwork hasil dengan teks bahasa tetap.

## Settings
- General: Easy/Normal/Hard disertai keterangan efeknya, serta bahasa Indonesia/English.
- Controls: panduan PC/Android, remapping keyboard untuk 10 aksi, konflik tombol dicegah, dan reset default.
- Video: kualitas grafis Low/Medium/High, fullscreen, serta FPS counter.

## World generation
- Aset dipindah ke kategori `player`, `enemy`, `map`, `objects`, dan `ui`; loader Phaser dan versi legacy diperbarui agar path tidak putus.
- Tanjakan naik dan turun diperpanjang menjadi minimal 520 px. Tanjakan turun memiliki akses tangga di sisi landing yang tinggi.
- Geometri landing generator disamakan dengan posisi landing collider di GameScene.
- Generator memvalidasi platform yang dibuat setelah ramp agar tidak menutup permukaan/ruang kepala ramp. Setelah cleanup area gerbang, generator menjamin satu ramp naik dan satu ramp turun.
- Musuh dari semua tipe, termasuk ghost, dilarang muncul di rongga bawah lereng.
- Hazard duri hanya ditempatkan dengan dasar sprite menempel pada permukaan tanah.
- Platform bergerak dinonaktifkan. Platform tinggi menggunakan pilar batu bertekstur dan batu tapak penyangga.
- Generasi tembok/ruin acak dihapus; background dungeon statis tetap menjadi arsitektur latar.

## Combat dan item
- Enemy health bar diperbarui setiap frame AI dan menggunakan lebar berdasarkan physics body.
- Hitbox serangan pemain memakai physics body musuh. Slime mengecek kontak fisik secara konsisten di setiap state agar damage tidak bergantung pada fase chase.
- Golem melakukan wind-up dan ground slam jarak dekat, tanpa leap. Impact memunculkan shockwave, debu, pecahan batu, camera shake, serta damage area yang hanya diproses sekali per serangan.
- Ghost menembakkan proyektil listrik langsung ke posisi pemain saat tembakan dimulai. Garis target-lock dan jeda aim dihapus; collision proyektil dicek kontinu terhadap player body.
- Potion dapat dipilih dari slot HUD. Healing memulihkan 40 HP, Damage meningkatkan serangan 50% selama 15 detik, Speed meningkatkan kecepatan 35% selama 12 detik. Sisa durasi Damage/Speed terlihat pada HUD.
- Popup aksi generik dihapus. Notifikasi melayang di atas pemain hanya untuk heart pickup dan potion yang dikonsumsi.

## Stage flow
- Input keyboard dan sentuh terkunci selama portal intro; kontrol dilepas setelah overlay intro selesai.
- Portal awal hanya muncul saat karakter keluar dari portal. Portal exit digunakan untuk transisi tahap.
- Label stage menampilkan nama dimensi yang sesuai dengan rentang tahap.

## Polishing kandidat rilis 2.4.0
- Label slot potion di HUD disingkat menjadi HP/ATK/DMG/SPD agar tiga slot tidak saling bertabrakan pada berbagai ukuran layar.
- Resolusi tekstur teks dinaikkan dan jarak huruf menu/settings dirapikan; konten kartu pemilihan karakter diposisikan ulang agar nama, deskripsi, statistik, dan status pilihan tetap berada di dalam kartu.
- Panduan tombol menu tidak menggandakan alias ENTER/P jika pemain sudah memetakan aksi ke tombol tersebut.
- Dampak ground-slam golem dihitung relatif terhadap posisi kaki/body golem dan player, sehingga pemain yang berdiri di platform dengan elevasi sama tetap dapat terkena hantaman.
- Pemeriksaan generator diperluas menjadi stress test 10.000 peta acak lintas 10 stage; seluruh peta mempertahankan ramp naik/turun, tidak menempatkan musuh di bawah lereng, tidak menghasilkan spike melayang, dan tidak membuat platform bergerak tanpa penyangga.

## Validasi dan deploy
- `npm run check` memeriksa 98 file PNG, struktur kategori, import lokal, i18n id/en, menu/settings/HUD/AI, legacy asset path, dan 300 variasi generator pada pemeriksaan cepat; stress test tambahan 10.000 peta lintas 10 stage juga telah lolos.
- `npm run build` menjalankan `npm run check` sebelum `vite build`.
- `vercel.json` diarahkan ke build command `npm run build` dan output `dist`.
- Build Vite dan playtest visual tetap harus dilakukan di komputer developer setelah `npm install`; pemeriksaan statis/generator tidak dianggap sebagai pengganti pengujian runtime.


## Perbaikan stabilitas dan UI 2.4.0
- Settings memakai panel cokelat gelap beraksen amber/kuning, teks minimal 17 px, tombol tab/kartu dengan kontras lebih kuat, dan resolusi teks 6x.
- Character Selection memusatkan tiga pilihan skin dengan jarak konsisten; tombol Menu Utama dan Mulai Permainan tetap satu ukuran dan satu gaya.
- Golem disejajarkan ke batas kaki spritesheet, hitbox disesuaikan dengan siluet, dan health bar ditempatkan di atas sprite. Ground-slam jarak dekat menggunakan wind-up berdiri; lunge jarak menengah/jauh tetap melompat dan menghasilkan gelombang damage saat mendarat.
- Slime memeriksa kontak fisik dan radius sentuh di seluruh state AI.
- Proyektil ghost dibatasi maksimal dua, menghapus Graphics trail per-frame dan alokasi rectangle per-frame, memakai collision swept-AABB ringan, dan dibersihkan ketika stage selesai/game over untuk mencegah freeze.
- Peti selalu ditempatkan di permukaan ramp/platform yang ditinggikan; data permukaannya disimpan untuk validasi.
- Platform landing di ujung ramp mendapatkan dua pilar batu visual yang mencapai tanah atau platform bawah, mengurangi kesan batu melayang.
- Audio menggunakan WAV lokal proyek: ambience dungeon, UI click, sword swing/hit, slime, golem slam, ghost zap, potion, heart, chest, portal, victory, dan game over. Ambience dikelola per scene agar shutdown scene lama tidak mematikan loop scene baru.
- Victory/Lose menggunakan panel hasil dinamis dengan subjudul, nama dimensi/stage, statistik damage/waktu/HP tersisa, dan tombol aksi yang terpusat. Efek suara hasil tidak diputar ganda.
- `npm run check` diperluas untuk menguji result UI, audio lokal, chest di permukaan elevated, landing support, dan dua pola serangan golem.

## Stabilitas audio, lantai, dan keterbacaan UI 2.4.0

- Panel Settings memakai palet amber/cokelat dengan kontras lebih tinggi, teks tombol terpilih yang jelas, dan status audio yang terbaca.
- Musik ambient orisinal lokal tersedia untuk Main Menu dan gameplay; volume utama, musik, SFX, serta mute disimpan di localStorage.
- Lantai memakai StaticImage collider Arcade yang di-refresh dan watchdog memulihkan player yang melewati garis lantai.
- Animasi golem-slam tidak lagi dipotong oleh state idle tepat setelah impact.
- Teks deskripsi karakter, statistik, label skin, dan petunjuk diperbesar.
