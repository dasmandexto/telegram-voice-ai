#!/bin/bash
# АВТОМАТИЧЕСКИЙ ДЕПЛОЙ В ПРИВАТНЫЙ GITHUB РЕПОЗИТОРИЙ
# Просто запустите: bash DEPLOY_NOW.sh

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║   GitHub Deploy - Telegram Voice AI v4.0             ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Ваш токен
TOKEN="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"

# Ввод имени пользователя
read -p "Ваш GitHub username: " USERNAME

if [ -z "$USERNAME" ]; then
    echo "❌ Username обязателен"
    exit 1
fi

# URL репозитория
REPO_URL="https://${TOKEN}@github.com/${USERNAME}/telegram-voice-ai.git"

echo ""
echo "📦 Инициализация Git..."
git init

echo "📝 Добавление файлов..."
git add .

echo "💾 Создание коммита..."
git commit -m "v4.0.0 - Multi-Account Edition with Whisper GGUF and OXXN

Features:
- Multi-account parallel calling
- Whisper GGUF speech recognition  
- OXXN intonation analysis
- TXT/CSV phone lists support
- Proxy rotation
- SpamBot check
- Session import (session.json/tdata)

Full documentation included."

echo "🔗 Настройка remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo "🌿 Настройка ветки main..."
git branch -M main

echo ""
echo "⬆️  Загрузка в ПРИВАТНЫЙ репозиторий..."
echo "Репозиторий: https://github.com/${USERNAME}/telegram-voice-ai"
echo ""

if git push -u origin main --force; then
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║          ✅ УСПЕШНО ЗАГРУЖЕНО В GITHUB!              ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    echo "🔗 Приватный репозиторий:"
    echo "   https://github.com/${USERNAME}/telegram-voice-ai"
    echo ""
    echo "⚠️  ВАЖНО: Удалите этот скрипт для безопасности:"
    echo "   rm DEPLOY_NOW.sh"
    echo ""
else
    echo ""
    echo "❌ Ошибка загрузки!"
    echo ""
    echo "Возможные причины:"
    echo "1. Репозиторий не существует"
    echo "   Создайте ПРИВАТНЫЙ репо: https://github.com/new"
    echo "   Название: telegram-voice-ai"
    echo "   Тип: Private ✅"
    echo ""
    echo "2. Токен не имеет прав"
    echo "   Проверьте права: repo (full control)"
    echo ""
    exit 1
fi
