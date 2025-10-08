const { Telegraf, Markup } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const moment = require('moment-timezone');
const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN || '8285829471:AAGehHp9CC1r6j1F7UArlcwUPG6Rex2RGMo';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

if (BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.log('❌ BOT_TOKEN не указан. Бот не будет запущен.');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const db = new sqlite3.Database('./trainplan.db');

// Команда старт
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const firstName = ctx.from.first_name;
    
    try {
        // Проверяем, есть ли пользователь в базе
        const response = await axios.get(`${BACKEND_URL}/api/user/telegram/${userId}`);
        
        if (response.data.user) {
            // Пользователь найден
            await ctx.reply(
                `С возвращением, ${firstName}! 🏋️\n\n` +
                `Ваш аккаунт TrainPlan уже привязан. Используйте команды:\n` +
                `/plan - Посмотреть план на неделю\n` +
                `/today - Тренировка на сегодня\n` +
                `/stats - Моя статистика\n` +
                `/reminders - Настройка напоминаний`
            );
        } else {
            // Пользователь не найден, предлагаем зарегистрироваться
            await ctx.reply(
                `Привет, ${firstName}! 👋\n\n` +
                `Я - ваш персональный тренер TrainPlan! 🏋️\n\n` +
                `Чтобы начать использовать все функции, вам нужно:\n\n` +
                `1. Зарегистрироваться на сайте: ${BACKEND_URL}\n` +
                `2. В настройках привязать Telegram аккаунт\n\n` +
                `После регистрации вы сможете:\n` +
                `• Создавать планы тренировок\n` +
                `• Получать умные напоминания\n` +
                `• Отслеживать прогресс\n` +
                `• Соревноваться с друзьями`
            );
        }
    } catch (error) {
        console.error('Error in start command:', error);
        await ctx.reply(
            `Привет, ${firstName}! 👋\n\n` +
            `Я - ваш персональный тренер TrainPlan! 🏋️\n\n` +
            `Для начала работы посетите наш сайт: ${BACKEND_URL}`
        );
    }
});

// Команда просмотра плана на неделю
bot.command('plan', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        const response = await axios.get(`${BACKEND_URL}/api/user/telegram/${userId}`);
        if (!response.data.user) {
            return await ctx.reply('❌ Ваш аккаунт не привязан. Зарегистрируйтесь на сайте.');
        }

        const planResponse = await axios.get(`${BACKEND_URL}/api/plan`, {
            headers: { 'Authorization': `Bearer ${response.data.user.token}` }
        });

        const { plan, weekDates, currentDay } = planResponse.data;
        const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

        let message = `📅 Ваш план на неделю:\n\n`;
        
        plan.forEach((day, index) => {
            const date = weekDates ? new Date(weekDates[index]).getDate() : '';
            const isToday = index === currentDay;
            const dayHeader = `${dayNames[index]} ${date ? `(${date})` : ''}${isToday ? ' 🟢 СЕГОДНЯ' : ''}`;
            
            if (day.is_rest_day) {
                message += `🏖️ ${dayHeader} - Выходной\n`;
            } else {
                const exerciseCount = day.exercises ? day.exercises.length : 0;
                message += `💪 ${dayHeader} - ${exerciseCount} упражн.\n`;
                
                // Показываем первые 2 упражнения
                if (day.exercises && day.exercises.length > 0) {
                    day.exercises.slice(0, 2).forEach(ex => {
                        message += `   • ${ex.name} (${ex.sets}×${ex.reps})\n`;
                    });
                    if (day.exercises.length > 2) {
                        message += `   • ... и еще ${day.exercises.length - 2}\n`;
                    }
                }
            }
            message += '\n';
        });

        await ctx.reply(message);

        // Добавляем кнопки для быстрых действий
        if (currentDay !== undefined && !plan[currentDay].is_rest_day) {
            await ctx.reply(
                'Сегодня у вас тренировка! Хотите начать?',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🏁 Начать тренировку', `start_workout_${currentDay}`)],
                    [Markup.button.callback('📊 Посмотреть статистику', 'show_stats')]
                ])
            );
        }

    } catch (error) {
        console.error('Error in plan command:', error);
        await ctx.reply('❌ Ошибка при загрузке плана. Попробуйте позже.');
    }
});

// Команда тренировки на сегодня
bot.command('today', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        const response = await axios.get(`${BACKEND_URL}/api/user/telegram/${userId}`);
        if (!response.data.user) {
            return await ctx.reply('❌ Ваш аккаунт не привязан. Зарегистрируйтесь на сайте.');
        }

        const planResponse = await axios.get(`${BACKEND_URL}/api/plan`, {
            headers: { 'Authorization': `Bearer ${response.data.user.token}` }
        });

        const { plan, currentDay } = planResponse.data;
        const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
        
        if (currentDay === undefined) {
            return await ctx.reply('❌ Не удалось определить текущий день.');
        }

        const todayPlan = plan[currentDay];
        const dayName = dayNames[currentDay];

        if (todayPlan.is_rest_day) {
            await ctx.reply(
                `🏖️ ${dayName} - Выходной день!\n\n` +
                `Отдых - важная часть тренировочного процесса. ` +
                `Восстанавливайтесь и готовьтесь к следующим тренировкам! 💫`
            );
        } else {
            let message = `💪 Тренировка на ${dayName}:\n\n`;
            
            if (todayPlan.exercises && todayPlan.exercises.length > 0) {
                todayPlan.exercises.forEach((ex, index) => {
                    message += `${index + 1}. ${ex.name}\n`;
                    message += `   Подходы: ${ex.sets}\n`;
                    message += `   Повторения: ${ex.reps}\n`;
                    if (ex.rest) message += `   Отдых: ${ex.rest}\n`;
                    message += '\n';
                });
            } else {
                message += 'На сегодня нет запланированных упражнений.\n';
            }

            message += `⏰ Напоминание: ${todayPlan.notification_time}`;

            await ctx.reply(message, 
                Markup.inlineKeyboard([
                    [Markup.button.callback('🏁 Начать тренировку', `start_workout_${currentDay}`)],
                    [Markup.button.callback('✅ Завершить тренировку', `complete_workout_${currentDay}`)]
                ])
            );
        }

    } catch (error) {
        console.error('Error in today command:', error);
        await ctx.reply('❌ Ошибка при загрузке данных. Попробуйте позже.');
    }
});

// Команда статистики
bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        const response = await axios.get(`${BACKEND_URL}/api/user/telegram/${userId}`);
        if (!response.data.user) {
            return await ctx.reply('❌ Ваш аккаунт не привязан. Зарегистрируйтесь на сайте.');
        }

        const statsResponse = await axios.get(`${BACKEND_URL}/api/analytics/${response.data.user.id}`, {
            headers: { 'Authorization': `Bearer ${response.data.user.token}` }
        });

        const stats = statsResponse.data.leader_stats;

        const message = 
            `📊 Ваша статистика:\n\n` +
            `🏋️ Всего тренировок: ${stats.total_workout_days}\n` +
            `📅 Завершено недель: ${stats.completed_weeks}\n` +
            `🔥 Текущий стрик: ${stats.current_streak} дней\n` +
            `🏆 Лучший стрик: ${stats.longest_streak} дней\n` +
            `💪 Всего упражнений: ${stats.total_exercises}\n\n` +
            `Продолжайте в том же духе! 💫`;

        await ctx.reply(message);

    } catch (error) {
        console.error('Error in stats command:', error);
        await ctx.reply('❌ Ошибка при загрузке статистики. Попробуйте позже.');
    }
});

// Обработка inline кнопок
bot.action(/start_workout_(\d+)/, async (ctx) => {
    const dayIndex = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await ctx.reply(`🏋️ Начинаем тренировку! Следуйте вашему плану и отмечайте выполненные упражнения в приложении. Удачи! 💪`);
});

bot.action(/complete_workout_(\d+)/, async (ctx) => {
    const dayIndex = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    
    try {
        const response = await axios.get(`${BACKEND_URL}/api/user/telegram/${userId}`);
        if (!response.data.user) {
            return await ctx.answerCbQuery('❌ Аккаунт не привязан', { show_alert: true });
        }

        const planResponse = await axios.get(`${BACKEND_URL}/api/plan`, {
            headers: { 'Authorization': `Bearer ${response.data.user.token}` }
        });

        const todayPlan = planResponse.data.plan[dayIndex];
        
        await axios.post(`${BACKEND_URL}/api/complete-workout`, {
            day_of_week: dayIndex,
            exercises: todayPlan.exercises,
            workout_duration: 45, // Примерная длительность
            notes: 'Завершено через Telegram бота'
        }, {
            headers: { 'Authorization': `Bearer ${response.data.user.token}` }
        });

        await ctx.answerCbQuery('🎉 Тренировка завершена!', { show_alert: true });
        await ctx.reply('✅ Тренировка успешно завершена! Отличная работа! 💪\n\nВаша статистика обновлена.');

    } catch (error) {
        console.error('Error completing workout:', error);
        await ctx.answerCbQuery('❌ Ошибка при завершении тренировки', { show_alert: true });
    }
});

// Команда напоминаний
bot.command('reminders', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        const response = await axios.get(`${BACKEND_URL}/api/user/telegram/${userId}`);
        if (!response.data.user) {
            return await ctx.reply('❌ Ваш аккаунт не привязан. Зарегистрируйтесь на сайте.');
        }

        const remindersResponse = await axios.get(`${BACKEND_URL}/api/reminders`, {
            headers: { 'Authorization': `Bearer ${response.data.user.token}` }
        });

        const reminders = remindersResponse.data.reminders;
        const dayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

        if (reminders.length === 0) {
            return await ctx.reply('⏰ У вас нет настроенных напоминаний.\n\nНастройте их в веб-приложении.');
        }

        let message = '⏰ Ваши напоминания:\n\n';
        
        reminders.forEach(reminder => {
            const status = reminder.is_active ? '✅' : '❌';
            message += `${status} ${dayNames[reminder.day_of_week]}: ${reminder.reminder_time}\n`;
        });

        await ctx.reply(message);

    } catch (error) {
        console.error('Error in reminders command:', error);
        await ctx.reply('❌ Ошибка при загрузке напоминаний. Попробуйте позже.');
    }
});

// Обработка ошибок
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
});

// Запуск бота
bot.launch().then(() => {
    console.log('🤖 Telegram Bot запущен');
}).catch(err => {
    console.error('Ошибка запуска бота:', err);
});

// Включить graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));