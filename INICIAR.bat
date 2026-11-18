@echo off
chcp 65001 >nul
title TireDecision
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado.
  echo  Instale em https://nodejs.org e rode este arquivo novamente.
  echo.
  pause
  exit /b 1
)

echo.
echo  Iniciando o TireDecision...
echo  A interface abrira em http://127.0.0.1:7791
echo.

start "TireDecision - servidor" /min cmd /c "node server.js"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:7791"

echo  Servidor em execucao. Feche a janela minimizada para encerrar.
timeout /t 5 /nobreak >nul
