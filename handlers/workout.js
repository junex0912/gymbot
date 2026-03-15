const { Scenes, Markup } = require('telegraf');
const db = require('../database/db');
const { parseWorkout, getAdvice, normalizeExerciseName } = require('../ai/gemini');

const getUserByTelegramId = db.prepare(
  'SELECT * FROM users WHERE telegram_id = ?'
);

const insertWorkout = db.prepare(`
  INSERT INTO workouts (user_id, date, exercise, weight_kg, sets, reps, notes, effort_score)
  VALUES (@user_id, @date, @exercise, @weight_kg, @sets, @reps, @notes, @effort_score)
`);

const getLastWorkoutForExercise = db.prepare(`
  SELECT * FROM workouts
  WHERE user_id = @user_id AND exercise = @exercise
  ORDER BY id DESC
  LIMIT 1
`);

const getRecord = db.prepare(`
  SELECT * FROM records
  WHERE user_id = @user_id AND exercise = @exercise
  ORDER BY max_weight_kg DESC
  LIMIT 1
`);

const insertRecord = db.prepare(`
  INSERT INTO records (user_id, exercise, max_weight_kg, achieved_date)
  VALUES (@user_id, @exercise, @max_weight_kg, @achieved_date)
`);

const updateRecord = db.prepare(`
  UPDATE records
  SET max_weight_kg = @max_weight_kg, achieved_date = @achieved_date
  WHERE id = @id
`);

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

const workoutScene = new Scenes.WizardScene(
  'workout',
  (ctx) => {
    const telegramId = String(ctx.from.id);
    const user = getUserByTelegramId.get(telegramId);

    if (!user) {
      ctx.reply('Сначала пройди онбординг через /start, чтобы создать профиль.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.userId = user.id;
    ctx.wizard.state.date = new Date().toISOString().slice(0, 10);
    ctx.wizard.state.sessionWorkouts = [];

    ctx.reply(
      'Как самочувствие сегодня? Оцени от 1 до 10',
      Markup.keyboard([['❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    const text =
      ctx.message && ctx.message.text ? ctx.message.text.trim() : '';

    if (isCancel(text)) {
      ctx.reply('Отменено. Напиши /train или /measure чтобы начать заново', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
    const score = parseInt(text, 10);

    if (!Number.isFinite(score) || score < 1 || score > 10) {
      ctx.reply(
        'Пожалуйста, оцени самочувствие числом от 1 до 10 (например, 7).'
      );
      return;
    }

    ctx.wizard.state.effortScore = score;

    try {
      const userId = ctx.wizard.state.userId;
      const advice = await getAdvice(userId, [], score);
      if (advice && advice.trim()) {
        await ctx.reply(`Совет тренера:\n${advice.trim()}`);
      }
    } catch (error) {
      console.error('Ошибка получения совета от AI-тренера:', error);
    }

    ctx.reply(
      'Принято! Записывай упражнения в свободной форме. Например: жим 100кг 5х3. Когда закончишь — напиши /done',
      Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      return;
    }

    const text = ctx.message.text.trim();

    if (isCancel(text)) {
      await ctx.reply(
        'Отменено. Напиши /train или /measure чтобы начать заново',
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }
    if (isBack(text)) {
      ctx.wizard.back();
      await ctx.reply(
        'Как самочувствие сегодня? Оцени от 1 до 10',
        Markup.keyboard([['❌ Отмена']]).resize()
      );
      return;
    }

    if (text.startsWith('/')) {
      if (text === '/done') {
        const date = ctx.wizard.state.date;
        const workouts = ctx.wizard.state.sessionWorkouts || [];

        if (!workouts.length) {
          await ctx.reply('За эту сессию ещё ничего не записано.');
        } else {
          let summary = `Итог тренировки за ${date} (текущая сессия):\n`;
          workouts.forEach((w, index) => {
            let line = `${index + 1}. ${w.exercise}`;
            if (w.weight_kg !== null && w.weight_kg !== undefined) {
              line += `, ${w.weight_kg} кг`;
            }
            if (w.sets !== null || w.reps !== null) {
              const s = w.sets !== null ? w.sets : '?';
              const r = w.reps !== null ? w.reps : '?';
              line += `, ${s}x${r}`;
            }
            if (w.notes) {
              line += ` — ${w.notes}`;
            }
            summary += `${line}\n`;
          });

          await ctx.reply(summary.trim());
        }

        return ctx.scene.leave();
      }

      // Другие команды в рамках тренировки игнорируем
      return;
    }

    const userId = ctx.wizard.state.userId;
    const date = ctx.wizard.state.date;
    const effortScore = ctx.wizard.state.effortScore;

    let parsed;
    try {
      parsed = await parseWorkout(text);
    } catch (error) {
      console.error('Ошибка парсинга тренировки через Groq AI:', error);
      await ctx.reply(
        'Не смог разобрать упражнение. Попробуй описать его чуть подробнее или по-другому.'
      );
      return;
    }

    const rawExercise =
      parsed.exercise && parsed.exercise.length > 0
        ? parsed.exercise
        : 'Упражнение';
    const weight_kg =
      parsed.weight_kg !== null && parsed.weight_kg !== undefined
        ? parsed.weight_kg
        : null;
    const sets =
      parsed.sets !== null && parsed.sets !== undefined ? parsed.sets : null;
    const reps =
      parsed.reps !== null && parsed.reps !== undefined ? parsed.reps : null;
    const notes = parsed.notes || '';

    let exercise = rawExercise;
    try {
      exercise = await normalizeExerciseName(rawExercise);
    } catch (error) {
      console.error('Ошибка нормализации названия упражнения через Groq:', error);
    }

    const previous = getLastWorkoutForExercise.get({
      user_id: userId,
      exercise,
    });

    insertWorkout.run({
      user_id: userId,
      date,
      exercise,
      weight_kg,
      sets,
      reps,
      notes,
      effort_score: effortScore,
    });

    if (!Array.isArray(ctx.wizard.state.sessionWorkouts)) {
      ctx.wizard.state.sessionWorkouts = [];
    }
    ctx.wizard.state.sessionWorkouts.push({
      exercise,
      weight_kg,
      sets,
      reps,
      notes,
    });

    let replyText = `Записал: ${exercise}`;
    if (weight_kg !== null) {
      replyText += `, ${weight_kg} кг`;
    }
    if (sets !== null || reps !== null) {
      const s = sets !== null ? sets : '?';
      const r = reps !== null ? reps : '?';
      replyText += `, ${s}x${r}`;
    }
    if (notes) {
      replyText += `. Заметки: ${notes}`;
    }

    await ctx.reply(replyText);

    if (previous) {
      let prevText = `Прошлый раз: ${previous.exercise}`;
      if (previous.weight_kg !== null && previous.weight_kg !== undefined) {
        prevText += `, ${previous.weight_kg} кг`;
      }
      if (previous.sets !== null || previous.reps !== null) {
        const ps = previous.sets !== null ? previous.sets : '?';
        const pr = previous.reps !== null ? previous.reps : '?';
        prevText += `, ${ps}x${pr}`;
      }

      await ctx.reply(prevText);
    }

    if (weight_kg !== null) {
      const record = getRecord.get({ user_id: userId, exercise });

      if (!record) {
        insertRecord.run({
          user_id: userId,
          exercise,
          max_weight_kg: weight_kg,
          achieved_date: date,
        });
        await ctx.reply('\uD83C\uDFC6 Новый рекорд!');
      } else if (weight_kg > record.max_weight_kg) {
        updateRecord.run({
          id: record.id,
          max_weight_kg: weight_kg,
          achieved_date: date,
        });
        await ctx.reply('\uD83C\uDFC6 Новый рекорд!');
      }
    }
  }
);

function registerWorkout(bot) {
  bot.command('train', (ctx) => ctx.scene.enter('workout'));
}

module.exports = {
  workoutScene,
  registerWorkout,
};

