const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const moment = require('moment-timezone');

const BOT_TOKEN = '8285829471:AAGehHp9CC1r6j1F7UArlcwUPG6Rex2RGMo';
const API_URL = 'http://localhost:3000/api';

const bot = new Telegraf(BOT_TOKEN);

// Хранилище временных данных
const userSessions = new Map();

// Команда старт
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const firstName = ctx.from.first_name;
    
    try {
        // Проверяем, зарегистрирован ли пользователь
        const response = await axios.get(`${API_URL}/user/telegram/${userId}`);
        
        if (response.data.user) {
            await ctx.reply(
                `С возвращением, ${firstName}! 🏋️\n\n` +
                `Ваши команды:\n` +
                `/plan - План тренировок\n` +
                `/today - Сегодняшняя тренировка\n` +
                `/stats - Статистика\n` +
                `/progress - Прогресс\n` +
                `/nutrition - Питание за сегодня\n` +
                `/water - Отметить воду\n` +
                `/challenges - Активные челленджи`
            );
        } else {
            await ctx.reply(
                `Привет, ${firstName}! 🎉\n\n` +
                `Я - ваш персональный фитнес-помощник TrainPlan Pro!\n\n` +
                `Для начала работы нужно зарегистрироваться в нашем веб-приложении:\n` +
                `http://localhost:3000\n\n` +
                `После регистрации вы сможете подключить Telegram и получать уведомления о тренировках! 💪`
            );
        }
    } catch (error) {
        await ctx.reply(
            `Привет, ${firstName}! 🎉\n\n` +
            `Я - ваш персональный фитнес-помощник TrainPlan Pro!\n\n` +
            `Для начала работы нужно зарегистрироваться в нашем веб-приложении:\n` +
            `http://localhost:3000\n\n` +
            `После регистрации вы сможете подключить Telegram и получать уведомления о тренировках! 💪`
        );
    }
});

// Команда просмотра плана
bot.command('plan', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const response = await axios.get(`${API_URL}/plan/telegram/${userId}`);
        const plan = response.data.plan;
        
        const today = new Date().getDay();
        const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
        
        let message = `📅 Ваш план тренировок:\n\n`;
        
        plan.forEach((day, index) => {
            const dayName = dayNames[index];
            const isToday = index === (today === 0 ? 6 : today - 1);
            const todayEmoji = isToday ? ' 🎯' : '';
            
            if (day.is_rest_day) {
                message += `${dayName}${todayEmoji} - 🏖️ Выходной\n`;
            } else {
                const exerciseCount = day.exercises.length;
                message += `${dayName}${todayEmoji} - 💪 ${exerciseCount} упражнений\n`;
                
                // Показываем первые 3 упражнения
                day.exercises.slice(0, 3).forEach(exercise => {
                    message += `   • ${exercise.name} (${exercise.sets}×${exercise.reps})\n`;
                });
                
                if (exerciseCount > 3) {
                    message += `   • ... и еще ${exerciseCount - 3} упражнений\n`;
                }
            }
            message += '\n';
        });
        
        await ctx.reply(message);
    } catch (error) {
        await ctx.reply('❌ Не удалось загрузить план тренировок. Сначала зарегистрируйтесь в веб-приложении.');
    }
});

// Команда сегодняшней тренировки
bot.command('today', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const response = await axios.get(`${API_URL}/plan/telegram/${userId}`);
        const plan = response.data.plan;
        
        const today = new Date().getDay();
        const dayIndex = today === 0 ? 6 : today - 1; // Преобразование к 0-6 (пн-вс)
        const todayPlan = plan[dayIndex];
        
        const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
        
        if (todayPlan.is_rest_day) {
            await ctx.reply(
                `🎉 Сегодня ${dayNames[dayIndex]} - выходной день!\n\n` +
                `Отдых - это важная часть тренировочного процесса. 💤\n` +
                `Дайте мышцам восстановиться для следующих тренировок!`
            );
        } else {
            let message = `🎯 Сегодня ${dayNames[dayIndex]} - день тренировки! 💪\n\n`;
            message += `Ваши упражнения на сегодня:\n\n`;
            
            todayPlan.exercises.forEach((exercise, index) => {
                message += `${index + 1}. ${exercise.name}\n`;
                message += `   Подходы: ${exercise.sets}\n`;
                message += `   Повторения: ${exercise.reps}\n`;
                if (exercise.rest) {
                    message += `   Отдых: ${exercise.rest}\n`;
                }
                message += '\n';
            });
            
            message += `Не забудьте сделать разминку перед тренировкой! 🔥`;
            
            await ctx.reply(message, Markup.inlineKeyboard([
                [Markup.button.callback('✅ Начать тренировку', 'start_workout')],
                [Markup.button.callback('🏁 Завершить тренировку', 'complete_workout')]
            ]));
        }
    } catch (error) {
        await ctx.reply('❌ Не удалось загрузить сегодняшнюю тренировку. Сначала зарегистрируйтесь в веб-приложении.');
    }
});

// Команда статистики
bot.command('stats', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const response = await axios.get(`${API_URL}/analytics/telegram/${userId}`);
        const stats = response.data.leader_stats;
        
        const message = `📊 Ваша статистика:\n\n` +
                       `💪 Тренировочных дней: ${stats.total_workout_days}\n` +
                       `🔥 Текущий стрик: ${stats.current_streak} дней\n` +
                       `🏆 Лучший стрик: ${stats.longest_streak} дней\n` +
                       `📈 Всего упражнений: ${stats.total_exercises}\n` +
                       `🎯 Завершено недель: ${stats.completed_weeks}\n\n` +
                       `Продолжайте в том же духе! 💫`;
        
        await ctx.reply(message);
    } catch (error) {
        await ctx.reply('❌ Не удалось загрузить статистику. Сначала зарегистрируйтесь в веб-приложении.');
    }
});

// Команда питания
bot.command('nutrition', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const response = await axios.get(`${API_URL}/nutrition/meals/telegram/${userId}`);
        const meals = response.data.meals;
        const healthResponse = await axios.get(`${API_URL}/health/profile/telegram/${userId}`);
        const health = healthResponse.data.health_profile;
        
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;
        
        let message = `🍎 Питание за сегодня:\n\n`;
        
        if (meals.length === 0) {
            message += `Еще нет записей о приемах пищи.\n`;
        } else {
            meals.forEach(meal => {
                message += `${getMealEmoji(meal.meal_type)} ${meal.meal_type}\n`;
                message += `Калории: ${meal.total_calories}\n`;
                message += `Белки: ${meal.total_protein}г\n`;
                message += `Углеводы: ${meal.total_carbs}г\n`;
                message += `Жиры: ${meal.total_fat}г\n\n`;
                
                totalCalories += meal.total_calories;
                totalProtein += meal.total_protein;
                totalCarbs += meal.total_carbs;
                totalFat += meal.total_fat;
            });
        }
        
        if (health.daily_calorie_target) {
            const remainingCalories = health.daily_calorie_target - totalCalories;
            message += `🎯 Цель: ${health.daily_calorie_target} ккал\n`;
            message += `📊 Съедено: ${totalCalories} ккал\n`;
            message += `⚖️ Осталось: ${remainingCalories} ккал\n\n`;
            
            if (remainingCalories > 0) {
                message += `Отлично! Вы в рамках цели! ✅`;
            } else {
                message += `Цель превышена. Завтра новый день! 🔄`;
            }
        }
        
        await ctx.reply(message);
    } catch (error) {
        await ctx.reply('❌ Не удалось загрузить данные о питании. Сначала зарегистрируйтесь в веб-приложении.');
    }
});

// Команда воды
bot.command('water', async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        await ctx.reply(
            `💧 Отметить потребление воды:\n\n` +
            `Сколько воды вы выпили?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('250 мл', 'water_250'), Markup.button.callback('500 мл', 'water_500')],
                [Markup.button.callback('1000 мл', 'water_1000'), Markup.button.callback('Другое количество', 'water_custom')]
            ])
        );
        
        // Сохраняем сессию для пользователя
        userSessions.set(userId, { action: 'water_tracking' });
    } catch (error) {
        await ctx.reply('❌ Ошибка при работе с водным трекером.');
    }
});

// Команда челленджей
bot.command('challenges', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const response = await axios.get(`${API_URL}/challenges/active/telegram/${userId}`);
        const challenges = response.data.challenges;
        
        if (challenges.length === 0) {
            await ctx.reply('🎯 На данный момент нет активных челленджей. Следите за обновлениями!');
            return;
        }
        
        let message = `🏆 Активные челленджи:\n\n`;
        
        challenges.forEach((challenge, index) => {
            message += `${index + 1}. ${challenge.name}\n`;
            message += `   ${challenge.description}\n`;
            message += `   Цель: ${challenge.goal_value} ${getGoalTypeText(challenge.goal_type)}\n`;
            
            if (challenge.current_progress !== undefined) {
                const progress = (challenge.current_progress / challenge.goal_value) * 100;
                message += `   Прогресс: ${challenge.current_progress}/${challenge.goal_value} (${progress.toFixed(1)}%)\n`;
            }
            
            if (challenge.end_date) {
                const endDate = moment(challenge.end_date);
                const daysLeft = endDate.diff(moment(), 'days');
                message += `   Осталось: ${daysLeft} дней\n`;
            }
            
            message += `   Участников: ${challenge.participant_count}\n\n`;
        });
        
        await ctx.reply(message, Markup.inlineKeyboard([
            [Markup.button.callback('🎯 Присоединиться к челленджу', 'join_challenge')]
        ]));
    } catch (error) {
        await ctx.reply('❌ Не удалось загрузить челленджи. Сначала зарегистрируйтесь в веб-приложении.');
    }
});

// Обработка inline кнопок
bot.action('start_workout', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('💪 Начинаем тренировку! Удачи! 🏋️\n\nНе забывайте про правильную технику!');
});

bot.action('complete_workout', async (ctx) => {
    await ctx.answerCbQuery();
    
    try {
        const userId = ctx.from.id;
        const today = new Date().getDay();
        const dayIndex = today === 0 ? 6 : today - 1;
        
        await axios.post(`${API_URL}/complete-workout/telegram`, {
            telegram_id: userId,
            day_of_week: dayIndex,
            exercises: [] // В реальном приложении нужно передать выполненные упражнения
        });
        
        await ctx.reply('🎉 Поздравляю с завершением тренировки! Вы становитесь сильнее! 💫');
    } catch (error) {
        await ctx.reply('❌ Не удалось отметить тренировку как завершенную.');
    }
});

// Обработка кнопок воды
bot.action(/water_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const amount = parseInt(ctx.match[1]);
    
    try {
        const userId = ctx.from.id;
        await axios.post(`${API_URL}/nutrition/water/telegram`, {
            telegram_id: userId,
            amount_ml: amount
        });
        
        const response = await axios.get(`${API_URL}/nutrition/water/telegram/${userId}`);
        const waterData = response.data;
        
        await ctx.reply(
            `✅ Добавлено ${amount} мл воды!\n\n` +
            `💧 Всего сегодня: ${waterData.total_ml} мл\n` +
            `🎯 Рекомендуется: ${waterData.recommended_ml} мл\n\n` +
            `Отличная гидратация! 💦`
        );
    } catch (error) {
        await ctx.reply('❌ Не удалось сохранить данные о воде.');
    }
});

// Вспомогательные функции
function getMealEmoji(mealType) {
    const emojis = {
        breakfast: '🌅',
        lunch: '🍽️',
        dinner: '🌙',
        snack: '🍎'
    };
    return emojis[mealType] || '🍴';
}

function getGoalTypeText(goalType) {
    const texts = {
        reps: 'повторений',
        days: 'дней',
        workouts: 'тренировок',
        calories: 'калорий',
        distance: 'км'
    };
    return texts[goalType] || goalType;
}

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
});

// Запуск бота
bot.launch().then(() => {
    console.log('🤖 Telegram Bot TrainPlan Pro запущен!');
}).catch(err => {
    console.error('Ошибка запуска бота:', err);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;