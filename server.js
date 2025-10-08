const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const schedule = require('node-schedule');
const moment = require('moment-timezone');
const { Telegraf } = require('telegraf');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'trainplan_secret_key_2024_production';
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';

// Инициализация бота (если токен указан)
let bot = null;
if (BOT_TOKEN && BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
    bot = new Telegraf(BOT_TOKEN);
    console.log('🤖 Telegram Bot инициализирован');
}

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Инициализация БД
const db = new sqlite3.Database('./trainplan.db');

// Создаем ВСЕ таблицы
db.serialize(() => {
  // Таблица пользователей
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    email TEXT,
    telegram_id INTEGER UNIQUE,
    timezone TEXT DEFAULT 'Europe/Moscow',
    theme TEXT DEFAULT 'dark',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1
  )`);

  // Таблица планов тренировок
  db.run(`CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    plan_data TEXT,
    week_start_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Таблица групп
  db.run(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    invite_code TEXT UNIQUE,
    creator_id INTEGER,
    plan_type TEXT DEFAULT 'week',
    is_public BOOLEAN DEFAULT 0,
    max_members INTEGER DEFAULT 50,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(creator_id) REFERENCES users(id)
  )`);

  // Таблица участников групп
  db.run(`CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    user_id INTEGER,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(group_id, user_id)
  )`);

  // Таблица статистики
  db.run(`CREATE TABLE IF NOT EXISTS user_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    total_workout_days INTEGER DEFAULT 0,
    completed_weeks INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    total_exercises INTEGER DEFAULT 0,
    total_weight_lifted INTEGER DEFAULT 0,
    favorite_exercise TEXT,
    last_workout_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Таблица выполненных тренировок
  db.run(`CREATE TABLE IF NOT EXISTS completed_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    workout_date DATE DEFAULT CURRENT_DATE,
    day_of_week INTEGER,
    exercises_completed INTEGER,
    total_exercises INTEGER,
    workout_duration INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Таблица упражнений (библиотека)
  db.run(`CREATE TABLE IF NOT EXISTS exercise_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    muscle_group TEXT,
    difficulty TEXT DEFAULT 'beginner',
    equipment TEXT DEFAULT 'bodyweight',
    image_url TEXT,
    video_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица шаблонов тренировок
  db.run(`CREATE TABLE IF NOT EXISTS workout_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    difficulty TEXT,
    duration_weeks INTEGER DEFAULT 1,
    template_data TEXT,
    created_by INTEGER,
    is_public BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  // Таблица напоминаний
  db.run(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    day_of_week INTEGER,
    reminder_time TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Таблица избранных упражнений
  db.run(`CREATE TABLE IF NOT EXISTS favorite_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    exercise_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(exercise_id) REFERENCES exercise_library(id),
    UNIQUE(user_id, exercise_id)
  )`);

  console.log('✅ Все таблицы базы данных созданы/проверены');
});

// Middleware для проверки JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен доступа отсутствует' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Неверный токен' });
    }
    req.user = user;
    next();
  });
};

// ==================== СИСТЕМА АУТЕНТИФИКАЦИИ ====================

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, firstName, email, telegramId } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    }

    db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка базы данных' });
      }

      if (row) {
        return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      db.run(
        'INSERT INTO users (username, password, first_name, email, telegram_id) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, firstName || username, email || null, telegramId || null],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Ошибка при создании пользователя' });
          }

          const userId = this.lastID;

          // Создаем запись статистики
          db.run('INSERT INTO user_stats (user_id) VALUES (?)', [userId]);

          // Создаем пустой план тренировок
          const emptyPlan = Array(7).fill().map((_, index) => ({
            day_of_week: index,
            is_rest_day: index === 2 || index === 4 || index === 6, // Среда, пятница, воскресенье - выходные
            notification_time: '19:00',
            exercises: []
          }));

          db.run(
            'INSERT INTO workout_plans (user_id, plan_data, week_start_date) VALUES (?, ?, DATE("now"))',
            [userId, JSON.stringify(emptyPlan)]
          );

          // Создаем напоминания по умолчанию
          const defaultReminders = [
            { day_of_week: 0, reminder_time: '19:00' }, // Понедельник
            { day_of_week: 1, reminder_time: '19:00' }, // Вторник
            { day_of_week: 3, reminder_time: '19:00' }, // Четверг
            { day_of_week: 5, reminder_time: '10:00' }  // Суббота
          ];

          defaultReminders.forEach(reminder => {
            db.run(
              'INSERT INTO reminders (user_id, day_of_week, reminder_time) VALUES (?, ?, ?)',
              [userId, reminder.day_of_week, reminder.reminder_time]
            );
          });

          const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '30d' });

          res.json({
            success: true,
            message: 'Пользователь успешно зарегистрирован',
            token,
            user: { id: userId, username, first_name: firstName || username }
          });
        }
      );
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
    }

    db.get(
      'SELECT * FROM users WHERE username = ? AND is_active = 1',
      [username],
      async (err, user) => {
        if (err) {
          return res.status(500).json({ error: 'Ошибка базы данных' });
        }

        if (!user) {
          return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
        }

        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
          success: true,
          message: 'Вход выполнен успешно',
          token,
          user: {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            email: user.email,
            telegram_id: user.telegram_id
          }
        });
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ==================== СИСТЕМА ПЛАНОВ ТРЕНИРОВОК ====================

app.get('/api/plan', authenticateToken, (req, res) => {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return date.toISOString().split('T')[0];
  });

  db.get(
    'SELECT plan_data FROM workout_plans WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
    [req.user.userId],
    (err, row) => {
      let plan = [];
      
      if (row && row.plan_data) {
        plan = JSON.parse(row.plan_data);
      } else {
        plan = Array(7).fill().map((_, i) => ({
          day_of_week: i,
          is_rest_day: i === 2 || i === 4 || i === 6,
          notification_time: '19:00',
          exercises: []
        }));
        
        db.run(
          'INSERT INTO workout_plans (user_id, plan_data, week_start_date) VALUES (?, ?, ?)',
          [req.user.userId, JSON.stringify(plan), weekDates[0]]
        );
      }

      res.json({
        plan: plan,
        weekDates: weekDates,
        weekNumber: Math.floor((today - new Date(today.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000)),
        currentDay: today.getDay() === 0 ? 6 : today.getDay() - 1 // Преобразование к 0-6 (пн-вс)
      });
    }
  );
});

app.post('/api/plan', authenticateToken, (req, res) => {
  const { plan, weekDates } = req.body;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: 'Неверный формат плана' });
  }

  const weekStart = weekDates && weekDates[0] ? weekDates[0] : new Date().toISOString().split('T')[0];

  db.run(
    'INSERT OR REPLACE INTO workout_plans (user_id, plan_data, week_start_date, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [req.user.userId, JSON.stringify(plan), weekStart],
    function(err) {
      if (err) {
        console.error('Error saving plan:', err);
        return res.status(500).json({ error: 'Ошибка при сохранении плана' });
      }
      res.json({ success: true, message: 'План успешно сохранен' });
    }
  );
});

// ==================== БАЗОВЫЕ ПЛАНЫ И ШАБЛОНЫ ====================

app.post('/api/load-default-plan', authenticateToken, (req, res) => {
  const defaultPlan = [
    {
      day_of_week: 0,
      is_rest_day: false,
      notification_time: '19:00',
      exercises: [
        { name: "Отжимания", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Приседания", sets: 3, reps: "15-20", rest: "60s" },
        { name: "Планка", sets: 3, reps: "30-45 секунд", rest: "30s" }
      ]
    },
    {
      day_of_week: 1,
      is_rest_day: false,
      notification_time: '19:00',
      exercises: [
        { name: "Подтягивания", sets: 3, reps: "5-8", rest: "90s" },
        { name: "Скручивания", sets: 3, reps: "15-20", rest: "45s" },
        { name: "Берпи", sets: 3, reps: "10", rest: "60s" }
      ]
    },
    { 
      day_of_week: 2, 
      is_rest_day: true, 
      notification_time: '19:00',
      exercises: [] 
    },
    {
      day_of_week: 3,
      is_rest_day: false,
      notification_time: '19:00',
      exercises: [
        { name: "Выпады", sets: 3, reps: "10-12", rest: "60s" },
        { name: "Отжимания на брусьях", sets: 3, reps: "8-10", rest: "75s" },
        { name: "Велосипед", sets: 3, reps: "20", rest: "45s" }
      ]
    },
    { 
      day_of_week: 4, 
      is_rest_day: true, 
      notification_time: '19:00',
      exercises: [] 
    },
    {
      day_of_week: 5,
      is_rest_day: false,
      notification_time: '10:00',
      exercises: [
        { name: "Бег", sets: 1, reps: "20-30 минут", rest: "0s" },
        { name: "Прыжки на скакалке", sets: 3, reps: "50", rest: "45s" },
        { name: "Планка боковая", sets: 3, reps: "30 секунд", rest: "30s" }
      ]
    },
    { 
      day_of_week: 6, 
      is_rest_day: true, 
      notification_time: '19:00',
      exercises: [] 
    }
  ];

  const weekStart = new Date().toISOString().split('T')[0];

  db.run(
    'INSERT OR REPLACE INTO workout_plans (user_id, plan_data, week_start_date, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
    [req.user.userId, JSON.stringify(defaultPlan), weekStart],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при загрузке базового плана' });
      }
      res.json({ success: true, message: 'Базовый план загружен', plan: defaultPlan });
    }
  );
});

// ==================== СИСТЕМА ГРУПП ====================

app.get('/api/groups/user/:userId', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  
  db.all(
    `SELECT g.*, 
            COUNT(gm.user_id) as member_count,
            u.username as creator_name
     FROM groups g
     LEFT JOIN group_members gm ON g.id = gm.group_id
     LEFT JOIN users u ON g.creator_id = u.id
     WHERE gm.user_id = ?
     GROUP BY g.id
     ORDER BY g.created_at DESC`,
    [userId],
    (err, groups) => {
      if (err) {
        console.error('Error loading groups:', err);
        return res.status(500).json({ error: 'Ошибка при загрузке групп' });
      }
      res.json({ groups: groups || [] });
    }
  );
});

app.post('/api/groups/create', authenticateToken, (req, res) => {
  const { name, description, plan_type, is_public, max_members } = req.body;
  const creatorId = req.user.userId;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название группы обязательно' });
  }

  const inviteCode = generateInviteCode();

  db.run(
    `INSERT INTO groups (name, description, invite_code, creator_id, plan_type, is_public, max_members) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name.trim(), description?.trim() || '', inviteCode, creatorId, plan_type || 'week', is_public || false, max_members || 50],
    function(err) {
      if (err) {
        console.error('Error creating group:', err);
        return res.status(500).json({ error: 'Ошибка при создании группы' });
      }

      const groupId = this.lastID;

      db.run(
        'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)',
        [groupId, creatorId, 'admin'],
        function(err) {
          if (err) {
            console.error('Error adding creator to group:', err);
          }

          res.json({ 
            success: true, 
            group_id: groupId, 
            invite_code: inviteCode,
            message: 'Группа создана успешно'
          });
        }
      );
    }
  );
});

// ==================== ЛИДЕРБОРД И СТАТИСТИКА ====================

app.get('/api/leaderboard', authenticateToken, (req, res) => {
  db.all(
    `SELECT u.username, u.first_name, 
            us.total_workout_days, 
            us.current_streak,
            us.longest_streak,
            us.total_exercises,
            (SELECT COUNT(*) FROM completed_workouts cw WHERE cw.user_id = u.id AND cw.workout_date >= DATE('now', '-7 days')) as recent_workouts
     FROM user_stats us
     JOIN users u ON us.user_id = u.id
     WHERE us.total_workout_days > 0 AND u.is_active = 1
     ORDER BY us.current_streak DESC, us.total_workout_days DESC
     LIMIT 50`,
    (err, leaders) => {
      if (err) {
        console.error('Error loading leaderboard:', err);
        return res.status(500).json({ error: 'Ошибка при загрузке таблицы лидеров' });
      }
      res.json({ leaders: leaders || [] });
    }
  );
});

app.get('/api/analytics/:userId', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.get(
    `SELECT us.total_workout_days, us.completed_weeks, 
            us.current_streak, us.longest_streak,
            us.total_exercises, us.total_weight_lifted,
            us.favorite_exercise,
            (SELECT COUNT(*) FROM completed_workouts cw WHERE cw.user_id = ? AND cw.workout_date >= DATE('now', '-30 days')) as monthly_workouts,
            (SELECT AVG(exercises_completed) FROM completed_workouts cw WHERE cw.user_id = ?) as avg_exercises_per_workout
     FROM user_stats us
     WHERE us.user_id = ?`,
    [userId, userId, userId],
    (err, stats) => {
      if (err) {
        console.error('Error loading analytics:', err);
        return res.status(500).json({ error: 'Ошибка при загрузке статистики' });
      }

      // Получаем историю тренировок за последние 30 дней
      db.all(
        `SELECT workout_date, exercises_completed, workout_duration 
         FROM completed_workouts 
         WHERE user_id = ? AND workout_date >= DATE('now', '-30 days')
         ORDER BY workout_date`,
        [userId],
        (err, workoutHistory) => {
          res.json({
            leader_stats: stats || {
              total_workout_days: 0,
              completed_weeks: 0,
              current_streak: 0,
              longest_streak: 0,
              total_exercises: 0,
              total_weight_lifted: 0,
              favorite_exercise: null,
              monthly_workouts: 0,
              avg_exercises_per_workout: 0
            },
            workout_history: workoutHistory || []
          });
        }
      );
    }
  );
});

// ==================== СИСТЕМА ТРЕНИРОВОК ====================

app.post('/api/complete-workout', authenticateToken, (req, res) => {
  const { day_of_week, exercises, workout_duration, notes } = req.body;
  const userId = req.user.userId;

  if (day_of_week === undefined || !exercises) {
    return res.status(400).json({ error: 'Неверные данные тренировки' });
  }

  const today = new Date().toISOString().split('T')[0];

  db.get(
    'SELECT id FROM completed_workouts WHERE user_id = ? AND workout_date = ? AND day_of_week = ?',
    [userId, today, day_of_week],
    (err, existing) => {
      if (existing) {
        return res.status(400).json({ error: 'Тренировка на сегодня уже завершена' });
      }

      db.run(
        `INSERT INTO completed_workouts (user_id, workout_date, day_of_week, exercises_completed, total_exercises, workout_duration, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, today, day_of_week, exercises.length, exercises.length, workout_duration || 0, notes || ''],
        function(err) {
          if (err) {
            console.error('Error saving workout:', err);
            return res.status(500).json({ error: 'Ошибка при сохранении тренировки' });
          }

          updateUserStats(userId);

          // Отправляем мотивационное сообщение
          sendMotivationalMessage(userId);

          res.json({ 
            success: true, 
            message: 'Тренировка успешно завершена!',
            workout_id: this.lastID
          });
        }
      );
    }
  );
});

// ==================== БИБЛИОТЕКА УПРАЖНЕНИЙ ====================

app.get('/api/exercises/library', authenticateToken, (req, res) => {
  const { category, difficulty, equipment } = req.query;
  
  let query = `SELECT * FROM exercise_library WHERE 1=1`;
  const params = [];

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }
  
  if (difficulty) {
    query += ` AND difficulty = ?`;
    params.push(difficulty);
  }
  
  if (equipment) {
    query += ` AND equipment = ?`;
    params.push(equipment);
  }

  query += ` ORDER BY name ASC`;

  db.all(query, params, (err, exercises) => {
    if (err) {
      console.error('Error loading exercise library:', err);
      return res.status(500).json({ error: 'Ошибка при загрузке библиотеки упражнений' });
    }
    res.json({ exercises: exercises || [] });
  });
});

// ==================== СИСТЕМА НАПОМИНАНИЙ ====================

app.get('/api/reminders', authenticateToken, (req, res) => {
  const userId = req.user.userId;

  db.all(
    'SELECT * FROM reminders WHERE user_id = ? ORDER BY day_of_week',
    [userId],
    (err, reminders) => {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при загрузке напоминаний' });
      }
      res.json({ reminders: reminders || [] });
    }
  );
});

app.post('/api/reminders', authenticateToken, (req, res) => {
  const { day_of_week, reminder_time, is_active } = req.body;
  const userId = req.user.userId;

  db.run(
    'INSERT OR REPLACE INTO reminders (user_id, day_of_week, reminder_time, is_active) VALUES (?, ?, ?, ?)',
    [userId, day_of_week, reminder_time, is_active !== false],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ошибка при сохранении напоминания' });
      }
      res.json({ success: true, message: 'Напоминание сохранено' });
    }
  );
});

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function updateUserStats(userId) {
  db.get(
    'SELECT COUNT(DISTINCT workout_date) as total_days FROM completed_workouts WHERE user_id = ?',
    [userId],
    (err, result) => {
      if (!err && result) {
        const totalDays = result.total_days;

        // Вычисляем текущий стрик
        db.get(
          `SELECT COUNT(*) as streak
           FROM (
             SELECT workout_date, 
                    JULIANDAY(workout_date) - JULIANDAY(LAG(workout_date) OVER (ORDER BY workout_date)) as diff
             FROM completed_workouts 
             WHERE user_id = ? 
             ORDER BY workout_date DESC
           ) 
           WHERE diff = 1 OR diff IS NULL`,
          [userId],
          (err, streakResult) => {
            const currentStreak = streakResult ? streakResult.streak : 0;

            db.run(
              `UPDATE user_stats 
               SET total_workout_days = ?,
                   current_streak = ?,
                   longest_streak = MAX(longest_streak, ?),
                   last_workout_date = CURRENT_DATE,
                   updated_at = CURRENT_TIMESTAMP
               WHERE user_id = ?`,
              [totalDays, currentStreak, currentStreak, userId]
            );
          }
        );
      }
    }
  );
}

function sendMotivationalMessage(userId) {
  const messages = [
    "Отличная работа! 💪 Вы становитесь сильнее с каждой тренировкой!",
    "Поздравляем с завершением тренировки! 🎉 Ваше упорство впечатляет!",
    "Еще один шаг к вашей цели! 🔥 Продолжайте в том же духе!",
    "Ваше тело благодарит вас за эту тренировку! 🙏 Отличный прогресс!",
    "Сила не в том, чтобы никогда не падать, а в том, чтобы подниматься каждый раз! 💫",
    "Каждая тренировка делает вас ближе к лучшей версии себя! 🌟",
    "Вы доказали, что можете всё! 🚀 Гордитесь своим прогрессом!",
    "Тренировка завершена, но ваш путь к успеху продолжается! 🏆"
  ];

  const randomMessage = messages[Math.floor(Math.random() * messages.length)];

  // Здесь можно добавить отправку через Telegram бота
  console.log(`Мотивационное сообщение для пользователя ${userId}: ${randomMessage}`);
}

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ==================== ЗАПУСК СЕРВЕРА ====================

app.listen(PORT, () => {
  console.log(`🚀 Сервер TrainPlan запущен на порту ${PORT}`);
  console.log(`📱 Откройте http://localhost:${PORT} в браузере`);
  console.log(`🔐 Система аутентификации активна`);
  console.log(`💾 База данных: trainplan.db`);
  console.log(`🤖 Статус бота: ${bot ? 'АКТИВЕН' : 'НЕ АКТИВЕН (укажите BOT_TOKEN)'}`);
});