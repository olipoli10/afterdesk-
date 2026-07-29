@echo off
rem Watchdog: keep the Next dev server alive no matter what kills it.
:loop
cd /d C:\dev\nightlexicon
npm run dev >> C:\dev\nightlexicon\.next-dev.log 2>&1
timeout /t 3 /nobreak >nul
goto loop
