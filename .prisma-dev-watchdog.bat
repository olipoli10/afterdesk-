@echo off
rem Watchdog: the local Prisma Postgres proxy dies unpredictably on this
rem machine — restart it forever. Only stale LOCK files are cleared;
rem server.json (the data-cluster registration) is preserved.
:loop
cd /d C:\dev\nightlexicon
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\server.lock" 2>nul
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\server.lock.lock" 2>nul
npx prisma dev >> C:\dev\nightlexicon\.prisma-dev.log 2>&1
timeout /t 3 /nobreak >nul
goto loop
