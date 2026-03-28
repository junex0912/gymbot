const cron = require('node-cron');
const db = require('../database/db');
const sleepFacts = require('../data/sleep_facts');

const MORNING_CHECK_TIME = process.env.MORNING_CHECK_TIME || '09:00';
const SLEEP_REMINDER_TIME = process.env.SLEEP_REMINDER_TIME || '22:30';

// telegram_id -> date (YYYY-MM-DD) ожидания ответа по сну
const pendingMorning = new Map();

// user_id -> { weekKey: string, used: Set<number> }
const weeklyFacts = new Map();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7; // 1..7, где 1 — понедельник (после правки)
  // приводим к понедельнику текущей недели
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function parseHours(text) {
  if (!text) return null;
  const raw = text.replace(',', '.').trim();
  const v = parseFloat(raw);
  if (!Number.isFinite(v) || v <= 0 || v > 24) return null;
  return v;
}

function buildCronFromTimeStr(timeStr) {
  const [hStr, mStr] = timeStr.split(':');
  const hour = Number(hStr) || 0;
  const minute = Number(mStr) || 0;
  return `${minute} ${hour} * * *`;
}

function pickWeeklyFact(userId) {
  const total = sleepFacts.length;
  if (!total) return null;

  const weekKey = getWeekKey();
  let entry = weeklyFacts.get(userId);
  if (!entry || entry.weekKey !== weekKey) {
    entry = { weekKey, used: new Set() };
    weeklyFacts.set(userId, entry);
  }

  if (entry.used.size >= total) {
    entry.used.clear();
  }

  const available = [];
  for (let i = 0; i < total; i += 1) {
    if (!entry.used.has(i)) available.push(i);
  }
  if (!available.length) {
    // на всякий случай, если что-то пошло не так
    for (let i = 0; i < total; i += 1) {
      available.push(i);
    }
    entry.used.clear();
  }

  const idx = available[Math.floor(Math.random() * available.length)];
  entry.used.add(idx);

  return sleepFacts[idx];
}

function registerReminders(bot) {
  // Утреннее напоминание
  const morningCron = buildCronFromTimeStr(MORNING_CHECK_TIME);
  cron.schedule(morningCron, async () => {
    const users = await db.all(
      'SELECT id, telegram_id, sleep_reminders FROM users'
    );
    const date = todayISO();

    for (const u of users) {
      if (u.sleep_reminders === 0) continue;

      const alreadyLogged = await db.get(
        `SELECT id FROM sleep_log WHERE user_id = ? AND date = ? LIMIT 1`,
        [u.id, date]
      );
      if (alreadyLogged) continue;

      try {
        await bot.telegram.sendMessage(
          u.telegram_id,
          'Доброе утро! ☀️ Сколько часов спал этой ночью? (ответь цифрой)'
        );
        pendingMorning.set(String(u.telegram_id), date);
      } catch (err) {
        console.error('Ошибка отправки утреннего напоминания:', err);
      }
    }
  });

  // Обработка ответов на утреннее сообщение
  bot.on('text', async (ctx, next) => {
    const telegramId = String(ctx.from.id);
    const pendingDate = pendingMorning.get(telegramId);
    if (!pendingDate) {
      return next();
    }

    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';
    const hours = parseHours(text);

    if (hours === null) {
      await ctx.reply('Пожалуйста, ответь числом — сколько часов ты спал этой ночью?');
      return;
    }

    pendingMorning.delete(telegramId);

    const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
      telegramId,
    ]);
    if (!user) {
      await ctx.reply('Сначала пройди онбординг через /start.');
      return;
    }

    try {
      await db.run(
        `INSERT INTO sleep_log (user_id, date, hours_slept) VALUES (?, ?, ?)`,
        [user.id, pendingDate, hours]
      );
    } catch (err) {
      console.error('Ошибка сохранения сна в БД:', err);
    }

    if (hours < 6) {
      await ctx.reply(
        'Маловато 😬 Сегодня лучше потренируйся в лёгком режиме — 70-80% от обычных весов'
      );
    } else if (hours >= 7 && hours <= 8) {
      await ctx.reply('Отлично! Готов к продуктивной тренировке 💪');
    } else if (hours >= 9) {
      await ctx.reply('Богатырский сон! Сегодня можно пробовать новые максимумы 🏆');
    } else {
      await ctx.reply('Спасибо! Сон записан 😴');
    }
  });

  // Вечернее напоминание
  const eveningCron = buildCronFromTimeStr(SLEEP_REMINDER_TIME);
  cron.schedule(eveningCron, async () => {
    const users = await db.all(
      'SELECT id, telegram_id, sleep_reminders FROM users'
    );

    for (const u of users) {
      if (u.sleep_reminders === 0) continue;
      const fact = pickWeeklyFact(u.id) || '';
      const message =
        `🌙 Время спать!\n\n${fact}\n\nЗавтра будет продуктивная тренировка 💪`;

      try {
        await bot.telegram.sendMessage(u.telegram_id, message);
      } catch (err) {
        console.error('Ошибка отправки вечернего напоминания:', err);
      }
    }
  });
}

module.exports = {
  registerReminders,
};

