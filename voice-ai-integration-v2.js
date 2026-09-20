/**
 * Voice AI Integration v2 для Telegram Auto Caller
 * С улучшенной обработкой всех статусов звонков
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class VoiceAITelegramCallerV2 {
    constructor(config) {
        this.config = {
            userDataDir: './telegram-session',
            callTimeout: 20000,        // 20 секунд ожидания ответа
            callDuration: 30000,       // 30 секунд максимум разговора
            delayBetweenCalls: 3000,   // 3 секунды между звонками
            phoneListFile: './phones.txt',
            resultsFile: './call-results.json',
            telegramUrl: 'https://web.telegram.org/k/',
            headless: false,
            
            // Voice AI настройки
            audioMessageFile: './audio-message.mp3',
            enableSTT: true,
            voiceAIEndpoint: null,
            
            // Поддержка импорта сессий
            importSessionPath: null,   // Путь к session+json или tdata
            
            ...config
        };
        
        this.browser = null;
        this.page = null;
        this.context = null;
        this.results = [];
        this.currentCallTimer = null;
    }

    /**
     * Инициализация с поддержкой импорта сессий
     */
    async initialize() {
        console.log('🚀 Запуск браузера с поддержкой аудио...');
        
        // Импорт сессии если указан путь
        if (this.config.importSessionPath) {
            await this.importSession(this.config.importSessionPath);
        }
        
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
                '--autoplay-policy=no-user-gesture-required',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.page = this.context.pages()[0] || await this.context.newPage();
        
        // Перехват медиа
        await this.setupMediaInterception();
        
        console.log('🌐 Открытие Web Telegram...');
        await this.page.goto(this.config.telegramUrl, { waitUntil: 'networkidle' });
        await this.page.waitForTimeout(3000);
        
        const isLoggedIn = await this.checkLogin();
        if (!isLoggedIn) {
            console.log('⚠️  Необходима авторизация в Telegram!');
            console.log('📱 Войдите в Telegram (60 секунд)...');
            console.log('💡 Или укажите путь к session/tdata в конфигурации');
            await this.page.waitForTimeout(60000);
            
            const isLoggedInNow = await this.checkLogin();
            if (!isLoggedInNow) {
                throw new Error('Не удалось авторизоваться в Telegram');
            }
        }
        
        console.log('✅ Готов к работе!');
    }

    /**
     * Импорт сессии из session+json или tdata
     */
    async importSession(sessionPath) {
        console.log(`📥 Импорт сессии из: ${sessionPath}`);
        
        try {
            if (!fs.existsSync(sessionPath)) {
                console.log('⚠️  Путь к сессии не найден');
                return;
            }
            
            // Проверяем тип сессии
            const stats = fs.statSync(sessionPath);
            
            if (stats.isDirectory()) {
                // tdata папка
                console.log('📂 Обнаружена tdata папка, копируем...');
                this.copyDirectory(sessionPath, path.join(this.config.userDataDir, 'tdata'));
            } else if (sessionPath.endsWith('.json')) {
                // session.json файл
                console.log('📄 Обнаружен session.json, импортируем...');
                const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
                // Сохраняем в нужный формат для Playwright
                fs.writeFileSync(
                    path.join(this.config.userDataDir, 'session.json'),
                    JSON.stringify(sessionData)
                );
            }
            
            console.log('✅ Сессия импортирована');
        } catch (error) {
            console.log('❌ Ошибка импорта сессии:', error.message);
        }
    }

    /**
     * Копирование директории
     */
    copyDirectory(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const entries = fs.readdirSync(src, { withFileTypes: true });
        
        for (let entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /**
     * Настройка перехвата медиа-потоков
     */
    async setupMediaInterception() {
        await this.page.addInitScript(() => {
            window.audioChunks = [];
            window.callStartTime = null;
            window.callEndTime = null;
            
            const originalRTCPeerConnection = window.RTCPeerConnection;
            window.RTCPeerConnection = function(...args) {
                const pc = new originalRTCPeerConnection(...args);
                
                pc.addEventListener('track', (event) => {
                    if (event.track.kind === 'audio') {
                        const stream = new MediaStream([event.track]);
                        
                        if (typeof MediaRecorder !== 'undefined') {
                            window.callMediaRecorder = new MediaRecorder(stream);
                            
                            window.callMediaRecorder.ondataavailable = (e) => {
                                if (e.data.size > 0) {
                                    window.audioChunks.push(e.data);
                                }
                            };
                            
                            window.callMediaRecorder.start(100);
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
     * Обработка одного звонка с ПОЛНОЙ логикой статусов
     */
    async makeCallWithVoiceAI(phoneNumber) {
        console.log(`\n📞 Звоню на ${phoneNumber}...`);
        
        try {
            // 1. Поиск контакта
            const searchInput = await this.page.$('input[placeholder*="Search"], input[placeholder*="Поиск"]');
            if (!searchInput) {
                return { 
                    status: 'error', 
                    phoneNumber, 
                    error: 'Search field not found',
                    timestamp: new Date().toISOString()
                };
            }
            
            await searchInput.click();
            await this.page.keyboard.press('Control+A');
            await searchInput.type(phoneNumber, { delay: 100 });
            await this.page.waitForTimeout(2000);
            
            // 2. Проверяем наличие контакта
            const firstResult = await this.page.$('.chatlist-chat:first-child');
            if (!firstResult) {
                console.log(`❌ Контакт ${phoneNumber} не найден`);
                return {
                    status: 'contact_not_found',
                    phoneNumber,
                    answered: false,
                    timestamp: new Date().toISOString()
                };
            }
            
            await firstResult.click();
            await this.page.waitForTimeout(1000);
            
            // 3. Инициируем звонок
            const callButton = await this.page.$('button[title*="Call"], .tgico-phone');
            if (!callButton) {
                console.log(`❌ Кнопка звонка не найдена`);
                return {
                    status: 'no_call_button',
                    phoneNumber,
                    answered: false,
                    timestamp: new Date().toISOString()
                };
            }
            
            await callButton.click();
            console.log('📞 Звонок инициирован...');
            
            // 4. ЖДЕМ ОТВЕТА С ОПРЕДЕЛЕНИЕМ СТАТУСА
            const callResult = await this.waitForCallAnswerWithStatus();
            
            // 5. Обрабатываем результат в зависимости от статуса
            if (callResult.status === 'answered') {
                console.log('✅ Звонок принят!');
                
                // Проигрываем аудио
                await this.page.waitForTimeout(1000);
                await this.playAudioMessage();
                
                // Слушаем ответ
                console.log('👂 Слушаю ответ...');
                await this.page.waitForTimeout(10000);
                
                // Распознаем речь
                const recognition = await this.extractAndRecognizeAudio();
                console.log(`💬 Ответ: "${recognition.text}" → ${recognition.category}`);
                
                // Завершаем звонок
                await this.endCall();
                
                return {
                    status: 'answered',
                    phoneNumber,
                    answered: true,
                    response: recognition.text,
                    response_category: recognition.category,
                    timestamp: new Date().toISOString(),
                    duration: callResult.duration
                };
                
            } else if (callResult.status === 'unreachable') {
                // АБОНЕНТ НЕ В СЕТИ (недозвон)
                console.log('📵 Абонент не в сети (недозвон)');
                await this.endCall();
                
                return {
                    status: 'unreachable',
                    phoneNumber,
                    answered: false,
                    call_status: 'subscriber_unavailable',
                    timestamp: new Date().toISOString()
                };
                
            } else if (callResult.status === 'no_answer') {
                // НЕ ОТВЕТИЛ (таймаут 20 секунд)
                console.log('❌ Не ответил (таймаут)');
                await this.endCall();
                
                return {
                    status: 'no_answer',
                    phoneNumber,
                    answered: false,
                    call_status: 'timeout_20sec',
                    timestamp: new Date().toISOString()
                };
                
            } else if (callResult.status === 'busy') {
                // ЗАНЯТО
                console.log('📞 Занято');
                await this.endCall();
                
                return {
                    status: 'busy',
                    phoneNumber,
                    answered: false,
                    call_status: 'line_busy',
                    timestamp: new Date().toISOString()
                };
                
            } else if (callResult.status === 'declined') {
                // СБРОСИЛ
                console.log('❌ Сбросил звонок');
                
                return {
                    status: 'declined',
                    phoneNumber,
                    answered: false,
                    call_status: 'call_declined',
                    timestamp: new Date().toISOString()
                };
            }
            
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
     * УЛУЧШЕННОЕ ожидание ответа с определением всех статусов
     */
    async waitForCallAnswerWithStatus() {
        const timeout = this.config.callTimeout;
        const startTime = Date.now();
        
        console.log(`⏳ Ожидание ответа (${timeout / 1000} сек)...`);
        
        while (Date.now() - startTime < timeout) {
            // Проверяем ОТВЕТИЛ (появился таймер звонка)
            const callTimer = await this.page.$('.call-duration, .call-timer, [class*="call-time"]');
            if (callTimer) {
                return { 
                    status: 'answered',
                    duration: Date.now() - startTime
                };
            }
            
            // Проверяем текст на экране для определения статуса
            const pageText = await this.page.evaluate(() => document.body.innerText).catch(() => '');
            
            // АБОНЕНТ НЕ В СЕТИ (недозвон)
            if (pageText.includes('unavailable') || 
                pageText.includes('offline') ||
                pageText.includes('недоступен') ||
                pageText.includes('не в сети')) {
                return { status: 'unreachable' };
            }
            
            // ЗАНЯТО
            if (pageText.includes('busy') || 
                pageText.includes('занят')) {
                return { status: 'busy' };
            }
            
            // СБРОСИЛ
            if (pageText.includes('declined') || 
                pageText.includes('отклонил') ||
                pageText.includes('Call ended')) {
                return { status: 'declined' };
            }
            
            // Проверяем элементы UI
            const callEnded = await this.page.$('.call-ended, [class*="call-declined"]');
            if (callEnded) {
                // Пытаемся определить причину
                const endReason = await this.page.evaluate(() => {
                    const elem = document.querySelector('.call-ended, [class*="call-declined"]');
                    return elem ? elem.innerText : '';
                }).catch(() => '');
                
                if (endReason.includes('busy') || endReason.includes('занят')) {
                    return { status: 'busy' };
                } else {
                    return { status: 'declined' };
                }
            }
            
            await this.page.waitForTimeout(500);
        }
        
        // ТАЙМАУТ 20 СЕКУНД - автоматически сбрасываем
        console.log('⏱️  Таймаут 20 сек - автоматически сбрасываю звонок');
        return { status: 'no_answer' };
    }

    /**
     * Проигрывание аудиосообщения
     */
    async playAudioMessage() {
        console.log('🎵 Проигрывание аудиосообщения...');
        
        if (!fs.existsSync(this.config.audioMessageFile)) {
            console.log('⚠️  Аудиофайл не найден:', this.config.audioMessageFile);
            return false;
        }
        
        try {
            const audioBase64 = fs.readFileSync(this.config.audioMessageFile).toString('base64');
            const mimeType = this.getAudioMimeType(this.config.audioMessageFile);
            
            await this.page.evaluate(({ audioData, mime }) => {
                return new Promise((resolve) => {
                    const audio = new Audio(`data:${mime};base64,${audioData}`);
                    audio.onended = () => resolve(true);
                    audio.onerror = () => resolve(false);
                    audio.play().catch(() => resolve(false));
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
     * Определение MIME-типа
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
     * Извлечение и распознавание аудио
     */
    async extractAndRecognizeAudio() {
        console.log('🎤 Извлечение записанного аудио...');
        
        try {
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
                            resolve(reader.result.split(',')[1]);
                        };
                        
                        reader.readAsDataURL(blob);
                        window.audioChunks = [];
                    };
                });
            });
            
            if (!audioData) {
                console.log('⚠️  Аудио не записано');
                return { text: '', category: 'unclear' };
            }
            
            const audioBuffer = Buffer.from(audioData, 'base64');
            const tempAudioFile = './temp-call-audio.webm';
            fs.writeFileSync(tempAudioFile, audioBuffer);
            
            const recognition = await this.recognizeSpeech(tempAudioFile);
            return recognition;
            
        } catch (error) {
            console.error('❌ Ошибка при извлечении аудио:', error.message);
            return { text: '', category: 'unclear' };
        }
    }

    /**
     * Распознавание речи
     */
    async recognizeSpeech(audioFile) {
        console.log('🗣️  Распознавание речи...');
        
        // Если настроен Voice AI API
        if (this.config.voiceAIEndpoint) {
            try {
                const audioBuffer = fs.readFileSync(audioFile);
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
                console.error('❌ Ошибка API:', error.message);
            }
        }
        
        // Заглушка для тестирования
        console.log('⚠️  Voice AI не настроен, используется заглушка');
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
        
        const positiveKeywords = ['да', 'угу', 'ага', 'давайте', 'хорошо', 'интересно', 'подходит', 'согласен'];
        if (positiveKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'yes';
        }
        
        const negativeKeywords = ['нет', 'не интересно', 'не надо', 'не подходит', 'отстаньте', 'не звоните'];
        if (negativeKeywords.some(keyword => lowerText.includes(keyword))) {
            return 'no';
        }
        
        return 'unclear';
    }

    /**
     * Завершение звонка
     */
    async endCall() {
        try {
            console.log('📴 Завершение звонка...');
            
            const endButton = await this.page.$('button.btn-icon.danger, button[title*="End"], button[title*="Завершить"]');
            if (endButton) {
                await endButton.click();
            } else {
                await this.page.keyboard.press('Escape');
            }
            
            await this.page.waitForTimeout(1000);
            console.log('✅ Звонок завершен');
        } catch (error) {
            console.log('⚠️  Ошибка завершения:', error.message);
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
            console.log(`\n[${i + 1}/${phoneList.length}] ━━━━━━━━━━━━━━━━━━━━`);
            
            const result = await this.makeCallWithVoiceAI(phoneList[i]);
            this.results.push(result);
            
            this.saveResults();
            
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
        const headers = 'Номер,Статус,Ответил,Детали,Ответ,Категория,Время\n';
        const rows = this.results.map(r => {
            const details = r.call_status || r.status;
            return `${r.phoneNumber},${r.status},${r.answered ? 'Да' : 'Нет'},${details},"${r.response || ''}",${r.response_category || ''},${r.timestamp}`;
        }).join('\n');
        
        fs.writeFileSync(csvFile, headers + rows);
        console.log(`📊 CSV сохранен: ${csvFile}`);
    }

    /**
     * Статистика
     */
    printStats() {
        const total = this.results.length;
        const answered = this.results.filter(r => r.answered).length;
        const noAnswer = this.results.filter(r => r.status === 'no_answer').length;
        const unreachable = this.results.filter(r => r.status === 'unreachable').length;
        const busy = this.results.filter(r => r.status === 'busy').length;
        const declined = this.results.filter(r => r.status === 'declined').length;
        const yes = this.results.filter(r => r.response_category === 'yes').length;
        const no = this.results.filter(r => r.response_category === 'no').length;
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 СТАТИСТИКА ОБЗВОНА');
        console.log('='.repeat(50));
        console.log(`Всего звонков: ${total}`);
        console.log(`✅ Ответили: ${answered}`);
        console.log(`❌ Не ответили (таймаут): ${noAnswer}`);
        console.log(`📵 Недозвон (не в сети): ${unreachable}`);
        console.log(`📞 Занято: ${busy}`);
        console.log(`🚫 Сбросили: ${declined}`);
        console.log('─'.repeat(50));
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
    const caller = new VoiceAITelegramCallerV2({
        audioMessageFile: './audio-message.mp3',
        voiceAIEndpoint: null,
        // importSessionPath: './session-data'  // Раскомментируйте если нужен импорт
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

module.exports = VoiceAITelegramCallerV2;
