const express = require('express');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const schedule = require('node-schedule');
const path = require('path');

// --- НАСТРОЙКИ ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = '8285829471:AAGehHp9CC1r6j1F7UArlcwUPG6Rex2RGMo';

// --- ИНИЦИАЛИЗАЦИЯ ---
const app = express();
const bot = new Telegraf(BOT_TOKEN);
const jobs = {};
const userSettings = {};

// --- MIDDLEWARE ---
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- АУТЕНТИФИКАЦИЯ ---
const simpleAuth = (req, res, next) => {
    req.user = {
        id: 123456789,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser'
    };
    console.log('Используется упрощенная аутентификация для разработки');
    next();
};

// --- СИСТЕМА УВЕДОМЛЕНИЙ ---

// Функция для отправки уведомления
async function sendExerciseNotification(userId, exercise, dayName, interval) {
    try {
        const message = `🏋️ **Тренировка: ${dayName}**\n\n` +
                       `**Упражнение:** ${exercise.name}\n` +
                       `**Подходы:** ${exercise.sets}\n` +
                       `**Повторения:** ${exercise.reps}\n\n` +
                       `Напоминание придёт через ${interval} минут`;

        await bot.telegram.sendMessage(userId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Завершил упражнение', callback_data: `complete_${exercise.name}` }
                ]]
            }
        });
        console.log(`Уведомление отправлено пользователю ${userId}`);
    } catch (error) {
        console.error('Ошибка отправки уведомления:', error);
    }
}

// Обработчик кнопки "Завершил"
bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    
    if (callbackData.startsWith('complete_')) {
        const exerciseName = callbackData.replace('complete_', '');
        
        await ctx.answerCbQuery();
        await ctx.editMessageText(
            `✅ **Упражнение завершено!**\n\n` +
            `**${exerciseName}** - отлично поработали! 💪\n\n` +
            `Следующее уведомление придёт по расписанию.`,
            { parse_mode: 'Markdown' }
        );
        
        console.log(`Пользователь ${ctx.from.id} завершил упражнение: ${exerciseName}`);
    }
});

// Функция для планирования уведомлений
function scheduleNotifications(userId, plan) {
    // Отменяем старые задания
    if (jobs[userId]) {
        jobs[userId].forEach(job => job.cancel());
        delete jobs[userId];
    }
    
    jobs[userId] = [];
    
    plan.forEach((day, dayIndex) => {
        if (day.isRestDay || !day.exercises.length || !day.notificationTime) return;
        
        const [hours, minutes] = day.notificationTime.split(':');
        const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
        
        // Планируем уведомление для каждого упражнения
        day.exercises.forEach((exercise, exerciseIndex) => {
            const rule = new schedule.RecurrenceRule();
            rule.dayOfWeek = dayIndex;
            rule.hour = parseInt(hours, 10);
            rule.minute = parseInt(minutes, 10) + (exerciseIndex * (day.notificationInterval || 10));
            rule.tz = 'Europe/Moscow';
            
            const job = schedule.scheduleJob(rule, () => {
                sendExerciseNotification(
                    userId, 
                    exercise, 
                    dayNames[dayIndex],
                    day.notificationInterval || 10
                );
            });
            
            jobs[userId].push(job);
        });
    });
    
    console.log(`Уведомления запланированы для пользователя ${userId}`);
}

// --- API ЭНДПОИНТЫ ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Получение плана тренировок
app.get('/api/plan', simpleAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const testPlan = [
            { 
                day_of_week: 0, 
                day: "Понедельник", 
                exercises: [
                    { name: "Приседания", sets: 3, reps: 10 },
                    { name: "Отжимания", sets: 4, reps: 15 }
                ], 
                isRestDay: false,
                notificationTime: "19:00",
                notificationInterval: 10
            },
            { 
                day_of_week: 1, 
                day: "Вторник", 
                exercises: [
                    { name: "Подтягивания", sets: 3, reps: 8 }
                ], 
                isRestDay: false,
                notificationTime: "19:00",
                notificationInterval: 10
            },
            { 
                day_of_week: 2, 
                day: "Среда", 
                exercises: [], 
                isRestDay: false,
                notificationTime: "19:00",
                notificationInterval: 10
            },
            { 
                day_of_week: 3, 
                day: "Четверг", 
                exercises: [
                    { name: "Планка", sets: 3, reps: "60 сек" }
                ], 
                isRestDay: false,
                notificationTime: "19:00",
                notificationInterval: 10
            },
            { 
                day_of_week: 4, 
                day: "Пятница", 
                exercises: [], 
                isRestDay: false,
                notificationTime: "19:00",
                notificationInterval: 10
            },
            { 
                day_of_week: 5, 
                day: "Суббота", 
                exercises: [], 
                isRestDay: true 
            },
            { 
                day_of_week: 6, 
                day: "Воскресенье", 
                exercises: [], 
                isRestDay: true 
            }
        ];
        
        res.json(testPlan);
    } catch (e) {
        console.error('Ошибка при получении плана:', e);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Сохранение плана тренировок
app.post('/api/plan', simpleAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const plan = req.body.plan;
        
        console.log('Сохранение плана для пользователя:', userId);
        
        // Планируем уведомления
        scheduleNotifications(userId, plan);
        
        res.json({ 
            status: 'success', 
            message: 'План успешно сохранен! Уведомления запланированы.',
            receivedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error('Ошибка при сохранении плана:', e);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение настроек
app.get('/api/settings', simpleAuth, (req, res) => {
    const userId = req.user.id;
    const settings = userSettings[userId] || {
        notificationsEnabled: true,
        soundEnabled: true,
        language: 'ru',
        timezone: 'Europe/Moscow'
    };
    
    res.json(settings);
});

// Сохранение настроек
app.post('/api/settings', simpleAuth, (req, res) => {
    const userId = req.user.id;
    userSettings[userId] = req.body.settings;
    
    res.json({ 
        status: 'success', 
        message: 'Настройки сохранены!' 
    });
});

// Тестовый endpoint
app.get('/test', (req, res) => {
    res.json({ 
        message: 'Сервер работает!',
        time: new Date().toISOString()
    });
});

// --- ЗАПУСК СЕРВЕРА ---
async function start() {
    try {
        // Запускаем бота
        await bot.launch();
        console.log('🤖 Telegram бот запущен');
        
        // Запускаем сервер
        app.listen(PORT, () => {
            console.log(`✅ Сервер запущен на порту ${PORT}`);
            console.log(`🌐 Локальный URL: http://localhost:${PORT}`);
            console.log(`🔧 Режим: РАЗРАБОТКА`);
            console.log('\n📋 Доступные endpoints:');
            console.log('   GET  /              - Frontend приложение');
            console.log('   GET  /api/plan      - Получить план тренировок');
            console.log('   POST /api/plan      - Сохранить план');
            console.log('   GET  /api/settings  - Получить настройки');
            console.log('   POST /api/settings  - Сохранить настройки');
        });
    } catch (error) {
        console.error('❌ Ошибка при запуске сервера:', error);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Остановка сервера...');
    Object.values(jobs).flat().forEach(job => job.cancel());
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Остановка сервера...');
    Object.values(jobs).flat().forEach(job => job.cancel());
    bot.stop();
    process.exit(0);
});

start();