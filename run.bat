@echo off
title Talk-to-Data Startup Manager
echo ===================================================
echo   Talk-to-Data BI Chatbot Startup Utility
echo ===================================================
echo.

:: 1. Start the FastAPI Backend Server
echo [1/2] Launching FastAPI Backend Server in separate terminal...
start "Talk-to-Data Backend (Port 8000)" cmd /k "cd backend && .venv\Scripts\activate.bat && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

:: Wait 10 seconds to allow database pools and LLM configs to initialize
timeout /t 10 /nobreak > nul

:: 2. Start the Vite React Frontend
echo [2/2] Launching Vite React Frontend client in separate terminal...
start "Talk-to-Data Frontend (Port 5173)" cmd /k "cd frontend && npm run dev"

:: Wait 10 seconds to allow app to initialize
timeout /t 10 /nobreak > nul

echo.
echo ===================================================
echo   Both servers have been launched!
echo   - Backend API Gateway: http://127.0.0.1:8000/
echo   - Frontend Interface:  http://localhost:5173/
echo ===================================================
echo.
pause
