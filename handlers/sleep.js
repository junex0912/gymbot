const { Scenes } = require('telegraf');
const db = require('../database/db');

const sleepScene = new Scenes.WizardScene(
  'sleep',
  async (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
      telegramId,
    ]);

    if (!user) {
      ctx.reply('Сначала пройди онбординг через /start, чтобы создать профиль.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.userId = user.id;
    ctx.wizard.state.date = new Date().toISOString().slice(0, 10);

    ctx.reply('Сколько часов ты спал(а) сегодня? Укажи число, например: 7.5');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text =
      ctx.message && ctx.message.text ? ctx.message.text.replace(',', '.').trim() : '';
    const hours = parseFloat(text);

    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      ctx.reply('Введи количество часов сна числом от 1 до 24, например: 7.5');
      return;
    }

    const userId = ctx.wizard.state.userId;
    const date = ctx.wizard.state.date;

    const existing = await db.get(
      `SELECT *
       FROM sleep_log
       WHERE user_id = ? AND date = ?
       LIMIT 1`,
      [userId, date]
    );

    if (existing) {
      await db.run(`UPDATE sleep_log SET hours_slept = ? WHERE id = ?`, [
        hours,
        existing.id,
      ]);
    } else {
      await db.run(
        `INSERT INTO sleep_log (user_id, date, hours_slept) VALUES (?, ?, ?)`,
        [userId, date, hours]
      );
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
