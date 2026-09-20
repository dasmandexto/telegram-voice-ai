import os
import io
import base64
import logging
import torch
import librosa
import soundfile as sf
import numpy as np
import whisper
from flask import Flask, request, jsonify
from transformers import Wav2Vec2Processor, Wav2Vec2ForSequenceClassification

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
OXXN_MODEL_PATH = "../models/oxxn-intonation"
WHISPER_MODEL_NAME = "base"

processor = None
emotion_model = None
whisper_model = None

EMOTION_LABELS = {0: 'negative', 1: 'neutral', 2: 'positive'}

def load_models():
    global processor, emotion_model, whisper_model
    try:
        logger.info(f"Loading Whisper model '{WHISPER_MODEL_NAME}' on {DEVICE}...")
        whisper_model = whisper.load_model(WHISPER_MODEL_NAME, device=DEVICE)
        
        logger.info(f"Loading OXXN Emotion model from {OXXN_MODEL_PATH} on {DEVICE}...")
        if not os.path.exists(OXXN_MODEL_PATH):
            logger.warning(f"OXXN model not found at {OXXN_MODEL_PATH}. Downloading from HuggingFace...")
            from huggingface_hub import snapshot_download
            snapshot_download(repo_id="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition", local_dir=OXXN_MODEL_PATH)

        processor = Wav2Vec2Processor.from_pretrained(OXXN_MODEL_PATH)
        emotion_model = Wav2Vec2ForSequenceClassification.from_pretrained(OXXN_MODEL_PATH)
        emotion_model = emotion_model.to(DEVICE)
        emotion_model.eval()
        logger.info("Models loaded successfully.")
    except Exception as e:
        logger.error(f"Error loading models: {e}")

@app.route('/analyze_call', methods=['POST'])
def analyze_call():
    try:
        data = request.json
        if not data or 'audio' not in data:
            return jsonify({'error': 'No audio provided'}), 400
        
        audio_data = data['audio']
        if ',' in audio_data:
            audio_data = audio_data.split(',')[1]
        
        audio_bytes = base64.b64decode(audio_data)
        
        # Load audio using librosa (forces 16000 Hz, mono)
        audio_array, sr = librosa.load(io.BytesIO(audio_bytes), sr=16000)
        
        if len(audio_array) < 1600:
            return jsonify({'transcription': '', 'intonation': 'neutral'})

        # 1. WHISPER TRANSCRIPTION
        # Whisper requires float32 array in range [-1, 1]
        transcription_result = whisper_model.transcribe(audio_array, fp16=(DEVICE=="cuda"))
        text = transcription_result["text"].strip()
        
        # 2. OXXN EMOTION ANALYSIS
        inputs = processor(audio_array, sampling_rate=sr, return_tensors="pt", padding=True)
        inputs = {k: v.to(DEVICE) for k, v in inputs.items()}
        
        with torch.no_grad():
            logits = emotion_model(**inputs).logits
            
        predicted_id = torch.argmax(logits, dim=-1).item()
        intonation = EMOTION_LABELS.get(predicted_id, 'neutral')
        
        return jsonify({
            'transcription': text,
            'intonation': intonation
        })
        
    except Exception as e:
        logger.error(f"Error processing audio: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    load_models()
    app.run(host='0.0.0.0', port=8000)
