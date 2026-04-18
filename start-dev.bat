@echo off
title Supply Analyzer Auto-Dev

echo ==============================================
echo [STARTING] Backend Algorand Analyzer (Port 3000)
echo ==============================================
start "Algo Backend" cmd /k "npm start"

echo ==============================================
echo [STARTING] Frontend Dashboard (Port 5173)
echo ==============================================
start "Algo Frontend" cmd /k "cd Dashboard && npm run dev"

echo.
echo ==============================================
echo ✓ Both services are launching in new windows!
echo   * Backend running Census and API endpoints
echo   * Frontend will hot-reload when you save files
echo ==============================================
pause
