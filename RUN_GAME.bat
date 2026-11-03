@echo off
setlocal
cd /d "%~dp0"

echo =========================================
echo   THE UNIVERSE - VITE + PHASER 4
echo =========================================

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Install Node.js 22.12+ lalu jalankan file ini lagi.
  pause
  exit /b 1
)

node -e "const v=process.versions.node.split('.').map(Number); if (!(v[0]>22 || (v[0]===22 && v[1]>=12) || (v[0]===20 && v[1]>=19))) process.exit(1)"
if errorlevel 1 (
  echo Versi Node.js perlu 20.19+ atau 22.12+.
  node --version
  pause
  exit /b 1
)

if not exist "node_modules\phaser" (
  echo Mengunduh dependency pertama kali...
  call npm install
  if errorlevel 1 (
    echo Instalasi gagal. Periksa koneksi internet dan ulangi.
    pause
    exit /b 1
  )
)

call npm run dev
pause
