const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const ROOT_DIR = path.join(__dirname, '..');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, ROOT_DIR);
    },
    filename: (req, file, cb) => {
        if (file.fieldname === 'audio1') cb(null, '1.wav');
        else if (file.fieldname === 'audio2') cb(null, '2.wav');
        else if (file.fieldname === 'phonesFile') cb(null, 'phones.txt');
        else cb(null, file.originalname);
    }
});

const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, 'public')));

app.get('/api/status', (req, res) => {
    const hasAudio1 = fs.existsSync(path.join(ROOT_DIR, '1.wav'));
    const hasAudio2 = fs.existsSync(path.join(ROOT_DIR, '2.wav'));
    const hasPhones = fs.existsSync(path.join(ROOT_DIR, 'phones.txt'));
    let phonesCount = 0;
    if (hasPhones) {
        const content = fs.readFileSync(path.join(ROOT_DIR, 'phones.txt'), 'utf8');
        phonesCount = content.split('\n').map(l => l.trim()).filter(Boolean).length;
    }
    res.json({ hasAudio1, hasAudio2, hasPhones, phonesCount });
});

app.post('/api/upload', upload.fields([
    { name: 'audio1', maxCount: 1 },
    { name: 'audio2', maxCount: 1 },
    { name: 'phonesFile', maxCount: 1 }
]), (req, res) => {
    res.json({ status: 'ok', message: 'Файлы успешно загружены' });
});

app.post('/api/save-phones', (req, res) => {
    const { phones } = req.body;
    if (typeof phones === 'string') {
        fs.writeFileSync(path.join(ROOT_DIR, 'phones.txt'), phones, 'utf8');
        return res.json({ status: 'ok', message: 'Список номеров сохранен' });
    }
    res.status(400).json({ error: 'Неверные данные' });
});

app.listen(PORT, () => {
    console.log(`Панель управления запущена на http://localhost:${PORT}`);
});
