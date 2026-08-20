@echo off
title Dahua Virtual Webcam Launcher
echo =====================================================
echo   Starting Dahua Virtual Webcam (OBS Studio)
echo =====================================================
echo.
echo Launching OBS Virtual Camera with Dahua RTSP stream...

start "" "C:\Program Files\obs-studio\bin\64bit\obs64.exe" --startvirtualcam --collection "Dahua Camera" --minimize-to-tray

echo.
echo [OK] Dahua Virtual Camera is now active!
echo You can now use your Dahua camera in Chrome, Edge, Vercel, or anywhere.
timeout /t 3 >nul
