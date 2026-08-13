@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title PHHotel Camera Agent

echo.
echo  ============================================
echo   PHHotel Camera Agent
echo   Phan mem ket noi camera khach san
echo  ============================================
echo.
echo  Huong dan: mo file HUONG_DAN.txt neu can.
echo  De cua so nay MO — dung dong khi dang dung.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [CAN CAI DAT] May chua co Node.js.
  echo.
  echo  Bam phim bat ky de mo trang cai Node.js ^(ban LTS^)...
  pause >nul
  start "" "https://nodejs.org/en/download"
  echo.
  echo  Sau khi cai xong Node.js:
  echo   1^) Dong cua so cai dat
  echo   2^) Dong cua so nay
  echo   3^) Bam dup lai file BAT_DAU.bat
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist "env.example" (
    copy /Y "env.example" ".env" >nul
    echo  [OK] Da tao file cau hinh .env ^(lan dau^)
  ) else if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo  [OK] Da tao file cau hinh .env ^(lan dau^)
  )
)

if not exist "node_modules\express" (
  echo  [LAN DAU] Dang cai thu vien — co the mat 1-3 phut...
  echo  Vui long doi, khong tat cua so.
  echo.
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo  [LOI] Cai thu vien that bai.
    echo  Kiem tra mang internet roi chay lai BAT_DAU.bat
    pause
    exit /b 1
  )
  echo.
  echo  [OK] Cai xong thu vien.
  echo.
)

if not exist "bin" mkdir bin

echo  Dang khoi dong...
echo  Khi thay dong:  camera-agent ProxVN public URL: https://...
echo  ^> Copy URL do va dan vao PHHotel ^> Cau hinh Camera ^> Agent URL
echo.
echo  Bam Ctrl+C de dung.
echo  --------------------------------------------
echo.

node server.js
set ERR=%ERRORLEVEL%

echo.
if not "%ERR%"=="0" (
  echo  [LOI] Chuong trinh dung bat thuong ^(ma %ERR%^).
  echo  Gui anh man hinh nay cho ky thuat PHHotel neu can ho tro.
) else (
  echo  Da dung Camera Agent.
)
echo.
pause
endlocal
exit /b %ERR%
