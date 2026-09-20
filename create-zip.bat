@echo off
REM Создание ZIP архива проекта Telegram Voice AI (Windows)

echo.
echo Создание ZIP архива...
echo.

REM Проверка наличия PowerShell
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] PowerShell не найден
    echo Используйте ручной способ: правой кнопкой на папку - Отправить - Сжатая ZIP-папка
    pause
    exit /b 1
)

REM Создать временную копию без node_modules
set TEMP_DIR=telegram-voice-ai-temp
set ZIP_NAME=telegram-voice-ai-v4.0.zip

echo [INFO] Подготовка файлов...

REM Удалить старый ZIP если существует
if exist "%ZIP_NAME%" del "%ZIP_NAME%"

REM Создать ZIP через PowerShell
echo [INFO] Создание архива...
powershell -Command "Compress-Archive -Path * -DestinationPath '%ZIP_NAME%' -Force -CompressionLevel Optimal"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   ZIP АРХИВ СОЗДАН!
    echo ========================================
    echo.
    echo Файл: %ZIP_NAME%
    echo.
    for %%I in ("%ZIP_NAME%") do echo Размер: %%~zI байт
    echo.
    echo Архив готов к скачиванию!
    echo.
) else (
    echo.
    echo [ERROR] Ошибка создания архива
    echo Попробуйте ручной способ:
    echo 1. Откройте папку проекта
    echo 2. Выделите все файлы
    echo 3. Правой кнопкой - Отправить - Сжатая ZIP-папка
    echo.
)

pause
