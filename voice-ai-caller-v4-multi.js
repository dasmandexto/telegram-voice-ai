/**
 * Voice AI Telegram Caller v4.0 - Multi-Account Edition
 * Параллельный автообзвон с множественными аккаунтами
 * Поддержка TXT/CSV файлов, Whisper GGUF, OXXN интонации
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

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

class MultiAccountCaller {
    constructor() {
        this.config = {
            // Директории
            sessionsDir: './sessions',           // Папка с session/tdata аккаунтами
            phoneListFile: null,                 // TXT или CSV файл
            audioMessageFile: null,
            resultsDir: './results',
            
            // Whisper GGUF и OXXN
            whisperGGUFPath: './models/whisper.gguf',
            oxxnModelPath: './models/oxxn-intonation',
            
            // Настройки звонков
            callTimeout: 20000,
            callDuration: 30000,
            delayBetweenCalls: 3000,
            
            // Прокси (один на аккаунт или пул)
            proxyListFile: null,
            callsBeforeProxyRotation: 50,
            
            // Параллелизм
            maxParallelAccounts: 3,              // Сколько аккаунтов работают одновременно
            
            // SpamBot
            checkSpamBotAfter: true,
            
            telegramUrl: 'https://web.telegram.org/k/',
            headless: false
        };
        
        this.accounts = [];                      // Список аккаунтов
        this.phoneNumbers = [];                  // Все номера для обзвона
        this.proxies = [];                       // Пул прокси
        this.results = [];                       // Результаты всех звонков
        this.activeWorkers = [];                 // Активные воркеры
    }

    /**
     * Интерактивная настройка
     */
    async interactiveSetup() {
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║   Voice AI Caller v4.0 - Multi-Account Setup         ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');

        // 1. Файл с номерами (TXT или CSV)
        const phoneFile = await question('📞 Путь к файлу с номерами (TXT или CSV): ');
        if (!fs.existsSync(phoneFile)) {
            throw new Error(`Файл не найден: ${phoneFile}`);
        }
        this.config.phoneListFile = phoneFile;
        await this.loadPhoneNumbers();
        console.log(`✅ Загружено ${this.phoneNumbers.length} номеров\n`);

        // 2. Аудиосообщение
        const audioFile = await question('🎵 Путь к аудиосообщению (MP3/OGG/WAV): ');
        if (!fs.existsSync(audioFile)) {
            throw new Error(`Файл не найден: ${audioFile}`);
        }
        this.config.audioMessageFile = audioFile;
        console.log('✅ Аудиосообщение загружено\n');

        // 3. Whisper GGUF модель
        const whisperPath = await question('🤖 Путь к Whisper GGUF модели (Enter = ./models/whisper.gguf): ');
        if (whisperPath.trim()) {
            this.config.whisperGGUFPath = whisperPath.trim();
        }
        if (!fs.existsSync(this.config.whisperGGUFPath)) {
            console.log(`⚠️  Whisper GGUF не найден: ${this.config.whisperGGUFPath}`);
            console.log('   Создайте папку ./models/ и поместите туда whisper.gguf\n');
        } else {
            console.log('✅ Whisper GGUF найден\n');
        }

        // 4. OXXN модель интонаций
        const oxxnPath = await question('🎭 Путь к OXXN модели интонаций (Enter = ./models/oxxn-intonation): ');
        if (oxxnPath.trim()) {
            this.config.oxxnModelPath = oxxnPath.trim();
        }
        if (!fs.existsSync(this.config.oxxnModelPath)) {
            console.log(`⚠️  OXXN модель не найдена: ${this.config.oxxnModelPath}`);
            console.log('   Создайте папку ./models/ и поместите туда модель OXXN\n');
        } else {
            console.log('✅ OXXN модель найдена\n');
        }

        // 5. Таймаут звонка
        const timeout = await question('⏱️  Таймаут ожидания ответа (сек, Enter = 20): ');
        if (timeout.trim()) {
            this.config.callTimeout = parseInt(timeout) * 1000;
        }

        // 6. Задержка между звонками
        const delay = await question('⏳ Задержка между звонками (сек, Enter = 3): ');
        if (delay.trim()) {
            this.config.delayBetweenCalls = parseInt(delay) * 1000;
        }

        // 7. Папка с сессиями
        const sessionsDir = await question('\n📁 Папка с session/tdata аккаунтами (Enter = ./sessions): ');
        if (sessionsDir.trim()) {
            this.config.sessionsDir = sessionsDir.trim();
        }
        await this.scanAccounts();
        console.log(`✅ Найдено ${this.accounts.length} аккаунтов\n`);

        if (this.accounts.length === 0) {
            throw new Error('Нет аккаунтов! Поместите папки session/tdata в ./sessions/');
        }

        // 8. Сколько аккаунтов работают параллельно
        const maxParallel = await question(`🔄 Сколько аккаунтов работают одновременно? (Enter = 3, макс ${this.accounts.length}): `);
        if (maxParallel.trim()) {
            const num = parseInt(maxParallel);
            this.config.maxParallelAccounts = Math.min(num, this.accounts.length);
        }

        // 9. Прокси (опционально)
        const useProxy = await question('\n🌐 Использовать прокси? (y/n, Enter = n): ');
        if (useProxy.toLowerCase() === 'y') {
            const proxyFile = await question('📄 Путь к файлу с прокси (формат: host:port:user:pass): ');
            if (fs.existsSync(proxyFile)) {
                this.config.proxyListFile = proxyFile;
                await this.loadProxies();
                console.log(`✅ Загружено ${this.proxies.length} прокси\n`);
            }
        }

        // 10. SpamBot проверка
        const checkSpam = await question('🛡️  Проверить SpamBot после работы? (y/n, Enter = y): ');
        this.config.checkSpamBotAfter = checkSpam.toLowerCase() !== 'n';

        console.log('\n✅ Настройка завершена!\n');
        
        // Показать сводку
        this.printSummary();
    }

    /**
     * Загрузка номеров из TXT или CSV
     */
    async loadPhoneNumbers() {
        const content = fs.readFileSync(this.config.phoneListFile, 'utf-8');
        const ext = path.extname(this.config.phoneListFile).toLowerCase();

        if (ext === '.txt') {
            // TXT: один номер на строку
            this.phoneNumbers = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(phone => this.normalizePhone(phone));
        } else if (ext === '.csv') {
            // CSV: номер в первой колонке
            this.phoneNumbers = content
                .split('\n')
                .slice(1) // Пропустить заголовок
                .map(line => line.split(',')[0].trim())
                .filter(phone => phone)
                .map(phone => this.normalizePhone(phone));
        } else {
            throw new Error('Поддерживаются только TXT и CSV файлы');
        }
    }

    /**
     * Нормализация номера телефона
     */
    normalizePhone(phone) {
        // Удалить все кроме цифр и +
        let normalized = phone.replace(/[^\d+]/g, '');
        
        // Добавить + если его нет
        if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
        }
        
        return normalized;
    }

    /**
     * Сканирование папки с аккаунтами
     */
    async scanAccounts() {
        if (!fs.existsSync(this.config.sessionsDir)) {
            fs.mkdirSync(this.config.sessionsDir, { recursive: true });
            return;
        }

        const entries = fs.readdirSync(this.config.sessionsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const accountPath = path.join(this.config.sessionsDir, entry.name);
            const sessionFile = path.join(accountPath, 'session.json');
            const tdataDir = path.join(accountPath, 'tdata');

            let accountType = null;
            if (fs.existsSync(sessionFile)) {
                accountType = 'session.json';
            } else if (fs.existsSync(tdataDir)) {
                accountType = 'tdata';
            }

            if (accountType) {
                this.accounts.push({
                    name: entry.name,
                    path: accountPath,
                    type: accountType,
                    status: 'idle',
                    callsCount: 0,
                    currentProxy: null
                });
            }
        }
    }

    /**
     * Загрузка прокси из файла
     */
    async loadProxies() {
        const content = fs.readFileSync(this.config.proxyListFile, 'utf-8');
        this.proxies = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => {
                const [host, port, username, password] = line.split(':');
                return { host, port, username, password };
            });
    }

    /**
     * Получить прокси для аккаунта
     */
    getProxyForAccount(accountIndex) {
        if (this.proxies.length === 0) return null;
        
        // Круговое распределение прокси
        const proxyIndex = accountIndex % this.proxies.length;
        return this.proxies[proxyIndex];
    }

    /**
     * Показать сводку перед запуском
     */
    printSummary() {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║              СВОДКА НАСТРОЕК                          ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`📞 Номеров для обзвона: ${this.phoneNumbers.length}`);
        console.log(`👥 Аккаунтов: ${this.accounts.length}`);
        console.log(`🔄 Параллельных потоков: ${this.config.maxParallelAccounts}`);
        console.log(`⏱️  Таймаут: ${this.config.callTimeout / 1000} сек`);
        console.log(`⏳ Задержка: ${this.config.delayBetweenCalls / 1000} сек`);
        console.log(`🌐 Прокси: ${this.proxies.length > 0 ? this.proxies.length + ' шт' : 'не используется'}`);
        console.log(`🤖 Whisper GGUF: ${fs.existsSync(this.config.whisperGGUFPath) ? '✅' : '❌'}`);
        console.log(`🎭 OXXN модель: ${fs.existsSync(this.config.oxxnModelPath) ? '✅' : '❌'}`);
        console.log('╚════════════════════════════════════════════════════════╝\n');
    }

    /**
     * Распределение номеров по аккаунтам
     */
    distributePhones() {
        const distribution = [];
        const phonesPerAccount = Math.ceil(this.phoneNumbers.length / this.accounts.length);

        for (let i = 0; i < this.accounts.length; i++) {
            const startIndex = i * phonesPerAccount;
            const endIndex = Math.min(startIndex + phonesPerAccount, this.phoneNumbers.length);
            distribution.push({
                account: this.accounts[i],
                phones: this.phoneNumbers.slice(startIndex, endIndex)
            });
        }

        return distribution;
    }

    /**
     * Запуск параллельного автообзвона
     */
    async startMultiAccountCalling() {
        const distribution = this.distributePhones();
        
        console.log('\n🚀 Запуск автообзвона...\n');

        // Разбиваем на батчи по maxParallelAccounts
        for (let i = 0; i < distribution.length; i += this.config.maxParallelAccounts) {
            const batch = distribution.slice(i, i + this.config.maxParallelAccounts);
            
            console.log(`\n📦 Батч ${Math.floor(i / this.config.maxParallelAccounts) + 1}: Запуск ${batch.length} аккаунтов...\n`);

            // Запуск воркеров параллельно
            const workers = batch.map((item, batchIndex) => 
                this.runAccountWorker(item.account, item.phones, i + batchIndex)
            );

            // Ждем завершения всех воркеров в батче
            await Promise.allSettled(workers);

            console.log(`\n✅ Батч ${Math.floor(i / this.config.maxParallelAccounts) + 1} завершен\n`);
        }

        // SpamBot проверка
        if (this.config.checkSpamBotAfter) {
            console.log('\n🛡️  Проверка SpamBot для всех аккаунтов...\n');
            await this.checkAllSpamBot();
        }

        // Сохранить результаты
        await this.saveResults();

        console.log('\n✅ ВСЕ АККАУНТЫ ЗАВЕРШИЛИ РАБОТУ!\n');
        this.printFinalStats();
    }

    /**
     * Воркер для одного аккаунта
     */
    async runAccountWorker(account, phones, accountIndex) {
        const workerName = `[${account.name}]`;
        console.log(`${workerName} 🟢 Старт | Номеров: ${phones.length}`);

        account.status = 'working';

        try {
            const caller = new SingleAccountCaller(
                account,
                phones,
                this.config,
                this.getProxyForAccount(accountIndex),
                workerName
            );

            const results = await caller.run();
            
            // Сохранить результаты этого аккаунта
            this.results.push(...results);
            account.status = 'completed';
            account.callsCount = results.length;

            console.log(`${workerName} ✅ Завершен | Обзвонено: ${results.length}`);

        } catch (error) {
            account.status = 'error';
            console.error(`${workerName} ❌ Ошибка: ${error.message}`);
        }
    }

    /**
     * Проверка SpamBot для всех аккаунтов
     */
    async checkAllSpamBot() {
        for (const account of this.accounts) {
            if (account.status !== 'completed') continue;

            try {
                const caller = new SingleAccountCaller(account, [], this.config, null, `[${account.name}]`);
                const status = await caller.checkSpamBot();
                account.spamBotStatus = status;
                console.log(`[${account.name}] SpamBot: ${status}`);
            } catch (error) {
                console.error(`[${account.name}] SpamBot check failed: ${error.message}`);
            }
        }
    }

    /**
     * Сохранение результатов
     */
    async saveResults() {
        if (!fs.existsSync(this.config.resultsDir)) {
            fs.mkdirSync(this.config.resultsDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultsFile = path.join(this.config.resultsDir, `results-${timestamp}.json`);

        const fullReport = {
            timestamp: new Date().toISOString(),
            config: this.config,
            accounts: this.accounts.map(acc => ({
                name: acc.name,
                type: acc.type,
                status: acc.status,
                callsCount: acc.callsCount,
                spamBotStatus: acc.spamBotStatus || 'not_checked'
            })),
            results: this.results,
            stats: {
                totalCalls: this.results.length,
                answered: this.results.filter(r => r.status === 'answered').length,
                noAnswer: this.results.filter(r => r.status === 'no_answer').length,
                unreachable: this.results.filter(r => r.status === 'unreachable').length,
                errors: this.results.filter(r => r.status === 'error').length
            }
        };

        fs.writeFileSync(resultsFile, JSON.stringify(fullReport, null, 2));
        console.log(`\n💾 Результаты сохранены: ${resultsFile}`);
    }

    /**
     * Финальная статистика
     */
    printFinalStats() {
        console.log('╔════════════════════════════════════════════════════════╗');
        console.log('║              ФИНАЛЬНАЯ СТАТИСТИКА                     ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        console.log(`📞 Всего звонков: ${this.results.length}`);
        console.log(`✅ Отвечено: ${this.results.filter(r => r.status === 'answered').length}`);
        console.log(`❌ Не отвечено: ${this.results.filter(r => r.status === 'no_answer').length}`);
        console.log(`📵 Недоступен: ${this.results.filter(r => r.status === 'unreachable').length}`);
        console.log(`⚠️  Ошибок: ${this.results.filter(r => r.status === 'error').length}`);
        console.log('\n👥 Аккаунты:');
        this.accounts.forEach(acc => {
            const statusIcon = acc.status === 'completed' ? '✅' : 
                              acc.status === 'error' ? '❌' : '⏸️';
            console.log(`   ${statusIcon} ${acc.name}: ${acc.callsCount} звонков | SpamBot: ${acc.spamBotStatus || 'N/A'}`);
        });
        console.log('╚════════════════════════════════════════════════════════╝\n');
    }

    /**
     * Главный запуск
     */
    async run() {
        try {
            await this.interactiveSetup();
            
            const confirm = await question('\n▶️  Начать автообзвон? (y/n): ');
            if (confirm.toLowerCase() !== 'y') {
                console.log('Отменено пользователем');
                rl.close();
                return;
            }

            rl.close();
            await this.startMultiAccountCalling();

        } catch (error) {
            console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
            console.error(error.stack);
            rl.close();
        }
    }
}

/**
 * Класс для работы одного аккаунта
 */
class SingleAccountCaller {
    constructor(account, phones, config, proxy, workerName) {
        this.account = account;
        this.phones = phones;
        this.config = config;
        this.proxy = proxy;
        this.workerName = workerName;
        this.browser = null;
        this.page = null;
        this.results = [];
    }

    /**
     * Запуск обзвона для этого аккаунта
     */
    async run() {
        await this.launchBrowser();
        await this.importSession();
        await this.openTelegram();

        for (let i = 0; i < this.phones.length; i++) {
            const phone = this.phones[i];
            console.log(`${this.workerName} [${i + 1}/${this.phones.length}] Звоним: ${phone}`);

            try {
                const result = await this.makeCall(phone);
                this.results.push(result);
                
                // Задержка между звонками
                if (i < this.phones.length - 1) {
                    await this.delay(this.config.delayBetweenCalls);
                }
            } catch (error) {
                console.error(`${this.workerName} Ошибка звонка ${phone}:`, error.message);
                this.results.push({
                    phone,
                    status: 'error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        await this.closeBrowser();
        return this.results;
    }

    /**
     * Запуск браузера с прокси
     */
    async launchBrowser() {
        const launchOptions = {
            headless: this.config.headless,
            args: ['--no-sandbox']
        };

        if (this.proxy) {
            launchOptions.proxy = {
                server: `${this.proxy.host}:${this.proxy.port}`,
                username: this.proxy.username,
                password: this.proxy.password
            };
            console.log(`${this.workerName} 🌐 Прокси: ${this.proxy.host}:${this.proxy.port}`);
        }

        this.browser = await chromium.launch(launchOptions);
    }

    /**
     * Импорт сессии
     */
    async importSession() {
        if (this.account.type === 'session.json') {
            const sessionFile = path.join(this.account.path, 'session.json');
            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
            
            const context = await this.browser.newContext({
                storageState: sessionData
            });
            this.page = await context.newPage();
        } else {
            // tdata
            const context = await this.browser.newContext({
                userDataDir: this.account.path
            });
            this.page = await context.newPage();
        }
    }

    /**
     * Открыть Telegram Web
     */
    async openTelegram() {
        await this.page.goto(this.config.telegramUrl);
        await this.page.waitForLoadState('networkidle');
        console.log(`${this.workerName} ✅ Telegram открыт`);
    }

    /**
     * Сделать звонок
     */
    async makeCall(phone) {
        // Поиск контакта
        await this.page.click('.input-search');
        await this.page.fill('.input-search input', phone);
        await this.delay(2000);

        // Открыть чат
        const chatSelector = `.chatlist-chat[data-dialog-id*="${phone}"]`;
        try {
            await this.page.click(chatSelector, { timeout: 5000 });
        } catch {
            return {
                phone,
                status: 'contact_not_found',
                timestamp: new Date().toISOString()
            };
        }

        // Кнопка звонка
        await this.page.click('.btn-icon.rp[title="Call"]');
        await this.delay(1000);

        // Ждем ответа или таймаута
        const callResult = await this.waitForCallAnswer();

        if (callResult.status === 'answered') {
            // Проиграть аудио
            await this.playAudio();
            
            // Распознать ответ через Whisper GGUF
            const audioData = await this.captureCallAudio();
            const transcription = await this.transcribeWithWhisper(audioData);
            
            // Анализ интонации через OXXN
            const intonation = await this.analyzeIntonation(audioData);
            
            callResult.transcription = transcription;
            callResult.intonation = intonation;
            callResult.response_category = this.categorizeResponse(transcription, intonation);
        }

        // Завершить звонок
        await this.hangUp();

        return {
            phone,
            ...callResult,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Ожидание ответа на звонок
     */
    async waitForCallAnswer() {
        const startTime = Date.now();
        
        while (Date.now() - startTime < this.config.callTimeout) {
            const pageText = await this.page.textContent('body');
            
            // Проверка статусов
            if (pageText.includes('00:0') || pageText.includes('is on the call')) {
                return { status: 'answered', duration: Date.now() - startTime };
            }
            if (pageText.includes('unavailable') || pageText.includes('недоступен')) {
                return { status: 'unreachable' };
            }
            if (pageText.includes('busy') || pageText.includes('занят')) {
                return { status: 'busy' };
            }
            if (pageText.includes('declined') || pageText.includes('отклонил')) {
                return { status: 'declined' };
            }
            
            await this.delay(500);
        }
        
        return { status: 'no_answer' };
    }

    /**
     * Проиграть аудиосообщение
     */
    async playAudio() {
        // Инжект аудио в страницу
        await this.page.evaluate((audioPath) => {
            const audio = new Audio(audioPath);
            audio.play();
        }, this.config.audioMessageFile);
        
        await this.delay(this.config.callDuration);
    }

    /**
     * Захват аудио из звонка
     */
    async captureCallAudio() {
        // Перехват WebRTC аудио потока
        const audioData = await this.page.evaluate(() => {
            return new Promise((resolve) => {
                const stream = window.RTCPeerConnection?.getLocalStreams?.()?.[0];
                if (!stream) {
                    resolve(null);
                    return;
                }

                const mediaRecorder = new MediaRecorder(stream);
                const chunks = [];

                mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                };

                mediaRecorder.start();
                setTimeout(() => mediaRecorder.stop(), 5000);
            });
        });

        return audioData;
    }

    /**
     * Распознавание через Whisper GGUF
     */
    async transcribeWithWhisper(audioData) {
        if (!fs.existsSync(this.config.whisperGGUFPath)) {
            console.log(`${this.workerName} ⚠️  Whisper GGUF не найден, пропускаем транскрипцию`);
            return null;
        }

        try {
            // Здесь должна быть интеграция с Whisper GGUF
            // Пример: запуск через whisper.cpp или llama.cpp
            const { spawn } = require('child_process');
            
            return new Promise((resolve, reject) => {
                const whisper = spawn('./whisper.cpp/main', [
                    '-m', this.config.whisperGGUFPath,
                    '-f', audioData, // Временный файл с аудио
                    '--language', 'auto'
                ]);

                let output = '';
                whisper.stdout.on('data', (data) => {
                    output += data.toString();
                });

                whisper.on('close', (code) => {
                    if (code === 0) {
                        resolve(output.trim());
                    } else {
                        reject(new Error('Whisper failed'));
                    }
                });
            });
        } catch (error) {
            console.error(`${this.workerName} Whisper error:`, error.message);
            return null;
        }
    }

    /**
     * Анализ интонации через OXXN
     */
    async analyzeIntonation(audioData) {
        if (!fs.existsSync(this.config.oxxnModelPath)) {
            console.log(`${this.workerName} ⚠️  OXXN модель не найдена, пропускаем анализ интонации`);
            return null;
        }

        try {
            // Интеграция с OXXN Realtime API
            // Пример: HTTP запрос к локальному серверу OXXN
            const response = await fetch('http://localhost:8000/analyze_intonation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio: audioData,
                    model_path: this.config.oxxnModelPath
                })
            });

            const result = await response.json();
            return result.intonation; // positive, negative, neutral

        } catch (error) {
            console.error(`${this.workerName} OXXN error:`, error.message);
            return null;
        }
    }

    /**
     * Категоризация ответа (yes/no/unclear)
     */
    categorizeResponse(transcription, intonation) {
        if (!transcription) return 'unclear';

        const text = transcription.toLowerCase();
        
        // Ключевые слова для "да"
        const yesWords = ['да', 'yes', 'согласен', 'хорошо', 'ок', 'конечно', 'agree'];
        const hasYes = yesWords.some(word => text.includes(word));
        
        // Ключевые слова для "нет"
        const noWords = ['нет', 'no', 'не', 'отказ', 'not interested', 'не интересует'];
        const hasNo = noWords.some(word => text.includes(word));

        // Учитываем интонацию
        if (hasYes && intonation === 'positive') return 'yes';
        if (hasNo || intonation === 'negative') return 'no';
        
        return 'unclear';
    }

    /**
     * Завершить звонок
     */
    async hangUp() {
        try {
            await this.page.click('.btn-icon[title="End call"]', { timeout: 2000 });
        } catch {
            // Звонок уже завершен
        }
        await this.delay(1000);
    }

    /**
     * Проверка SpamBot
     */
    async checkSpamBot() {
        await this.page.click('.input-search');
        await this.page.fill('.input-search input', '@SpamBot');
        await this.delay(2000);
        
        await this.page.click('.chatlist-chat:first-child');
        await this.delay(1000);
        
        // Отправить /start
        await this.page.fill('.input-message-input', '/start');
        await this.page.press('.input-message-input', 'Enter');
        await this.delay(3000);
        
        // Прочитать ответ
        const response = await this.page.textContent('.message:last-child');
        
        if (response.includes('Good news') || response.includes('не ограничен')) {
            return 'clean';
        } else if (response.includes('limited') || response.includes('ограничен')) {
            return 'limited';
        } else {
            return 'unknown';
        }
    }

    /**
     * Закрыть браузер
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    /**
     * Задержка
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Запуск
(async () => {
    const multiCaller = new MultiAccountCaller();
    await multiCaller.run();
})();
