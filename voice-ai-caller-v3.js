/**
 * Voice AI Telegram Caller v3.0
 * С интерактивной настройкой, прокси и проверкой SpamBot
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Интерфейс для ввода
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Промисифицированный вопрос
function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

class VoiceAICallerV3 {
    constructor(config) {
        this.config = {
            userDataDir: './telegram-session',
            telegramUrl: 'https://web.telegram.org/k/',
            headless: false,
            
            // Будут заполнены интерактивно
            callTimeout: 20000,
            callDuration: 30000,
            delayBetweenCalls: 3000,
            phoneListFile: null,
            audioMessageFile: null,
            resultsFile: './call-results.json',
            
            // Прокси
            proxyServer: null,
            proxyUsername: null,
            proxyPassword: null,
            callsBeforeProxyRotation: 50,  // Менять прокси после N звонков
            
            // SpamBot проверка
            checkSpamBotAfter: true,
            
            // Voice AI
            voiceAIEndpoint: null,
            
            // Импорт сессии
            importSessionPath: null,
            
            ...config
        };
        
        this.browser = null;
        this.page = null;
        this.context = null;
        this.results = [];
        this.callsWithCurrentProxy = 0;
        this.currentProxyIndex = 0;
        this.proxyList = [];
    }

    /**
     * Интерактивная настройка перед запуском
     */
    async interactiveSetup() {
        console.log('\n' + '='.repeat(60));
        console.log('📞 TELEGRAM AUTO CALLER v3.0 - Интерактивная настройка');
        console.log('='.repeat(60) + '\n');

        // 1. Список номеров
        console.log('📋 ШАГ 1: Список номеров для обзвона');
        const phonesInput = await question('Введите путь к файлу с номерами (по умолчанию ./phones.txt): ');
        this.config.phoneListFile = phonesInput.trim() || './phones.txt';
        
        if (!fs.existsSync(this.config.phoneListFile)) {
            console.log(`⚠️  Файл не найден. Создаю ${this.config.phoneListFile}...`);
            fs.writeFileSync(this.config.phoneListFile, '+380501234567\n+380631234567\n');
            console.log('✅ Файл создан. Отредактируйте его и перезапустите.');
            process.exit(0);
        }
        
        const phoneCount = fs.readFileSync(this.config.phoneListFile, 'utf-8')
            .split('\n')
            .filter(line => line.trim().startsWith('+')).length;
        console.log(`✅ Загружено ${phoneCount} номеров\n`);

        // 2. Аудиосообщение
        console.log('🎵 ШАГ 2: Аудиосообщение');
        const audioInput = await question('Введите путь к аудиофайлу (по умолчанию ./audio-message.mp3): ');
        this.config.audioMessageFile = audioInput.trim() || './audio-message.mp3';
        
        if (!fs.existsSync(this.config.audioMessageFile)) {
            console.log(`❌ Аудиофайл не найден: ${this.config.audioMessageFile}`);
            console.log('Положите аудиофайл в проект и перезапустите.');
            process.exit(0);
        }
        console.log(`✅ Аудиофайл найден\n`);

        // 3. Таймаут ожидания ответа
        console.log('⏱️  ШАГ 3: Таймаут ожидания ответа');
        const timeoutInput = await question('Сколько секунд ждать ответа? (по умолчанию 20): ');
        const timeoutSeconds = parseInt(timeoutInput) || 20;
        this.config.callTimeout = timeoutSeconds * 1000;
        console.log(`✅ Таймаут установлен: ${timeoutSeconds} секунд\n`);

        // 4. Задержка между звонками
        console.log('⏳ ШАГ 4: Задержка между звонками');
        const delayInput = await question('Задержка между звонками в секундах? (по умолчанию 3): ');
        const delaySeconds = parseInt(delayInput) || 3;
        this.config.delayBetweenCalls = delaySeconds * 1000;
        console.log(`✅ Задержка установлена: ${delaySeconds} секунд\n`);

        // 5. Прокси
        console.log('🌐 ШАГ 5: Настройка прокси');
        const useProxy = await question('Использовать прокси? (y/n, по умолчанию n): ');
        
        if (useProxy.toLowerCase() === 'y') {
            console.log('\nВведите прокси в формате:');
            console.log('  • Один прокси: http://user:pass@host:port');
            console.log('  • Несколько (по одному на строке): создайте файл proxy.txt\n');
            
            const proxyFileOrString = await question('Введите прокси или путь к proxy.txt: ');
            
            if (fs.existsSync(proxyFileOrString)) {
                // Файл с прокси
                this.proxyList = fs.readFileSync(proxyFileOrString, 'utf-8')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                console.log(`✅ Загружено ${this.proxyList.length} прокси из файла`);
            } else {
                // Один прокси
                this.proxyList = [proxyFileOrString.trim()];
                console.log('✅ Прокси настроен');
            }
            
            // Ротация прокси
            const rotationInput = await question('Менять прокси после скольких звонков? (по умолчанию 50): ');
            this.config.callsBeforeProxyRotation = parseInt(rotationInput) || 50;
            console.log(`✅ Прокси будет меняться каждые ${this.config.callsBeforeProxyRotation} звонков\n`);
            
            // Парсим первый прокси
            this.parseProxy(this.proxyList[0]);
        } else {
            console.log('✅ Работа без прокси\n');
        }

        // 6. Сессия Telegram
        console.log('🔐 ШАГ 6: Авторизация Telegram');
        const importSession = await question('Импортировать сессию из файла? (y/n, по умолчанию n): ');
        
        if (importSession.toLowerCase() === 'y') {
            const sessionPath = await question('Путь к session.json или tdata папке: ');
            if (fs.existsSync(sessionPath)) {
                this.config.importSessionPath = sessionPath;
                console.log('✅ Сессия будет импортирована');
            } else {
                console.log('⚠️  Файл не найден, будет использована обычная авторизация');
            }
        } else {
            console.log('✅ Будет использована авторизация через QR-код/SMS');
        }
        console.log();

        // 7. SpamBot проверка
        console.log('🤖 ШАГ 7: Проверка через @SpamBot');
        const checkSpam = await question('Проверить аккаунт через @SpamBot после работы? (y/n, по умолчанию y): ');
        this.config.checkSpamBotAfter = checkSpam.toLowerCase() !== 'n';
        console.log(this.config.checkSpamBotAfter ? '✅ Проверка включена' : '⚠️  Проверка отключена');
        console.log();

        // 8. Voice AI endpoint
        console.log('🎙️  ШАГ 8: Voice AI для распознавания речи');
        const useVoiceAI = await question('Использовать Voice AI API? (y/n, по умолчанию n): ');
        
        if (useVoiceAI.toLowerCase() === 'y') {
            const endpoint = await question('Введите URL Voice AI API (например http://localhost:3000/api/transcribe): ');
            this.config.voiceAIEndpoint = endpoint.trim();
            console.log('✅ Voice AI настроен');
        } else {
            console.log('⚠️  Используется заглушка (случайные ответы для тестирования)');
        }
        console.log();

        // Итоговая сводка
        console.log('\n' + '='.repeat(60));
        console.log('📊 ИТОГОВАЯ КОНФИГУРАЦИЯ');
        console.log('='.repeat(60));
        console.log(`📋 Номеров: ${phoneCount}`);
        console.log(`🎵 Аудио: ${this.config.audioMessageFile}`);
        console.log(`⏱️  Таймаут ответа: ${this.config.callTimeout / 1000} сек`);
        console.log(`⏳ Задержка между звонками: ${this.config.delayBetweenCalls / 1000} сек`);
        console.log(`🌐 Прокси: ${this.proxyList.length > 0 ? `${this.proxyList.length} шт (ротация каждые ${this.config.callsBeforeProxyRotation} звонков)` : 'нет'}`);
        console.log(`🔐 Сессия: ${this.config.importSessionPath ? 'импорт' : 'авторизация'}`);
        console.log(`🤖 SpamBot проверка: ${this.config.checkSpamBotAfter ? 'да' : 'нет'}`);
        console.log(`🎙️  Voice AI: ${this.config.voiceAIEndpoint ? 'настроен' : 'заглушка'}`);
        console.log('='.repeat(60) + '\n');

        const confirm = await question('Всё верно? Начать обзвон? (y/n): ');
        if (confirm.toLowerCase() !== 'y') {
            console.log('❌ Запуск отменён');
            process.exit(0);
        }
        
        console.log('\n🚀 Запускаем обзвон...\n');
    }

    /**
     * Парсинг прокси строки
     */
    parseProxy(proxyString) {
        try {
            // Формат: http://user:pass@host:port или http://host:port
            const url = new URL(proxyString);
            
            this.config.proxyServer = `${url.protocol}//${url.host}`;
            this.config.proxyUsername = url.username || null;
            this.config.proxyPassword = url.password || null;
            
            console.log(`✅ Прокси распознан: ${url.host}`);
        } catch (error) {
            console.log(`⚠️  Ошибка парсинга прокси: ${error.message}`);
        }
    }

    /**
     * Ротация прокси
     */
    rotateProxy() {
        if (this.proxyList.length === 0) return;
        
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
        this.parseProxy(this.proxyList[this.currentProxyIndex]);
        this.callsWithCurrentProxy = 0;
        
        console.log(`\n🔄 РОТАЦИЯ ПРОКСИ → ${this.config.proxyServer}\n`);
    }

    /**
     * Проверка нужна ли ротация
     */
    checkProxyRotation() {
        if (this.proxyList.length === 0) return;
        
        this.callsWithCurrentProxy++;
        
        if (this.callsWithCurrentProxy >= this.config.callsBeforeProxyRotation) {
            this.rotateProxy();
            return true;
        }
        
        return false;
    }

    /**
     * Инициализация с прокси
     */
    async initialize() {
        console.log('🚀 Запуск браузера...');
        
        // Импорт сессии
        if (this.config.importSessionPath) {
            await this.importSession(this.config.importSessionPath);
        }
        
        if (!fs.existsSync(this.config.userDataDir)) {
            fs.mkdirSync(this.config.userDataDir, { recursive: true });
        }

        // Настройки контекста
        const contextOptions = {
            headless: this.config.headless,
            viewport: { width: 1280, height: 720 },
            permissions: ['microphone', 'camera'],
            args: [
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--autoplay-policy=no-user-gesture-required',
                '--disable-blink-features=AutomationControlled'
            ]
        };

        // Добавляем прокси если настроен
        if (this.config.proxyServer) {
            contextOptions.proxy = {
                server: this.config.proxyServer,
                username: this.config.proxyUsername,
                password: this.config.proxyPassword
            };
            console.log(`🌐 Используется прокси: ${this.config.proxyServer}`);
        }

        this.context = await chromium.launchPersistentContext(
            this.config.userDataDir,
            contextOptions
        );

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
            await this.page.waitForTimeout(60000);
            
            const isLoggedInNow = await this.checkLogin();
            if (!isLoggedInNow) {
                throw new Error('Не удалось авторизоваться в Telegram');
            }
        }
        
        console.log('✅ Готов к работе!\n');
    }

    /**
     * Импорт сессии
     */
    async importSession(sessionPath) {
        console.log(`📥 Импорт сессии из: ${sessionPath}`);
        
        try {
            if (!fs.existsSync(sessionPath)) {
                console.log('⚠️  Путь к сессии не найден');
                return;
            }
            
            const stats = fs.statSync(sessionPath);
            
            if (stats.isDirectory()) {
                console.log('📂 Обнаружена tdata папка, копируем...');
                this.copyDirectory(sessionPath, path.join(this.config.userDataDir, 'tdata'));
            } else if (sessionPath.endsWith('.json')) {
                console.log('📄 Обнаружен session.json, импортируем...');
                const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
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
     * Настройка перехвата медиа
     */
    async setupMediaInterception() {
        await this.page.addInitScript(() => {
            window.audioChunks = [];
            
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
        const content = fs.readFileSync(this.config.phoneListFile, 'utf-8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('+'));
    }

    /**
     * Обработка звонка (аналогично v2)
     */
    async makeCall(phoneNumber) {
        console.log(`\n📞 Звоню на ${phoneNumber}...`);
        
        try {
            const searchInput = await this.page.$('input[placeholder*="Search"], input[placeholder*="Поиск"]');
            if (!searchInput) {
                return { status: 'error', phoneNumber, error: 'Search not found', timestamp: new Date().toISOString() };
            }
            
            await searchInput.click();
            await this.page.keyboard.press('Control+A');
            await searchInput.type(phoneNumber, { delay: 100 });
            await this.page.waitForTimeout(2000);
            
            const firstResult = await this.page.$('.chatlist-chat:first-child');
            if (!firstResult) {
                console.log(`❌ Контакт не найден`);
                return { status: 'contact_not_found', phoneNumber, answered: false, timestamp: new Date().toISOString() };
            }
            
            await firstResult.click();
            await this.page.waitForTimeout(1000);
            
            const callButton = await this.page.$('button[title*="Call"], .tgico-phone');
            if (!callButton) {
                console.log(`❌ Кнопка звонка не найдена`);
                return { status: 'no_call_button', phoneNumber, answered: false, timestamp: new Date().toISOString() };
            }
            
            await callButton.click();
            console.log('📞 Звонок инициирован...');
            
            const callResult = await this.waitForCallAnswerWithStatus();
            
            if (callResult.status === 'answered') {
                console.log('✅ Звонок принят!');
                
                await this.page.waitForTimeout(1000);
                await this.playAudioMessage();
                
                console.log('👂 Слушаю ответ...');
                await this.page.waitForTimeout(10000);
                
                const recognition = await this.extractAndRecognizeAudio();
                console.log(`💬 Ответ: "${recognition.text}" → ${recognition.category}`);
                
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
                console.log('📵 Абонент не в сети');
                await this.endCall();
                return { status: 'unreachable', phoneNumber, answered: false, call_status: 'subscriber_unavailable', timestamp: new Date().toISOString() };
                
            } else if (callResult.status === 'no_answer') {
                console.log('❌ Не ответил (таймаут)');
                await this.endCall();
                return { status: 'no_answer', phoneNumber, answered: false, call_status: 'timeout', timestamp: new Date().toISOString() };
                
            } else if (callResult.status === 'busy') {
                console.log('📞 Занято');
                await this.endCall();
                return { status: 'busy', phoneNumber, answered: false, call_status: 'line_busy', timestamp: new Date().toISOString() };
                
            } else if (callResult.status === 'declined') {
                console.log('❌ Сбросил');
                return { status: 'declined', phoneNumber, answered: false, call_status: 'call_declined', timestamp: new Date().toISOString() };
            }
            
        } catch (error) {
            console.error('❌ Ошибка:', error.message);
            await this.endCall();
            return { status: 'error', phoneNumber, error: error.message, timestamp: new Date().toISOString() };
        }
    }

    /**
     * Ожидание ответа с определением статуса
     */
    async waitForCallAnswerWithStatus() {
        const timeout = this.config.callTimeout;
        const startTime = Date.now();
        
        console.log(`⏳ Ожидание ответа (${timeout / 1000} сек)...`);
        
        while (Date.now() - startTime < timeout) {
            const callTimer = await this.page.$('.call-duration, .call-timer');
            if (callTimer) {
                return { status: 'answered', duration: Date.now() - startTime };
            }
            
            const pageText = await this.page.evaluate(() => document.body.innerText).catch(() => '');
            
            if (pageText.includes('unavailable') || pageText.includes('недоступен') || pageText.includes('offline')) {
                return { status: 'unreachable' };
            }
            
            if (pageText.includes('busy') || pageText.includes('занят')) {
                return { status: 'busy' };
            }
            
            if (pageText.includes('declined') || pageText.includes('отклонил')) {
                return { status: 'declined' };
            }
            
            await this.page.waitForTimeout(500);
        }
        
        console.log('⏱️  Таймаут - автосброс');
        return { status: 'no_answer' };
    }

    /**
     * Проигрывание аудио
     */
    async playAudioMessage() {
        console.log('🎵 Проигрывание аудио...');
        
        if (!fs.existsSync(this.config.audioMessageFile)) {
            console.log('⚠️  Аудио не найдено');
            return false;
        }
        
        try {
            const audioBase64 = fs.readFileSync(this.config.audioMessageFile).toString('base64');
            const ext = this.config.audioMessageFile.split('.').pop();
            const mimeTypes = { 'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg' };
            const mime = mimeTypes[ext] || 'audio/mpeg';
            
            await this.page.evaluate(({ audioData, mime }) => {
                return new Promise((resolve) => {
                    const audio = new Audio(`data:${mime};base64,${audioData}`);
                    audio.onended = () => resolve(true);
                    audio.onerror = () => resolve(false);
                    audio.play().catch(() => resolve(false));
                });
            }, { audioData: audioBase64, mime });
            
            console.log('✅ Аудио проиграно');
            return true;
        } catch (error) {
            console.error('❌ Ошибка аудио:', error.message);
            return false;
        }
    }

    /**
     * Извлечение и распознавание аудио
     */
    async extractAndRecognizeAudio() {
        console.log('🎤 Извлечение аудио...');
        
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
            const tempFile = './temp-call-audio.webm';
            fs.writeFileSync(tempFile, audioBuffer);
            
            return await this.recognizeSpeech(tempFile);
            
        } catch (error) {
            console.error('❌ Ошибка извлечения:', error.message);
            return { text: '', category: 'unclear' };
        }
    }

    /**
     * Распознавание речи через Voice AI
     */
    async recognizeSpeech(audioFile) {
        console.log('🗣️  Распознавание речи...');
        
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
                console.error('❌ Ошибка Voice AI:', error.message);
            }
        }
        
        // Заглушка
        console.log('⚠️  Заглушка (Voice AI не настроен)');
        const mockResponses = ['да', 'нет', 'не интересно', 'давайте', 'угу', ''];
        const mockText = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        
        return {
            text: mockText,
            category: this.categorizeResponse(mockText),
            isMock: true
        };
    }

    /**
     * Категоризация
     */
    categorizeResponse(text) {
        const lower = text.toLowerCase().trim();
        
        const positive = ['да', 'угу', 'ага', 'давайте', 'хорошо', 'интересно'];
        if (positive.some(k => lower.includes(k))) return 'yes';
        
        const negative = ['нет', 'не интересно', 'не надо', 'отстаньте'];
        if (negative.some(k => lower.includes(k))) return 'no';
        
        return 'unclear';
    }

    /**
     * Завершение звонка
     */
    async endCall() {
        try {
            console.log('📴 Завершение...');
            const endButton = await this.page.$('button.btn-icon.danger, button[title*="End"]');
            if (endButton) {
                await endButton.click();
            } else {
                await this.page.keyboard.press('Escape');
            }
            await this.page.waitForTimeout(1000);
            console.log('✅ Завершено');
        } catch (error) {
            console.log('⚠️  Ошибка завершения');
        }
    }

    /**
     * Проверка через SpamBot
     */
    async checkSpamBot() {
        console.log('\n🤖 Проверка аккаунта через @SpamBot...');
        
        try {
            // Поиск SpamBot
            const searchInput = await this.page.$('input[placeholder*="Search"]');
            await searchInput.click();
            await this.page.keyboard.press('Control+A');
            await searchInput.type('@SpamBot', { delay: 100 });
            await this.page.waitForTimeout(2000);
            
            const firstResult = await this.page.$('.chatlist-chat:first-child');
            if (firstResult) {
                await firstResult.click();
                await this.page.waitForTimeout(1000);
                
                // Нажимаем Start
                const startButton = await this.page.$('button:has-text("START"), button:has-text("Start")');
                if (startButton) {
                    await startButton.click();
                    await this.page.waitForTimeout(3000);
                }
                
                // Читаем ответ
                const messages = await this.page.$$('.message');
                if (messages.length > 0) {
                    const lastMessage = messages[messages.length - 1];
                    const text = await lastMessage.innerText();
                    
                    if (text.includes('Good news') || text.includes('not limited')) {
                        console.log('✅ Аккаунт чистый - ограничений нет');
                        return { status: 'clean', message: text };
                    } else {
                        console.log('⚠️  Возможны ограничения');
                        return { status: 'limited', message: text };
                    }
                }
            }
            
            console.log('⚠️  Не удалось получить ответ от SpamBot');
            return { status: 'unknown' };
            
        } catch (error) {
            console.error('❌ Ошибка проверки SpamBot:', error.message);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Основной цикл обзвона
     */
    async startCalling() {
        await this.initialize();
        
        const phoneList = this.loadPhoneList();
        console.log(`📋 Загружено ${phoneList.length} номеров\n`);
        
        for (let i = 0; i < phoneList.length; i++) {
            console.log(`\n[${i + 1}/${phoneList.length}] ━━━━━━━━━━━━━━━━━━━━`);
            
            // Проверка ротации прокси
            this.checkProxyRotation();
            
            const result = await this.makeCall(phoneList[i]);
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
        
        // Проверка SpamBot
        if (this.config.checkSpamBotAfter) {
            const spamCheck = await this.checkSpamBot();
            console.log('\n📝 Результат проверки SpamBot:', spamCheck.status);
        }
    }

    /**
     * Сохранение результатов
     */
    saveResults() {
        fs.writeFileSync(this.config.resultsFile, JSON.stringify(this.results, null, 2));
    }

    /**
     * Экспорт CSV
     */
    exportToCSV() {
        const csvFile = this.config.resultsFile.replace('.json', '.csv');
        const headers = 'Номер,Статус,Ответил,Детали,Ответ,Категория,Время\n';
        const rows = this.results.map(r => {
            const details = r.call_status || r.status;
            return `${r.phoneNumber},${r.status},${r.answered ? 'Да' : 'Нет'},${details},"${r.response || ''}",${r.response_category || ''},${r.timestamp}`;
        }).join('\n');
        
        fs.writeFileSync(csvFile, headers + rows);
        console.log(`📊 CSV: ${csvFile}`);
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
        console.log(`Всего: ${total}`);
        console.log(`✅ Ответили: ${answered}`);
        console.log(`👍 Заинтересованы: ${yes}`);
        console.log(`👎 Отказались: ${no}`);
        console.log('='.repeat(50));
    }

    async close() {
        if (this.context) {
            await this.context.close();
        }
        rl.close();
    }
}

// Запуск
async function main() {
    const caller = new VoiceAICallerV3();
    
    try {
        await caller.interactiveSetup();
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

module.exports = VoiceAICallerV3;
