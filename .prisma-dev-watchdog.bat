@echo off
rem Watchdog: the local Prisma Postgres proxy dies unpredictably on this
rem machine — restart it forever. server.json (the "a server is already
rem running" registration) must be cleared alongside the locks: when the
rem process dies uncleanly, server.json can survive pointing at a PID that
rem no longer exists, which makes the next `prisma dev` self-skip with
rem "already running" and never actually listen. Losing server.json only
rem means the dev cluster re-registers on next start; the data directory
rem itself is untouched, so no data is lost.
:loop
cd /d C:\dev\nightlexicon
rem The "already running" registration that actually gates a fresh start
rem lives in Data\default\server.json — NOT Data\durable-streams\default\,
rem which was cleared here for most of this session while the real stale
rem file sat untouched, silently causing every restart to self-skip.
rem Clear both locations; harmless if either doesn't exist.
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\default\server.lock" 2>nul
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\default\server.lock.lock" 2>nul
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\default\server.json" 2>nul
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\server.lock" 2>nul
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\server.lock.lock" 2>nul
del "%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\server.json" 2>nul
npx prisma dev >> C:\dev\nightlexicon\.prisma-dev.log 2>&1
timeout /t 3 /nobreak >nul
goto loop
