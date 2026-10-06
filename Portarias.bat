@echo off
rem Abre as Portarias como aplicativo local (a planilha FichaContabilis e lida da pasta "planilhas" ou da pasta de pasta.txt).
title Portarias
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Pagina portarias.html -PortaInicial 8790 -Titulo Portarias
if errorlevel 1 pause
