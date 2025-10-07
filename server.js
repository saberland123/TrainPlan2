// server.js - ПОЛНАЯ ВЕРСИЯ СО ВСЕМИ ФУНКЦИЯМИ
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '8285829471:AAGehHp9CC1r6j1F7UArlcwUPG6Rex2RGMo';

const bot = new Telegraf(BOT_TOKEN);
const jobs = {};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS middleware
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
        sets INTEGER,
        reps TEXT,
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

    // НОВЫЕ ТАБЛИЦЫ ДЛЯ ГРУППОВЫХ ТРЕНИРОВОК
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        creator_id INTEGER,
        invite_code TEXT UNIQUE,
        plan_type TEXT DEFAULT 'week',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        FOREIGN KEY(creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        user_id INTEGER,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        notification_time TEXT DEFAULT '19:00',
        notification_interval INTEGER DEFAULT 10,
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(group_id, user_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS group_workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        day_of_week INTEGER,
        exercise_name TEXT NOT NULL,
        sets INTEGER NOT NULL,
        reps TEXT NOT NULL,
        rest_between_sets INTEGER DEFAULT 60,
        rest_after_exercise INTEGER DEFAULT 60,
        order_index INTEGER,
        FOREIGN KEY(group_id) REFERENCES groups(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS group_completed_workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER,
        user_id INTEGER,
        exercise_name TEXT,
        completed_date DATE,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sets INTEGER,
        reps TEXT,
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Таблица для лидерборда
    db.run(`CREATE TABLE IF NOT EXISTS leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        total_workout_days INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_workout_date DATE,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Таблица для шаринга результатов
    db.run(`CREATE TABLE IF NOT EXISTS shared_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        share_code TEXT UNIQUE,
        shared_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
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
            db.run(`INSERT INTO completed_workouts (user_id, exercise_name, completed_date, sets, reps) VALUES (?, ?, ?, ?, ?)`, 
                [userId, exercise.name, today, exercise.sets, exercise.reps]);

            await ctx.editMessageText(
                `✅ **${exercise.name} завершено!**\n\n` +
                `Отлично! ${exercise.sets} подход(а) × ${exercise.reps} выполнено!\n` +
                `Отдых ${exercise.rest_after_exercise} секунд до следующего упражнения...`,
                { parse_mode: 'Markdown' }
            );

            // Обновляем лидерборд
            updateLeaderboard(userId, exercise);

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

// Обновление лидерборда при завершении тренировки
function updateLeaderboard(userId, exercise) {
    const today = new Date().toISOString().split('T')[0];
    
    // Проверяем, достаточно ли интенсивная тренировка для зачета
    const sets = parseInt(exercise.sets) || 0;
    const reps = parseInt(exercise.reps) || 0;
    
    // Условия для зачета тренировочного дня:
    // Минимум 2 подхода И минимум 5 повторений (или время для кардио)
    const isValidWorkout = sets >= 2 && (reps >= 5 || exercise.reps.includes('сек') || exercise.reps.includes('мин'));
    
    if (!isValidWorkout) return;
    
    db.get(`SELECT * FROM leaderboard WHERE user_id = ?`, [userId], (err, userStats) => {
        if (err) return;
        
        if (!userStats) {
            // Создаем новую запись
            db.run(`INSERT INTO leaderboard (user_id, total_workout_days, current_streak, longest_streak, last_workout_date) 
                    VALUES (?, 1, 1, 1, ?)`, [userId, today]);
        } else {
            let newCurrentStreak = userStats.current_streak;
            let newTotalDays = userStats.total_workout_days;
            
            // Проверяем, является ли сегодняшняя тренировка продолжением стрика
            const lastWorkout = new Date(userStats.last_workout_date);
            const todayDate = new Date(today);
            const diffTime = Math.abs(todayDate - lastWorkout);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                // Продолжение стрика
                newCurrentStreak += 1;
            } else if (diffDays > 1) {
                // Разрыв стрика
                newCurrentStreak = 1;
            }
            // Если diffDays === 0 - тренировка уже засчитана сегодня
            
            if (diffDays > 0) {
                newTotalDays += 1;
            }
            
            const newLongestStreak = Math.max(newCurrentStreak, userStats.longest_streak);
            
            db.run(`UPDATE leaderboard SET total_workout_days = ?, current_streak = ?, longest_streak = ?, last_workout_date = ? WHERE user_id = ?`,
                [newTotalDays, newCurrentStreak, newLongestStreak, today, userId]);
        }
    });
}

// API Endpoints

// Получение плана тренировок с датами
app.get('/api/plan', (req, res) => {
    const userId = 1; // Временно фиксированный ID

    // Обновляем текущую неделю
    const { weekDates, weekNumber } = updateCurrentWeek();

    db.all(`SELECT * FROM training_plans WHERE user_id = ? ORDER BY day_of_week`, [userId], (err, plans) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (plans.length === 0) {
            createDefaultPlan(userId);
            return res.json({ plan: [], weekDates, weekNumber });
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

// Сохранение плана тренировок
app.post('/api/plan', (req, res) => {
    const userId = 1; // Временно фиксированный ID
    const plan = req.body.plan;

    db.run(`DELETE FROM exercises WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = ?)`, [userId]);
    db.run(`DELETE FROM training_plans WHERE user_id = ?`, [userId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        plan.forEach((dayPlan, dayIndex) => {
            db.run(`INSERT INTO training_plans (user_id, day_of_week, is_rest_day, notification_time, notification_interval) 
                    VALUES (?, ?, ?, ?, ?)`,
                [userId, dayIndex, dayPlan.isRestDay || false, dayPlan.notificationTime || '19:00', dayPlan.notificationInterval || 10],
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

        scheduleNotifications(userId);
        res.json({ status: 'success', message: 'План сохранен!' });
    });
});

// Загрузка базового плана
app.post('/api/load-default-plan', (req, res) => {
    const userId = 1; // Временно фиксированный ID

    db.run(`DELETE FROM exercises WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = ?)`, [userId]);
    db.run(`DELETE FROM training_plans WHERE user_id = ?`, [userId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        createDefaultPlan(userId);
        scheduleNotifications(userId);

        res.json({ status: 'success', message: 'Базовый план загружен!' });
    });
});

// Получение статистики
app.get('/api/stats', (req, res) => {
    const userId = 1; // Временно фиксированный ID
    const today = new Date().toISOString().split('T')[0];
    
    // Получаем завершенные дни за текущую неделю
    db.all(`SELECT DISTINCT completed_date FROM completed_workouts 
            WHERE user_id = ? AND completed_date >= date('now', '-7 days')`, 
        [userId], (err, completedDays) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            // Получаем общее количество завершенных тренировок
            db.get(`SELECT COUNT(*) as total FROM completed_workouts WHERE user_id = ?`, 
                [userId], (err, totalResult) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    res.json({
                        completedThisWeek: completedDays.length,
                        totalCompleted: totalResult.total,
                        today: today
                    });
                }
            );
        }
    );
});

// ГРУППОВЫЕ ТРЕНИРОВКИ - API

// Создание новой группы
app.post('/api/groups/create', async (req, res) => {
    const { name, description, plan_type, creator_id } = req.body;
    
    try {
        const inviteCode = uuidv4().substring(0, 8).toUpperCase();
        
        db.run(`INSERT INTO groups (name, description, creator_id, invite_code, plan_type) VALUES (?, ?, ?, ?, ?)`,
            [name, description, creator_id, inviteCode, plan_type || 'week'],
            function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Ошибка при создании группы' });
                }
                
                const groupId = this.lastID;
                
                // Добавляем создателя в группу
                db.run(`INSERT INTO group_members (group_id, user_id) VALUES (?, ?)`,
                    [groupId, creator_id],
                    function(err) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({ error: 'Ошибка при добавлении в группу' });
                        }
                        
                        res.json({
                            status: 'success',
                            group_id: groupId,
                            invite_code: inviteCode,
                            message: 'Группа создана успешно!'
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Присоединение к группе по инвайт-коду
app.post('/api/groups/join', async (req, res) => {
    const { invite_code, user_id } = req.body;
    
    try {
        // Находим группу по инвайт-коду
        db.get(`SELECT * FROM groups WHERE invite_code = ? AND is_active = 1`, [invite_code], (err, group) => {
            if (err || !group) {
                return res.status(404).json({ error: 'Группа не найдена или неактивна' });
            }
            
            // Проверяем, не состоит ли пользователь уже в группе
            db.get(`SELECT * FROM group_members WHERE group_id = ? AND user_id = ? AND is_active = 1`, 
                [group.id, user_id], (err, existingMember) => {
                    if (existingMember) {
                        return res.status(400).json({ error: 'Вы уже состоите в этой группе' });
                    }
                    
                    // Добавляем пользователя в группу
                    db.run(`INSERT INTO group_members (group_id, user_id) VALUES (?, ?)`,
                        [group.id, user_id],
                        function(err) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({ error: 'Ошибка при присоединении к группе' });
                            }
                            
                            res.json({
                                status: 'success',
                                group_id: group.id,
                                group_name: group.name,
                                message: 'Вы успешно присоединились к группе!'
                            });
                        }
                    );
                }
            );
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка групп пользователя
app.get('/api/groups/user/:user_id', (req, res) => {
    const userId = req.params.user_id;
    
    db.all(`
        SELECT g.*, gm.joined_at, 
               (SELECT COUNT(*) FROM group_members WHERE group_id = g.id AND is_active = 1) as member_count
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ? AND gm.is_active = 1 AND g.is_active = 1
        ORDER BY gm.joined_at DESC
    `, [userId], (err, groups) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        res.json({ groups });
    });
});

// Получение детальной информации о группе
app.get('/api/groups/:group_id', (req, res) => {
    const groupId = req.params.group_id;
    
    // Получаем информацию о группе
    db.get(`SELECT * FROM groups WHERE id = ? AND is_active = 1`, [groupId], (err, group) => {
        if (err || !group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        // Получаем участников группы
        db.all(`
            SELECT u.id, u.first_name, u.username, gm.joined_at, gm.notification_time
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ? AND gm.is_active = 1
            ORDER BY gm.joined_at ASC
        `, [groupId], (err, members) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            // Получаем план тренировок группы
            db.all(`SELECT * FROM group_workouts WHERE group_id = ? ORDER BY day_of_week, order_index`, [groupId], (err, workouts) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                // Получаем статистику по завершенным тренировкам
                db.all(`
                    SELECT user_id, COUNT(DISTINCT completed_date) as completed_days
                    FROM group_completed_workouts 
                    WHERE group_id = ? AND completed_date >= date('now', '-7 days')
                    GROUP BY user_id
                `, [groupId], (err, stats) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    res.json({
                        group,
                        members,
                        workouts,
                        stats
                    });
                });
            });
        });
    });
});

// Сохранение группового плана тренировок
app.post('/api/groups/:group_id/workouts', (req, res) => {
    const groupId = req.params.group_id;
    const { workouts } = req.body;
    
    // Удаляем старые тренировки
    db.run(`DELETE FROM group_workouts WHERE group_id = ?`, [groupId], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        // Добавляем новые тренировки
        const insertPromises = workouts.map(workout => {
            return new Promise((resolve, reject) => {
                db.run(`INSERT INTO group_workouts (group_id, day_of_week, exercise_name, sets, reps, rest_between_sets, rest_after_exercise, order_index) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [groupId, workout.day_of_week, workout.exercise_name, workout.sets, workout.reps, 
                     workout.rest_between_sets || 60, workout.rest_after_exercise || 60, workout.order_index || 0],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        });
        
        Promise.all(insertPromises)
            .then(() => {
                res.json({ status: 'success', message: 'План тренировок обновлен!' });
            })
            .catch(error => {
                console.error(error);
                res.status(500).json({ error: 'Ошибка при сохранении плана' });
            });
    });
});

// Выход из группы
app.post('/api/groups/:group_id/leave', (req, res) => {
    const groupId = req.params.group_id;
    const { user_id } = req.body;
    
    db.run(`UPDATE group_members SET is_active = 0 WHERE group_id = ? AND user_id = ?`, 
        [groupId, user_id], 
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка при выходе из группы' });
            }
            
            res.json({ status: 'success', message: 'Вы вышли из группы' });
        }
    );
});

// Удаление группы (только для создателя)
app.delete('/api/groups/:group_id', (req, res) => {
    const groupId = req.params.group_id;
    const { user_id } = req.body;
    
    // Проверяем, является ли пользователь создателем группы
    db.get(`SELECT * FROM groups WHERE id = ? AND creator_id = ?`, [groupId, user_id], (err, group) => {
        if (err || !group) {
            return res.status(403).json({ error: 'Вы не можете удалить эту группу' });
        }
        
        // Деактивируем группу
        db.run(`UPDATE groups SET is_active = 0 WHERE id = ?`, [groupId], function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка при удалении группы' });
            }
            
            res.json({ status: 'success', message: 'Группа удалена' });
        });
    });
});

// ЛИДЕРБОРД И АНАЛИТИКА - API

// Получение таблицы лидеров
app.get('/api/leaderboard', (req, res) => {
    db.all(`
        SELECT u.first_name, u.username, l.total_workout_days, l.current_streak, l.longest_streak
        FROM leaderboard l
        JOIN users u ON l.user_id = u.id
        ORDER BY l.total_workout_days DESC, l.longest_streak DESC
        LIMIT 50
    `, (err, leaders) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        res.json({ leaders });
    });
});

// Расширенная аналитика пользователя
app.get('/api/analytics/:user_id', (req, res) => {
    const userId = req.params.user_id;
    
    // Базовая статистика
    db.get(`SELECT * FROM leaderboard WHERE user_id = ?`, [userId], (err, leaderStats) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        // Статистика по упражнениям
        db.all(`
            SELECT exercise_name, COUNT(*) as count, 
                   SUM(sets) as total_sets,
                   AVG(sets) as avg_sets
            FROM completed_workouts 
            WHERE user_id = ?
            GROUP BY exercise_name
            ORDER BY count DESC
        `, [userId], (err, exerciseStats) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            // Еженедельная активность
            db.all(`
                SELECT strftime('%Y-%W', completed_date) as week,
                       COUNT(DISTINCT completed_date) as workout_days,
                       COUNT(*) as total_exercises
                FROM completed_workouts 
                WHERE user_id = ?
                GROUP BY week
                ORDER BY week DESC
                LIMIT 8
            `, [userId], (err, weeklyStats) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                // Самые продуктивные дни
                db.all(`
                    SELECT strftime('%w', completed_date) as day_of_week,
                           COUNT(*) as workout_count
                    FROM completed_workouts 
                    WHERE user_id = ?
                    GROUP BY day_of_week
                    ORDER BY workout_count DESC
                `, [userId], (err, dayStats) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    res.json({
                        leader_stats: leaderStats || {
                            total_workout_days: 0,
                            current_streak: 0,
                            longest_streak: 0
                        },
                        exercise_stats: exerciseStats,
                        weekly_stats: weeklyStats,
                        day_stats: dayStats
                    });
                });
            });
        });
    });
});

// Создание ссылки для шаринга результатов
app.post('/api/share/results', (req, res) => {
    const { user_id, days_range = 7 } = req.body;
    
    const shareCode = uuidv4().substring(0, 12).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Ссылка действительна 7 дней
    
    // Получаем данные для шаринга
    db.all(`
        SELECT exercise_name, completed_date, sets, reps
        FROM completed_workouts 
        WHERE user_id = ? AND completed_date >= date('now', ?)
        ORDER BY completed_date DESC
    `, [user_id, `-${days_range} days`], (err, workouts) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        const shareData = {
            user_id: user_id,
            workouts: workouts,
            share_date: new Date().toISOString(),
            days_range: days_range
        };
        
        db.run(`INSERT INTO shared_results (user_id, share_code, shared_data, expires_at) VALUES (?, ?, ?, ?)`,
            [user_id, shareCode, JSON.stringify(shareData), expiresAt.toISOString()],
            function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Ошибка при создании ссылки' });
                }
                
                res.json({
                    status: 'success',
                    share_code: shareCode,
                    share_url: `/share/${shareCode}`,
                    expires_at: expiresAt
                });
            }
        );
    });
});

// Просмотр общих результатов
app.get('/api/share/:share_code', (req, res) => {
    const shareCode = req.params.share_code;
    
    db.get(`SELECT * FROM shared_results WHERE share_code = ? AND expires_at > datetime('now')`, [shareCode], (err, share) => {
        if (err || !share) {
            return res.status(404).json({ error: 'Ссылка не найдена или устарела' });
        }
        
        const shareData = JSON.parse(share.shared_data);
        
        // Получаем информацию о пользователе
        db.get(`SELECT first_name, username FROM users WHERE id = ?`, [shareData.user_id], (err, user) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            res.json({
                user: user,
                workouts: shareData.workouts,
                share_date: shareData.share_date,
                days_range: shareData.days_range
            });
        });
    });
});

// Завершение тренировки с обновлением лидерборда
app.post('/api/complete-workout', (req, res) => {
    const { user_id, exercise_name, sets, reps } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    db.run(`INSERT INTO completed_workouts (user_id, exercise_name, completed_date, sets, reps) VALUES (?, ?, ?, ?, ?)`,
        [user_id, exercise_name, today, sets, reps],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            // Обновляем лидерборд
            updateLeaderboard(user_id, { sets, reps });
            
            res.json({ status: 'success', message: 'Тренировка завершена!' });
        }
    );
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

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 TrainPlan Server with Groups & Leaderboard Started!');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 URL: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
    console.log('📊 Features: Group workouts, Leaderboard, Analytics, Sharing');
    console.log('='.repeat(60));
    
    updateCurrentWeek();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Stopping server...');
    Object.values(jobs).flat().forEach(job => job.cancel());
    bot.stop();
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping server...');
    Object.values(jobs).flat().forEach(job => job.cancel());
    bot.stop();
    db.close();
    process.exit(0);
});