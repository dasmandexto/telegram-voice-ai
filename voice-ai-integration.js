/**
 * Voice AI Integration для Telegram Auto Caller
 * Интеграция голосового AI с автоматизацией Telegram через Playwright
 */

const { chromium } = require('playwright');
const fs = require('fs');

class VoiceAITelegramCaller {
    constructor(config) {
        this.config = {
            userDataDir: './telegram-session',
            callTimeout: 20000,
            callDuration: 30000,
            delayBetweenCalls: 3000,
            phoneListFile: './phones.txt',
            resultsFile: './call-results.json',
            telegramUrl: 'https://web.telegram.org/k/',
            headless: false,
            
            // Voice AI настройки
            audioMessageFile: './audio-message.mp3', // Ваше аудиосообщение
            enableSTT: true, // Speech-to-Text (распознавание речи)
            enableTTS: false, // Text-to-Speech (не нужен, проигрываем готовое аудио)
            
            // API для Voice AI (если используется)
            voiceAIEndpoint: null, // 'http://localhost:3000/api/voice' или URL вашего AI
            
            ...config
        };
        
        this.browser = null;
        this.page = null;
        this.context = null;
        this.results = [];
        this.audioContext = null;
        this.mediaRecorder = null;
    }

    /**
     * Инициализация с поддержкой аудио
     */
    async initialize() {
        console.log('🚀 Запуск браузера с поддержкой аудио...');
        
        if (!fs.existsSync(this.config.userDataDir)) {
            fs.mkdirSync(this.config.userDataDir, { recursive: true });
        }

        this.context = await chromium.launchPersistentContext(this.config.userDataDir, {
            headless: this.config.headless,
            viewport: { width: 1280, height: 720 },
            permissions: ['microphone', 'camera'],
            args: [
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--autoplay-policy=no-user-gesture-required', // Автовоспроизведение аудио
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.page = this.context.pages()[0] || await this.context.newPage();
        
        // Перехват событий медиа для анализа
        await this.setupMediaInterception();
        
        console.log('🌐 Открытие Web Telegram...');
        await this.page.goto(this.config.telegramUrl, { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(3000);
        
        const isLoggedIn = await this.checkLogin();
        if (!isLoggedIn) {
            console.log('⚠️  Необходима авторизация в Telegram!');
            console.log('📱 Войдите в Telegram (60 секунд)...');
            await this.page.waitForTimeout(60000);
        }
        
        console.log('✅ Готов к работе!');
    }

    /**
     * Настройка перехвата медиа-потоков
     */
    async setupMediaInterception() {
        // Внедряем скрипт для перехвата аудио
        await this.page.addInitScript(() => {
            window.audioChunks = [];
            window.callStartTime = null;
            window.callEndTime = null;
            
            // Перехватываем RTCPeerConnection для анализа аудио
            const originalRTCPeerConnection = window.RTCPeerConnection;
            window.RTCPeerConnection = function(...args) {
                const pc = new originalRTCPeerConnection(...args);
                
                pc.addEventListener('track', (event) => {
                    console.log('[Voice] Получен медиа-трек:', event.track.kind);
                    
                    if (event.track.kind === 'audio') {
                        const stream = new MediaStream([event.track]);
                        
                        // Создаем MediaRecorder для записи входящего аудио
                        if (typeof MediaRecorder !== 'undefined') {
                            window.callMediaRecorder = new MediaRecorder(stream);
                            
                            window.callMediaRecorder.ondataavailable = (e) => {
                                if (e.data.size > 0) {
                                    window.audioChunks.push(e.data);
                                }
                            };
                            
                            window.callMediaRecorder.start(100); // Запись каждые 100мс
                            console.log('[Voice] Запись аудио начата');
                        }
                    }
                });
                
                return pc;
            };
        });
    }

    /**
     * Проверка авторизации
     */
    async checkLogin() {
        try {
            const searchInput = await this.page.$('input[placeholder*="Search"], input[placeholder*="Поиск"]');
            return searchInput !== null;
        } catch {
            return false;
        }
    }

    /**
     * Загрузка номеров
     */
    loadPhoneList() {
        if (!fs.existsSync(this.config.phoneListFile)) {
            console.log('📝 Создаю пример файла с номерами...');
            fs.writeFileSync(this.config.phoneListFile, '+380501234567\n+380631234567');
        }
        
        const content = fs.readFileSync(this.config.phoneListFile, 'utf-8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('+'));
    }

    /**
     * Проигрывание аудиосообщения через виртуальное устройство
     */
    async playAudioMessage() {
        console.log('🎵 Проигрывание аудиосообщения...');
        
        if (!fs.existsSync(this.config.audioMessageFile)) {
            console.log('⚠️  Аудиофайл не найден:', this.config.audioMessageFile);
            return false;
        }
        
        try {
            // Внедряем аудио в страницу и проигрываем
            const audioBase64 = fs.readFileSync(this.config.audioMessageFile).toString('base64');
            const mimeType = this.getAudioMimeType(this.config.audioMessageFile);
            
            await this.page.evaluate(({ audioData, mime }) => {
                return new Promise((resolve) => {
                    const audio = new Audio(`data:${mime};base64,${audioData}`);
                    
                    audio.onended = () => {
                        console.log('[Voice] Аудиосообщение проиграно');
                        resolve(true);
                    };
                    
                    audio.onerror = (e) => {
                        console.error('[Voice] Ошибка воспроизведения:', e);
                        resolve(false);
                    };
                    
                    audio.play().catch(e => {
                        console.error('[Voice] Не удалось воспроизвести:', e);
                        resolve(false);
                    });
                });
            }, { audioData: audioBase64, mime: mimeType });
            
            console.log('✅ Аудиосообщение проиграно');
            return true;
            
        } catch (error) {
            console.error('❌ Ошибка при проигрывании аудио:', error.message);
            return false;
        }
    }

    /**
     * Определение MIME-типа аудио
     */
    getAudioMimeType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const mimeTypes = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'm4a': 'audio/mp4',
            'webm': 'audio/webm'
        };
        return mimeTypes[ext] || 'audio/mpeg';
    }

    /**
     * Извлечение записанного аудио и распознавание речи
     */
    async extractAndRecognizeAudio() {
        console.log('🎤 Извлечение записанного аудио...');
        
        try {
            // Получаем записанные аудио-чанки из браузера
            const audioData = await this.page.evaluate(() => {
                return new Promise((resolve) => {
                    if (!window.callMediaRecorder) {
                        resolve(null);
                        return;
                    }
                    
                    window.callMediaRecorder.stop();
                    
                    window.callMediaRecorder.onstop = () => {
                        if (window.audioChunks.length === 0) {
                            resolve(null);
                            return;
                        }
                        
                        const blob = new Blob(window.audioChunks, { type: 'audio/webm' });
                        const reader = new FileReader();
                        
                        reader.onloadend = () => {
                            resolve(reader.result.split(',')[1]); // Base64
                        };
                        
                        reader.readAsDataURL(blob);
                        
                        // Очистка для следующего звонка
                        window.audioChunks = [];
                    };
                });
            });
            
            if (!audioData) {
                console.log('⚠️  Аудио не записано (возможно, собеседник не говорил)');
                return { text: '', category: 'unclear' };
            }
            
            // Сохраняем аудио во временный файл
            const audioBuffer = Buffer.from(audioData, 'base64');
            const tempAudioFile = './temp-call-audio.webm';
            fs.writeFileSync(tempAudioFile, audioBuffer);
            
            console.log(`💾 Аудио сохранено: ${tempAudioFile}`);
            
            // Распознавание речи
            const recognition = await this.recognizeSpeech(tempAudioFile);
            
            return recognition;
            
        } catch (error) {
            console.error('❌ Ошибка при извлечении аудио:', error.message);
            return { text: '', category: 'unclear' };
        }
    }

    /**
     * Распознавание речи (Speech-to-Text)
     */
    async recognizeSpeech(audioFile) {
        console.log('🗣️  Распознавание речи...');
        
        // ВАРИАНТ 1: Локальное распознавание (Whisper, Vosk и т.д.)
        // Здесь должна быть интеграция с вашей STT системой
        
        // ВАРИАНТ 2: Через API
        if (this.config.voiceAIEndpoint) {
            try {
                const audioBuffer = fs.readFileSync(audioFile);
                
                // Отправляем на ваш Voice AI сервер
                const response = await fetch(this.config.voiceAIEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'audio/webm' },
                    body: audioBuffer
                });
                
                const result = await response.json();
                console.log('✅ Распознано:', result.text);
                
                return {
                    text: result.text,
                    category: this.categorizeResponse(result.text)
                };
                
            } catch (error) {
                console.error('❌ Ошибка API распознавания:', error.message);
            }
        }
        
        // ВАРИАНТ 3: Временная заглушка (для тестирования)
        console.log('⚠️  Voice AI не настроен, используется заглушка');
        console.log('💡 Настройте voiceAIEndpoint в конфигурации для реального распознавания');
        
        // Симуляция распознавания
        const mockResponses = ['да', 'нет', 'не интересно', 'давайте', 'угу', ''];
        const mockText = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        
        return {
            text: mockText,
            category: this.categorizeResponse(mockText),
            isMock: true
        };
    }

    /**
     * Категоризация ответа
     */
    categorizeResponse(text) {
        const lowerText = text.toLowerCase().trim();
        
        // Позитивные ответы (заинтересован)
        const positiveKeywords = ['да', 'угу', 'ага', 'давайте', 'хорошо', 'интересно', 'подходит', 'согласен'];
        if (positiveKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'yes';
        }
        
        // Негативные ответы (не заинтересован)
        const negativeKeywords = ['нет', 'не интересно', 'не надо', 'не подходит', 'отстаньте', 'не звоните'];
        if (negativeKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'no';
        }
        
        // Неясный ответ
        return 'unclear';
    }

    /**
     * Обработка одного звонка с Voice AI
     */
    async makeCallWithVoiceAI(phoneNumber) {
        console.log(`\n📞 Звоню на ${phoneNumber}...`);
        
        try {
            // 1. Поиск контакта
            const searchInput = await this.page.$('input[placeholder*="Search"], input[placeholder*="Поиск"]');
            if (!searchInput) {
                return { status: 'error', phoneNumber, error: 'Search not found' };
            }
            
            await searchInput.click();
            await this.page.keyboard.press('Control+A');
            await searchInput.type(phoneNumber, { delay: 100 });
            await this.page.waitForTimeout(2000);
            
            // 2. Открыть чат
            const firstResult = await this.page.$('.chatlist-chat:first-child');
            if (!firstResult) {
                return { status: 'not_found', phoneNumber };
            }
            
            await firstResult.click();
            await this.page.waitForTimeout(1000);
            
            // 3. Инициировать звонок
            const callButton = await this.page.$('button[title*="Call"], .tgico-phone');
            if (!callButton) {
                return { status: 'no_call_button', phoneNumber };
            }
            
            await callButton.click();
            console.log('📞 Звонок инициирован, ожидание ответа...');
            
            // 4. Ждать ответа (20 секунд)
            const callAnswered = await this.waitForAnswer();
            
            if (!callAnswered) {
                console.log('❌ Не ответили');
                await this.endCall();
                return {
                    status: 'no_answer',
                    phoneNumber,
                    answered: false,
                    timestamp: new Date().toISOString()
                };
            }
            
            console.log('✅ Звонок принят!');
            
            // 5. Проиграть аудиосообщение
            await this.page.waitForTimeout(1000); // Даем время на стабилизацию соединения
            await this.playAudioMessage();
            
            // 6. Ждать ответ собеседника (10 секунд молчания для прослушивания)
            console.log('👂 Слушаю ответ...');
            await this.page.waitForTimeout(10000);
            
            // 7. Распознать речь
            const recognition = await this.extractAndRecognizeAudio();
            
            console.log(`💬 Ответ: "${recognition.text}" → ${recognition.category}`);
            
            // 8. Завершить звонок
            await this.endCall();
            
            // 9. Вернуть результат
            return {
                status: 'answered',
                phoneNumber,
                answered: true,
                response: recognition.text,
                response_category: recognition.category,
                timestamp: new Date().toISOString(),
                isMock: recognition.isMock || false
            };
            
        } catch (error) {
            console.error('❌ Ошибка во время звонка:', error.message);
            await this.endCall();
            return {
                status: 'error',
                phoneNumber,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Ожидание ответа на звонок
     */
    async waitForAnswer() {
        const timeout = this.config.callTimeout;
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const callTimer = await this.page.$('.call-duration, .call-timer');
            if (callTimer) {
                return true; // Звонок принят
            }
            
            const callEnded = await this.page.$('.call-ended');
            if (callEnded) {
                return false; // Звонок сброшен
            }
            
            await this.page.waitForTimeout(500);
        }
        
        return false; // Таймаут
    }

    /**
     * Завершение звонка
     */
    async endCall() {
        try {
            const endButton = await this.page.$('button.btn-icon.danger, button[title*="End"]');
            if (endButton) {
                await endButton.click();
            } else {
                await this.page.keyboard.press('Escape');
            }
            await this.page.waitForTimeout(1000);
        } catch (error) {
            console.log('⚠️  Ошибка завершения звонка');
        }
    }

    /**
     * Основной процесс обзвона
     */
    async startCalling() {
        await this.initialize();
        
        const phoneList = this.loadPhoneList();
        console.log(`📋 Загружено ${phoneList.length} номеров\n`);
        
        if (phoneList.length === 0) {
            console.log('⚠️  Список пуст!');
            return;
        }
        
        for (let i = 0; i < phoneList.length; i++) {
            console.log(`\n[${ i + 1}/${phoneList.length}] ━━━━━━━━━━━━━━━━━━━━`);
            
            const result = await this.makeCallWithVoiceAI(phoneList[i]);
            this.results.push(result);
            
            // Сохранение после каждого звонка
            this.saveResults();
            
            // Задержка перед следующим
            if (i < phoneList.length - 1) {
                console.log(`⏳ Задержка ${this.config.delayBetweenCalls / 1000} сек...`);
                await this.page.waitForTimeout(this.config.delayBetweenCalls);
            }
        }
        
        console.log('\n✅ Обзвон завершен!\n');
        this.saveResults();
        this.exportToCSV();
        this.printStats();
    }

    /**
     * Сохранение результатов
     */
    saveResults() {
        fs.writeFileSync(this.config.resultsFile, JSON.stringify(this.results, null, 2));
    }

    /**
     * Экспорт в CSV
     */
    exportToCSV() {
        const csvFile = this.config.resultsFile.replace('.json', '.csv');
        const headers = 'Номер,Статус,Ответил,Ответ,Категория,Время\n';
        const rows = this.results.map(r => 
            `${r.phoneNumber},${r.status},${r.answered ? 'Да' : 'Нет'},"${r.response || ''}",${r.response_category || ''},${r.timestamp}`
        ).join('\n');
        
        fs.writeFileSync(csvFile, headers + rows);
        console.log(`📊 CSV сохранен: ${csvFile}`);
    }

    /**
     * Статистика
     */
    printStats() {
        const total = this.results.length;
        const answered = this.results.filter(r => r.answered).length;
        const yes = this.results.filter(r => r.response_category === 'yes').length;
        const no = this.results.filter(r => r.response_category === 'no').length;
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 СТАТИСТИКА');
        console.log('='.repeat(50));
        console.log(`Всего звонков: ${total}`);
        console.log(`✅ Ответили: ${answered}`);
        console.log(`👍 Заинтересованы: ${yes}`);
        console.log(`👎 Отказались: ${no}`);
        console.log('='.repeat(50));
    }

    async close() {
        if (this.context) {
            await this.context.close();
        }
    }
}

// Запуск
async function main() {
    const caller = new VoiceAITelegramCaller({
        audioMessageFile: './audio-message.mp3',
        voiceAIEndpoint: null // Укажите URL вашего Voice AI API
    });
    
    try {
        await caller.startCalling();
    } catch (error) {
        console.error('💥 Ошибка:', error);
    } finally {
        await caller.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = VoiceAITelegramCaller;
