#!/usr/bin/env python3
"""
OXXN Intonation Analysis Server
Анализирует интонацию и эмоции в голосе для Telegram Voice AI Caller

Требования:
    pip install flask torch transformers librosa soundfile

Запуск:
    python oxxn-server.py

API:
    POST /analyze_intonation - Анализ интонации из аудио
    GET /health - Проверка работоспособности
"""

from flask import Flask, request, jsonify
import torch
from transformers import Wav2Vec2Processor, Wav2Vec2ForSequenceClassification
import librosa
import soundfile as sf
import base64
import io
import numpy as np
import os
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Конфигурация
MODEL_PATH = "./models/oxxn-intonation"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Глобальные переменные для модели
processor = None
model = None

# Маппинг меток эмоций
EMOTION_LABELS = {
    0: 'negative',    # Отрицательная интонация (гнев, раздражение, отказ)
    1: 'neutral',     # Нейтральная интонация (спокойствие, безразличие)
    2: 'positive'     # Положительная интонация (радость, согласие, интерес)
}

def load_model():
    """
    Загрузка модели при старте сервера
    """
    global processor, model
    
    try:
        logger.info(f"Загрузка модели из {MODEL_PATH}...")
        
        if not os.path.exists(MODEL_PATH):
            logger.warning(f"Модель не найдена в {MODEL_PATH}")
            logger.warning("Скачайте модель:")
            logger.warning("  huggingface-cli download ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition --local-dir ./models/oxxn-intonation")
            return False
        
        processor = Wav2Vec2Processor.from_pretrained(MODEL_PATH)
        model = Wav2Vec2ForSequenceClassification.from_pretrained(MODEL_PATH)
        model = model.to(DEVICE)
        model.eval()  # Режим инференса
        
        logger.info(f"✅ Модель загружена на {DEVICE}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Ошибка загрузки модели: {e}")
        return False

@app.route('/analyze_intonation', methods=['POST'])
def analyze_intonation():
    """
    Анализ интонации из аудио
    
    Request JSON:
        {
            "audio": "data:audio/webm;base64,..." или base64 строка,
            "model_path": "./models/oxxn-intonation" (опционально)
        }
    
    Response JSON:
        {
            "intonation": "positive" | "negative" | "neutral",
            "confidence": 0.85,
            "all_scores": {
                "negative": 0.05,
                "neutral": 0.10,
                "positive": 0.85
            }
        }
    """
    try:
        # Проверка загруженности модели
        if model is None or processor is None:
            return jsonify({
                'error': 'Модель не загружена. Проверьте MODEL_PATH.',
                'model_path': MODEL_PATH
            }), 500
        
        data = request.json
        
        if 'audio' not in data:
            return jsonify({'error': 'Поле "audio" обязательно'}), 400
        
        audio_data = data['audio']
        
        # Декодирование base64 аудио
        try:
            # Убрать data:audio/webm;base64, если есть
            if ',' in audio_data:
                audio_data = audio_data.split(',')[1]
            
            audio_bytes = base64.b64decode(audio_data)
        except Exception as e:
            return jsonify({'error': f'Ошибка декодирования base64: {str(e)}'}), 400
        
        # Загрузка аудио через librosa
        try:
            # Librosa читает из file-like объекта
            audio_array, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000)
        except Exception as e:
            return jsonify({'error': f'Ошибка загрузки аудио: {str(e)}'}), 400
        
        # Валидация аудио
        if len(audio_array) == 0:
            return jsonify({'error': 'Пустое аудио'}), 400
        
        if len(audio_array) < 1600:  # Меньше 0.1 секунды
            return jsonify({'error': 'Аудио слишком короткое (минимум 0.1 сек)'}), 400
        
        logger.info(f"Получено аудио: {len(audio_array)} сэмплов, {sr} Hz, {len(audio_array)/sr:.2f} сек")
        
        # Препроцессинг
        try:
            inputs = processor(
                audio_array, 
                sampling_rate=sr, 
                return_tensors="pt", 
                padding=True
            )
            inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
        except Exception as e:
            return jsonify({'error': f'Ошибка препроцессинга: {str(e)}'}), 500
        
        # Инференс
        try:
            with torch.no_grad():
                logits = model(**inputs).logits
        except Exception as e:
            return jsonify({'error': f'Ошибка инференса: {str(e)}'}), 500
        
        # Предсказание
        predicted_id = torch.argmax(logits, dim=-1).item()
        intonation = EMOTION_LABELS.get(predicted_id, 'neutral')
        
        # Softmax для вероятностей
        probs = torch.softmax(logits, dim=-1)[0]
        confidence = probs[predicted_id].item()
        
        all_scores = {
            'negative': probs[0].item(),
            'neutral': probs[1].item() if len(probs) > 1 else 0.0,
            'positive': probs[2].item() if len(probs) > 2 else 0.0
        }
        
        logger.info(f"Результат: {intonation} (confidence: {confidence:.2f})")
        
        return jsonify({
            'intonation': intonation,
            'confidence': round(confidence, 4),
            'all_scores': {k: round(v, 4) for k, v in all_scores.items()},
            'audio_duration': round(len(audio_array) / sr, 2)
        })
    
    except Exception as e:
        logger.error(f"Неожиданная ошибка: {str(e)}")
        return jsonify({'error': f'Внутренняя ошибка: {str(e)}'}), 500

@app.route('/health', methods=['GET'])
def health():
    """
    Проверка работоспособности сервера
    
    Response JSON:
        {
            "status": "ok" | "error",
            "model_loaded": true | false,
            "model_path": "...",
            "device": "cuda" | "cpu"
        }
    """
    return jsonify({
        'status': 'ok' if (model is not None and processor is not None) else 'error',
        'model_loaded': model is not None and processor is not None,
        'model_path': MODEL_PATH,
        'device': str(DEVICE),
        'model_exists': os.path.exists(MODEL_PATH)
    })

@app.route('/', methods=['GET'])
def index():
    """
    Главная страница с информацией
    """
    return """
    <html>
    <head>
        <title>OXXN Intonation Server</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
            .endpoint { margin: 20px 0; padding: 15px; border-left: 4px solid #4CAF50; background: #f9f9f9; }
            .status { padding: 5px 10px; border-radius: 3px; background: #4CAF50; color: white; }
        </style>
    </head>
    <body>
        <h1>🎭 OXXN Intonation Analysis Server</h1>
        <p><span class="status">Running</span></p>
        
        <h2>Endpoints</h2>
        
        <div class="endpoint">
            <h3>POST /analyze_intonation</h3>
            <p>Анализ интонации из аудио</p>
            <pre>{
  "audio": "data:audio/webm;base64,..."
}</pre>
        </div>
        
        <div class="endpoint">
            <h3>GET /health</h3>
            <p>Проверка работоспособности</p>
        </div>
        
        <h2>Example</h2>
        <pre>curl -X POST http://localhost:8000/analyze_intonation \\
  -H "Content-Type: application/json" \\
  -d '{"audio": "base64_encoded_audio_here"}'</pre>
  
        <h2>Model Info</h2>
        <p>Model path: <code>{}</code></p>
        <p>Device: <code>{}</code></p>
        <p>Model loaded: <code>{}</code></p>
    </body>
    </html>
    """.format(
        MODEL_PATH, 
        str(DEVICE),
        'Yes ✅' if (model is not None) else 'No ❌'
    )

if __name__ == '__main__':
    print("╔════════════════════════════════════════════════════════╗")
    print("║   OXXN Intonation Analysis Server                     ║")
    print("╚════════════════════════════════════════════════════════╝")
    print()
    print(f"📁 Model path: {MODEL_PATH}")
    print(f"💻 Device: {DEVICE}")
    print()
    
    # Загрузить модель
    model_loaded = load_model()
    
    if not model_loaded:
        print()
        print("⚠️  ПРЕДУПРЕЖДЕНИЕ: Модель не загружена!")
        print("   Сервер запустится, но /analyze_intonation вернет ошибку")
        print()
        print("📥 Скачайте модель:")
        print("   pip install huggingface_hub")
        print("   huggingface-cli download ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition --local-dir ./models/oxxn-intonation")
        print()
    
    print("🚀 Запуск сервера на http://0.0.0.0:8000...")
    print("📖 Документация: http://localhost:8000/")
    print("🏥 Health check: http://localhost:8000/health")
    print()
    print("Для остановки нажмите Ctrl+C")
    print()
    
    app.run(host='0.0.0.0', port=8000, debug=False)
