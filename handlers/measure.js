const { Scenes, Markup } = require('telegraf');
const Groq = require('groq-sdk');
const db = require('../database/db');

const groqApiKey = process.env.GROQ_API_KEY;
let groqClient = null;

if (!groqApiKey) {
  console.warn('GROQ_API_KEY не задан в .env, анализ замеров недоступен.');
} else {
  groqClient = new Groq({ apiKey: groqApiKey });
}

function isBack(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t === 'назад' || t === '⬅️ назад';
}

function isCancel(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return t === 'отмена' || t === '❌ отмена';
}

function formatDiff(label, current, previous, unit) {
  if (previous === null || previous === undefined) {
    return `${label}: ${current}${unit} (первая запись)`;
  }

  const diff = current - previous;
  if (Math.abs(diff) < 1e-6) {
    return `${label}: ${current}${unit} → 0${unit}`;
  }

  const arrow = diff > 0 ? '↑' : '↓';
  const sign = diff > 0 ? '+' : '';
  const value = Math.round(diff * 10) / 10;
  return `${label}: ${current}${unit} ${arrow} ${sign}${value}${unit}`;
}

async function analyzeMeasurements(userId) {
  if (!groqClient) {
    return null;
  }

  const measurements =
    (await db.all(
      `SELECT *
       FROM measurements
       WHERE user_id = ?
       ORDER BY date ASC`,
      [userId]
    )) || [];
  const profile = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

  if (!measurements.length || !profile) {
    return null;
  }

  const goal = profile.goal || 'не указана';
  const name = profile.name || 'Без имени';

  const prompt =
    `Проанализируй динамику замеров пользователя и скажи достигается ли его цель (${goal}). ` +
    'Отвечай коротко, конкретно, на русском.\n' +
    `Имя: ${name}\n` +
    `История замеров (JSON): ${JSON.stringify(measurements)}\n`;

  const completion = await groqClient.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const choice = completion.choices && completion.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    return null;
  }

  const content = choice.message.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content.map((part) => part.text || '').join('').trim();
  }
  return String(content).trim();
}

const measureScene = new Scenes.WizardScene(
  'measure',
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
    ctx.wizard.state.measurement = {};

    ctx.reply(
      'Текущий вес (кг)?',
      Markup.keyboard([['❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    const text = raw.replace(',', '.').trim();
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0 || value > 400) {
      ctx.reply('Введи вес в килограммах, например: 82.5');
      return;
    }
    ctx.wizard.state.measurement.body_weight = value;
    ctx.reply(
      'Обхват груди (см)?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Текущий вес (кг)?',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0 || value > 200) {
      ctx.reply('Введи обхват груди в сантиметрах, например: 105');
      return;
    }
    ctx.wizard.state.measurement.chest = value;
    ctx.reply(
      'Обхват талии (см)?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Обхват груди (см)?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0 || value > 200) {
      ctx.reply('Введи обхват талии в сантиметрах, например: 82');
      return;
    }
    ctx.wizard.state.measurement.waist = value;
    ctx.reply(
      'Обхват бёдер (см)?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Обхват талии (см)?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0 || value > 200) {
      ctx.reply('Введи обхват бёдер в сантиметрах, например: 100');
      return;
    }
    ctx.wizard.state.measurement.hips = value;
    ctx.reply(
      'Обхват бицепса (см)?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Обхват бёдер (см)?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0 || value > 80) {
      ctx.reply('Введи обхват бицепса в сантиметрах, например: 38');
      return;
    }
    ctx.wizard.state.measurement.bicep = value;
    ctx.reply(
      'Обхват бедра (см)?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const raw =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Обхват бицепса (см)?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const value = parseFloat(text);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      ctx.reply('Введи обхват бедра в сантиметрах, например: 60');
      return;
    }
    ctx.wizard.state.measurement.thigh = value;

    const userId = ctx.wizard.state.userId;
    const date = ctx.wizard.state.date;
    const m = ctx.wizard.state.measurement;

    const prev =
      (await db.get(
        `SELECT *
         FROM measurements
         WHERE user_id = ?
         ORDER BY date DESC, id DESC
         LIMIT 1`,
        [userId]
      )) || null;

    await db.run(
      `INSERT INTO measurements (user_id, date, body_weight, chest, waist, hips, bicep, thigh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        date,
        m.body_weight,
        m.chest,
        m.waist,
        m.hips,
        m.bicep,
        m.thigh,
      ]
    );

    const lines = [];
    lines.push(`Замеры на ${date}:`);
    lines.push(
      formatDiff('Вес', m.body_weight, prev ? prev.body_weight : null, ' кг')
    );
    lines.push(
      formatDiff('Грудь', m.chest, prev ? prev.chest : null, ' см')
    );
    lines.push(
      formatDiff('Талия', m.waist, prev ? prev.waist : null, ' см')
    );
    lines.push(
      formatDiff('Бёдра', m.hips, prev ? prev.hips : null, ' см')
    );
    lines.push(
      formatDiff('Бицепс', m.bicep, prev ? prev.bicep : null, ' см')
    );
    lines.push(
      formatDiff('Бедро', m.thigh, prev ? prev.thigh : null, ' см')
    );

    await ctx.reply(lines.join('\n'), Markup.removeKeyboard());

    try {
      const analysis = await analyzeMeasurements(userId);
      if (analysis) {
        await ctx.reply(`Анализ прогресса:\n${analysis}`);
      }
    } catch (error) {
      console.error('Ошибка анализа замеров через Groq:', error);
    }

    return ctx.scene.leave();
  }
);

function registerMeasure(bot) {
  bot.command('measure', (ctx) => ctx.scene.enter('measure'));
}

module.exports = {
  measureScene,
  registerMeasure,
};

