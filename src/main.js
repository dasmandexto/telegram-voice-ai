const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    phonesFile: './phones.txt',
    audio1: './1.wav', // Приветствие
    audio2: './2.wav', // Прощание
    aiServer: 'http://localhost:8000/analyze_call',
    sessionsDir: './sessions',
    headless: false
};

async function run() {
    const phones = fs.readFileSync(CONFIG.phonesFile, 'utf8').split('\n').map(p => p.trim()).filter(Boolean);
    const audio1Base64 = fs.readFileSync(CONFIG.audio1).toString('base64');
    const audio2Base64 = fs.readFileSync(CONFIG.audio2).toString('base64');

    const browser = await chromium.launch({
        headless: CONFIG.headless,
        args: [
            '--use-fake-ui-for-media-stream',
            '--disable-web-security'
        ]
    });

    // Берем первую сессию для простоты (можно расширить для мультиакка)
    const sessionPaths = fs.readdirSync(CONFIG.sessionsDir).map(p => path.join(CONFIG.sessionsDir, p));
    if (sessionPaths.length === 0) throw new Error("Нет сессий в папке sessions/");
    
    const context = await browser.newContext({ userDataDir: sessionPaths[0] });
    const page = await context.newPage();

    // ИНЖЕКЦИЯ WebRTC HOOK
    await page.addInitScript(() => {
        // Подменяем микрофон на наш AudioContext
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            if (constraints && constraints.audio) {
                window.botAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                window.botAudioDest = window.botAudioContext.createMediaStreamDestination();
                return window.botAudioDest.stream;
            }
            return originalGetUserMedia(constraints);
        };

        // Функция для проигрывания base64 аудио в микрофон
        window.playBotAudio = async (base64) => {
            const arrayBuffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
            const audioBuffer = await window.botAudioContext.decodeAudioData(arrayBuffer);
            const source = window.botAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(window.botAudioDest);
            source.start(0);
            return new Promise(resolve => source.onended = resolve);
        };

        // Захват входящего аудио от собеседника
        window.recordedChunks = [];
        window.mediaRecorder = null;
        
        const originalPlay = window.HTMLAudioElement.prototype.play;
        window.HTMLAudioElement.prototype.play = function() {
            if (this.srcObject && this.srcObject.getAudioTracks().length > 0 && !window.mediaRecorder) {
                window.mediaRecorder = new MediaRecorder(this.srcObject, { mimeType: 'audio/webm' });
                window.mediaRecorder.ondataavailable = e => window.recordedChunks.push(e.data);
                window.mediaRecorder.start();
            }
            return originalPlay.apply(this, arguments);
        };

        window.stopAndGetRecording = async () => {
            if(!window.mediaRecorder) return null;
            return new Promise(resolve => {
                window.mediaRecorder.onstop = () => {
                    const blob = new Blob(window.recordedChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        window.recordedChunks = [];
                        resolve(reader.result);
                    };
                    reader.readAsDataURL(blob);
                };
                window.mediaRecorder.stop();
                window.mediaRecorder = null;
            });
        };
    });

    await page.goto('https://web.telegram.org/k/');
    await page.waitForLoadState('networkidle');

    for (const phone of phones) {
        console.log(\n📞 Звоним на: );
        
        // Поиск контакта и звонок
        await page.click('.input-search');
        await page.fill('.input-search input', phone);
        await page.waitForTimeout(2000);
        
        try {
            await page.click(.chatlist-chat[data-dialog-id*=""], { timeout: 5000 });
        } catch(e) {
            console.log(❌ Контакт не найден);
            continue;
        }

        await page.click('.btn-icon.rp[title="Call"]');
        await page.waitForTimeout(2000);

        // Ждем ответа (упрощенно)
        console.log("Ожидание ответа...");
        let answered = false;
        for(let i=0; i<20; i++) { // 20 сек таймаут
            const text = await page.textContent('body');
            if(text.includes('00:0')) { answered = true; break; }
            await page.waitForTimeout(1000);
        }

        if (answered) {
            console.log("✅ Ответили. Воспроизводим 1.wav...");
            // Проигрываем 1.wav
            await page.evaluate(async (base64) => await window.playBotAudio(base64), audio1Base64);
            
            console.log("Слушаем ответ...");
            // Ждем 5 секунд (или дольше) для записи ответа
            await page.waitForTimeout(5000);
            
            const base64Audio = await page.evaluate(async () => await window.stopAndGetRecording());
            
            console.log("Отправляем аудио на AI сервер...");
            const aiResponse = await fetch(CONFIG.aiServer, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64Audio })
            }).then(r => r.json()).catch(e => ({ error: e.message }));
            
            console.log("🧠 Результат ИИ:", aiResponse);
            
            console.log("Воспроизводим 2.wav...");
            // Проигрываем 2.wav (прощание)
            await page.evaluate(async (base64) => await window.playBotAudio(base64), audio2Base64);
        } else {
            console.log("❌ Не ответили.");
        }
        
        // Завершаем звонок
        try {
            await page.click('.call-container .btn-icon.rp[title="Decline"]'); // Примерная кнопка сброса
        } catch(e) {}
        await page.waitForTimeout(3000);
    }
    await browser.close();
}

run().catch(console.error);
