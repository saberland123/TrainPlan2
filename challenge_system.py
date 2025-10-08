# challenge_system.py
import sqlite3
import json
from datetime import datetime, timedelta
import random

class ChallengeSystem:
    def __init__(self, db_path='fitness_bot.db'):
        self.db_path = db_path
        self.init_challenge_tables()
    
    def init_challenge_tables(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Челенджи
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                challenge_type TEXT, -- 'daily', 'weekly', 'monthly', 'special'
                goal_type TEXT, -- 'reps', 'weight', 'workouts', 'streak'
                goal_value INTEGER,
                reward_xp INTEGER,
                difficulty TEXT,
                start_date DATE,
                end_date DATE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Достижения пользователей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                achievement_type TEXT,
                achievement_name TEXT,
                achievement_data TEXT,
                earned_xp INTEGER,
                earned_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Прогресс по челенджам
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_challenges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                challenge_id INTEGER,
                current_progress INTEGER DEFAULT 0,
                is_completed BOOLEAN DEFAULT FALSE,
                completed_at DATETIME,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Уровни и опыт
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_levels (
                user_id INTEGER PRIMARY KEY,
                total_xp INTEGER DEFAULT 0,
                current_level INTEGER DEFAULT 1,
                workouts_completed INTEGER DEFAULT 0,
                streak_days INTEGER DEFAULT 0,
                last_workout_date DATE,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Инициализация базовых челенджей
        self.initialize_default_challenges(cursor)
        
        conn.commit()
        conn.close()
    
    def initialize_default_challenges(self, cursor):
        """Инициализация базовых челенджей и достижений"""
        
        # Еженедельные челенджи
        weekly_challenges = [
            ('Силовая неделя', 'Выполните 5 тренировок за неделю', 'weekly', 'workouts', 5, 250, 'medium'),
            ('Отжимания мастер', 'Сделайте 200 отжиманий за неделю', 'weekly', 'reps', 200, 150, 'easy'),
            ('Стальной пресс', '100 скручиваний за неделю', 'weekly', 'reps', 100, 120, 'easy'),
        ]
        
        for challenge in weekly_challenges:
            cursor.execute('''
                INSERT OR IGNORE INTO challenges 
                (name, description, challenge_type, goal_type, goal_value, reward_xp, difficulty)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', challenge)
        
        # Достижения
        achievements = [
            ('first_workout', 'Первая тренировка', 'Выполнили первую тренировку', 50),
            ('week_streak', 'Неделя тренировок', '7 дней подряд без пропусков', 100),
            ('month_streak', 'Месяц тренировок', '30 дней регулярных тренировок', 500),
            ('weight_milestone', 'Весовой рубеж', 'Побили личный рекорд в жиме', 200),
            ('consistent_training', 'Стабильность', '10 тренировок в месяц', 300),
        ]
        
        for achievement in achievements:
            cursor.execute('''
                INSERT OR IGNORE INTO achievements_template 
                (achievement_type, achievement_name, description, reward_xp)
                VALUES (?, ?, ?, ?)
            ''', achievement)
    
    def check_achievements(self, user_id):
        """Проверка и выдача достижений"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Проверяем различные достижения
        achievements_to_check = [
            self.check_streak_achievement(user_id, cursor),
            self.check_workout_count_achievement(user_id, cursor),
            self.check_weight_achievement(user_id, cursor),
        ]
        
        new_achievements = [a for a in achievements_to_check if a]
        
        conn.close()
        return new_achievements
    
    def check_streak_achievement(self, user_id, cursor):
        """Проверка достижений по серии тренировок"""
        cursor.execute('''
            SELECT streak_days FROM user_levels WHERE user_id = ?
        ''', (user_id,))
        
        result = cursor.fetchone()
        if result:
            streak_days = result[0]
            
            if streak_days >= 7:
                self.grant_achievement(user_id, 'week_streak', cursor)
            if streak_days >= 30:
                self.grant_achievement(user_id, 'month_streak', cursor)
    
    def grant_achievement(self, user_id, achievement_type, cursor):
        """Выдача достижения пользователю"""
        cursor.execute('''
            SELECT * FROM user_achievements 
            WHERE user_id = ? AND achievement_type = ?
        ''', (user_id, achievement_type))
        
        if not cursor.fetchone():
            cursor.execute('''
                INSERT INTO user_achievements (user_id, achievement_type, achievement_name, earned_xp)
                SELECT ?, achievement_type, achievement_name, reward_xp 
                FROM achievements_template 
                WHERE achievement_type = ?
            ''', (user_id, achievement_type))
            
            return True
        return False