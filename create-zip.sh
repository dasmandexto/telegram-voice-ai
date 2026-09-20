#!/bin/bash
# Создание ZIP архива проекта Telegram Voice AI

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ZIP_NAME="telegram-voice-ai-v4.0-${TIMESTAMP}.zip"

echo "📦 Создание ZIP архива..."
echo "Имя файла: $ZIP_NAME"
echo ""

# Создать ZIP, исключив ненужные файлы
zip -r "$ZIP_NAME" . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x "telegram-session/*" \
    -x "sessions/*" \
    -x "*.log" \
    -x ".DS_Store" \
    -x "Thumbs.db"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ZIP архив создан: $ZIP_NAME"
    echo "📊 Размер: $(du -h "$ZIP_NAME" | cut -f1)"
    echo ""
    echo "Архив готов к скачиванию!"
else
    echo "❌ Ошибка создания архива"
    exit 1
fi
