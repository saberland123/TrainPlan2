# exercise_library.py
import sqlite3
import json
import os
from typing import List, Dict

class ExerciseLibrary:
    def __init__(self, db_path='fitness_bot.db'):
        self.db_path = db_path
        self.init_exercise_tables()
        self.populate_exercise_library()
    
    def init_exercise_tables(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Основная таблица упражнений
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                category TEXT,
                muscle_group TEXT,
                equipment TEXT,
                difficulty TEXT,
                instructions TEXT,
                video_url TEXT,
                image_url TEXT,
                calories_burned INTEGER,
                is_custom BOOLEAN DEFAULT FALSE,
                created_by INTEGER,
                rating REAL DEFAULT 4.5,
                rating_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Избранные упражнения
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS favorite_exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                exercise_id INTEGER,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, exercise_id)
            )
        ''')
        
        # Отзывы на упражнения
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS exercise_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                exercise_id INTEGER,
                rating INTEGER,
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def populate_exercise_library(self):
        """Заполнение базы упражнений"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        exercises = [
            {
                'name': 'Жим штанги лежа',
                'description': 'Базовое упражнение для развития грудных мышц',
                'category': 'strength',
                'muscle_group': 'chest',
                'equipment': 'barbell, bench',
                'difficulty': 'intermediate',
                'instructions': json.dumps([
                    'Лягте на скамью, ноги firmly на полу',
                    'Возьмите штангу широким хватом',
                    'Опустите штангу к груди, сохраняя контроль',
                    'Выжмите штангу в исходное положение'
                ]),
                'calories_burned': 120
            },
            {
                'name': 'Приседания со штангой',
                'description': 'Фундаментальное упражнение для ног и всего тела',
                'category': 'strength',
                'muscle_group': 'legs',
                'equipment': 'barbell',
                'difficulty': 'intermediate',
                'instructions': json.dumps([
                    'Поместите штангу на трапеции',
                    'Держите спину прямой, грудь вперед',
                    'Опускайтесь до параллели с полом',
                    'Вернитесь в исходное положение'
                ]),
                'calories_burned': 180
            },
            # ... больше упражнений
        ]
        
        for exercise in exercises:
            cursor.execute('''
                INSERT OR IGNORE INTO exercises 
                (name, description, category, muscle_group, equipment, difficulty, instructions, calories_burned)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                exercise['name'], exercise['description'], exercise['category'],
                exercise['muscle_group'], exercise['equipment'], exercise['difficulty'],
                exercise['instructions'], exercise['calories_burned']
            ))
        
        conn.commit()
        conn.close()
    
    def search_exercises(self, filters: Dict = None) -> List[Dict]:
        """Поиск упражнений с фильтрами"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        query = "SELECT * FROM exercises WHERE 1=1"
        params = []
        
        if filters:
            if 'muscle_group' in filters:
                query += " AND muscle_group = ?"
                params.append(filters['muscle_group'])
            
            if 'equipment' in filters:
                query += " AND equipment LIKE ?"
                params.append(f'%{filters["equipment"]}%')
            
            if 'difficulty' in filters:
                query += " AND difficulty = ?"
                params.append(filters['difficulty'])
            
            if 'category' in filters:
                query += " AND category = ?"
                params.append(filters['category'])
        
        query += " ORDER BY rating DESC, name ASC"
        
        cursor.execute(query, params)
        exercises = cursor.fetchall()
        
        conn.close()
        return exercises
    
    def add_custom_exercise(self, user_id, exercise_data):
        """Добавление пользовательского упражнения"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO exercises 
            (name, description, category, muscle_group, equipment, difficulty, instructions, is_custom, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            exercise_data['name'], exercise_data['description'], exercise_data['category'],
            exercise_data['muscle_group'], exercise_data['equipment'], exercise_data['difficulty'],
            json.dumps(exercise_data['instructions']), True, user_id
        ))
        
        exercise_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return exercise_id