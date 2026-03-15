const { Scenes } = require('telegraf');
const db = require('../database/db');

const getUserByTelegramId = db.prepare(
  'SELECT * FROM users WHERE telegram_id = ?'
);

const getSleepByDate = db.prepare(`
  SELECT *
  FROM sleep_log
  WHERE user_id = ? AND date = ?
  LIMIT 1
`);

const insertSleep = db.prepare(`
  INSERT INTO sleep_log (user_id, date, hours_slept)
  VALUES (@user_id, @date, @hours_slept)
`);

const updateSleep = db.prepare(`
  UPDATE sleep_log
  SET hours_slept = @hours_slept
  WHERE id = @id
`);

const sleepScene = new Scenes.WizardScene(
  'sleep',
  (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = getUserByTelegramId.get(telegramId);

    if (!user) {
      ctx.reply('Сначала пройди онбординг через /start, чтобы создать профиль.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.userId = user.id;
    ctx.wizard.state.date = new Date().toISOString().slice(0, 10);

    ctx.reply('Сколько часов ты спал(а) сегодня? Укажи число, например: 7.5');
    return ctx.wizard.next();
  },
  (ctx) => {
    const text =
      ctx.message && ctx.message.text ? ctx.message.text.replace(',', '.').trim() : '';
    const hours = parseFloat(text);

    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      ctx.reply('Введи количество часов сна числом от 1 до 24, например: 7.5');
      return;
    }

    const userId = ctx.wizard.state.userId;
    const date = ctx.wizard.state.date;

    const existing = getSleepByDate.get(userId, date);

    if (existing) {
      updateSleep.run({
        id: existing.id,
        hours_slept: hours,
      });
    } else {
      insertSleep.run({
        user_id: userId,
        date,
        hours_slept: hours,
      });
    }

    ctx.reply(`Записал сон за сегодня: ${hours} ч.`);
    return ctx.scene.leave();
  }
);

function registerSleep(bot) {
  bot.command('sleep', (ctx) => ctx.scene.enter('sleep'));
}

module.exports = {
  sleepScene,
  registerSleep,
};

