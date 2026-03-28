const { Scenes, Markup } = require('telegraf');
const db = require('../database/db');
const { parseWorkout, normalizeExerciseName } = require('../ai/gemini');

const SIMILARITY_THRESHOLD = 0.85;

function normalizeForKey(s) {
  if (!s) return '';
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = [];
  for (let i = 0; i <= m; i += 1) {
    dp[i] = new Array(n + 1).fill(0);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j += 1) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function stringSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a, b);
  return 1 - d / Math.max(a.length, b.length, 1);
}

async function findBestMatchingAlias(userId, rawExercise) {
  const key = normalizeForKey(rawExercise);
  if (!key) return null;

  const rows = await db.all(
    `SELECT input_text, normalized_name FROM exercise_aliases WHERE user_id = ?`,
    [userId]
  );

  let best = null;
  let bestScore = 0;

  for (const row of rows) {
    const rk = normalizeForKey(row.input_text);
    if (rk === key) {
      return row;
    }
    const sim = stringSimilarity(rk, key);
    if (sim > bestScore && sim >= SIMILARITY_THRESHOLD) {
      bestScore = sim;
      best = row;
    }
  }

  return best;
}

async function upsertExerciseAlias(userId, inputKey, normalizedName) {
  await db.run(
    `INSERT INTO exercise_aliases (user_id, input_text, normalized_name)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, input_text) DO UPDATE SET
       normalized_name = excluded.normalized_name`,
    [userId, inputKey, normalizedName]
  );
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

const BTN_OK = '✅ Верно';
const BTN_FIX = '✏️ Исправить';

function exerciseEntryKeyboard() {
  return Markup.keyboard([['⬅️ Назад', '❌ Отмена']]).resize();
}

function confirmExerciseKeyboard() {
  return Markup.keyboard([
    [BTN_OK, BTN_FIX],
    ['⬅️ Назад', '❌ Отмена'],
  ]).resize();
}

function formatRecordedLine(exercise, weight_kg, sets, reps, notes) {
  let line = `Записал: ${exercise}`;
  if (weight_kg !== null) {
    line += `, ${weight_kg} кг`;
  }
  if (sets !== null || reps !== null) {
    const s = sets !== null ? sets : '?';
    const r = reps !== null ? reps : '?';
    line += `, ${s}x${r}`;
  }
  if (notes) {
    line += `. Заметки: ${notes}`;
  }
  return line;
}

async function saveWorkoutAndFollowUp(
  ctx,
  {
    userId,
    date,
    exercise,
    weight_kg,
    sets,
    reps,
    notes,
    effortScore,
  },
  options = {}
) {
  const { firstMessage } = options;

  const previous = await db.get(
    `SELECT * FROM workouts
     WHERE user_id = ? AND exercise = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, exercise]
  );

  await db.run(
    `INSERT INTO workouts (user_id, date, exercise, weight_kg, sets, reps, notes, effort_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, date, exercise, weight_kg, sets, reps, notes, effortScore]
  );

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

  const replyText =
    firstMessage !== undefined
      ? firstMessage
      : formatRecordedLine(exercise, weight_kg, sets, reps, notes);

  await ctx.reply(replyText, exerciseEntryKeyboard());

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
    const record = await db.get(
      `SELECT * FROM records
       WHERE user_id = ? AND exercise = ?
       ORDER BY max_weight_kg DESC
       LIMIT 1`,
      [userId, exercise]
    );

    if (!record) {
      await db.run(
        `INSERT INTO records (user_id, exercise, max_weight_kg, achieved_date)
         VALUES (?, ?, ?, ?)`,
        [userId, exercise, weight_kg, date]
      );
      await ctx.reply('\uD83C\uDFC6 Новый рекорд!');
    } else if (weight_kg > record.max_weight_kg) {
      await db.run(
        `UPDATE records
         SET max_weight_kg = ?, achieved_date = ?
         WHERE id = ?`,
        [weight_kg, date, record.id]
      );
      await ctx.reply('\uD83C\uDFC6 Новый рекорд!');
    }
  }
}

const workoutScene = new Scenes.WizardScene(
  'workout',
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
    ctx.wizard.state.sessionWorkouts = [];
    ctx.wizard.state.exercisePending = null;

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

    ctx.reply(
      'Принято! Записывай упражнения в свободной форме. Например: жим 100кг 5х3. Когда закончишь — напиши /done',
      exerciseEntryKeyboard()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      return;
    }

    const text = ctx.message.text.trim();
    const userId = ctx.wizard.state.userId;
    const date = ctx.wizard.state.date;
    const effortScore = ctx.wizard.state.effortScore;
    const pending = ctx.wizard.state.exercisePending;

    if (isCancel(text)) {
      ctx.wizard.state.exercisePending = null;
      await ctx.reply(
        'Отменено. Напиши /train или /measure чтобы начать заново',
        Markup.removeKeyboard()
      );
      return ctx.scene.leave();
    }

    if (pending && pending.step === 'correction') {
      const corrected = text.trim();
      if (!corrected) {
        await ctx.reply('Напиши название упражнения текстом.');
        return;
      }

      const inputKey = pending.inputKey;
      const {
        weight_kg,
        sets,
        reps,
        notes,
      } = pending;

      ctx.wizard.state.exercisePending = null;

      await upsertExerciseAlias(userId, inputKey, corrected);

      await saveWorkoutAndFollowUp(
        ctx,
        {
          userId,
          date,
          exercise: corrected,
          weight_kg,
          sets,
          reps,
          notes,
          effortScore,
        },
        {
          firstMessage:
            'Записано с исправлением! Запомнил для следующего раза 👍',
        }
      );
      return;
    }

    if (pending && pending.step === 'confirm') {
      if (text === BTN_OK) {
        const {
          rawExercise,
          normalizedCandidate,
          weight_kg,
          sets,
          reps,
          notes,
        } = pending;

        ctx.wizard.state.exercisePending = null;

        const inputKey = normalizeForKey(rawExercise);
        await upsertExerciseAlias(userId, inputKey, normalizedCandidate);

        await saveWorkoutAndFollowUp(
          ctx,
          {
            userId,
            date,
            exercise: normalizedCandidate,
            weight_kg,
            sets,
            reps,
            notes,
            effortScore,
          },
          { firstMessage: 'Записано! 💪' }
        );
        return;
      }

      if (text === BTN_FIX) {
        pending.step = 'correction';
        pending.inputKey = normalizeForKey(pending.rawExercise);
        await ctx.reply(
          'Как правильно называется упражнение?',
          Markup.keyboard([['❌ Отмена']]).resize()
        );
        return;
      }

      if (isBack(text)) {
        ctx.wizard.state.exercisePending = null;
        await ctx.reply(
          'Введи упражнение ещё раз.',
          exerciseEntryKeyboard()
        );
        return;
      }

      await ctx.reply(
        `Нажми «${BTN_OK}» или «${BTN_FIX}».`,
        confirmExerciseKeyboard()
      );
      return;
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

      return;
    }

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

    const aliasRow = await findBestMatchingAlias(userId, rawExercise);

    let exercise;
    if (aliasRow) {
      exercise = aliasRow.normalized_name;
    } else {
      try {
        exercise = await normalizeExerciseName(rawExercise);
      } catch (error) {
        console.error('Ошибка нормализации названия упражнения через Groq:', error);
        exercise = rawExercise;
      }

      ctx.wizard.state.exercisePending = {
        step: 'confirm',
        rawExercise,
        normalizedCandidate: exercise,
        weight_kg,
        sets,
        reps,
        notes,
      };

      const preview = formatRecordedLine(
        exercise,
        weight_kg,
        sets,
        reps,
        notes
      );

      await ctx.reply(preview, confirmExerciseKeyboard());
      return;
    }

    await saveWorkoutAndFollowUp(ctx, {
      userId,
      date,
      exercise,
      weight_kg,
      sets,
      reps,
      notes,
      effortScore,
    });
  }
);

function registerWorkout(bot) {
  bot.command('train', (ctx) => ctx.scene.enter('workout'));
}

module.exports = {
  workoutScene,
  registerWorkout,
};
