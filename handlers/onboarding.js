const { Scenes, Markup } = require('telegraf');
const db = require('../database/db');

const levelOptions = ['Новичок', 'Средний', 'Продвинутый'];
const goalOptions = ['Набор массы', 'Похудение', 'Развитие силы'];

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

const onboardingScene = new Scenes.WizardScene(
  'onboarding',
  (ctx) => {
    ctx.reply(
      'Давай познакомимся! Как тебя зовут?',
      Markup.keyboard([['❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(text)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    const name = text;
    if (!name) {
      ctx.reply('Пожалуйста, напиши своё имя текстом.');
      return;
    }
    ctx.wizard.state.user = { name };
    ctx.reply(
      'Сколько тебе лет?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(text)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(text)) {
      ctx.wizard.back();
      ctx.reply(
        'Давай познакомимся! Как тебя зовут?',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
      return;
    }

    const age = parseInt(text, 10);
    if (!Number.isFinite(age) || age <= 0 || age > 100) {
      ctx.reply('Введи, пожалуйста, реальный возраст числом (например, 28).');
      return;
    }
    ctx.wizard.state.user.age = age;
    ctx.reply(
      'Какой у тебя рост в сантиметрах?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Сколько тебе лет?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const height = parseFloat(text);
    if (!Number.isFinite(height) || height < 100 || height > 250) {
      ctx.reply('Введи рост в сантиметрах, например: 178');
      return;
    }
    ctx.wizard.state.user.height_cm = height;
    ctx.reply(
      'Сколько ты сейчас весишь (в кг)?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const raw = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Какой у тебя рост в сантиметрах?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const weight = parseFloat(text);
    if (!Number.isFinite(weight) || weight < 30 || weight > 300) {
      ctx.reply('Введи вес в килограммах, например: 72.5');
      return;
    }
    ctx.wizard.state.user.weight_kg = weight;
    ctx.reply(
      'Какой у тебя уровень подготовки?',
      Markup.keyboard([
        levelOptions,
        ['⬅️ Назад', '❌ Отмена'],
      ]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(text)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(text)) {
      ctx.wizard.back();
      ctx.reply(
        'Сколько ты сейчас весишь (в кг)?',
        Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
      );
      return;
    }

    if (!levelOptions.includes(text)) {
      ctx.reply('Выбери вариант с клавиатуры: Новичок, Средний или Продвинутый.');
      return;
    }
    ctx.wizard.state.user.level = text;
    ctx.reply(
      'Какая у тебя основная цель?',
      Markup.keyboard([
        goalOptions,
        ['⬅️ Назад', '❌ Отмена'],
      ]).resize()
    );
    return ctx.wizard.next();
  },
  (ctx) => {
    const text = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(text)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(text)) {
      ctx.wizard.back();
      ctx.reply(
        'Какой у тебя уровень подготовки?',
        Markup.keyboard([
          levelOptions,
          ['⬅️ Назад', '❌ Отмена'],
        ]).resize()
      );
      return;
    }

    if (!goalOptions.includes(text)) {
      ctx.reply('Выбери цель с клавиатуры: Набор массы, Похудение или Развитие силы.');
      return;
    }
    ctx.wizard.state.user.goal = text;
    ctx.reply(
      'Сколько в среднем часов ты спишь за ночь?',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const raw = ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(raw)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    if (isBack(raw)) {
      ctx.wizard.back();
      ctx.reply(
        'Какая у тебя основная цель?',
        Markup.keyboard([
          goalOptions,
          ['⬅️ Назад', '❌ Отмена'],
        ]).resize()
      );
      return;
    }

    const text = raw.replace(',', '.').trim();
    const hours = parseFloat(text);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      ctx.reply('Введи количество часов сна числом от 1 до 24, например: 7.5');
      return;
    }
    ctx.wizard.state.user.avg_sleep_hours = hours;

    const { name, age, height_cm, weight_kg, level, goal, avg_sleep_hours } = ctx.wizard.state.user;
    const telegramId = String(ctx.from.id);

    try {
      await db.run(
        `INSERT INTO users (telegram_id, name, age, height_cm, weight_kg, level, goal, avg_sleep_hours)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [telegramId, name, age, height_cm, weight_kg, level, goal, avg_sleep_hours]
      );
      await ctx.reply(
        `Отлично, ${name}! Профиль создан. Напиши /train когда будешь в зале \uD83D\uDCAA`,
        Markup.removeKeyboard()
      );
      await ctx.reply(
        `Вот что я умею 💪

📝 /train — записать тренировку. Просто пиши в свободной форме: «жим 100кг 5х3»
/done — завершить тренировку

📊 /week — отчёт за неделю
/month — отчёт за месяц
/compare — сравнение с друзьями

📏 /measure — записать замеры тела
😴 /sleep — записать часы сна
🏆 /records — личные рекорды

👤 /profile — твой профиль
/update — обновить данные
/reminders — включить/выключить напоминания

🤖 /ask — задать вопрос AI-тренеру

Просто начни тренировку — напиши /train 🚀`
      );
    } catch (error) {
      console.error('Ошибка сохранения пользователя:', error);
      ctx.reply('Произошла ошибка при сохранении профиля. Попробуй позже.', Markup.removeKeyboard());
    }

    return ctx.scene.leave();
  }
);

function registerOnboarding(bot) {
  bot.start(async (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = await db.get('SELECT * FROM users WHERE telegram_id = ?', [
      telegramId,
    ]);

    if (user) {
      const name = user.name || 'друг';
      return ctx.reply(
        `Привет, ${name}! Ты уже зарегистрирован. Напиши /train чтобы начать тренировку`
      );
    }

    return ctx.scene.enter('onboarding');
  });
}

module.exports = {
  onboardingScene,
  registerOnboarding,
};

