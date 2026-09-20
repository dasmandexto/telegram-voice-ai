# 🔐 Импорт сессий Telegram (session+json / tdata)

Инструкция по использованию готовых сессий Telegram для аккаунтов без 2FA.

---

## 🎯 Когда это нужно

Если у вас есть Telegram аккаунты, в которые:
- ❌ Невозможен вход через QR-код
- ❌ Нет 2FA (двухфакторной аутентификации)
- ✅ Есть только session файлы или tdata папка

**Решение:** Импортируйте готовую сессию вместо авторизации!

---

## 📦 Типы сессий

### 1. session.json (Session String)

**Что это:**
- JSON файл с данными сессии
- Обычно получается из Telegram клиентов
- Содержит auth_key, user_id и другие данные

**Формат файла:**
```json
{
  "auth_key": "...",
  "user_id": 12345678,
  "dc_id": 2,
  ...
}
```

---

### 2. tdata (Telegram Desktop Data)

**Что это:**
- Папка с данными Telegram Desktop
- Полная сессия с кешем и настройками
- Копируется из Telegram Desktop

**Структура:**
```
tdata/
├── D877F783D5D3EF8C/
├── key_datas
├── settings
└── ...другие файлы
```

---

## 🚀 Как использовать

### Вариант 1: session.json

**Шаг 1: Подготовка**
```bash
# Положите session.json в корень проекта
/telegram-auto-caller/
├── session.json          # Ваш файл сессии
├── voice-ai-integration-v2.js
└── ...
```

**Шаг 2: Настройка**

Отредактируйте скрипт запуска или создайте свой:

```javascript
const { VoiceAITelegramCallerV2 } = require('./voice-ai-integration-v2');

const caller = new VoiceAITelegramCallerV2({
    importSessionPath: './session.json',  // Путь к session.json
    audioMessageFile: './audio-message.mp3',
    phoneListFile: './phones.txt'
});

caller.startCalling();
```

**Шаг 3: Запуск**
```bash
node your-script.js
```

---

### Вариант 2: tdata папка

**Шаг 1: Подготовка**
```bash
# Скопируйте папку tdata в проект
/telegram-auto-caller/
├── session-tdata/        # Папка с tdata
│   ├── D877F783D5D3EF8C/
│   ├── key_datas
│   └── settings
├── voice-ai-integration-v2.js
└── ...
```

**Шаг 2: Настройка**

```javascript
const caller = new VoiceAITelegramCallerV2({
    importSessionPath: './session-tdata',  // Путь к tdata папке
    audioMessageFile: './audio-message.mp3',
    phoneListFile: './phones.txt'
});

caller.startCalling();
```

**Шаг 3: Запуск**
```bash
node your-script.js
```

---

## 📂 Где найти tdata в Telegram Desktop

### Windows:
```
C:\Users\YOUR_USERNAME\AppData\Roaming\Telegram Desktop\tdata\
```

### macOS:
```
~/Library/Application Support/Telegram Desktop/tdata/
```

### Linux:
```
~/.local/share/TelegramDesktop/tdata/
```

**Действия:**
1. Закройте Telegram Desktop
2. Скопируйте папку `tdata`
3. Вставьте в проект как `session-tdata`

---

## 🔧 Автоматический импорт при запуске

Скрипт автоматически:
1. Проверяет наличие `importSessionPath`
2. Определяет тип (JSON или tdata)
3. Копирует в `telegram-session/`
4. Использует для авторизации

**Логи при импорте:**
```bash
🚀 Запуск браузера с поддержкой аудио...
📥 Импорт сессии из: ./session.json
📄 Обнаружен session.json, импортируем...
✅ Сессия импортирована
🌐 Открытие Web Telegram...
✅ Готов к работе!
```

---

## ⚠️ Безопасность

### Важные правила:

1. **НЕ КОММИТЬТЕ сессии в Git!**
   ```bash
   # .gitignore уже настроен:
   telegram-session/
   session.json
   session-tdata/
   *.session
   ```

2. **Храните сессии безопасно**
   - Не делитесь ими
   - Шифруйте при передаче
   - Удаляйте после использования

3. **Используйте отдельные аккаунты**
   - Не используйте личный Telegram
   - Создайте аккаунт специально для обзвона

---

## 🔄 Множественные аккаунты

### Структура для нескольких аккаунтов:

```
/telegram-auto-caller/
├── account-1/
│   ├── session.json
│   └── phones-1.txt
├── account-2/
│   ├── session.json
│   └── phones-2.txt
├── account-3/
│   ├── session.json
│   └── phones-3.txt
└── ...
```

### Скрипт для обзвона всеми аккаунтами:

```javascript
const { VoiceAITelegramCallerV2 } = require('./voice-ai-integration-v2');

const accounts = [
    {
        name: 'Account 1',
        importSessionPath: './account-1/session.json',
        phoneListFile: './account-1/phones-1.txt',
        userDataDir: './telegram-session-1'
    },
    {
        name: 'Account 2',
        importSessionPath: './account-2/session.json',
        phoneListFile: './account-2/phones-2.txt',
        userDataDir: './telegram-session-2'
    },
    {
        name: 'Account 3',
        importSessionPath: './account-3/session.json',
        phoneListFile: './account-3/phones-3.txt',
        userDataDir: './telegram-session-3'
    }
];

async function callWithMultipleAccounts() {
    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🚀 Запуск ${account.name}`);
        console.log('='.repeat(50) + '\n');
        
        const caller = new VoiceAITelegramCallerV2({
            ...account,
            audioMessageFile: './audio-message.mp3'
        });
        
        try {
            await caller.startCalling();
        } catch (error) {
            console.error(`❌ Ошибка в ${account.name}:`, error);
        } finally {
            await caller.close();
        }
        
        // Задержка между аккаунтами
        if (i < accounts.length - 1) {
            console.log(`\n⏳ Задержка 10 секунд перед следующим аккаунтом...\n`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    
    console.log('\n✅ Обзвон всеми аккаунтами завершен!');
}

callWithMultipleAccounts();
```

**Сохраните как:** `multi-account-caller.js`

**Запуск:**
```bash
node multi-account-caller.js
```

---

## 🧪 Проверка сессии

### Тестовый скрипт для проверки сессии:

```javascript
const { chromium } = require('playwright');

async function testSession(sessionPath) {
    console.log('🧪 Проверка сессии:', sessionPath);
    
    const context = await chromium.launchPersistentContext('./test-session', {
        headless: false
    });
    
    const page = context.pages()[0] || await context.newPage();
    
    // Импорт сессии (упрощенная версия)
    // ... код импорта ...
    
    await page.goto('https://web.telegram.org/k/');
    await page.waitForTimeout(5000);
    
    // Проверяем авторизацию
    const searchInput = await page.$('input[placeholder*="Search"]');
    
    if (searchInput) {
        console.log('✅ Сессия рабочая! Авторизация успешна.');
    } else {
        console.log('❌ Сессия не работает. Требуется авторизация.');
    }
    
    await context.close();
}

testSession('./session.json');
```

**Сохраните как:** `test-session.js`

**Запуск:**
```bash
node test-session.js
```

---

## 📋 Чек-лист импорта

- [ ] Получил session.json или tdata
- [ ] Положил в проект
- [ ] Настроил `importSessionPath` в скрипте
- [ ] Проверил .gitignore (сессии не должны коммититься)
- [ ] Запустил тестовый скрипт
- [ ] Авторизация прошла успешно
- [ ] Готов к обзвону

---

## 🔧 Устранение проблем

### Проблема: "Сессия не работает"

**Решение:**
1. Проверьте формат файла (JSON валидный?)
2. Убедитесь что сессия не устарела
3. Попробуйте экспортировать заново из Telegram Desktop

### Проблема: "tdata не импортируется"

**Решение:**
1. Убедитесь что скопировали всю папку
2. Проверьте права доступа к файлам
3. Закройте Telegram Desktop перед копированием

### Проблема: "Требуется 2FA код"

**Решение:**
- Этот метод работает только для аккаунтов БЕЗ 2FA
- Если включен 2FA - используйте обычную авторизацию с QR-кодом

---

## 🎓 Рекомендации

### Для массового обзвона:

1. **Используйте несколько аккаунтов**
   - Распределите нагрузку
   - 50-100 звонков на аккаунт в день

2. **Храните сессии безопасно**
   - Зашифрованное хранилище
   - Регулярное обновление

3. **Мониторинг аккаунтов**
   - Проверяйте не заблокированы ли
   - Ротируйте при необходимости

4. **Автоматизация**
   - Скрипт для множественных аккаунтов
   - Планировщик задач (cron)

---

## 📞 Пример конфигурации для production

```javascript
const config = {
    // Сессия
    importSessionPath: process.env.TELEGRAM_SESSION_PATH || './session.json',
    userDataDir: './telegram-session',
    
    // Обзвон
    audioMessageFile: './audio-message.mp3',
    phoneListFile: './phones.txt',
    resultsFile: './call-results.json',
    
    // Таймауты
    callTimeout: 20000,
    callDuration: 30000,
    delayBetweenCalls: 3000,
    
    // Режим
    headless: true,  // В production - без GUI
    
    // Voice AI
    voiceAIEndpoint: process.env.VOICE_AI_ENDPOINT || null
};

const caller = new VoiceAITelegramCallerV2(config);
caller.startCalling();
```

---

**Готово! Теперь вы можете использовать готовые сессии для автоматизации.**

🔐 Не забывайте о безопасности!
