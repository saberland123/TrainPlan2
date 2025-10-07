// server.js - С ГРУППОВЫМИ ТРЕНИРОВКАМИ И ЛИДЕРБОРДОМ
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
    // Существующие таблицы...
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        first_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS training_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        day_of_week INTEGER,
        is_rest_day BOOLEAN DEFAULT 0,
        notification_time TEXT DEFAULT '19:00',
        notification_interval INTEGER DEFAULT 10,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

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

    db.run(`CREATE TABLE IF NOT EXISTS current_week (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        week_start DATE,
        week_number INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // НОВЫЕ ТАБЛИЦЫ ДЛЯ ГРУППОВЫХ ТРЕНИРОВОК
    db.run(`CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        creator_id INTEGER,
        invite_code TEXT UNIQUE,
        plan_type TEXT DEFAULT 'week', -- 'week' или 'month'
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
        day_of_week INTEGER, -- 0-6 для недели, 1-31 для месяца
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
        shared_data TEXT, -- JSON с результатами
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
}

// [Остальные существующие функции...]

// НОВЫЕ ФУНКЦИИ ДЛЯ ГРУППОВЫХ ТРЕНИРОВОК

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

// НОВЫЕ ФУНКЦИИ ДЛЯ ЛИДЕРБОРДА И АНАЛИТИКИ

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

// [Остальной существующий код...]

// Обновляем функцию завершения тренировки для обновления лидерборда
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

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(60));
    console.log('🚀 TrainPlan Server with Groups & Leaderboard Started!');
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📊 Features: Group workouts, Leaderboard, Analytics, Sharing');
    console.log('='.repeat(60));
    
    updateCurrentWeek();
});