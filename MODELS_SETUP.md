# 🤖 Настройка Whisper GGUF и OXXN моделей

Инструкция по установке и интеграции моделей для распознавания речи и анализа интонаций.

---

## 📁 Структура папок

```
telegram-voice-ai/
├── models/
│   ├── whisper.gguf              ← Whisper модель
│   ├── oxxn-intonation/          ← OXXN модель
│   │   ├── config.json
│   │   ├── model.safetensors
│   │   └── tokenizer/
│   └── README.md
├── sessions/                      ← Ваши аккаунты
│   ├── account1/
│   │   └── session.json
│   ├── account2/
│   │   └── tdata/
│   └── account3/
│       └── session.json
├── phones.txt                     ← Список номеров (TXT)
└── voice-ai-caller-v4-multi.js
```

---

## 1️⃣ Установка Whisper GGUF

### Скачать модель

**Вариант A: Официальная модель от OpenAI (конвертированная в GGUF)**

```bash
# Создать папку моделей
mkdir -p models

# Скачать quantized модель (рекомендуется: base или small)
cd models

# Base модель (74MB, оптимальное соотношение скорость/качество)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mv ggml-base.bin whisper.gguf

# ИЛИ Small модель (466MB, выше качество)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
mv ggml-small.bin whisper.gguf

# ИЛИ Tiny модель (75MB, самая быстрая)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
mv ggml-tiny.bin whisper.gguf
```

**Вариант B: Скачать через Hugging Face CLI**

```bash
pip install huggingface_hub

# Скачать модель
huggingface-cli download ggerganov/whisper.cpp ggml-base.bin --local-dir ./models
mv ./models/ggml-base.bin ./models/whisper.gguf
```

### Установка whisper.cpp (для запуска GGUF)

```bash
# Клонировать whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Компиляция
make

# Проверка
./main -h
```

**Для Windows:**

```cmd
# Скачать pre-built binary
# https://github.com/ggerganov/whisper.cpp/releases

# Или собрать через CMake
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

---

## 2️⃣ Установка OXXN (интонации и эмоции)

### Что такое OXXN?

OXXN Realtime API - модель для анализа интонаций, эмоций и настроения по голосу.

### Скачать модель

**Вариант A: Официальная модель (если доступна)**

```bash
cd models
mkdir oxxn-intonation
cd oxxn-intonation

# Скачать с Hugging Face (пример - замените на актуальную модель)
huggingface-cli download organization/oxxn-model --local-dir .
```

**Вариант B: Альтернативные модели для анализа эмоций**

Если OXXN недоступна, можно использовать:

1. **Wav2Vec2 Emotion** (Facebook)
```bash
cd models/oxxn-intonation
huggingface-cli download ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition --local-dir .
```

2. **SpeechBrain Emotion Recognition**
```bash
pip install speechbrain
# Модель загрузится автоматически при первом использовании
```

### Запуск OXXN сервера

Создайте файл `oxxn-server.py`:

```python
#!/usr/bin/env python3
"""
OXXN Intonation Analysis Server
Анализирует интонацию и эмоции в аудио
"""

from flask import Flask, request, jsonify
import torch
from transformers import Wav2Vec2Processor, Wav2Vec2ForSequenceClassification
import librosa
import base64
import io
import numpy as np

app = Flask(__name__)

# Загрузка модели
MODEL_PATH = "./models/oxxn-intonation"
processor = Wav2Vec2Processor.from_pretrained(MODEL_PATH)
model = Wav2Vec2ForSequenceClassification.from_pretrained(MODEL_PATH)

# Маппинг меток
EMOTION_LABELS = {
    0: 'negative',    # Отрицательная интонация
    1: 'neutral',     # Нейтральная
    2: 'positive'     # Положительная
}

@app.route('/analyze_intonation', methods=['POST'])
def analyze_intonation():
    try:
        data = request.json
        audio_base64 = data['audio']
        
        # Декодировать base64 аудио
        audio_bytes = base64.b64decode(audio_base64.split(',')[1])
        audio_array, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000)
        
        # Препроцессинг
        inputs = processor(audio_array, sampling_rate=sr, return_tensors="pt", padding=True)
        
        # Инференс
        with torch.no_grad():
            logits = model(**inputs).logits
        
        # Предсказание
        predicted_id = torch.argmax(logits, dim=-1).item()
        intonation = EMOTION_LABELS.get(predicted_id, 'neutral')
        confidence = torch.softmax(logits, dim=-1).max().item()
        
        return jsonify({
            'intonation': intonation,
            'confidence': confidence,
            'all_scores': {
                'negative': torch.softmax(logits, dim=-1)[0][0].item(),
                'neutral': torch.softmax(logits, dim=-1)[0][1].item(),
                'positive': torch.softmax(logits, dim=-1)[0][2].item()
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': MODEL_PATH})

if __name__ == '__main__':
    print("🎭 OXXN Intonation Server запущен на http://localhost:8000")
    app.run(host='0.0.0.0', port=8000)
```

**Запуск сервера:**

```bash
pip install flask torch transformers librosa

python oxxn-server.py
# Сервер запустится на http://localhost:8000
```

**Проверка работы:**

```bash
curl http://localhost:8000/health
```

---

## 3️⃣ Структура sessions (мультиаккаунты)

### Формат session.json

```
sessions/
├── account1/
│   └── session.json
├── account2/
│   └── session.json
└── account3/
    └── session.json
```

**Пример session.json:**

```json
{
  "cookies": [...],
  "origins": [...],
  "localStorage": [
    {
      "name": "user_auth",
      "value": "..."
    }
  ]
}
```

### Формат tdata

```
sessions/
├── account1/
│   └── tdata/
│       ├── key_data
│       ├── D877F783D5D3EF8C/
│       └── ...
├── account2/
│   └── tdata/
│       └── ...
```

---

## 4️⃣ Формат файла с номерами

### TXT формат (рекомендуется)

**phones.txt:**

```
+380501234567
+380672345678
+380933456789
+79001234567
+1234567890
```

- Один номер на строку
- Обязательно с `+` и кодом страны
- Комментарии начинаются с `#`

**Пример с комментариями:**

```
# Украина
+380501234567
+380672345678

# Россия
+79001234567
+79101234567

# США
+12345678901
```

### CSV формат

**phones.csv:**

```csv
phone,name,notes
+380501234567,Иван,Клиент 1
+380672345678,Петр,Клиент 2
+79001234567,Мария,Клиент 3
```

- Номер в первой колонке
- Дополнительные колонки игнорируются (но сохраняются в логах)

---

## 5️⃣ Проверка установки

### Чек-лист перед запуском

```bash
# 1. Проверить Whisper
ls -lh models/whisper.gguf
./whisper.cpp/main -m models/whisper.gguf -h

# 2. Проверить OXXN сервер
curl http://localhost:8000/health

# 3. Проверить аккаунты
ls -la sessions/

# 4. Проверить номера
head -5 phones.txt

# 5. Проверить аудио
ls -lh audio-message.mp3
```

### Тестовый запуск

```bash
# Запустить v4.0 мультиаккаунт
node voice-ai-caller-v4-multi.js
```

**Интерактивная настройка проверит:**
- ✅ Наличие phones.txt
- ✅ Наличие audio-message.mp3
- ✅ Наличие Whisper GGUF
- ✅ Наличие OXXN модели
- ✅ Количество аккаунтов в sessions/

---

## 6️⃣ Производительность

### Рекомендации по моделям

| Модель | Размер | Скорость | Качество | Использование |
|--------|--------|----------|----------|---------------|
| Whisper Tiny | 75MB | Очень быстро | Базовое | Массовый обзвон |
| Whisper Base | 142MB | Быстро | Хорошее | ✅ Рекомендуется |
| Whisper Small | 466MB | Средне | Отличное | Высокая точность |
| Whisper Medium | 1.5GB | Медленно | Превосходное | Максимальное качество |

### Системные требования

**Минимальные:**
- CPU: 4 ядра
- RAM: 8GB
- Диск: 10GB свободного места

**Рекомендуемые (10+ параллельных аккаунтов):**
- CPU: 8+ ядер
- RAM: 16GB+
- Диск: 50GB SSD
- GPU: NVIDIA (опционально, ускоряет Whisper в 5-10x)

### GPU ускорение (опционально)

**Для Whisper:**

```bash
# Собрать whisper.cpp с CUDA
cd whisper.cpp
make clean
WHISPER_CUDA=1 make

# Проверка
./main -m models/whisper.gguf --print-devices
```

**Для OXXN:**

```python
# В oxxn-server.py использовать GPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = model.to(device)
```

---

## 7️⃣ Устранение проблем

### Whisper не распознает речь

**Проблема:** Пустая транскрипция

**Решения:**
1. Проверить формат аудио (должен быть WAV 16kHz)
2. Увеличить громкость записи
3. Использовать модель побольше (base → small)

### OXXN сервер не отвечает

**Проблема:** Connection refused

**Решения:**
```bash
# Проверить запущен ли сервер
ps aux | grep oxxn-server

# Проверить порт
lsof -i :8000

# Перезапустить
pkill -f oxxn-server
python oxxn-server.py
```

### Аккаунты не импортируются

**Проблема:** Account not found

**Решения:**
1. Проверить структуру папок:
   ```bash
   sessions/
   └── account1/
       └── session.json  ← Должен быть в подпапке
   ```

2. Проверить формат session.json (валидный JSON)

3. Для tdata: убедиться что папка `tdata/` внутри account1/

---

## 8️⃣ Альтернативы

### Вместо Whisper GGUF

1. **Google Cloud Speech-to-Text** (платный, но очень точный)
2. **Azure Speech Services** (первые 5 часов бесплатно)
3. **Vosk** (полностью оффлайн, русский язык)

### Вместо OXXN

1. **OpenAI GPT-4 Audio** (платный API)
2. **SpeechBrain** (open source)
3. **pyAudioAnalysis** (простой анализ тона)

---

## 📚 Ссылки

- Whisper.cpp: https://github.com/ggerganov/whisper.cpp
- Whisper модели: https://huggingface.co/ggerganov/whisper.cpp
- Wav2Vec2 Emotion: https://huggingface.co/ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition
- SpeechBrain: https://speechbrain.github.io/

---

**Готово! Теперь у вас есть полная настройка Voice AI с Whisper и OXXN.**
