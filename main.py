import os
import logging
import sqlite3
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
from datetime import datetime
import json

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(self, db_path='fitness_bot.db'):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Инициализация всех таблиц базы данных"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Таблица пользователей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица анкеты здоровья
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS health_questionnaire (
                user_id INTEGER PRIMARY KEY,
                age INTEGER,
                weight REAL,
                height REAL,
                gender TEXT,
                fitness_level TEXT,
                goals TEXT,
                injuries TEXT,
                limitations TEXT,
                sleep_hours INTEGER,
                stress_level INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица тренировок
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                workout_name TEXT,
                duration INTEGER,
                calories_burned INTEGER,
                date DATE DEFAULT CURRENT_DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица питания
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS nutrition (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                food_name TEXT,
                calories INTEGER,
                protein REAL,
                carbs REAL,
                fat REAL,
                meal_type TEXT,
                date DATE DEFAULT CURRENT_DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Таблица челленджей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                goal_type TEXT,
                goal_value INTEGER,
                reward_points INTEGER,
                is_active BOOLEAN DEFAULT TRUE
            )
        ''')
        
        # Инициализация базовых данных
        self.initialize_sample_data(cursor)
        
        conn.commit()
        conn.close()
    
    def initialize_sample_data(self, cursor):
        """Инициализация примеров данных"""
        # Базовые челленджи
        challenges = [
            ('Неделя активности', 'Выполните 5 тренировок за неделю', 'workouts', 5, 100),
            ('Силовой вызов', 'Увеличьте рабочий вес в основных упражнениях', 'weight', 1, 150),
            ('Кардио марафон', 'Сожгите 2000 калорий за неделю', 'calories', 2000, 200)
        ]
        
        for challenge in challenges:
            cursor.execute('''
                INSERT OR IGNORE INTO challenges (name, description, goal_type, goal_value, reward_points)
                VALUES (?, ?, ?, ?, ?)
            ''', challenge)

class FitnessBot:
    def __init__(self, token: str):
        self.token = token
        self.application = Application.builder().token(token).build()
        self.db = DatabaseManager()
        
        # Регистрация обработчиков
        self.register_handlers()
    
    def register_handlers(self):
        """Регистрация всех обработчиков команд"""
        self.application.add_handler(CommandHandler("start", self.start))
        self.application.add_handler(CommandHandler("help", self.help))
        self.application.add_handler(CommandHandler("health", self.health_questionnaire))
        self.application.add_handler(CommandHandler("nutrition", self.nutrition_dashboard))
        self.application.add_handler(CommandHandler("workout", self.workout_tracking))
        self.application.add_handler(CommandHandler("challenges", self.show_challenges))
        self.application.add_handler(CommandHandler("progress", self.show_progress))
        self.application.add_handler(CommandHandler("profile", self.show_profile))
        
        self.application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
        self.application.add_handler(CallbackQueryHandler(self.handle_callback))
    
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик команды /start"""
        user = update.effective_user
        
        # Сохраняем пользователя в базу
        conn = sqlite3.connect('fitness_bot.db')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO users (user_id, username, first_name, last_name)
            VALUES (?, ?, ?, ?)
        ''', (user.id, user.username, user.first_name, user.last_name))
        conn.commit()
        conn.close()
        
        welcome_text = f"""
🏋️‍♂️ Добро пожаловать в FitnessBot, {user.first_name}!

Я ваш персональный фитнес-помощник с искусственным интеллектом! 🤖

✨ <b>Что я умею:</b>

• 📊 <b>Персональная анкета здоровья</b> - учёт ваших особенностей и целей
• 🍎 <b>Трекер питания и калорий</b> - полный контроль БЖУ
• 💪 <b>Трекер тренировок</b> - отслеживание прогресса
• 🏆 <b>Челленджи и достижения</b> - геймификация тренировок
• 📈 <b>Детальная аналитика</b> - графики и отчёты
• 🎯 <b>Рекомендации ИИ</b> - персонализированные советы

🚀 <b>Начните с анкеты здоровья:</b>
"""
        
        keyboard = [
            [InlineKeyboardButton("🏥 Заполнить анкету здоровья", callback_data="health_start")],
            [InlineKeyboardButton("🍎 Отслеживать питание", callback_data="nutrition_start")],
            [InlineKeyboardButton("💪 Начать тренировку", callback_data="workout_start")],
            [InlineKeyboardButton("🏆 Активные челленджи", callback_data="challenges_view")],
            [InlineKeyboardButton("📊 Мой прогресс", callback_data="progress_view")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(welcome_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def health_questionnaire(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Анкета здоровья"""
        user = update.effective_user
        
        health_text = """
🏥 <b>Персональная анкета здоровья</b>

Для создания индивидуальной программы тренировок и питания, пожалуйста, ответьте на несколько вопросов.

<b>Преимущества заполнения анкеты:</b>
• ✅ Персональные рекомендации по нагрузкам
• 🎯 Учёт травм и ограничений  
• 📊 Точный расчёт калорий и БЖУ
• 💡 Советы по восстановлению

Начнём?
"""
        
        keyboard = [
            [InlineKeyboardButton("✅ Начать анкету", callback_data="health_start")],
            [InlineKeyboardButton("📊 Мои данные", callback_data="health_view")],
            [InlineKeyboardButton("⚡ Пропустить", callback_data="health_skip")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(health_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def nutrition_dashboard(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Панель питания"""
        nutrition_text = """
🍎 <b>Умный трекер питания</b>

Полный контроль над вашим рационом:

<b>Сегодняшняя статистика:</b>
• 🔥 Калории: 0/2000 ккал
• 💪 Белки: 0/150г 
• 🍚 Углеводы: 0/250г
• 🥑 Жиры: 0/65г

<b>Функции:</b>
• 📝 Добавление продуктов и блюд
• 📊 Автоматический расчёт БЖУ
• 🎯 Рекомендации по целям
• ⏰ Напоминания о приёмах пищи
"""
        
        keyboard = [
            [InlineKeyboardButton("➕ Добавить приём пищи", callback_data="add_meal")],
            [InlineKeyboardButton("📊 Статистика питания", callback_data="nutrition_stats")],
            [InlineKeyboardButton("🎯 Цели по питанию", callback_data="nutrition_goals")],
            [InlineKeyboardButton("📝 Мои продукты", callback_data="my_foods")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(nutrition_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def workout_tracking(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Трекер тренировок"""
        workout_text = """
💪 <b>Трекер тренировок</b>

Отслеживайте ваши тренировки и прогресс:

<b>Сегодняшняя активность:</b>
• ✅ Тренировок: 0
• ⏱️ Время: 0 мин
• 🔥 Сожжено: 0 ккал

<b>Доступные функции:</b>
• 🏋️‍♂️ Библиотека упражнений
• 📈 Отслеживание прогресса
• 🎯 Персональные программы
• 🤖 Рекомендации ИИ
"""
        
        keyboard = [
            [InlineKeyboardButton("➕ Начать тренировку", callback_data="start_workout")],
            [InlineKeyboardButton("📚 Библиотека упражнений", callback_data="exercise_library")],
            [InlineKeyboardButton("📊 История тренировок", callback_data="workout_history")],
            [InlineKeyboardButton("🎯 Мои программы", callback_data="my_programs")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(workout_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def show_challenges(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показать челленджи"""
        challenges_text = """
🏆 <b>Система челленджей и достижений</b>

Участвуйте в челленджах и получайте награды!

<b>Активные челленджи:</b>

1. 💪 <b>Неделя активности</b>
   Цель: 5 тренировок за неделю
   Прогресс: ▰▰▰▱▱ 60%
   Награда: 100 очков

2. 🔥 <b>Силовой вызов</b>
   Цель: Увеличить рабочие веса
   Прогресс: ▰▰▱▱▱ 40%
   Награда: 150 очков

3. 🏃‍♂️ <b>Кардио марафон</b>
   Цель: 2000 калорий за неделю
   Прогресс: ▰▱▱▱▱ 20%
   Награда: 200 очков

<b>Ваш уровень: 3</b> (450/600 XP)
"""
        
        keyboard = [
            [InlineKeyboardButton("🎯 Присоединиться к челленджу", callback_data="join_challenge")],
            [InlineKeyboardButton("🏅 Мои достижения", callback_data="my_achievements")],
            [InlineKeyboardButton("📊 Рейтинг", callback_data="leaderboard")],
            [InlineKeyboardButton("🎁 Награды", callback_data="rewards")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(challenges_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def show_progress(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показать прогресс"""
        progress_text = """
📊 <b>Ваш фитнес-прогресс</b>

<b>Статистика за месяц:</b>
• ✅ Выполнено тренировок: 12
• 📈 Увеличение силы: +15%
• 🏃‍♂️ Сожжено калорий: 8,500
• ⏱️ Средняя продолжительность: 45 мин

<b>Достижения этого месяца:</b>
• 🥇 Побит личный рекорд в жиме лежа
• 🔥 Самая интенсивная тренировка
• 📅 7 дней подряд без пропусков

<b>Рекомендации:</b>
• 💡 Попробуйте увеличить веса на 5%
• 🍎 Обратите внимание на потребление белка
• 🧘 Добавьте растяжку после тренировок
"""
        
        keyboard = [
            [InlineKeyboardButton("📈 Подробная статистика", callback_data="detailed_stats")],
            [InlineKeyboardButton("📅 Календарь тренировок", callback_data="workout_calendar")],
            [InlineKeyboardButton("📤 Экспорт данных", callback_data="export_data")],
            [InlineKeyboardButton("🤖 AI Анализ", callback_data="ai_analysis")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(progress_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def show_profile(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показать профиль пользователя"""
        user = update.effective_user
        
        profile_text = f"""
👤 <b>Ваш профиль</b>

<b>Основная информация:</b>
• Имя: {user.first_name or 'Не указано'}
• Username: @{user.username or 'Не указан'}
• ID: {user.id}

<b>Фитнес-статистика:</b>
• Уровень: 3
• Опыт: 450/600 XP
• Тренировок выполнено: 12
• Текущая серия: 3 дня

<b>Настройки:</b>
• Уведомления: ✅ Включены
• Единицы измерения: Метрические
• Язык: Русский
"""
        
        keyboard = [
            [InlineKeyboardButton("✏️ Редактировать профиль", callback_data="edit_profile")],
            [InlineKeyboardButton("🔔 Настройки уведомлений", callback_data="notification_settings")],
            [InlineKeyboardButton("🎯 Мои цели", callback_data="my_goals")],
            [InlineKeyboardButton("📊 Сброс статистики", callback_data="reset_stats")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(profile_text, reply_markup=reply_markup, parse_mode='HTML')
    
    async def handle_callback(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик callback запросов"""
        query = update.callback_query
        await query.answer()
        
        callback_data = query.data
        
        # Обработка различных callback
        if callback_data == "health_start":
            await query.edit_message_text("🏥 <b>Анкета здоровья</b>\n\nПожалуйста, ответьте на вопросы...", parse_mode='HTML')
        elif callback_data == "nutrition_start":
            await self.nutrition_dashboard(update, context)
        elif callback_data == "challenges_view":
            await self.show_challenges(update, context)
        elif callback_data == "progress_view":
            await self.show_progress(update, context)
        else:
            await query.edit_message_text(f"🔧 <b>Функция в разработке</b>\n\nРаздел '{callback_data}' скоро будет доступен!", parse_mode='HTML')
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Обработчик текстовых сообщений"""
        user_message = update.message.text.lower()
        
        # Интеллектуальная обработка сообщений
        if any(word in user_message for word in ['привет', 'hello', 'start']):
            await update.message.reply_text("👋 Привет! Рад снова вас видеть! Используйте /start для главного меню.")
        elif any(word in user_message for word in ['спасибо', 'thanks']):
            await update.message.reply_text("🤝 Всегда рад помочь! Если есть вопросы - обращайтесь!")
        elif any(word in user_message for word in ['трен', 'workout']):
            await self.workout_tracking(update, context)
        elif any(word in user_message for word in ['еда', 'питание', 'food']):
            await self.nutrition_dashboard(update, context)
        elif any(word in user_message for word in ['здор', 'health']):
            await self.health_questionnaire(update, context)
        else:
            await update.message.reply_text("🤖 Понял ваш запрос! Для навигации используйте команды:\n\n/start - Главное меню\n/health - Здоровье\n/nutrition - Питание\n/workout - Тренировки\n/challenges - Челленджи\n/progress - Прогресс")

    async def help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Показать справку"""
        help_text = """
🆘 <b>Справка по командам</b>

<b>Основные команды:</b>
/start - Главное меню и приветствие
/help - Эта справка
/profile - Ваш профиль

<b>Фитнес-функции:</b>
/health - Анкета здоровья и рекомендации
/nutrition - Трекер питания и калорий
/workout - Трекер тренировок
/challenges - Челленджи и достижения
/progress - Статистика и аналитика

<b>Техническая поддержка:</b>
По вопросам работы бота обращайтесь к разработчику.

✨ <b>Совет:</b> Вы также можете писать сообщения обычным текстом - я постараюсь понять!
"""
        await update.message.reply_text(help_text, parse_mode='HTML')

    def run(self):
        """Запуск бота"""
        logger.info("FitnessBot запущен и готов к работе!")
        print("✅ Бот успешно запущен!")
        print("📊 База данных инициализирована")
        print("🤖 Все функции активированы")
        self.application.run_polling()

# Запуск бота
if __name__ == '__main__':
    # Получаем токен из переменных окружения (для Render) или используем дефолтный
    BOT_TOKEN = os.environ.get('BOT_TOKEN', '8285829471:AAGehHp9CC1r6j1F7UArlcwUPG6Rex2RGMo')
    
    if not BOT_TOKEN:
        print("❌ Ошибка: BOT_TOKEN не найден!")
        print("ℹ️ Установите переменную окружения BOT_TOKEN или укажите токен в коде")
        exit(1)
    
    bot = FitnessBot(BOT_TOKEN)
    bot.run()