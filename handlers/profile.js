const { Scenes, Markup } = require('telegraf');
const db = require('../database/db');

const levelOptions = ['Новичок', 'Средний', 'Продвинутый'];
const goalOptions = ['Набор массы', 'Похудение', 'Развитие силы'];

const UPDATE_FIELDS = [
  { key: 'name', label: 'Имя', column: 'name' },
  { key: 'weight_kg', label: 'Вес', column: 'weight_kg' },
  { key: 'goal', label: 'Цель', column: 'goal' },
  { key: 'level', label: 'Уровень', column: 'level' },
  { key: 'height_cm', label: 'Рост', column: 'height_cm' },
  { key: 'avg_sleep_hours', label: 'Средний сон', column: 'avg_sleep_hours' },
];

function isCancel(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t === 'отмена' || t === '❌ отмена';
}

function formatProfile(user) {
  const name = user.name || '—';
  const age = user.age != null ? user.age : '—';
  const height = user.height_cm != null ? user.height_cm : '—';
  const weight = user.weight_kg != null ? user.weight_kg : '—';
  const goal = user.goal || '—';
  const level = user.level || '—';
  const sleep =
    user.avg_sleep_hours != null ? `${user.avg_sleep_hours}` : '—';

  return [
    '👤 Имя: ' + name,
    '🎂 Возраст: ' + age + ' лет',
    '📏 Рост: ' + height + ' см',
    '⚖️ Вес: ' + weight + ' кг',
    '🎯 Цель: ' + goal,
    '💪 Уровень: ' + level,
    '😴 Средний сон: ' + sleep + ' ч',
  ].join('\n');
}

async function handleRemindersCommand(ctx) {
  const telegramId = String(ctx.from.id);
  const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
    telegramId,
  ]);

  if (!user) {
    await ctx.reply(
      'Сначала пройди онбординг через /start, чтобы создать профиль.'
    );
    return;
  }

  await ctx.reply(
    'Настройка напоминаний о сне:',
    Markup.keyboard([
      ['🔔 Включить напоминания о сне'],
      ['🔕 Выключить напоминания о сне'],
      ['❌ Отмена'],
    ]).resize()
  );

  ctx.wizard = ctx.wizard || {};
}

const updateScene = new Scenes.WizardScene(
  'update_profile',
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

    const buttons = UPDATE_FIELDS.map((f) => [f.label]);
    ctx.reply(
      'Что хочешь обновить?',
      Markup.keyboard([
        ...buttons,
        ['/reminders'],
        ['❌ Отмена'],
      ]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(text)) {
      ctx.reply('Отменено.', Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    if (text === '/reminders') {
      ctx.scene.leave();
      handleRemindersCommand(ctx);
      return;
    }

    const field = UPDATE_FIELDS.find(
      (f) => f.label.toLowerCase() === text.toLowerCase()
    );
    if (!field) {
      ctx.reply(
        'Выбери пункт с клавиатуры: Вес, Цель, Уровень, Рост или Средний сон.'
      );
      return;
    }

    ctx.wizard.state.field = field;

    if (field.key === 'goal') {
      ctx.reply(
        'Выбери новую цель:',
        Markup.keyboard([goalOptions, ['❌ Отмена']]).resize()
      );
    } else if (field.key === 'level') {
      ctx.reply(
        'Выбери новый уровень:',
        Markup.keyboard([levelOptions, ['❌ Отмена']]).resize()
      );
    } else if (field.key === 'weight_kg') {
      ctx.reply('Введи новый вес (кг):', Markup.keyboard([['❌ Отмена']]).resize());
    } else if (field.key === 'height_cm') {
      ctx.reply(
        'Введи новый рост (см):',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
    } else if (field.key === 'avg_sleep_hours') {
      ctx.reply(
        'Введи среднее количество часов сна:',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
    } else if (field.key === 'name') {
      ctx.reply(
        'Введи новое имя:',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
    }

    return ctx.wizard.next();
  },
  async (ctx) => {
    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';
    const raw = (text || '').replace(',', '.').trim();

    if (isCancel(text)) {
      ctx.reply('Отменено.', Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    const field = ctx.wizard.state.field;
    const userId = ctx.wizard.state.userId;

    let value = null;

    if (field.key === 'weight_kg') {
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v < 30 || v > 300) {
        ctx.reply('Введи вес в кг, например: 75');
        return;
      }
      value = v;
    } else if (field.key === 'height_cm') {
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v < 100 || v > 250) {
        ctx.reply('Введи рост в см, например: 178');
        return;
      }
      value = v;
    } else if (field.key === 'avg_sleep_hours') {
      const v = parseFloat(raw);
      if (!Number.isFinite(v) || v <= 0 || v > 24) {
        ctx.reply('Введи число от 1 до 24, например: 7.5');
        return;
      }
      value = v;
    } else if (field.key === 'goal') {
      if (!goalOptions.includes(text)) {
        ctx.reply('Выбери цель с клавиатуры.');
        return;
      }
      value = text;
    } else if (field.key === 'level') {
      if (!levelOptions.includes(text)) {
        ctx.reply('Выбери уровень с клавиатуры.');
        return;
      }
      value = text;
    } else if (field.key === 'name') {
      if (!text) {
        ctx.reply('Имя не может быть пустым. Введи новое имя:');
        return;
      }
      value = text;
    }

    await db.run(`UPDATE users SET ${field.column} = ? WHERE id = ?`, [
      value,
      userId,
    ]);

    if (field.key === 'name') {
      ctx.reply('Имя обновлено ✅', Markup.removeKeyboard());
    } else {
      ctx.reply('Обновлено! ✅', Markup.removeKeyboard());
    }
    return ctx.scene.leave();
  }
);

function registerProfile(bot) {
  bot.command('profile', async (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
      telegramId,
    ]);

    if (!user) {
      return ctx.reply(
        'Сначала пройди онбординг через /start, чтобы создать профиль.'
      );
    }

    return ctx.reply(formatProfile(user));
  });

  bot.command('update', (ctx) => ctx.scene.enter('update_profile'));

  bot.command('reminders', (ctx) => handleRemindersCommand(ctx));

  bot.hears('🔔 Включить напоминания о сне', async (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
      telegramId,
    ]);
    if (!user) {
      return ctx.reply('Сначала пройди онбординг через /start.');
    }
    await db.run('UPDATE users SET sleep_reminders = ? WHERE id = ?', [
      1,
      user.id,
    ]);
    return ctx.reply('Напоминания о сне включены 🔔', Markup.removeKeyboard());
  });

  bot.hears('🔕 Выключить напоминания о сне', async (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
      telegramId,
    ]);
    if (!user) {
      return ctx.reply('Сначала пройди онбординг через /start.');
    }
    await db.run('UPDATE users SET sleep_reminders = ? WHERE id = ?', [
      0,
      user.id,
    ]);
    return ctx.reply('Напоминания о сне выключены 🔕', Markup.removeKeyboard());
  });
}

module.exports = {
  updateScene,
  registerProfile,
  formatProfile,
};
