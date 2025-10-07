// server.js - С PUSH УВЕДОМЛЕНИЯМИ ОТ БОТА
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const schedule = require('node-schedule');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8285829471:AAGehHp9CC1r6j1F7UArlcwUPG6Rex2RGMo';

const bot = new Telegraf(BOT_TOKEN);
const jobs = {};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация базы данных
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('✅ Connected to SQLite database');
        initDatabase();
    }
});

function initDatabase() {
    // Таблица пользователей
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        first_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица планов тренировок
    db.run(`CREATE TABLE IF NOT EXISTS training_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        day_of_week INTEGER,
        is_rest_day BOOLEAN DEFAULT 0,
        notification_time TEXT DEFAULT '19:00',
        notification_interval INTEGER DEFAULT 10,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Таблица упражнений
    db.run(`CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER,
        name TEXT,
        sets INTEGER,
        reps TEXT,
        rest_between_sets INTEGER DEFAULT 60,
        rest_after_exercise INTEGER DEFAULT 60,
        order_index INTEGER,
        FOREIGN KEY(plan_id) REFERENCES training_plans(id)
    )`);

    // Таблица выполненных тренировок
    db.run(`CREATE TABLE IF NOT EXISTS completed_workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        exercise_name TEXT,
        completed_date DATE,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Таблица текущей недели
    db.run(`CREATE TABLE IF NOT EXISTS current_week (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        week_start DATE,
        week_number INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Таблица сессий тренировок
    db.run(`CREATE TABLE IF NOT EXISTS workout_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        day_of_week INTEGER,
        current_exercise_index INTEGER DEFAULT 0,
        exercises_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
}

// Функция для получения дат текущей недели
function getCurrentWeekDates() {
    const now = new Date();
    const currentDay = now.getDay();
    const startOfWeek = new Date(now);
    
    const diff = currentDay === 0 ? -6 : 1 - currentDay;
    startOfWeek.setDate(now.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        weekDates.push(date);
    }

    return weekDates;
}

// Функция для получения номера недели в году
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

// Обновление текущей недели в базе данных
function updateCurrentWeek() {
    const weekDates = getCurrentWeekDates();
    const weekStart = weekDates[0];
    const weekNumber = getWeekNumber(weekStart);

    db.run(`INSERT OR REPLACE INTO current_week (id, week_start, week_number) VALUES (1, ?, ?)`, 
        [weekStart.toISOString().split('T')[0], weekNumber], 
        (err) => {
            if (err) console.error('Error updating week:', err);
            else console.log(`📅 Week updated: ${weekStart.toDateString()} (Week ${weekNumber})`);
        }
    );

    return { weekDates, weekNumber };
}

// Регистрация пользователя
async function registerUser(telegramId, username, firstName) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)`,
            [telegramId, username, firstName],
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
}

// Создание базового плана тренировок
function createDefaultPlan(userId) {
    const defaultExercises = [
        // Понедельник - Грудь/Трицепс
        { day: 0, exercises: [
            { name: "Отжимания", sets: 5, reps: "5", rest_between_sets: 60, rest_after_exercise: 60 },
            { name: "Жим гантелей", sets: 3, reps: "10-12", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        // Вторник - Ноги
        { day: 1, exercises: [
            { name: "Приседания", sets: 4, reps: "10-12", rest_between_sets: 90, rest_after_exercise: 60 },
            { name: "Выпады", sets: 3, reps: "10 на каждую ногу", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        // Среда - Спина/Бицепс
        { day: 2, exercises: [
            { name: "Подтягивания", sets: 4, reps: "6-8", rest_between_sets: 60, rest_after_exercise: 60 },
            { name: "Тяга гантели", sets: 3, reps: "10-12", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        // Четверг - Плечи
        { day: 3, exercises: [
            { name: "Жим гантелей сидя", sets: 4, reps: "10-12", rest_between_sets: 60, rest_after_exercise: 60 },
            { name: "Махи гантелями", sets: 3, reps: "12-15", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        // Пятница - Пресс/Кардио
        { day: 4, exercises: [
            { name: "Пресс скручивания", sets: 3, reps: "15-20", rest_between_sets: 45, rest_after_exercise: 45 },
            { name: "Планка", sets: 3, reps: "60 секунд", rest_between_sets: 45, rest_after_exercise: 45 },
            { name: "Планка с подтягиванием ног", sets: 3, reps: "5 на каждую ногу", rest_between_sets: 45, rest_after_exercise: 60 }
        ], isRestDay: false },
        // Суббота - Отдых (пользователь может изменить)
        { day: 5, exercises: [], isRestDay: true },
        // Воскресенье - Отдых (пользователь может изменить)
        { day: 6, exercises: [], isRestDay: true }
    ];

    defaultExercises.forEach(dayPlan => {
        db.run(`INSERT INTO training_plans (user_id, day_of_week, is_rest_day, notification_time, notification_interval) 
                VALUES (?, ?, ?, ?, ?)`,
            [userId, dayPlan.day, dayPlan.isRestDay || false, '19:00', 10],
            function(err) {
                if (err) return console.error(err);
                
                const planId = this.lastID;
                dayPlan.exercises.forEach((exercise, index) => {
                    db.run(`INSERT INTO exercises (plan_id, name, sets, reps, rest_between_sets, rest_after_exercise, order_index) 
                            VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [planId, exercise.name, exercise.sets, exercise.reps, exercise.rest_between_sets, exercise.rest_after_exercise, index]);
                });
            }
        );
    });
}

// Система уведомлений через бота
async function scheduleNotifications(userId) {
    // Отменяем старые уведомления
    if (jobs[userId]) {
        jobs[userId].forEach(job => job.cancel());
        delete jobs[userId];
    }

    jobs[userId] = [];

    db.all(`SELECT * FROM training_plans WHERE user_id = ?`, [userId], (err, plans) => {
        if (err) return console.error(err);

        plans.forEach(plan => {
            if (plan.is_rest_day || !plan.notification_time) return;

            const [hours, minutes] = plan.notification_time.split(':');
            
            // Получаем упражнения для этого дня
            db.all(`SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index`, [plan.id], (err, exercises) => {
                if (err) return console.error(err);

                if (exercises.length === 0) return;

                // Планируем уведомление на заданное время
                const rule = new schedule.RecurrenceRule();
                rule.dayOfWeek = plan.day_of_week;
                rule.hour = parseInt(hours);
                rule.minute = parseInt(minutes);
                rule.tz = 'Europe/Moscow';

                const job = schedule.scheduleJob(rule, async () => {
                    await startWorkoutSession(userId, plan.day_of_week, exercises);
                });

                jobs[userId].push(job);
                console.log(`⏰ Scheduled notification for user ${userId} on day ${plan.day_of_week} at ${plan.notification_time}`);
            });
        });
    });
}

// Запуск сессии тренировки через бота
async function startWorkoutSession(userId, dayOfWeek, exercises) {
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресеньe"];
    
    try {
        // Сохраняем сессию в базу
        db.run(`INSERT INTO workout_sessions (user_id, day_of_week, exercises_data, current_exercise_index) VALUES (?, ?, ?, ?)`,
            [userId, dayOfWeek, JSON.stringify(exercises), 0],
            async function(err) {
                if (err) {
                    console.error('Error saving workout session:', err);
                    return;
                }

                const sessionId = this.lastID;
                await sendExerciseToUser(userId, sessionId, dayOfWeek, exercises, 0);
            }
        );
    } catch (error) {
        console.error('Error starting workout session:', error);
    }
}

// Отправка упражнения пользователю через бота
async function sendExerciseToUser(userId, sessionId, dayOfWeek, exercises, exerciseIndex) {
    const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресеньe"];
    
    if (exerciseIndex >= exercises.length) {
        await bot.telegram.sendMessage(userId, 
            `🎉 **Тренировка на ${dayNames[dayOfWeek]} завершена!**\n\nОтличная работа! 💪\nВсе упражнения выполнены!`,
            { parse_mode: 'Markdown' }
        );
        
        // Удаляем сессию
        db.run(`DELETE FROM workout_sessions WHERE id = ?`, [sessionId]);
        return;
    }

    const exercise = exercises[exerciseIndex];
    
    try {
        await bot.telegram.sendMessage(userId,
            `🏋️ **${dayNames[dayOfWeek]} - Упражнение ${exerciseIndex + 1}/${exercises.length}**\n\n` +
            `**${exercise.name}**\n` +
            `📊 ${exercise.sets} подход(а) × ${exercise.reps}\n` +
            `⏱️ Отдых между подходами: ${exercise.rest_between_sets} сек\n` +
            `🔄 Отдых после упражнения: ${exercise.rest_after_exercise} сек\n\n` +
            `Нажми "✅ Завершил" когда выполнишь все подходы`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Завершил упражнение', callback_data: `complete_${sessionId}_${exerciseIndex}` }
                    ]]
                }
            }
        );
    } catch (error) {
        console.error('Error sending message to user:', error);
    }
}

// Обработчик команд бота
bot.start(async (ctx) => {
    const user = ctx.from;
    await registerUser(user.id, user.username, user.first_name);
    
    await ctx.reply(
        `👋 Привет, ${user.first_name}!\n\n` +
        `Я твой персональный тренер! 🏋️\n\n` +
        `Открой Web App чтобы настроить свой план тренировок:`,
        Markup.keyboard([
            [Markup.button.webApp('📅 Открыть TrainPlan', 'https://your-app-url.com')]
        ]).resize()
    );
});

// Обработчик завершения упражнения
bot.on('callback_query', async (ctx) => {
    const userId = ctx.from.id;
    const callbackData = ctx.callbackQuery.data;

    if (callbackData.startsWith('complete_')) {
        const parts = callbackData.replace('complete_', '').split('_');
        const sessionId = parseInt(parts[0]);
        const exerciseIndex = parseInt(parts[1]);

        await ctx.answerCbQuery();

        // Получаем данные сессии
        db.get(`SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?`, [sessionId, userId], async (err, session) => {
            if (err || !session) {
                await ctx.editMessageText('❌ Сессия не найдена');
                return;
            }

            const exercises = JSON.parse(session.exercises_data);
            const exercise = exercises[exerciseIndex];
            const today = new Date().toISOString().split('T')[0];
            
            // Сохраняем в базу выполненное упражнение
            db.run(`INSERT INTO completed_workouts (user_id, exercise_name, completed_date) VALUES (?, ?, ?)`, 
                [userId, exercise.name, today]);

            await ctx.editMessageText(
                `✅ **${exercise.name} завершено!**\n\n` +
                `Отлично! ${exercise.sets} подход(а) × ${exercise.reps} выполнено!\n` +
                `Отдых ${exercise.rest_after_exercise} секунд до следующего упражнения...`,
                { parse_mode: 'Markdown' }
            );

            // Обновляем индекс текущего упражнения
            const nextIndex = exerciseIndex + 1;
            db.run(`UPDATE workout_sessions SET current_exercise_index = ? WHERE id = ?`, [nextIndex, sessionId]);

            // Ждем и отправляем следующее упражнение
            setTimeout(async () => {
                await sendExerciseToUser(userId, sessionId, session.day_of_week, exercises, nextIndex);
            }, (exercise.rest_after_exercise || 60) * 1000);
        });
    }
});

// Middleware аутентификации
const authMiddleware = (req, res, next) => {
    // В реальном приложении здесь должна быть проверка Telegram Web App данных
    req.user = { id: 1, telegram_id: 123456789 };
    next();
};

// API Endpoints (остаются без изменений, как в предыдущей версии)
// ... [здесь все эндпоинты из предыдущего кода] ...

// Запуск сервера и бота
async function start() {
    try {
        await bot.launch();
        console.log('🤖 Telegram bot started with PUSH notifications');

        // Запускаем ежедневное обновление недели в 00:01
        schedule.scheduleJob('1 0 * * *', () => {
            updateCurrentWeek();
            console.log('📅 Auto-updated week dates');
        });

        app.listen(PORT, '0.0.0.0', () => {
            console.log('='.repeat(60));
            console.log('🚀 SERVER WITH PUSH NOTIFICATIONS STARTED!');
            console.log(`📍 Port: ${PORT}`);
            console.log('📊 Features: Bot notifications, User-defined rest days');
            console.log('='.repeat(60));
            
            // Инициализируем текущую неделю
            updateCurrentWeek();
        });
    } catch (error) {
        console.error('❌ Failed to start:', error);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping server...');
    Object.values(jobs).flat().forEach(job => job.cancel());
    bot.stop();
    db.close();
    process.exit(0);
});

start();