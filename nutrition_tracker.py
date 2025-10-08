# nutrition_tracker.py
import sqlite3
import json
from datetime import datetime, date
import logging

class NutritionTracker:
    def __init__(self, db_path='fitness_bot.db'):
        self.db_path = db_path
        self.init_nutrition_tables()
    
    def init_nutrition_tables(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # База продуктов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS food_database (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT,
                calories REAL,
                protein REAL,
                carbs REAL,
                fat REAL,
                fiber REAL,
                sugar REAL,
                serving_size TEXT,
                is_custom BOOLEAN DEFAULT FALSE,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Дневное питание
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS daily_nutrition (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                date DATE DEFAULT CURRENT_DATE,
                total_calories REAL DEFAULT 0,
                total_protein REAL DEFAULT 0,
                total_carbs REAL DEFAULT 0,
                total_fat REAL DEFAULT 0,
                goal_calories REAL,
                goal_protein REAL,
                goal_carbs REAL,
                goal_fat REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Приемы пищи
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                date DATE DEFAULT CURRENT_DATE,
                meal_type TEXT, -- breakfast, lunch, dinner, snack
                food_items TEXT, -- JSON список продуктов
                total_calories REAL,
                total_protein REAL,
                total_carbs REAL,
                total_fat REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Напоминания о еде
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meal_reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                meal_type TEXT,
                scheduled_time TIME,
                is_active BOOLEAN DEFAULT TRUE,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Инициализация базовых продуктов
        self.initialize_food_database(cursor)
        
        conn.commit()
        conn.close()
    
    def initialize_food_database(self, cursor):
        """Инициализация базы продуктов"""
        basic_foods = [
            ('Куриная грудка', 'protein', 165, 31, 0, 3.6, '100г'),
            ('Гречка', 'carbs', 343, 13, 72, 3.4, '100г сухой'),
            ('Овсянка', 'carbs', 389, 16, 66, 6.9, '100г сухой'),
            ('Яйцо куриное', 'protein', 155, 13, 1.1, 11, '1 шт (50г)'),
            ('Творог 5%', 'protein', 121, 17, 1.8, 5, '100г'),
            ('Банан', 'fruit', 89, 1.1, 23, 0.3, '1 шт (100г)'),
            ('Яблоко', 'fruit', 52, 0.3, 14, 0.2, '1 шт (150г)'),
            ('Лосось', 'protein', 208, 20, 0, 13, '100г'),
            ('Рис бурый', 'carbs', 111, 2.6, 23, 0.9, '100г вареный'),
            ('Брокколи', 'vegetable', 34, 2.8, 7, 0.4, '100г'),
        ]
        
        for food in basic_foods:
            cursor.execute('''
                INSERT OR IGNORE INTO food_database 
                (name, category, calories, protein, carbs, fat, serving_size)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', food)
    
    def calculate_daily_calories(self, user_id, health_data):
        """Расчет дневной нормы калорий"""
        # Формула Миффлина-Сан Жеора
        if health_data['gender'] == 'male':
            bmr = 10 * health_data['weight'] + 6.25 * health_data['height'] - 5 * health_data['age'] + 5
        else:
            bmr = 10 * health_data['weight'] + 6.25 * health_data['height'] - 5 * health_data['age'] - 161
        
        # Учет уровня активности
        activity_multipliers = {
            'sedentary': 1.2,
            'light': 1.375,
            'moderate': 1.55,
            'active': 1.725,
            'very_active': 1.9
        }
        
        activity_level = health_data.get('activity_level', 'moderate')
        tdee = bmr * activity_multipliers.get(activity_level, 1.55)
        
        # Корректировка по целям
        goals = health_data.get('goals', [])
        if 'weight_loss' in goals:
            tdee -= 500
        elif 'weight_gain' in goals:
            tdee += 500
        
        return {
            'calories': round(tdee),
            'protein': round(tdee * 0.3 / 4),  # 30% от калорий
            'carbs': round(tdee * 0.4 / 4),    # 40% от калорий
            'fat': round(tdee * 0.3 / 9)       # 30% от калорий
        }