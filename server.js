// server.js - ГАРАНТИРОВАННО РАБОЧАЯ ВЕРСИЯ ДЛЯ RENDER
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Basic routes
app.get('/', (req, res) => {
    console.log('GET / - Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plan', (req, res) => {
    console.log('GET /api/plan');
    res.json([
        { day: "Понедельник", exercises: [], isRestDay: false },
        { day: "Вторник", exercises: [], isRestDay: false },
        { day: "Среда", exercises: [], isRestDay: false },
        { day: "Четверг", exercises: [], isRestDay: false },
        { day: "Пятница", exercises: [], isRestDay: false },
        { day: "Суббота", exercises: [], isRestDay: true },
        { day: "Воскресенье", exercises: [], isRestDay: true }
    ]);
});

app.post('/api/plan', (req, res) => {
    console.log('POST /api/plan', req.body);
    res.json({ status: 'success', message: 'План сохранен!' });
});

// Health check - ОБЯЗАТЕЛЬНО
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// КРИТИЧЕСКИ ВАЖНО: правильный запуск сервера
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 SERVER STARTED SUCCESSFULLY ON RENDER');
    console.log('='.repeat(60));
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Host: 0.0.0.0`);
    console.log(`📁 Directory: ${__dirname}`);
    console.log('='.repeat(60));
});

// Экспортируем для Render
module.exports = app;