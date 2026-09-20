/**
 * Telegram Auto Caller - Автоматизация обзвона через Web Telegram
 * Использует Playwright для управления браузером и голосовыми звонками
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Конфигурация
const CONFIG = {
    // Путь к данным пользователя Telegram (где хранится сессия)
    userDataDir: './telegram-session',
    
    // Время ожидания ответа (миллисекунды)
    callTimeout: 20000, // 20 секунд гудков
    
    // Время на разговор после ответа
    callDuration: 30000, // 30 секунд максимум
    
    // Задержка между звонками
    delayBetweenCalls: 3000, // 3 секунды
    
    // Файл с номерами телефонов
    phoneListFile: './phones.txt',
    
    // Файл для сохранения результатов
    resultsFile: './call-results.json',
    
    // URL Web Telegram
    telegramUrl: 'https://web.telegram.org/k/',
    
    // Включить headless режим (true = без GUI)
    headless: false,
    
    // Включить запись звука (для интеграции с Voice AI)
    enableAudioCapture: true
};

class TelegramCaller {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
        this.context = null;
        this.results = [];
        this.currentCallIndex = 0;
    }

    /**
     * Инициализация браузера и открытие Telegram
     */
    async initialize() {
        console.log('🚀 Запуск браузера...');
        
        // Создаем директорию для сессии если её нет
        if (!fs.existsSync(this.config.userDataDir)) {
            fs.mkdirSync(this.config.userDataDir, { recursive: true });
        }

        // Запускаем браузер с сохранением сессии
        this.context = await chromium.launchPersistentContext(this.config.userDataDir, {
            headless: this.config.headless,
            viewport: { width: 1280, height: 720 },
            permissions: ['microphone', 'camera'], // Разрешения для звонков
            args: [
                '--use-fake-ui-for-media-stream', // Автоматически разрешать доступ к медиа
                '--use-fake-device-for-media-stream',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.page = this.context.pages()[0] || await this.context.newPage();
        
        console.log('🌐 Открытие Web Telegram...');
        await this.page.goto(this.config.telegramUrl, { waitUntil: 'networkidle' });
        
        // Ждем полной загрузки
        await this.page.waitForTimeout(3000);
        
        // Проверяем, авторизован ли пользователь
        const isLoggedIn = await this.checkLogin();
        
        if (!isLoggedIn) {
            console.log('⚠️  Необходима авторизация в Telegram!');
            console.log('📱 Отсканируйте QR-код или войдите по номеру телефона...');
            console.log('⏳ Ожидание авторизации (60 секунд)...');
            
            // Даем время на авторизацию
            await this.page.waitForTimeout(60000);
            
            const isLoggedInNow = await this.checkLogin();
            if (!isLoggedInNow) {
                throw new Error('Не удалось авторизоваться в Telegram');
            }
        }
        
        console.log('✅ Авторизация успешна!');
    }

    /**
     * Проверка авторизации
     */
    async checkLogin() {
        try {
            // Проверяем наличие элементов авторизованного пользователя
            const searchInput = await this.page.$('input[placeholder*="Search"], input[placeholder*="Поиск"]');
            return searchInput !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Загрузка списка телефонов из файла
     */
    loadPhoneList() {
        console.log(`📋 Загрузка номеров из ${this.config.phoneListFile}...`);
        
        if (!fs.existsSync(this.config.phoneListFile)) {
            console.log('⚠️  Файл с номерами не найден, создаю пример...');
            fs.writeFileSync(this.config.phoneListFile, '+380501234567\n+380631234567\n+380931234567');
        }
        
        const content = fs.readFileSync(this.config.phoneListFile, 'utf-8');
        const phones = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('+'));
        
        console.log(`✅ Загружено ${phones.length} номеров`);
        return phones;
    }

    /**
     * Поиск контакта по номеру телефона
     */
    async searchContact(phoneNumber) {
        console.log(`🔍 Поиск контакта: ${phoneNumber}`);
        
        // Ищем поле поиска
        const searchInput = await this.page.$('input[placeholder*="Search"], input[placeholder*="Поиск"]');
        
        if (!searchInput) {
            throw new Error('Не найдено поле поиска');
        }
        
        // Очищаем предыдущий поиск
        await searchInput.click();
        await this.page.keyboard.press('Control+A');
        await this.page.keyboard.press('Backspace');
        
        // Вводим номер телефона
        await searchInput.type(phoneNumber, { delay: 100 });
        
        // Ждем результатов поиска
        await this.page.waitForTimeout(2000);
        
        // Проверяем, найден ли контакт
        const firstResult = await this.page.$('.chatlist-chat:first-child, .search-result:first-child');
        
        return firstResult !== null;
    }

    /**
     * Инициация звонка
     */
    async initiateCall(phoneNumber) {
        console.log(`📞 Звоню на ${phoneNumber}...`);
        
        // Ищем контакт
        const contactFound = await this.searchContact(phoneNumber);
        
        if (!contactFound) {
            console.log(`❌ Контакт ${phoneNumber} не найден`);
            return { status: 'not_found', phoneNumber };
        }
        
        // Открываем чат с контактом
        const firstResult = await this.page.$('.chatlist-chat:first-child, .search-result:first-child');
        await firstResult.click();
        await this.page.waitForTimeout(1000);
        
        // Ищем кнопку звонка (обычно в правом верхнем углу)
        const callButton = await this.page.$(
            'button[title*="Call"], button[title*="Позвонить"], ' +
            '.tgico-phone, .btn-icon.tgico-phone'
        );
        
        if (!callButton) {
            console.log(`❌ Кнопка звонка не найдена для ${phoneNumber}`);
            return { status: 'no_call_button', phoneNumber };
        }
        
        // Нажимаем кнопку звонка
        await callButton.click();
        
        console.log(`⏳ Ожидание ответа (${this.config.callTimeout / 1000} сек)...`);
        
        // Ждем ответа или таймаута
        const callResult = await this.waitForCallAnswer();
        
        return {
            status: callResult.answered ? 'answered' : 'no_answer',
            phoneNumber,
            timestamp: new Date().toISOString(),
            ...callResult
        };
    }

    /**
     * Ожидание ответа на звонок
     */
    async waitForCallAnswer() {
        const startTime = Date.now();
        let answered = false;
        let callEndedBy = 'unknown';
        
        // Проверяем признаки ответа на звонок
        const checkInterval = setInterval(async () => {
            try {
                // Проверяем элементы активного звонка
                const callActive = await this.page.$(
                    '.call-container, .call-panel, [class*="call-active"]'
                );
                
                // Проверяем таймер звонка (если идет разговор, появляется таймер)
                const callTimer = await this.page.$('.call-duration, .call-timer');
                
                if (callTimer) {
                    answered = true;
                    console.log('✅ Звонок принят!');
                    clearInterval(checkInterval);
                }
                
                // Проверяем, завершен ли звонок
                const callEnded = await this.page.$('.call-ended, [class*="call-declined"]');
                if (callEnded && !answered) {
                    console.log('❌ Звонок не принят или сброшен');
                    callEndedBy = 'declined';
                    clearInterval(checkInterval);
                }
                
            } catch (error) {
                // Игнорируем ошибки в процессе проверки
            }
        }, 500);
        
        // Ждем таймаут или ответ
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                clearInterval(checkInterval);
                
                if (!answered) {
                    console.log(`⏱️  Таймаут ${this.config.callTimeout / 1000} сек - завершаю звонок`);
                    this.endCall(); // Завершаем звонок
                }
                
                resolve({
                    answered,
                    callEndedBy: answered ? 'timeout_after_answer' : 'no_answer',
                    duration: Date.now() - startTime
                });
            }, answered ? this.config.callDuration : this.config.callTimeout);
            
            // Если ответили, ждем завершения разговора
            const answerCheck = setInterval(() => {
                if (answered) {
                    clearInterval(answerCheck);
                    setTimeout(() => {
                        clearTimeout(timeout);
                        this.endCall();
                        resolve({
                            answered: true,
                            callEndedBy: 'completed',
                            duration: Date.now() - startTime
                        });
                    }, this.config.callDuration);
                }
            }, 500);
        });
    }

    /**
     * Завершение звонка
     */
    async endCall() {
        try {
            console.log('📴 Завершение звонка...');
            
            // Ищем кнопку завершения звонка (обычно красная трубка)
            const endCallButton = await this.page.$(
                'button.btn-icon.danger, button[title*="End"], button[title*="Завершить"], ' +
                '.call-button-decline, .tgico-close, button.call-decline'
            );
            
            if (endCallButton) {
                await endCallButton.click();
                await this.page.waitForTimeout(1000);
            } else {
                // Пробуем нажать Escape
                await this.page.keyboard.press('Escape');
            }
            
            console.log('✅ Звонок завершен');
        } catch (error) {
            console.log('⚠️  Ошибка при завершении звонка:', error.message);
        }
    }

    /**
     * Сохранение результатов
     */
    saveResults() {
        console.log(`💾 Сохранение результатов в ${this.config.resultsFile}...`);
        fs.writeFileSync(
            this.config.resultsFile,
            JSON.stringify(this.results, null, 2),
            'utf-8'
        );
        console.log('✅ Результаты сохранены');
    }

    /**
     * Экспорт в CSV
     */
    exportToCSV() {
        const csvFile = this.config.resultsFile.replace('.json', '.csv');
        console.log(`📊 Экспорт в CSV: ${csvFile}...`);
        
        const headers = 'Номер телефона,Статус,Ответил,Длительность (сек),Время звонка\n';
        const rows = this.results.map(r => {
            const duration = r.duration ? Math.round(r.duration / 1000) : 0;
            return `${r.phoneNumber},${r.status},${r.answered ? 'Да' : 'Нет'},${duration},${r.timestamp}`;
        }).join('\n');
        
        fs.writeFileSync(csvFile, headers + rows, 'utf-8');
        console.log('✅ CSV экспортирован');
    }

    /**
     * Печать статистики
     */
    printStats() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 СТАТИСТИКА ОБЗВОНА');
        console.log('='.repeat(50));
        
        const total = this.results.length;
        const answered = this.results.filter(r => r.answered).length;
        const notAnswered = this.results.filter(r => !r.answered).length;
        const notFound = this.results.filter(r => r.status === 'not_found').length;
        
        console.log(`Всего звонков: ${total}`);
        console.log(`✅ Ответили: ${answered} (${(answered/total*100).toFixed(1)}%)`);
        console.log(`❌ Не ответили: ${notAnswered} (${(notAnswered/total*100).toFixed(1)}%)`);
        console.log(`🔍 Не найдены: ${notFound} (${(notFound/total*100).toFixed(1)}%)`);
        console.log('='.repeat(50) + '\n');
    }

    /**
     * Основной процесс обзвона
     */
    async startCalling() {
        try {
            // Инициализация
            await this.initialize();
            
            // Загрузка номеров
            const phoneList = this.loadPhoneList();
            
            if (phoneList.length === 0) {
                console.log('⚠️  Список номеров пуст!');
                return;
            }
            
            console.log('\n🎯 Начинаю обзвон...\n');
            
            // Обзвон каждого номера
            for (let i = 0; i < phoneList.length; i++) {
                this.currentCallIndex = i;
                const phoneNumber = phoneList[i];
                
                console.log(`\n[${i + 1}/${phoneList.length}] ━━━━━━━━━━━━━━━━━━━━━━━`);
                
                // Инициируем звонок
                const result = await this.initiateCall(phoneNumber);
                
                // Сохраняем результат
                this.results.push(result);
                
                // Промежуточное сохранение
                this.saveResults();
                
                // Задержка перед следующим звонком
                if (i < phoneList.length - 1) {
                    console.log(`⏳ Задержка ${this.config.delayBetweenCalls / 1000} сек перед следующим звонком...`);
                    await this.page.waitForTimeout(this.config.delayBetweenCalls);
                }
            }
            
            // Финальное сохранение и статистика
            console.log('\n✅ Обзвон завершен!\n');
            this.saveResults();
            this.exportToCSV();
            this.printStats();
            
        } catch (error) {
            console.error('❌ Ошибка:', error.message);
            throw error;
        }
    }

    /**
     * Закрытие браузера
     */
    async close() {
        if (this.context) {
            await this.context.close();
            console.log('👋 Браузер закрыт');
        }
    }
}

// Точка входа
async function main() {
    const caller = new TelegramCaller(CONFIG);
    
    try {
        await caller.startCalling();
    } catch (error) {
        console.error('💥 Критическая ошибка:', error);
    } finally {
        await caller.close();
    }
}

// Запуск только если это главный модуль
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { TelegramCaller, CONFIG };
