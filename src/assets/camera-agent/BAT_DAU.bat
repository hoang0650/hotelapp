@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title PHHotel Camera Agent

echo.
echo  ============================================
echo   PHHotel Camera Agent
echo   Phan mem ket noi camera khach san
echo  ============================================
echo.
echo  Huong dan: mo file HUONG_DAN.txt neu can.
echo  De cua so nay MO - dung dong khi dang dung.
echo.

REM Phat hien mo BAT tu trong RAR/ZIP ^(WinRAR/7-Zip temp^) - chua giai nen
set "CURDIR=%CD%"
echo %CURDIR% | findstr /I /C:"Rar$DI" /C:".rartemp" /C:"\Temp\Rar" /C:"\Temp\7z" /C:"\INetCache\" /C:"\AppData\Local\Temp\7z" >nul
if not errorlevel 1 goto :NEED_EXTRACT
echo %CURDIR% | findstr /I /C:"\AppData\Local\Temp\" >nul
if not errorlevel 1 (
  if not exist "%~dp0server.js" goto :NEED_EXTRACT
)

if not exist "%~dp0server.js" goto :NEED_SERVER_JS

set "NODE_EXE="
set "NPM_CMD="
set "PF86=%ProgramFiles(x86)%"

where node >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%i in ('where node 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%i"
  )
)

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "!PF86!\nodejs\node.exe" set "NODE_EXE=!PF86!\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "C:\nvm4w\nodejs\node.exe" set "NODE_EXE=C:\nvm4w\nodejs\node.exe"
if not defined NODE_EXE if defined NVM_HOME if exist "%NVM_HOME%\nodejs\node.exe" set "NODE_EXE=%NVM_HOME%\nodejs\node.exe"
if not defined NODE_EXE if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\node.exe" set "NODE_EXE=%NVM_SYMLINK%\node.exe"
if not defined NODE_EXE if exist "%APPDATA%\nvm\nodejs\node.exe" set "NODE_EXE=%APPDATA%\nvm\nodejs\node.exe"

if not defined NODE_EXE goto :NEED_NODE

echo  [OK] Tim thay Node.js:
call "%NODE_EXE%" -v
if errorlevel 1 goto :BAD_NODE
echo.

for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
if exist "%NODE_DIR%npm.cmd" set "NPM_CMD=%NODE_DIR%npm.cmd"
if not defined NPM_CMD (
  where npm >nul 2>&1
  if not errorlevel 1 (
    for /f "delims=" %%i in ('where npm 2^>nul') do (
      if not defined NPM_CMD set "NPM_CMD=%%i"
    )
  )
)

if not exist ".env" goto :MAKE_ENV
goto :AFTER_ENV

:MAKE_ENV
if exist "env.example" copy /Y "env.example" ".env" >nul & echo  [OK] Da tao file cau hinh .env ^(lan dau^) & goto :AFTER_ENV
if exist ".env.example" copy /Y ".env.example" ".env" >nul & echo  [OK] Da tao file cau hinh .env ^(lan dau^)
goto :AFTER_ENV

:AFTER_ENV
if exist "node_modules\express" goto :START_AGENT

echo  [LAN DAU] Dang cai thu vien - co the mat 1-3 phut...
echo  Vui long doi, khong tat cua so.
echo.
if not defined NPM_CMD goto :NEED_NPM
call "%NPM_CMD%" install --omit=dev
if errorlevel 1 goto :NPM_FAIL
echo.
echo  [OK] Cai xong thu vien.
echo.

:START_AGENT
if not exist "bin" mkdir bin

if not exist "bin\proxvn-windows-amd64.exe" (
  echo  [CANH BAO] Thieu ProxVN client: bin\proxvn-windows-amd64.exe
  echo  Agent van chay LOCAL, nhung KHONG co URL https://... de dan vao PHHotel.
  echo  Hay tai lai goi ZIP tu Kho tai lieu ^(co file ProxVN^), roi giai nen de ghi de.
  echo.
) else (
  echo  [OK] Da co ProxVN client trong bin\
)

REM Neu agent cu con chay tren 8787 thi thong bao / giai port truoc khi start
set "AGENT_PORT=8787"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="PORT" set "AGENT_PORT=%%B"
  )
)

echo  Dang kiem tra cong !AGENT_PORT! ...
set "P=!AGENT_PORT!"
"%NODE_EXE%" -e "const http=require('http');const p=Number(process.env.P||8787);const r=http.get({host:'127.0.0.1',port:p,path:'/health',timeout:1200},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{try{const j=JSON.parse(b||'{}');if(j&&j.ok){if(j.publicUrl)console.log(j.publicUrl);process.exit(0);}process.exit(2);}catch(e){process.exit(2);}});});r.on('error',()=>process.exit(2));r.on('timeout',()=>{try{r.destroy();}catch(e){}process.exit(2);});"
set "PROBE=!ERRORLEVEL!"
if "!PROBE!"=="0" (
  echo.
  echo  [OK] Camera Agent DA DANG CHAY - khong can mo them.
  echo  De cua so Camera Agent cu mo.
  echo  Neu can khoi dong lai: dong cua so cu roi bam dup BAT_DAU.bat.
  echo.
  pause
  exit /b 0
)

REM Cong bi chiem nhung khong phai agent healthy → giai roi start lai
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":!AGENT_PORT! .*LISTENING"') do (
  if not "%%P"=="0" (
    echo  [OK] Dang dong tien trinh cu tren cong !AGENT_PORT! ^(PID %%P^)...
    taskkill /PID %%P /F >nul 2>&1
  )
)
timeout /t 1 /nobreak >nul

echo  Dang khoi dong...
echo  Khi thay dong:  camera-agent ProxVN public URL: https://...
echo  ^> Copy URL do va dan vao PHHotel ^> Cau hinh Camera ^> Agent URL
echo.
echo  Bam Ctrl+C de dung.
echo  --------------------------------------------
echo.

call "%NODE_EXE%" server.js
set "ERR=!ERRORLEVEL!"

echo.
if "!ERR!"=="0" (
  echo  Da dung Camera Agent.
) else (
  echo  [LOI] Chuong trinh dung bat thuong ^(ma !ERR!^).
  echo  Neu bao EADDRINUSE / cong 8787: dong cua so Camera Agent cu roi chay lai.
  echo  Gui anh man hinh nay cho ky thuat PHHotel neu can ho tro.
)
echo.
pause
exit /b !ERR!

:NEED_EXTRACT
echo  [LOI] Ban dang mo BAT_DAU.bat TU BEN TRONG file RAR/ZIP.
echo  WinRAR chi giai nen tam vao Temp, thieu server.js nen Agent khong chay.
echo.
echo  CACH DUNG DUNG:
echo   1^) Click chuot phai file ZIP/RAR ^> Extract to / Giai nen vao...
echo   2^) Chon thu muc de nho ^(vd: Desktop\PHHotel-Camera-Agent^)
echo   3^) Mo thu muc DA GIAI NEN, bam dup BAT_DAU.bat o do
echo.
echo  KHONG bam dup BAT_DAU.bat ngay trong cua so WinRAR.
echo.
pause
exit /b 1

:NEED_SERVER_JS
echo  [LOI] Thieu file server.js trong thu muc:
echo  %CD%
echo.
echo  Hay tai lai goi ZIP tu PHHotel ^> Kho tai lieu, giai nen DAY DU,
echo  roi bam dup BAT_DAU.bat trong thu muc da giai nen.
echo.
pause
exit /b 1

:NEED_NODE
echo  [CAN CAI DAT] Khong tim thay Node.js tren may nay.
echo  Da kiem tra: PATH, Program Files, NVM.
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

:BAD_NODE
echo  [LOI] File node.exe khong chay duoc:
echo  %NODE_EXE%
pause
exit /b 1

:NEED_NPM
echo  [LOI] Tim thay node nhung khong tim thay npm.cmd
echo  Hay cai lai Node.js ^(ban LTS^) tu nodejs.org
pause
exit /b 1

:NPM_FAIL
echo.
echo  [LOI] Cai thu vien that bai.
echo  Kiem tra mang internet roi chay lai BAT_DAU.bat
pause
exit /b 1
