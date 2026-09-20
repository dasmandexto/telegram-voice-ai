#!/bin/bash

# Telegram Voice AI - GitHub Deployment Script
# Автоматическая загрузка проекта в GitHub репозиторий

set -e  # Остановка при ошибках

echo "🚀 Начинаем загрузку Telegram Voice AI в GitHub..."
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка наличия git
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git не установлен. Установите Git и попробуйте снова.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Git найден${NC}"

# Конфигурация
REPO_URL="https://github.com/YOUR_USERNAME/telegram-voice-ai.git"

# Запрос токена у пользователя (не храним в коде!)
echo -e "${YELLOW}⚠️  Для загрузки требуется GitHub Personal Access Token${NC}"
echo "Создайте токен: https://github.com/settings/tokens/new"
echo "Требуемые права: repo (full control)"
echo ""
read -p "Введите ваш GitHub токен: " GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${RED}❌ Токен не указан. Выход.${NC}"
    exit 1
fi

# Инициализация Git репозитория
if [ ! -d ".git" ]; then
    echo "📦 Инициализация Git репозитория..."
    git init
    echo -e "${GREEN}✅ Репозиторий инициализирован${NC}"
else
    echo -e "${GREEN}✅ Git репозиторий уже существует${NC}"
fi

# Добавление всех файлов
echo ""
echo "📝 Добавление файлов..."
git add .
echo -e "${GREEN}✅ Файлы добавлены${NC}"

# Создание коммита
echo ""
echo "💾 Создание коммита..."
git commit -m "Initial commit - Telegram Voice AI Auto Caller v3.0

Features:
- Automated voice calling through Telegram Web
- 7 call statuses (answered, no_answer, unreachable, busy, declined, etc.)
- Voice AI integration (Whisper + OXXN Realtime API)
- Interactive configuration UI
- Proxy support with rotation
- SpamBot check integration
- Session import (session.json/tdata)
- Comprehensive documentation

Versions included: v1.0, v2.0, v3.0" || echo "Коммит уже существует, пропускаем..."

echo -e "${GREEN}✅ Коммит создан${NC}"

# Добавление remote
echo ""
echo "🔗 Настройка удаленного репозитория..."
if git remote | grep -q "origin"; then
    echo "Удаляем существующий origin..."
    git remote remove origin
fi

# URL с токеном для аутентификации
AUTH_URL="https://${GITHUB_TOKEN}@github.com/YOUR_USERNAME/telegram-voice-ai.git"
git remote add origin "$AUTH_URL"
echo -e "${GREEN}✅ Remote настроен${NC}"

# Переименование ветки в main
echo ""
echo "🌿 Настройка ветки main..."
git branch -M main
echo -e "${GREEN}✅ Ветка main готова${NC}"

# Push в GitHub
echo ""
echo "⬆️  Загрузка в GitHub..."
if git push -u origin main; then
    echo ""
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ УСПЕШНО ЗАГРУЖЕНО В GITHUB!${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo ""
    echo "🔗 Репозиторий: https://github.com/YOUR_USERNAME/telegram-voice-ai"
    echo ""
    echo -e "${YELLOW}💡 Рекомендация:${NC}"
    echo "Для будущих загрузок используйте SSH ключи вместо токенов"
    echo "Инструкция: https://docs.github.com/en/authentication/connecting-to-github-with-ssh"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Ошибка при загрузке${NC}"
    echo ""
    echo "Возможные причины:"
    echo "1. Репозиторий не существует - создайте его на GitHub.com"
    echo "2. Неверный токен - проверьте права доступа"
    echo "3. Неверное имя пользователя в URL"
    echo ""
    echo "Исправьте проблему и запустите скрипт снова"
    exit 1
fi
