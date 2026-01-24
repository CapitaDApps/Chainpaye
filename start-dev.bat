@echo off
echo Starting ChainPaye WhatsApp Bot in Development Mode...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if tsx is available
npx tsx --version >nul 2>&1
if errorlevel 1 (
    echo Installing tsx...
    npm install -g tsx
)

echo Starting server on http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

REM Start the development server
npx tsx --watch index.ts

pause