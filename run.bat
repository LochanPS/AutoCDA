@echo off
echo ============================================
echo  AutoCDA — Automatic Circuit Design Assistant
echo ============================================
echo.
echo Checking for Node.js...
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    echo Please download and install it from https://nodejs.org
    echo Then run this script again.
    pause
    exit /b
)
echo [OK] Node.js found.
echo.
echo Checking for Python...
python --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    echo [OK] Python found.
    echo Generating circuit schematics using Schemdraw...
    python generate_schematics.py
    echo [OK] Schematic generation complete.
) ELSE (
    echo [WARN] Python not found. Using fallback inline schematics.
)
echo.
echo Installing dependencies (this may take a minute on first run)...
npm install
echo.
echo Starting AutoCDA...
echo Browser will open automatically at http://localhost:3000
echo.
npm start
pause
