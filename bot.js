const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply('Welcome! Open the app: ', {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '📅 Open TrainPlan',
                    web_app: { url: process.env.WEB_APP_URL }
                }
            ]]
        }
    });
});

// Запускаем бота только если токен есть
if (BOT_TOKEN) {
    bot.launch().then(() => {
        console.log('🤖 Bot started successfully');
    }).catch(console.error);
} else {
    console.log('❌ Bot token not found');
}