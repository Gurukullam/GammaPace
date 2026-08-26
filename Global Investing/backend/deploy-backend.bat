@echo off
chcp 65001 >nul
echo ==========================================
echo  NASDAQ Analysis AI — Backend Deployer
echo  Target: Vercel
echo ==========================================
echo.

REM Check if vercel CLI is installed
where vercel >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Vercel CLI not found. Installing...
    npm install -g vercel
    if %errorlevel% neq 0 (
        echo ❌ Failed to install Vercel CLI.
        echo    Run manually: npm install -g vercel
        pause
        exit /b 1
    )
)

echo ✅ Vercel CLI found
echo.
echo 🔧 Deploying backend to Vercel...
echo.

REM Login (only first time)
echo 📝 If this is your first time, a browser will open to authorize Vercel.
vercel login

REM Deploy
cd /d "%~dp0"
vercel --prod

echo.
echo ==========================================
echo ✅ Backend deployed!
echo.
echo 📋 NEXT STEPS:
echo    1. Copy the deployment URL (e.g., https://nasdaq-api-xxxxx.vercel.app)
echo    2. Open frontend/index.html
echo    3. Paste the URL into Settings > Backend URL
echo    4. Deploy frontend to GitHub Pages
echo ==========================================
pause