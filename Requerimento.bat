@echo off
rem Abre o Requerimento do Servidor como aplicativo local (as planilhas sao lidas da pasta "planilhas").
title Requerimento do Servidor
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 pause
