const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve static files from root as fallback
app.use(express.static('.'));

// Инициализация базы данных
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('✅ Connected to SQLite database');
        initDatabase(() => {
            console.log('✅ Database fully initialized, starting server...');
            startServer();
        });
    }
});

function initDatabase(callback) {
    const tables = [
        `CREATE TABLE IF NOT EXISTS current_week (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            week_start DATE,
            week_number INTEGER,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            timezone TEXT DEFAULT 'Europe/Moscow',
            theme TEXT DEFAULT 'dark',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS training_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            day_of_week INTEGER,
            is_rest_day BOOLEAN DEFAULT 0,
            notification_time TEXT DEFAULT '19:00',
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`,

        `CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER,
            name TEXT,
            sets INTEGER,
            reps TEXT,
            order_index INTEGER,
            FOREIGN KEY(plan_id) REFERENCES training_plans(id)
        )`,

        `CREATE TABLE IF NOT EXISTS completed_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            exercise_name TEXT,
            completed_date DATE,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sets INTEGER,
            reps TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`,

        `CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            creator_id INTEGER,
            invite_code TEXT UNIQUE,
            plan_type TEXT DEFAULT 'week',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY(creator_id) REFERENCES users(id)
        )`,

        `CREATE TABLE IF NOT EXISTS group_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_id INTEGER,
            user_id INTEGER,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY(group_id) REFERENCES groups(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            UNIQUE(group_id, user_id)
        )`,

        `CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            total_workout_days INTEGER DEFAULT 0,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_workout_date DATE,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`
    ];

    let completed = 0;
    tables.forEach((sql, index) => {
        db.run(sql, (err) => {
            if (err) {
                console.error(`❌ Error creating table ${index + 1}:`, err);
            } else {
                console.log(`✅ Table ${index + 1} created successfully`);
            }
            completed++;
            if (completed === tables.length) {
                console.log('✅ All tables created successfully');
                db.run(`INSERT OR IGNORE INTO users (id, telegram_id, first_name) VALUES (1, 123456, 'Test User')`, (err) => {
                    if (err) {
                        console.error('Error creating test user:', err);
                    } else {
                        console.log('✅ Test user created successfully');
                    }
                    if (callback) callback();
                });
            }
        });
    });
}

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

function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function updateCurrentWeek() {
    const weekDates = getCurrentWeekDates();
    const weekStart = weekDates[0];
    const weekNumber = getWeekNumber(weekStart);

    db.run(`INSERT OR REPLACE INTO current_week (id, week_start, week_number) VALUES (1, ?, ?)`, 
        [weekStart.toISOString().split('T')[0], weekNumber], 
        (err) => {
            if (err) {
                console.error('Error updating week:', err);
            } else {
                console.log('✅ Week updated successfully');
            }
        }
    );

    return { weekDates, weekNumber };
}

function createDefaultPlan(userId) {
    return new Promise((resolve, reject) => {
        let completed = 0;
        const totalDays = 7;
        
        db.run(`DELETE FROM training_plans WHERE user_id = ?`, [userId], (err) => {
            if (err) {
                reject(err);
                return;
            }

            for (let day = 0; day < totalDays; day++) {
                db.run(`INSERT INTO training_plans (user_id, day_of_week, is_rest_day, notification_time) 
                        VALUES (?, ?, ?, ?)`,
                    [userId, day, false, '19:00'],
                    function(err) {
                        if (err) {
                            console.error('Error creating default plan:', err);
                            reject(err);
                            return;
                        }
                        completed++;
                        if (completed === totalDays) {
                            resolve();
                        }
                    }
                );
            }
        });
    });
}

// API endpoints
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/plan', (req, res) => {
    const userId = 1;
    const { weekDates, weekNumber } = updateCurrentWeek();
    
    db.all(`SELECT * FROM training_plans WHERE user_id = ? ORDER BY day_of_week`, [userId], (err, plans) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (plans.length === 0) {
            const emptyPlan = Array(7).fill().map((_, dayIndex) => ({
                day_of_week: dayIndex,
                is_rest_day: false,
                notification_time: '19:00',
                exercises: []
            }));
            
            return res.json({ 
                plan: emptyPlan, 
                weekDates: weekDates.map(date => date.toISOString()),
                weekNumber
            });
        }

        const planPromises = plans.map(plan => {
            return new Promise((resolve, reject) => {
                db.all(`SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index`, [plan.id], (err, exercises) => {
                    if (err) reject(err);
                    else resolve({
                        ...plan,
                        exercises: exercises || []
                    });
                });
            });
        });

        Promise.all(planPromises)
            .then(fullPlan => res.json({ 
                plan: fullPlan, 
                weekDates: weekDates.map(date => date.toISOString()),
                weekNumber
            }))
            .catch(error => {
                console.error(error);
                res.status(500).json({ error: 'Database error' });
            });
    });
});

app.post('/api/plan', (req, res) => {
    const userId = 1;
    const plan = req.body.plan;

    if (!plan || !Array.isArray(plan)) {
        return res.status(400).json({ error: 'Invalid plan data' });
    }

    db.serialize(() => {
        db.run(`DELETE FROM exercises WHERE plan_id IN (SELECT id FROM training_plans WHERE user_id = ?)`, [userId], (err) => {
            if (err) {
                console.error('Error deleting exercises:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            db.run(`DELETE FROM training_plans WHERE user_id = ?`, [userId], (err) => {
                if (err) {
                    console.error('Error deleting plans:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                let plansSaved = 0;
                const totalPlans = plan.length;

                if (totalPlans === 0) {
                    return res.json({ status: 'success', message: 'План сохранен!' });
                }

                plan.forEach((dayPlan, dayIndex) => {
                    db.run(`INSERT INTO training_plans (user_id, day_of_week, is_rest_day, notification_time) 
                            VALUES (?, ?, ?, ?)`,
                        [userId, dayIndex, dayPlan.is_rest_day || false, dayPlan.notification_time || '19:00'],
                        function(err) {
                            if (err) {
                                console.error('Error saving plan day:', err);
                                plansSaved++;
                                checkComplete();
                                return;
                            }

                            const planId = this.lastID;
                            
                            if (!dayPlan.is_rest_day && dayPlan.exercises && dayPlan.exercises.length > 0) {
                                let exercisesSaved = 0;
                                const totalExercises = dayPlan.exercises.length;

                                dayPlan.exercises.forEach((exercise, exerciseIndex) => {
                                    db.run(`INSERT INTO exercises (plan_id, name, sets, reps, order_index) 
                                            VALUES (?, ?, ?, ?, ?)`,
                                        [planId, exercise.name, exercise.sets, exercise.reps, exerciseIndex],
                                        function(err) {
                                            if (err) {
                                                console.error('Error saving exercise:', err);
                                            }
                                            exercisesSaved++;
                                            
                                            if (exercisesSaved === totalExercises) {
                                                plansSaved++;
                                                checkComplete();
                                            }
                                        }
                                    );
                                });
                            } else {
                                plansSaved++;
                                checkComplete();
                            }
                        }
                    );
                });

                function checkComplete() {
                    if (plansSaved === totalPlans) {
                        res.json({ status: 'success', message: 'План сохранен!' });
                    }
                }
            });
        });
    });
});

app.post('/api/load-default-plan', (req, res) => {
    const userId = 1;

    createDefaultPlan(userId)
        .then(() => {
            res.json({ status: 'success', message: 'Базовый план загружен!' });
        })
        .catch(error => {
            console.error('Error loading default plan:', error);
            res.status(500).json({ error: 'Ошибка при загрузке базового плана' });
        });
});

app.get('/api/groups/user/:user_id', (req, res) => {
    const userId = req.params.user_id;
    
    db.all(`
        SELECT g.*, COUNT(gm.user_id) as member_count
        FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id AND gm.is_active = 1
        WHERE g.id IN (SELECT group_id FROM group_members WHERE user_id = ? AND is_active = 1)
        AND g.is_active = 1
        GROUP BY g.id
        ORDER BY g.created_at DESC
    `, [userId], (err, groups) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        res.json({ groups: groups || [] });
    });
});

app.post('/api/groups/create', async (req, res) => {
    const { name, description, plan_type, creator_id } = req.body;
    
    try {
        const inviteCode = uuidv4().substring(0, 8).toUpperCase();
        
        db.run(`INSERT INTO groups (name, description, creator_id, invite_code, plan_type) VALUES (?, ?, ?, ?, ?)`,
            [name, description, creator_id || 1, inviteCode, plan_type || 'week'],
            function(err) {
                if (err) {
                    console.error('Error creating group:', err);
                    return res.status(500).json({ error: 'Ошибка при создании группы: ' + err.message });
                }
                
                const groupId = this.lastID;
                
                db.run(`INSERT INTO group_members (group_id, user_id) VALUES (?, ?)`,
                    [groupId, creator_id || 1],
                    function(err) {
                        if (err) {
                            console.error('Error adding creator to group:', err);
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
        console.error('Server error creating group:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

app.post('/api/groups/join', (req, res) => {
    const { invite_code, user_id } = req.body;
    
    db.get(`SELECT * FROM groups WHERE invite_code = ? AND is_active = 1`, [invite_code], (err, group) => {
        if (err || !group) {
            return res.status(404).json({ error: 'Группа не найдена или код неверный' });
        }
        
        db.run(`INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)`,
            [group.id, user_id || 1],
            function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Ошибка при присоединении к группе' });
                }
                
                res.json({
                    status: 'success',
                    group_name: group.name,
                    message: 'Вы успешно присоединились к группе!'
                });
            }
        );
    });
});

app.get('/api/groups/:group_id', (req, res) => {
    const groupId = req.params.group_id;
    
    db.get(`SELECT * FROM groups WHERE id = ? AND is_active = 1`, [groupId], (err, group) => {
        if (err || !group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        db.all(`
            SELECT u.id, u.first_name, u.username, gm.joined_at
            FROM group_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.group_id = ? AND gm.is_active = 1
            ORDER BY gm.joined_at ASC
        `, [groupId], (err, members) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            res.json({
                group,
                members: members || []
            });
        });
    });
});

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
        
        res.json({ leaders: leaders || [] });
    });
});

app.get('/api/analytics/:user_id', (req, res) => {
    const userId = req.params.user_id;
    
    db.get(`SELECT * FROM leaderboard WHERE user_id = ?`, [userId], (err, leaderStats) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        res.json({
            leader_stats: leaderStats || {
                total_workout_days: 0,
                current_streak: 0,
                longest_streak: 0
            }
        });
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Функция запуска сервера
function startServer() {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('🚀 TrainPlan Server Started on port', PORT);
        console.log('📊 Health check: http://localhost:' + PORT + '/health');
        
        setTimeout(() => {
            updateCurrentWeek();
        }, 1000);
        
        console.log('🤖 Bot temporarily disabled to avoid conflicts');
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${PORT} is already in use`);
        } else {
            console.error('❌ Server error:', error);
        }
        process.exit(1);
    });
}

process.once('SIGINT', () => {
    console.log('\n🛑 Stopping server...');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('\n🛑 Stopping server...');
    process.exit(0);
});