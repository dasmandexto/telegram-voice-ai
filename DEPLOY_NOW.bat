@echo off
REM АВТОМАТИЧЕСКИЙ ДЕПЛОЙ В ПРИВАТНЫЙ GITHUB РЕПОЗИТОРИЙ
REM Просто запустите: DEPLOY_NOW.bat

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   GitHub Deploy - Telegram Voice AI
echo ========================================
echo.

REM Ваш токен
set TOKEN=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

REM Ввод username
set /p USERNAME="Ваш GitHub username: "

if "%USERNAME%"=="" (
    echo [ERROR] Username обязателен
    pause
    exit /b 1
)

REM URL репозитория
set REPO_URL=https://%TOKEN%@github.com/%USERNAME%/telegram-voice-ai.git

echo.
echo [INFO] Инициализация Git...
git init
if %errorlevel% neq 0 goto :error

echo [INFO] Добавление файлов...
git add .
if %errorlevel% neq 0 goto :error

echo [INFO] Создание коммита...
git commit -m "v4.0.0 - Multi-Account Edition with Whisper GGUF and OXXN"
if %errorlevel% equ 0 (
    echo [OK] Коммит создан
) else (
    echo [INFO] Коммит уже существует
)

echo [INFO] Настройка remote...
git remote remove origin 2>nul
git remote add origin %REPO_URL%
if %errorlevel% neq 0 goto :error

echo [INFO] Настройка ветки main...
git branch -M main
if %errorlevel% neq 0 goto :error

echo.
echo [INFO] Загрузка в ПРИВАТНЫЙ репозиторий...
echo Репозиторий: https://github.com/%USERNAME%/telegram-voice-ai
echo.

git push -u origin main --force
if %errorlevel% neq 0 goto :error

echo.
echo ========================================
echo   УСПЕШНО ЗАГРУЖЕНО В GITHUB!
echo ========================================
echo.
echo Приватный репозиторий:
echo https://github.com/%USERNAME%/telegram-voice-ai
echo.
echo [WARNING] Удалите этот скрипт для безопасности:
echo del DEPLOY_NOW.bat
echo.
pause
exit /b 0

:error
echo.
echo [ERROR] Ошибка загрузки!
echo.
echo Возможные причины:
echo 1. Репозиторий не существует
echo    Создайте ПРИВАТНЫЙ репо: https://github.com/new
echo    Название: telegram-voice-ai
echo    Тип: Private
echo.
echo 2. Токен не имеет прав
echo    Проверьте права: repo (full control)
echo.
pause
exit /b 1
