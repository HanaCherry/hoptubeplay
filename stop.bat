@echo off
cd /d "%~dp0"
echo Stopping HopTubePlay...
if exist data\hoptubeplay.pid (
  set /p PID=<data\hoptubeplay.pid
  taskkill /PID %PID% /F >nul 2>&1
  del /q data\hoptubeplay.pid >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr LISTENING') do (
  taskkill /PID %%a /F >nul 2>&1
)
echo HopTubePlay stopped.
pause
