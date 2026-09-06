@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8765" ^| findstr "LISTENING"') do taskkill /PID %%a /T /F >nul 2>nul
start "SafeShift Server" cmd /k "npm run dev"
timeout /t 5 >nul
start "" http://127.0.0.1:8765
