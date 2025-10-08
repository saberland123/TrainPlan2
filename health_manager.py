# health_manager.py
import sqlite3
from datetime import datetime, timedelta
import json

class HealthManager:
    def __init__(self, db_path='fitness_bot.db'):
        self.db_path = db_path
        self.init_health_tables()
    
    def init_health_tables(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Анкета здоровья
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
                medical_conditions TEXT,
                sleep_hours INTEGER,
                stress_level INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Рекомендации по здоровью
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS health_recommendations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                type TEXT,
                title TEXT,
                description TEXT,
                priority INTEGER,
                is_completed BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Напоминания
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS health_reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                reminder_type TEXT,
                message TEXT,
                scheduled_time TIME,
                is_active BOOLEAN DEFAULT TRUE,
                days_of_week TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def save_health_questionnaire(self, user_id, data):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO health_questionnaire 
            (user_id, age, weight, height, gender, fitness_level, goals, injuries, limitations, medical_conditions, sleep_hours, stress_level, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, data['age'], data['weight'], data['height'], data['gender'], 
              data['fitness_level'], json.dumps(data['goals']), json.dumps(data['injuries']),
              json.dumps(data['limitations']), data['medical_conditions'], data['sleep_hours'],
              data['stress_level'], datetime.now()))
        
        # Генерируем персональные рекомендации
        self.generate_health_recommendations(user_id, data)
        
        conn.commit()
        conn.close()
    
    def generate_health_recommendations(self, user_id, health_data):
        recommendations = []
        
        # Анализ данных и создание рекомендаций
        if health_data['sleep_hours'] < 7:
            recommendations.append({
                'type': 'sleep',
                'title': 'Улучшение качества сна',
                'description': 'Рекомендуется увеличить продолжительность сна до 7-9 часов для лучшего восстановления',
                'priority': 2
            })
        
        if health_data['stress_level'] > 7:
            recommendations.append({
                'type': 'stress',
                'title': 'Управление стрессом',
                'description': 'Высокий уровень стресса. Рекомендуются медитация, прогулки и дыхательные упражнения',
                'priority': 1
            })
        
        # Рекомендации по разминке/заминке
        recommendations.extend([
            {
                'type': 'warmup',
                'title': 'Обязательная разминка',
                'description': 'Перед каждой тренировкой выполняйте 5-10 минут динамической разминки',
                'priority': 1
            },
            {
                'type': 'cooldown',
                'title': 'Заминка после тренировки',
                'description': 'После тренировки уделите 5-10 минут растяжке основных мышечных групп',
                'priority': 2
            }
        ])
        
        # Сохраняем рекомендации
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        for rec in recommendations:
            cursor.execute('''
                INSERT INTO health_recommendations (user_id, type, title, description, priority)
                VALUES (?, ?, ?, ?, ?)
            ''', (user_id, rec['type'], rec['title'], rec['description'], rec['priority']))
        
        conn.commit()
        conn.close()