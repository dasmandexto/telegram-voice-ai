@echo off
REM Telegram Voice AI - GitHub Deployment Script (Windows)
REM Автоматическая загрузка проекта в GitHub репозиторий

setlocal enabledelayedexpansion

echo.
echo ========================================
echo  Telegram Voice AI - GitHub Deployment
echo ========================================
echo.

REM Проверка наличия git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git не установлен!
    echo Скачайте Git с https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [OK] Git найден
echo.

REM Конфигурация
set REPO_URL=https://github.com/YOUR_USERNAME/telegram-voice-ai.git

echo [INFO] Для загрузки требуется GitHub Personal Access Token
echo Создайте токен: https://github.com/settings/tokens/new
echo Требуемые права: repo (full control)
echo.
set /p GITHUB_TOKEN="Введите ваш GitHub токен: "

if "%GITHUB_TOKEN%"=="" (
    echo [ERROR] Токен не указан. Выход.
    pause
    exit /b 1
)

echo.

REM Инициализация Git репозитория
if not exist ".git" (
    echo [INFO] Инициализация Git репозитория...
    git init
    if %errorlevel% neq 0 goto :error
    echo [OK] Репозиторий инициализирован
) else (
    echo [OK] Git репозиторий уже существует
)

REM Добавление всех файлов
echo.
echo [INFO] Добавление файлов...
git add .
if %errorlevel% neq 0 goto :error
echo [OK] Файлы добавлены

REM Создание коммита
echo.
echo [INFO] Создание коммита...
git commit -m "Initial commit - Telegram Voice AI Auto Caller v3.0" -m "Features: Automated voice calling, Voice AI integration, Proxy support, SpamBot check, Session import, Comprehensive documentation"
if %errorlevel% equ 0 (
    echo [OK] Коммит создан
) else (
    echo [INFO] Коммит уже существует или нет изменений
)

REM Добавление remote
echo.
echo [INFO] Настройка удаленного репозитория...
git remote remove origin 2>nul
set AUTH_URL=https://%GITHUB_TOKEN%@github.com/YOUR_USERNAME/telegram-voice-ai.git
git remote add origin %AUTH_URL%
if %errorlevel% neq 0 goto :error
echo [OK] Remote настроен

REM Переименование ветки в main
echo.
echo [INFO] Настройка ветки main...
git branch -M main
if %errorlevel% neq 0 goto :error
echo [OK] Ветка main готова

REM Push в GitHub
echo.
echo [INFO] Загрузка в GitHub...
echo.
git push -u origin main
if %errorlevel% neq 0 goto :error

echo.
echo ========================================
echo  УСПЕШНО ЗАГРУЖЕНО В GITHUB!
echo ========================================
echo.
echo Репозиторий: https://github.com/YOUR_USERNAME/telegram-voice-ai
echo.
echo [INFO] Для будущих загрузок используйте SSH ключи вместо токенов
echo Инструкция: https://docs.github.com/en/authentication/connecting-to-github-with-ssh
echo.
pause
exit /b 0

:error
echo.
echo [ERROR] Ошибка при выполнении операции
echo.
echo Возможные причины:
echo 1. Репозиторий не существует - создайте его на GitHub.com
echo 2. Неверный токен - проверьте права доступа
echo 3. Неверное имя пользователя в URL
echo.
echo Исправьте проблему и запустите скрипт снова
echo.
pause
exit /b 1
