# analytics_dashboard.py
import sqlite3
import json
from datetime import datetime, timedelta

class AnalyticsDashboard:
    def __init__(self, db_path='fitness_bot.db'):
        self.db_path = db_path
    
    def generate_progress_text(self, user_id, days=30):
        """Генерация текстового отчета прогресса"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Получаем базовую статистику
        cursor.execute('''
            SELECT COUNT(*) as workout_count,
                   MIN(date) as first_date,
                   MAX(date) as last_date
            FROM workouts 
            WHERE user_id = ? AND date >= date('now', ?)
        ''', (user_id, f'-{days} days'))
        
        stats = cursor.fetchone()
        conn.close()
        
        if stats and stats[0] > 0:
            workout_count, first_date, last_date = stats
            
            progress_text = f"""
📊 <b>Ваш прогресс за последние {days} дней</b>

✅ <b>Тренировки:</b>
• Выполнено: {workout_count} тренировок
• Первая тренировка: {first_date}
• Последняя тренировка: {last_date}
• Средняя частота: {round(workout_count / days, 1)} тренировок в неделю

🏆 <b>Рекомендации:</b>
• {'Отличная работа! Продолжайте в том же духе! 💪' if workout_count >= 12 else 'Можно увеличить частоту тренировок!'}
• {'🔥 Идеальная регулярность!' if workout_count >= 15 else 'Старайтесь заниматься 3-4 раза в неделю'}
"""
        else:
            progress_text = f"""
📊 <b>Ваш прогресс за последние {days} дней</b>

😔 Пока нет данных о тренировках за этот период.

💡 <b>Советы:</b>
• Начните с анкеты здоровья: /health
• Посмотрите доступные упражнения: /exercises
• Присоединитесь к челленджам: /challenges
"""
        
        return progress_text
    
    def export_user_data(self, user_id):
        """Экспорт данных пользователя в текстовом формате"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        export_data = "ФИТНЕС ОТЧЕТ\n"
        export_data += "=" * 50 + "\n\n"
        
        # Данные здоровья
        cursor.execute('SELECT * FROM health_questionnaire WHERE user_id = ?', (user_id,))
        health_data = cursor.fetchone()
        if health_data:
            export_data += "ДАННЫЕ ЗДОРОВЬЯ:\n"
            export_data += f"Возраст: {health_data[1]}\n"
            export_data += f"Вес: {health_data[2]} кг\n"
            export_data += f"Рост: {health_data[3]} см\n"
            export_data += f"Пол: {health_data[4]}\n"
            export_data += f"Уровень подготовки: {health_data[5]}\n\n"
        
        # Тренировки
        cursor.execute('SELECT * FROM workouts WHERE user_id = ? ORDER BY date', (user_id,))
        workouts = cursor.fetchall()
        if workouts:
            export_data += f"ТРЕНИРОВКИ ({len(workouts)}):\n"
            for workout in workouts:
                export_data += f"- {workout[2]}: {workout[3]}\n"
            export_data += "\n"
        
        conn.close()
        return export_data