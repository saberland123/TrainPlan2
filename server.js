// server.js - ИСПРАВЛЕННАЯ ВЕРСИЯ ДЛЯ RENDER
const express = require('express');
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
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Простой CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

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
        { day: 0, exercises: [
            { name: "Отжимания", sets: 5, reps: "5", rest_between_sets: 60, rest_after_exercise: 60 },
            { name: "Жим гантелей", sets: 3, reps: "10-12", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        { day: 1, exercises: [
            { name: "Приседания", sets: 4, reps: "10-12", rest_between_sets: 90, rest_after_exercise: 60 },
            { name: "Выпады", sets: 3, reps: "10 на каждую ногу", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        { day: 2, exercises: [
            { name: "Подтягивания", sets: 4, reps: "6-8", rest_between_sets: 60, rest_after_exercise: 60 },
            { name: "Тяга гантели", sets: 3, reps: "10-12", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        { day: 3, exercises: [
            { name: "Жим гантелей сидя", sets: 4, reps: "10-12", rest_between_sets: 60, rest_after_exercise: 60 },
            { name: "Махи гантелями", sets: 3, reps: "12-15", rest_between_sets: 60, rest_after_exercise: 60 }
        ], isRestDay: false },
        { day: 4, exercises: [
            { name: "Пресс скручивания", sets: 3, reps: "15-20", rest_between_sets: 45, rest_after_exercise: 45 },
            { name: "Планка", sets: 3, reps: "60 секунд", rest_between_sets: 45, rest_after_exercise: 45 }
        ], isRestDay: false },
        { day: 5, exercises: [], isRestDay: true },
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

// Команды бота
bot.start(async (ctx) => {
    const user = ctx.from;
    await registerUser(user.id, user.username, user.first_name);
    
    await ctx.reply(
        `👋 Привет, ${user.first_name}!\n\n` +
        `Я твой персональный тренер! 🏋️\n\n` +
        `Открой Web App чтобы настроить свой план тренировок:`,
        Markup.keyboard([
            [Markup.button.webApp('📅 Открыть TrainPlan', `https://${process.env.RENDER_EXTERNAL_URL || 'localhost:3000'}`)]
        ]).resize()
    );
});

// Webhook для обработки callback от Web App
app.post('/webhook', express.json(), (req, res) => {
    const { userId, message } = req.body;
    // Обработка данных от Web App
    res.json({ status: 'received' });
});

// API Endpoints
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/plan', (req, res) => {
    const { weekDates, weekNumber } = updateCurrentWeek();
    
    db.all(`SELECT * FROM training_plans ORDER BY day_of_week`, [], (err, plans) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        const planPromises = plans.map(plan => {
            return new Promise((resolve, reject) => {
                db.all(`SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index`, [plan.id], (err, exercises) => {
                    if (err) reject(err);
                    else resolve({
                        ...plan,
                        exercises: exercises
                    });
                });
            });
        });

        Promise.all(planPromises)
            .then(fullPlan => res.json({ 
                plan: fullPlan, 
                weekDates: weekDates.map(date => date.toISOString()),
                weekNumber,
                currentDate: new Date().toISOString()
            }))
            .catch(error => {
                console.error(error);
                res.status(500).json({ error: 'Database error' });
            });
    });
});

app.post('/api/plan', (req, res) => {
    const plan = req.body.plan;

    db.run(`DELETE FROM exercises WHERE plan_id IN (SELECT id FROM training_plans)`, []);
    db.run(`DELETE FROM training_plans`, [], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        plan.forEach((dayPlan, dayIndex) => {
            db.run(`INSERT INTO training_plans (user_id, day_of_week, is_rest_day, notification_time, notification_interval) 
                    VALUES (?, ?, ?, ?, ?)`,
                [1, dayIndex, dayPlan.isRestDay || false, dayPlan.notificationTime || '19:00', dayPlan.notificationInterval || 10],
                function(err) {
                    if (err) return console.error(err);

                    const planId = this.lastID;
                    dayPlan.exercises.forEach((exercise, exerciseIndex) => {
                        db.run(`INSERT INTO exercises (plan_id, name, sets, reps, rest_between_sets, rest_after_exercise, order_index) 
                                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [planId, exercise.name, exercise.sets, exercise.reps, 
                             exercise.rest_between_sets || 60, exercise.rest_after_exercise || 60, exerciseIndex]);
                    });
                }
            );
        });

        res.json({ status: 'success', message: 'План сохранен!' });
    });
});

app.post('/api/load-default-plan', (req, res) => {
    db.run(`DELETE FROM exercises WHERE plan_id IN (SELECT id FROM training_plans)`, []);
    db.run(`DELETE FROM training_plans`, [], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        createDefaultPlan(1);
        res.json({ status: 'success', message: 'Базовый план загружен!' });
    });
});

app.get('/api/stats', (req, res) => {
    db.all(`SELECT DISTINCT completed_date FROM completed_workouts 
            WHERE completed_date >= date('now', '-7 days')`, [], (err, completedDays) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        db.get(`SELECT COUNT(*) as total FROM completed_workouts`, [], (err, totalResult) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({
                completedThisWeek: completedDays.length,
                totalCompleted: totalResult.total,
                today: new Date().toISOString().split('T')[0]
            });
        });
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        url: process.env.RENDER_EXTERNAL_URL || 'localhost:3000'
    });
});

// Запуск сервера БЕЗ автоматического запуска бота
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 TrainPlan Server Started!');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log('='.repeat(60));
    
    updateCurrentWeek();
    
    // Запускаем бота только если не в production или есть явное разрешение
    if (process.env.ENABLE_BOT === 'true') {
        startBot();
    } else {
        console.log('🤖 Bot polling is disabled. Use webhooks instead.');
    }
});

// Функция для запуска бота (отдельно от сервера)
async function startBot() {
    try {
        // Останавливаем любые предыдущие вебхуки
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('✅ Webhook deleted');
        
        // Запускаем бота
        await bot.launch();
        console.log('🤖 Telegram bot started with polling');
    } catch (error) {
        console.error('❌ Failed to start bot:', error.message);
        // Не выходим из процесса, чтобы сервер продолжал работать
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping server...');
    bot.stop();
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping server...');
    bot.stop();
    db.close();
    process.exit(0);
});