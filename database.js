// database.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Путь к файлу нашей базы данных
const DB_FILE = './trainplan.db';

let db;

// Функция для инициализации базы данных
async function initDb() {
    db = await open({
        filename: DB_FILE,
        driver: sqlite3.Database
    });

    console.log('Подключено к базе данных SQLite.');

    // Создаем таблицы, если их еще нет
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_id INTEGER UNIQUE NOT NULL,
            first_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            day_of_week INTEGER NOT NULL, -- 0=Пн, 1=Вт, ...
            is_rest_day BOOLEAN DEFAULT FALSE,
            training_time TEXT, -- Время начала тренировки, например "19:00"
            UNIQUE(user_id, day_of_week) -- У одного юзера не может быть двух понедельников
        );
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            sets TEXT NOT NULL,
            reps TEXT NOT NULL,
            order_index INTEGER NOT NULL -- Порядок выполнения
        );
    `);

    console.log('Таблицы успешно созданы/проверены.');
    return db;
}

// Функция для получения подключения к БД
function getDb() {
    if (!db) {
        throw new Error('База данных не инициализирована! Вызовите initDb() сначала.');
    }
    return db;
}

module.exports = { initDb, getDb };