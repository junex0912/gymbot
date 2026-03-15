require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const db = require('./database/db');
const { onboardingScene, registerOnboarding } = require('./handlers/onboarding');
const { workoutScene, registerWorkout } = require('./handlers/workout');
const { sleepScene, registerSleep } = require('./handlers/sleep');
const { measureScene, registerMeasure } = require('./handlers/measure');
const { registerStats } = require('./handlers/stats');
const { updateScene, registerProfile } = require('./handlers/profile');
const { askTrainer } = require('./ai/gemini');
const { registerReminders } = require('./cron/reminders');

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('TELEGRAM_BOT_TOKEN не задан в .env');
  process.exit(1);
}

const bot = new Telegraf(botToken);

// Bot commands for Telegram menu
bot.telegram
  .setMyCommands([
    { command: 'start', description: 'Регистрация и профиль' },
    { command: 'train', description: 'Начать тренировку' },
    { command: 'done', description: 'Завершить тренировку и получить совет' },
    { command: 'sleep', description: 'Записать сколько часов спал' },
    { command: 'measure', description: 'Ввести замеры тела' },
    { command: 'week', description: 'Отчёт за неделю' },
    { command: 'month', description: 'Отчёт за месяц' },
    { command: 'history', description: 'История конкретного упражнения' },
    { command: 'stats', description: 'Отчёт за N месяцев' },
    { command: 'compare', description: 'Сравнение прогресса с другими' },
    { command: 'records', description: 'Личные рекорды' },
    { command: 'update', description: 'Обновить профиль' },
    { command: 'profile', description: 'Посмотреть профиль' },
    { command: 'reminders', description: 'Настроить напоминания о сне' },
    { command: 'ask', description: 'Чат с тренером' },
    { command: 'stop', description: 'Завершить чат с тренером' },
    { command: 'help', description: 'Список всех команд' },
  ])
  .catch((err) => {
    console.error('Не удалось зарегистрировать команды бота:', err);
  });

// Scenes & session
const stage = new Scenes.Stage([
  onboardingScene,
  workoutScene,
  sleepScene,
  measureScene,
  updateScene,
]);
bot.use(session());
bot.use(stage.middleware());

// Handlers
registerOnboarding(bot, db);
registerWorkout(bot);
registerSleep(bot);
registerMeasure(bot);
registerStats(bot);
registerProfile(bot);
registerReminders(bot);

// Чат с тренером (режим /ask)
const activeChatUsers = new Map(); // telegram_id -> { userId, history: [{role, content}] }

bot.command('ask', (ctx) => {
  const telegramId = String(ctx.from.id);
  const userStmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
  const user = userStmt.get(telegramId);

  if (!user) {
    return ctx.reply('Сначала пройди онбординг через /start.');
  }

  activeChatUsers.set(telegramId, { userId: user.id, history: [] });
  return ctx.reply(
    'Ты в режиме чата с тренером. Задавай вопросы, а когда захочешь выйти — напиши /stop 💬'
  );
});

bot.command('stop', (ctx) => {
  const telegramId = String(ctx.from.id);
  const hadChat = activeChatUsers.delete(telegramId);
  if (hadChat) {
    return ctx.reply('Чат с тренером завершён. Хорошей тренировки! 💪');
  }
  return ctx.reply('Сейчас чат с тренером не активен.');
});

bot.on('text', async (ctx, next) => {
  const telegramId = String(ctx.from.id);
  const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

  // Если это команда — выходим из чата (если активен) и передаём дальше
  if (text.startsWith('/')) {
    if (activeChatUsers.has(telegramId) && text !== '/ask') {
      activeChatUsers.delete(telegramId);
    }
    return next();
  }

  const chatState = activeChatUsers.get(telegramId);
  if (!chatState) {
    return next();
  }

  const { userId, history } = chatState;
  const question = text;
  if (!question) {
    return next();
  }

  history.push({ role: 'user', content: question });

  try {
    const answer = await askTrainer(userId, history, question);
    history.push({ role: 'assistant', content: answer });
    await ctx.reply(answer);
  } catch (err) {
    console.error('Ошибка askTrainer:', err);
    await ctx.reply('Не удалось получить ответ. Попробуй позже.');
  }
});

bot.command('help', (ctx) =>
  ctx.reply(
    [
      '/start — регистрация и профиль',
      '/train — начать тренировку',
      '/done — завершить тренировку и получить совет',
      '/sleep — записать сколько часов спал',
      '/measure — ввести замеры тела',
      '/week — отчёт за неделю',
      '/month — отчёт за месяц',
      '/history [упражнение] — история конкретного упражнения. Пример: /history жим',
      '/stats [число] — отчёт за N месяцев. Пример: /stats 3',
      '/compare — сравнение прогресса с другими пользователями',
      '/records — личные рекорды',
      '/update — обновить профиль',
      '/profile — посмотреть свой профиль',
      '/reminders — настроить напоминания о сне',
      '/ask — чат с тренером',
      '/stop — завершить чат с тренером',
      '/help — список всех команд',
    ].join('\n')
  )
);

bot.launch()
  .then(() => {
    console.log('GymBot запущен');
  })
  .catch((err) => {
    console.error('Ошибка запуска бота:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

