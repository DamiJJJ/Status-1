@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (set PY=python) else (set PY=py)
echo ============================================
echo  NEON ARENA - lokalny serwer gry
echo  Adres: http://localhost:8137
echo  Zamknij to okno, aby wylaczyc serwer.
echo ============================================
start "" cmd /c "timeout /t 1 >nul & start "" http://localhost:8137/index.html"
%PY% -m http.server 8137
