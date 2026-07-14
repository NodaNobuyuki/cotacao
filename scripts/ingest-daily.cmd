@echo off
REM Daily CEPEA ingestion, invoked by Windows Task Scheduler.
REM
REM Must run in an interactive session (user logged on): the Cloudflare
REM challenge does not clear in a headless browser, so a real Chromium window
REM has to open. Task Scheduler's default "run only when user is logged on" is
REM therefore the correct setting, not a limitation to work around.

setlocal
cd /d "%~dp0.."

set LOGDIR=data\cepea\logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

for /f "tokens=1-3 delims=/-. " %%a in ("%DATE%") do set STAMP=%%c%%b%%a
set LOGFILE=%LOGDIR%\ingest-%STAMP%.log

echo [%DATE% %TIME%] iniciando ingestao CEPEA >> "%LOGFILE%"
call npm run ingest:daily >> "%LOGFILE%" 2>&1
set CODE=%ERRORLEVEL%
echo [%DATE% %TIME%] fim (exit=%CODE%) >> "%LOGFILE%"

exit /b %CODE%
