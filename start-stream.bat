@echo off
title Dahua Camera Stream Server (Port 4000)
cd /d "%~dp0"
echo Starting Dahua RTSP-to-WebSocket Bridge...
echo Stream will be available at ws://localhost:4000
echo.
npm run stream
pause
