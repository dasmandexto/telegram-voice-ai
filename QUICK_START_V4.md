# 🚀 Быстрый старт v4.0 - Мультиаккаунтный автообзвон

**5 минут до первого запуска!**

---

## 📦 Шаг 1: Установка зависимостей

```bash
npm install
```

---

## 📁 Шаг 2: Подготовка файлов

### 2.1 Создать структуру папок

```bash
mkdir -p sessions models results
```

### 2.2 Поместить аккаунты в sessions/

```
sessions/
├── account1/
│   └── session.json
├── account2/
│   └── tdata/
└── account3/
    └── session.json
```

**Где взять session.json или tdata?**

- Экспортировать из Telegram Desktop
- Использовать Telethon/Pyrogram для создания сессий
- Купить готовые софт-аккаунты

### 2.3 Создать phones.txt

```txt
+380501234567
+380672345678
+79001234567
+12345678901
```

- Один номер на строку
- Обязательно с `+` и кодом страны

### 2.4 Подготовить аудиосообщение

```bash
# Поместите ваш MP3/OGG/WAV файл
cp /path/to/your/message.mp3 ./audio-message.mp3
```

---

## 🤖 Шаг 3: Установка моделей (опционально)

### 3.1 Whisper GGUF (распознавание речи)

```bash
cd models

# Скачать Base модель (142MB, рекомендуется)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin whisper.gguf

cd ..
```

### 3.2 Установить whisper.cpp

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make
cd ..
```

### 3.3 OXXN сервер (анализ интонаций)

```bash
# Установить зависимости
pip install flask torch transformers librosa

# Скачать модель эмоций
cd models
mkdir oxxn-intonation
cd oxxn-intonation
huggingface-cli download ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition --local-dir .
cd ../..

# Создать сервер (см. MODELS_SETUP.md)
# Или пропустить - автообзвон работает и без Voice AI
```

**💡 Можно пропустить шаг 3**, если не нужно распознавание речи (только обзвон).

---

## ▶️ Шаг 4: Запуск

```bash
node voice-ai-caller-v4-multi.js
```

### Интерактивная настройка

Скрипт задаст вам вопросы:

```
📞 Путь к файлу с номерами: phones.txt
🎵 Путь к аудиосообщению: audio-message.mp3
🤖 Whisper GGUF модель: [Enter для ./models/whisper.gguf]
🎭 OXXN модель: [Enter для ./models/oxxn-intonation]
⏱️  Таймаут ожидания (сек): 20
⏳ Задержка между звонками (сек): 3
📁 Папка с аккаунтами: [Enter для ./sessions]
🔄 Параллельных потоков: 3
🌐 Использовать прокси: n
🛡️  Проверить SpamBot: y
```

### Подтверждение

```
╔════════════════════════════════════════╗
║         СВОДКА НАСТРОЕК               ║
╚════════════════════════════════════════╝
📞 Номеров: 100
👥 Аккаунтов: 5
🔄 Параллельных потоков: 3
⏱️  Таймаут: 20 сек
⏳ Задержка: 3 сек

▶️  Начать автообзвон? (y/n): y
```

---

## 📊 Результаты

После завершения результаты сохраняются в:

```
results/results-2024-01-20T15-30-00.json
```

**Формат результата:**

```json
{
  "timestamp": "2024-01-20T15:30:00.000Z",
  "accounts": [
    {
      "name": "account1",
      "status": "completed",
      "callsCount": 20,
      "spamBotStatus": "clean"
    }
  ],
  "results": [
    {
      "phone": "+380501234567",
      "status": "answered",
      "transcription": "да, интересно",
      "intonation": "positive",
      "response_category": "yes"
    }
  ],
  "stats": {
    "totalCalls": 100,
    "answered": 45,
    "noAnswer": 30,
    "unreachable": 25
  }
}
```

---

## 🔧 Настройка прокси (опционально)

### Создать proxy.txt

```
host1:port1:user1:pass1
host2:port2:user2:pass2
host3:port3:user3:pass3
```

**Пример:**

```
proxy1.example.com:8080:username:password
192.168.1.100:3128:admin:secret
```

При запуске выберите:

```
🌐 Использовать прокси: y
📄 Путь к файлу с прокси: proxy.txt
```

Прокси будут автоматически распределены между аккаунтами.

---

## 📈 Параллелизм

### Схема распределения

**Пример: 100 номеров, 5 аккаунтов, 3 параллельных потока**

```
Батч 1 (3 аккаунта работают одновременно):
├── account1: номера 1-20
├── account2: номера 21-40
└── account3: номера 41-60

Батч 2 (оставшиеся 2 аккаунта):
├── account4: номера 61-80
└── account5: номера 81-100
```

**Каждый аккаунт работает независимо:**
- Своя сессия Telegram
- Свой прокси (если настроен)
- Свой список номеров

---

## 🛡️ SpamBot проверка

После завершения всех звонков автоматически проверяется статус каждого аккаунта:

```
[account1] SpamBot: clean ✅
[account2] SpamBot: clean ✅
[account3] SpamBot: limited ⚠️
[account4] SpamBot: clean ✅
[account5] SpamBot: clean ✅
```

**Статусы:**
- `clean` - Аккаунт чистый
- `limited` - Есть ограничения (не рекомендуется использовать)
- `unknown` - Не удалось проверить

---

## ⚙️ Дополнительные настройки

### Изменить количество параллельных потоков

В коде `voice-ai-caller-v4-multi.js`:

```javascript
maxParallelAccounts: 5  // Увеличить до 5
```

### Изменить ротацию прокси

```javascript
callsBeforeProxyRotation: 100  // Менять прокси после 100 звонков
```

### Headless режим (без GUI)

```javascript
headless: true  // Браузеры в фоне
```

---

## 🐛 Устранение проблем

### Аккаунты не найдены

```
❌ Нет аккаунтов! Поместите папки session/tdata в ./sessions/
```

**Решение:**
```bash
ls -la sessions/
# Должны быть подпапки с session.json или tdata/
```

### Модели не найдены

```
⚠️  Whisper GGUF не найден
⚠️  OXXN модель не найдена
```

**Решение:**
- Это НЕ ошибка, просто предупреждение
- Автообзвон работает без моделей
- Но не будет распознавания речи
- Установите модели по MODELS_SETUP.md

### Прокси не работает

```
❌ Proxy connection failed
```

**Решение:**
1. Проверить формат: `host:port:user:pass`
2. Проверить доступность прокси
3. Попробовать без прокси для теста

---

## 📚 Полная документация

- **MODELS_SETUP.md** - Установка Whisper и OXXN
- **SESSION_IMPORT.md** - Импорт session.json и tdata
- **CALL_FLOWS.md** - Все статусы звонков
- **VOICE_AI_INTEGRATION.md** - Интеграция Voice AI API

---

## ✅ Чек-лист перед запуском

- [ ] Установлен Node.js 16+
- [ ] Выполнено `npm install`
- [ ] Создана папка `sessions/` с аккаунтами
- [ ] Создан файл `phones.txt` с номерами
- [ ] Подготовлен `audio-message.mp3`
- [ ] (Опционально) Установлены Whisper GGUF и OXXN
- [ ] (Опционально) Настроены прокси в `proxy.txt`

---

**Готово! Запускайте `node voice-ai-caller-v4-multi.js` и начинайте автообзвон! 🚀**
