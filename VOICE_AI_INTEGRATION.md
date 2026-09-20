# 🎙️ Интеграция Voice AI - Whisper + OXXN Realtime API

Инструкция по подключению вашего Voice AI стека для распознавания речи и интонаций.

---

## 🎯 Архитектура

```
Telegram Call
     │
     ▼
WebRTC Audio Stream (WebM)
     │
     ▼
Playwright перехватывает аудио
     │
     ▼
Сохраняется temp-call-audio.webm
     │
     ▼
Отправляется на Voice AI API
     │
     ├──► Whisper (guff) → текст транскрипции
     └──► OXXN Realtime API → интонации
              │
              ▼
     Объединённый результат:
     {
       "text": "да, интересно",
       "sentiment": "positive",
       "emotions": {...},
       "intonation": {...}
     }
```

---

## 📡 Voice AI API Endpoint

Создайте простой HTTP сервер, который будет принимать аудио и возвращать результат.

### Пример сервера (Node.js + Express):

```javascript
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Эндпоинт для транскрипции
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    try {
        const audioPath = req.file.path;
        
        // 1. Whisper (guff) для транскрипции
        const transcription = await runWhisper(audioPath);
        
        // 2. OXXN Realtime API для интонаций
        const intonation = await analyzeIntonation(audioPath);
        
        // 3. Объединяем результат
        const result = {
            text: transcription.text,
            language: transcription.language,
            sentiment: intonation.sentiment,
            emotions: intonation.emotions,
            confidence: transcription.confidence
        };
        
        // Удаляем временный файл
        fs.unlinkSync(audioPath);
        
        res.json(result);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Функция для Whisper
async function runWhisper(audioPath) {
    return new Promise((resolve, reject) => {
        // Запускаем Whisper (guff)
        // Замените на ваш реальный путь и команду
        exec(`whisper ${audioPath} --model base --language ru --output_format json`, 
            (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                
                // Парсим результат
                const result = JSON.parse(stdout);
                resolve({
                    text: result.text,
                    language: result.language,
                    confidence: result.confidence || 0.9
                });
            }
        );
    });
}

// Функция для OXXN Realtime API
async function analyzeIntonation(audioPath) {
    // Отправляем на OXXN Realtime API
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath));
    
    const response = await fetch('https://api.oxxn.ai/v1/realtime/analyze', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer YOUR_OXXN_API_KEY`
        },
        body: formData
    });
    
    const data = await response.json();
    
    return {
        sentiment: data.sentiment,       // positive / negative / neutral
        emotions: data.emotions,         // { joy: 0.8, anger: 0.1, ... }
        intonation: data.intonation,     // pitch, tempo, energy
        confidence: data.confidence
    };
}

app.listen(3000, () => {
    console.log('🎙️  Voice AI API запущен на http://localhost:3000');
});
```

---

## 🔧 Настройка в Telegram Caller

### Вариант 1: Через интерактивную настройку

```bash
node voice-ai-caller-v3.js
```

Когда система спросит:

```
🎙️  ШАГ 8: Voice AI для распознавания речи
Использовать Voice AI API? (y/n, по умолчанию n): y
Введите URL Voice AI API: http://localhost:3000/api/transcribe
```

---

### Вариант 2: Прямая настройка в коде

```javascript
const caller = new VoiceAICallerV3({
    voiceAIEndpoint: 'http://localhost:3000/api/transcribe',
    audioMessageFile: './audio-message.mp3',
    phoneListFile: './phones.txt'
});

await caller.startCalling();
```

---

## 📤 Формат запроса к Voice AI API

**Метод:** POST

**URL:** `http://localhost:3000/api/transcribe`

**Content-Type:** `audio/webm`

**Body:** Бинарные данные аудио (WebM формат)

**Пример (cURL):**
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -H "Content-Type: audio/webm" \
  --data-binary @temp-call-audio.webm
```

---

## 📥 Формат ответа от Voice AI API

**Обязательные поля:**

```json
{
  "text": "да, интересно"
}
```

**Расширенный формат (опционально):**

```json
{
  "text": "да, интересно",
  "language": "ru",
  "sentiment": "positive",
  "emotions": {
    "joy": 0.8,
    "interest": 0.9,
    "neutral": 0.1
  },
  "intonation": {
    "pitch": "high",
    "tempo": "normal",
    "energy": 0.85
  },
  "confidence": 0.95
}
```

**Минимальный рабочий вариант:**

Если ваш API возвращает только `{ "text": "..." }` - этого достаточно!

---

## 🚀 Быстрый тест Voice AI

Создайте тестовый файл `test-voice-ai.js`:

```javascript
const fs = require('fs');

async function testVoiceAI() {
    // Загружаем тестовый аудиофайл
    const audioBuffer = fs.readFileSync('./test-audio.webm');
    
    // Отправляем на Voice AI API
    const response = await fetch('http://localhost:3000/api/transcribe', {
        method: 'POST',
        headers: {
            'Content-Type': 'audio/webm'
        },
        body: audioBuffer
    });
    
    const result = await response.json();
    
    console.log('✅ Результат распознавания:');
    console.log(JSON.stringify(result, null, 2));
}

testVoiceAI();
```

**Запуск:**
```bash
node test-voice-ai.js
```

---

## 🔄 Обработка результата в Telegram Caller

Скрипт автоматически:

1. **Извлекает аудио** из WebRTC потока
2. **Сохраняет** в `temp-call-audio.webm`
3. **Отправляет** на ваш Voice AI API
4. **Получает** `{ text: "..." }`
5. **Категоризирует** ответ на yes/no/unclear
6. **Записывает** в базу данных

**Код обработки:**

```javascript
async recognizeSpeech(audioFile) {
    if (this.config.voiceAIEndpoint) {
        const audioBuffer = fs.readFileSync(audioFile);
        
        const response = await fetch(this.config.voiceAIEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: audioBuffer
        });
        
        const result = await response.json();
        
        return {
            text: result.text,
            category: this.categorizeResponse(result.text),
            // Дополнительные данные если есть
            sentiment: result.sentiment,
            emotions: result.emotions,
            confidence: result.confidence
        };
    }
}
```

---

## 🎨 Использование интонаций и эмоций

Если ваш OXXN API возвращает интонации, можете улучшить категоризацию:

```javascript
categorizeResponse(text, sentiment, emotions) {
    const lowerText = text.toLowerCase().trim();
    
    // Позитивные слова
    const positive = ['да', 'угу', 'давайте', 'хорошо', 'интересно'];
    if (positive.some(k => lowerText.includes(k))) {
        // Если sentiment тоже positive - высокая уверенность
        if (sentiment === 'positive') {
            return { category: 'yes', confidence: 'high' };
        }
        return { category: 'yes', confidence: 'medium' };
    }
    
    // Негативные слова
    const negative = ['нет', 'не интересно', 'не надо'];
    if (negative.some(k => lowerText.includes(k))) {
        if (sentiment === 'negative') {
            return { category: 'no', confidence: 'high' };
        }
        return { category: 'no', confidence: 'medium' };
    }
    
    // Анализируем эмоции если текст неясен
    if (emotions) {
        if (emotions.joy > 0.7 || emotions.interest > 0.7) {
            return { category: 'yes', confidence: 'low', reason: 'emotions' };
        }
        if (emotions.anger > 0.7 || emotions.disgust > 0.7) {
            return { category: 'no', confidence: 'low', reason: 'emotions' };
        }
    }
    
    return { category: 'unclear', confidence: 'low' };
}
```

---

## 🐛 Отладка

### Включить логи Voice AI запросов:

```javascript
async recognizeSpeech(audioFile) {
    console.log('🔍 DEBUG: Отправка на Voice AI...');
    console.log('📁 Файл:', audioFile);
    console.log('📏 Размер:', fs.statSync(audioFile).size, 'байт');
    console.log('🌐 Endpoint:', this.config.voiceAIEndpoint);
    
    const audioBuffer = fs.readFileSync(audioFile);
    
    console.log('📤 Отправляем...');
    const response = await fetch(this.config.voiceAIEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/webm' },
        body: audioBuffer
    });
    
    console.log('📥 Статус:', response.status);
    const result = await response.json();
    console.log('✅ Результат:', JSON.stringify(result, null, 2));
    
    return result;
}
```

---

## ⚡ Производительность

### Рекомендации:

1. **Кеширование моделей Whisper** - загружайте модель один раз при старте сервера
2. **Батчинг** - обрабатывайте несколько запросов параллельно
3. **GPU ускорение** - используйте CUDA для Whisper если доступно
4. **Timeout** - установите разумный таймаут (5-10 секунд)

### Пример оптимизированного сервера:

```javascript
// Загружаем Whisper модель при старте
const whisperModel = loadWhisperModel('base');

app.post('/api/transcribe', async (req, res) => {
    // Таймаут 10 секунд
    const timeout = setTimeout(() => {
        res.status(504).json({ error: 'Timeout' });
    }, 10000);
    
    try {
        const result = await Promise.all([
            whisperModel.transcribe(audioPath),  // Whisper
            analyzeIntonation(audioPath)         // OXXN
        ]);
        
        clearTimeout(timeout);
        res.json({ ...result[0], ...result[1] });
        
    } catch (error) {
        clearTimeout(timeout);
        res.status(500).json({ error: error.message });
    }
});
```

---

## 📋 Чек-лист интеграции

- [ ] Voice AI API сервер запущен на http://localhost:3000
- [ ] Эндпоинт `/api/transcribe` отвечает
- [ ] Whisper (guff) настроен и работает
- [ ] OXXN Realtime API ключ добавлен
- [ ] Тестовый запрос возвращает `{ "text": "..." }`
- [ ] В voice-ai-caller-v3.js настроен `voiceAIEndpoint`
- [ ] Запущен тестовый звонок
- [ ] Аудио успешно распознаётся
- [ ] Результаты записываются в базу

---

## 🆘 Частые проблемы

### Проблема: "Connection refused"

**Решение:**
- Убедитесь что Voice AI API запущен
- Проверьте URL (http://localhost:3000/api/transcribe)
- Проверьте firewall

### Проблема: "Invalid audio format"

**Решение:**
- WebM может требовать конвертации
- Используйте ffmpeg для конвертации в WAV
- Или настройте Whisper на приём WebM напрямую

### Проблема: "Transcription is empty"

**Решение:**
- Проверьте что аудио действительно записалось
- Откройте temp-call-audio.webm и прослушайте
- Убедитесь что громкость достаточная

### Проблема: "OXXN API rate limit"

**Решение:**
- Кешируйте результаты для одинаковых фраз
- Используйте локальные модели для интонаций
- Оптимизируйте количество запросов

---

## 🎯 Готово к тестированию!

**Запуск с Voice AI:**

```bash
# 1. Запустите Voice AI API сервер
node voice-ai-server.js

# 2. Запустите Telegram Caller
node voice-ai-caller-v3.js

# 3. В интерактивной настройке укажите:
# Voice AI endpoint: http://localhost:3000/api/transcribe
```

**Ожидаемый результат:**

```
✅ Звонок принят!
🎵 Проигрывание аудио...
👂 Слушаю ответ...
🎤 Извлечение аудио...
🗣️  Распознавание речи...
✅ Распознано: да, интересно
💬 Ответ: "да, интересно" → yes
```

---

**Успешной интеграции! 🚀🎙️**
