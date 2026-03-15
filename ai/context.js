const db = require('../database/db');

const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');

const getWorkoutsLast6WeeksStmt = db.prepare(`
  SELECT *
  FROM workouts
  WHERE user_id = ? AND date >= ?
  ORDER BY date DESC
`);

const getLastMeasurementsStmt = db.prepare(`
  SELECT *
  FROM measurements
  WHERE user_id = ?
  ORDER BY date DESC
  LIMIT 3
`);

const getSleepLast7DaysStmt = db.prepare(`
  SELECT *
  FROM sleep_log
  WHERE user_id = ? AND date >= ?
  ORDER BY date DESC
`);

async function getUserContext(userId) {
  const profile = getUserByIdStmt.get(userId);

  const today = new Date();
  const sixWeeksAgo = new Date(today);
  sixWeeksAgo.setDate(today.getDate() - 42);
  const sixWeeksAgoStr = sixWeeksAgo.toISOString().slice(0, 10);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  const workouts = getWorkoutsLast6WeeksStmt.all(userId, sixWeeksAgoStr);
  const measurements = getLastMeasurementsStmt.all(userId);
  const sleep = getSleepLast7DaysStmt.all(userId, sevenDaysAgoStr);

  return {
    profile,
    workouts,
    measurements,
    sleep,
  };
}

module.exports = {
  getUserContext,
};

