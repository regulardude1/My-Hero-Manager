@echo off
cd /d "%~dp0"
echo Starting My-Hero-Manager Tauri App...

:: Ensure scoop nodejs is in PATH if it exists (fixes double-click issues without restart)
if exist "%USERPROFILE%\scoop\apps\nodejs\current" (
    set "PATH=%USERPROFILE%\scoop\apps\nodejs\current;%USERPROFILE%\scoop\shims;%PATH%"
)

call npm run tauri dev
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The application failed to launch.
    pause
)