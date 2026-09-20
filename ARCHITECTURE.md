# 🏗️ Архитектура Telegram Auto Caller

Техническое описание работы системы автоматического обзвона.

---

## 📐 Общая схема

```
┌─────────────────────────────────────────────────────────────┐
│                    Telegram Auto Caller                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         Playwright Automation           │
        │    (Chromium Browser Control)           │
        └─────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌─────────┐        ┌──────────┐       ┌──────────┐
    │ Session │        │   Web    │       │  Media   │
    │ Manager │        │ Telegram │       │ Streams  │
    └─────────┘        └──────────┘       └──────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌─────────┐        ┌──────────┐       ┌──────────┐
    │ Persist │        │  Search  │       │  Audio   │
    │ Context │        │   Chat   │       │ Capture  │
    └─────────┘        │   Call   │       └──────────┘
                       └──────────┘              │
                              │                  ▼
                              ▼           ┌──────────┐
                       ┌──────────┐       │  Voice   │
                       │  Phone   │       │    AI    │
                       │  List    │       │   STT    │
                       └──────────┘       └──────────┘
                              │                  │
                              ▼                  ▼
                       ┌──────────┐       ┌──────────┐
                       │ Results  │◄──────│ Response │
                       │   DB     │       │ Category │
                       └──────────┘       └──────────┘
```

---

## 🔄 Жизненный цикл звонка

### 1️⃣ **Инициализация**

```javascript
// Запуск браузера с персистентным контекстом
chromium.launchPersistentContext('./telegram-session', {
    permissions: ['microphone', 'camera'],
    args: ['--use-fake-ui-for-media-stream']
})
```

**Что происходит:**
- Создается изолированный браузерный контекст
- Загружается сохраненная сессия Telegram (если есть)
- Предоставляются разрешения на микрофон/камеру
- Настраивается автоматическое принятие медиа-запросов

---

### 2️⃣ **Авторизация** (только первый раз)

```javascript
await page.goto('https://web.telegram.org/k/')
await checkLogin() // Проверка элементов UI
```

**Варианты авторизации:**
- QR-код (сканирование через мобильное приложение)
- Номер телефона + SMS-код

**Сессия сохраняется** в `telegram-session/` - повторная авторизация не нужна.

---

### 3️⃣ **Поиск контакта**

```javascript
// Находим поле поиска
const searchInput = await page.$('input[placeholder*="Search"]')

// Вводим номер телефона
await searchInput.type('+380501234567')

// Ждем результатов
await page.waitForTimeout(2000)

// Кликаем на первый результат
const firstResult = await page.$('.chatlist-chat:first-child')
await firstResult.click()
```

**Селекторы:**
- `.chatlist-chat` - элемент чата в списке
- `input[placeholder*="Search"]` - поле поиска

---

### 4️⃣ **Инициация звонка**

```javascript
// Находим кнопку звонка
const callButton = await page.$(
    'button[title*="Call"], .tgico-phone'
)

// Нажимаем
await callButton.click()
```

**Что происходит:**
- Web Telegram инициирует WebRTC соединение
- Браузер запрашивает доступ к микрофону (автоматически разрешен)
- Начинается процесс установки соединения

---

### 5️⃣ **Ожидание ответа**

```javascript
async waitForAnswer() {
    const timeout = 20000 // 20 секунд
    
    while (Date.now() - startTime < timeout) {
        // Проверяем наличие таймера звонка
        const callTimer = await page.$('.call-duration')
        
        if (callTimer) {
            return true // Ответили!
        }
        
        // Проверяем, сброшен ли звонок
        const callEnded = await page.$('.call-ended')
        if (callEnded) {
            return false // Не ответили
        }
        
        await page.waitForTimeout(500)
    }
    
    return false // Таймаут
}
```

**Логика:**
- Каждые 500мс проверяем UI элементы
- `.call-duration` появляется только при активном звонке
- `.call-ended` появляется при сбросе/завершении
- Таймаут: 20 секунд (настраивается)

---

### 6️⃣ **Перехват аудиопотока**

```javascript
// Внедряем скрипт в страницу
await page.addInitScript(() => {
    // Перехватываем RTCPeerConnection
    const originalRTC = window.RTCPeerConnection
    
    window.RTCPeerConnection = function(...args) {
        const pc = new originalRTC(...args)
        
        // Слушаем медиа-треки
        pc.addEventListener('track', (event) => {
            if (event.track.kind === 'audio') {
                const stream = new MediaStream([event.track])
                
                // Записываем аудио
                window.callMediaRecorder = new MediaRecorder(stream)
                window.callMediaRecorder.start(100) // Каждые 100мс
            }
        })
        
        return pc
    }
})
```

**Что это дает:**
- Перехват входящего аудиопотока от собеседника
- Запись в реальном времени
- Возможность передачи на Voice AI для распознавания

---

### 7️⃣ **Проигрывание аудиосообщения**

```javascript
async playAudioMessage() {
    // Читаем файл и конвертируем в Base64
    const audioBase64 = fs.readFileSync('./audio-message.mp3')
        .toString('base64')
    
    // Внедряем в страницу и проигрываем
    await page.evaluate((audioData) => {
        const audio = new Audio(`data:audio/mpeg;base64,${audioData}`)
        return audio.play()
    }, audioBase64)
}
```

**Как это работает:**
- Аудиофайл читается с диска
- Конвертируется в Data URL (Base64)
- Создается `<audio>` элемент в контексте страницы
- Проигрывается через браузер
- Передается через WebRTC собеседнику

---

### 8️⃣ **Распознавание речи (Voice AI)**

```javascript
async recognizeSpeech(audioFile) {
    // ВАРИАНТ 1: Локальный STT (Whisper, Vosk)
    // const result = await localWhisper.transcribe(audioFile)
    
    // ВАРИАНТ 2: API сервис
    if (this.config.voiceAIEndpoint) {
        const audioBuffer = fs.readFileSync(audioFile)
        
        const response = await fetch(this.config.voiceAIEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'audio/webm' },
            body: audioBuffer
        })
        
        const result = await response.json()
        return result.text
    }
    
    // ВАРИАНТ 3: Заглушка для тестирования
    return mockResponse()
}
```

**Интеграция Voice AI:**
- Аудио отправляется на ваш API
- Получается транскрипция текста
- Категоризируется ответ (да/нет/неясно)

---

### 9️⃣ **Категоризация ответа**

```javascript
categorizeResponse(text) {
    const lower = text.toLowerCase()
    
    // Позитивные
    const positive = ['да', 'угу', 'ага', 'давайте', 'хорошо']
    if (positive.some(word => lower.includes(word))) {
        return 'yes'
    }
    
    // Негативные
    const negative = ['нет', 'не интересно', 'не надо']
    if (negative.some(word => lower.includes(word))) {
        return 'no'
    }
    
    // Неясно
    return 'unclear'
}
```

---

### 🔟 **Завершение звонка**

```javascript
async endCall() {
    // Ищем кнопку завершения
    const endButton = await page.$('button.btn-icon.danger')
    
    if (endButton) {
        await endButton.click()
    } else {
        // Альтернатива: нажать Escape
        await page.keyboard.press('Escape')
    }
}
```

---

### 1️⃣1️⃣ **Запись результата**

```javascript
const result = {
    phoneNumber: '+380501234567',
    status: 'answered',
    answered: true,
    response: 'да, интересно',
    response_category: 'yes',
    timestamp: new Date().toISOString()
}

// Сохранение в JSON
fs.writeFileSync('call-results.json', JSON.stringify(results, null, 2))

// Экспорт в CSV
const csv = results.map(r => 
    `${r.phoneNumber},${r.status},${r.response_category}`
).join('\n')

fs.writeFileSync('call-results.csv', csv)
```

---

## 🔒 Безопасность

### Сессия Telegram

**Хранение:**
- Папка: `telegram-session/`
- Содержит: cookies, localStorage, IndexedDB
- **НЕ КОММИТЬТЕ В GIT!** (добавлено в `.gitignore`)

**Защита:**
- Персистентный контекст изолирован
- Данные шифруются Chromium
- Доступ только через Playwright

### Разрешения браузера

```javascript
permissions: ['microphone', 'camera']
args: ['--use-fake-ui-for-media-stream']
```

- Микрофон/камера разрешены автоматически
- Используется fake UI для медиа (без всплывающих окон)
- Безопасно в контексте автоматизации

---

## ⚡ Производительность

### Оптимизации

1. **Персистентный контекст** - не создаем новый браузер каждый раз
2. **Сохранение сессии** - авторизация только один раз
3. **Промежуточное сохранение** - результаты сохраняются после каждого звонка
4. **Задержки между звонками** - снижает нагрузку на аккаунт

### Ограничения

- **Таймаут соединения:** 20 секунд (настраивается)
- **Длительность звонка:** 30 секунд (настраивается)
- **Задержка между звонками:** 3 секунды (рекомендуется минимум)
- **Рекомендуемый лимит:** 50-100 звонков в день с одного аккаунта

---

## 🧩 Расширяемость

### Добавление новых категорий ответов

```javascript
// В categorizeResponse()
const interested = ['расскажите больше', 'когда можно', 'сколько стоит']
if (interested.some(phrase => lower.includes(phrase))) {
    return 'interested'
}
```

### Интеграция с CRM

```javascript
// После записи результата
async saveToCRM(result) {
    await fetch('https://your-crm.com/api/leads', {
        method: 'POST',
        body: JSON.stringify(result)
    })
}
```

### Мультиаккаунт

```javascript
// Создать несколько сессий
const accounts = [
    { userDataDir: './session-1', phoneList: './phones-1.txt' },
    { userDataDir: './session-2', phoneList: './phones-2.txt' }
]

// Распределить обзвон
accounts.forEach(async (account) => {
    const caller = new TelegramCaller(account)
    await caller.startCalling()
})
```

---

## 📊 Метрики

### Логирование

```javascript
console.log(`📞 Звоню на ${phoneNumber}...`)
console.log(`✅ Звонок принят!`)
console.log(`💬 Ответ: "${text}" → ${category}`)
```

### Статистика

- Всего звонков
- Процент ответивших
- Процент заинтересованных
- Средняя длительность

---

## 🔮 Будущие улучшения

- [ ] Голосовое меню (IVR)
- [ ] Распознавание эмоций
- [ ] A/B тестирование аудиосообщений
- [ ] Интеграция с календарями
- [ ] Автоматическая постобработка (отправка email/SMS)
- [ ] Webhook уведомления в реальном времени
- [ ] Dashboard для мониторинга

---

**Архитектура разработана для масштабирования и расширения.**
