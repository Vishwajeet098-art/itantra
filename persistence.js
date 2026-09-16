const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'itantra_db.json');

function replacer(key, value) {
  if (value instanceof Set) return { __isSet: true, data: Array.from(value) };
  return value;
}

function reviver(key, value) {
  if (value && typeof value === 'object' && value.__isSet) return new Set(value.data);
  return value;
}

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'), reviver);
      console.log('[DB] Loaded from disk:', Object.keys(data.users || {}).length, 'users');
      return data;
    } catch (e) {
      console.error('[DB] Load error:', e);
    }
  }
  return { users: {}, phoneIndex: {}, rooms: {}, pushSubs: {}, sosEvents: [] };
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, replacer, 2));
  } catch (e) {
    console.error('[DB] Save error:', e);
  }
}

module.exports = { loadDB, saveDB };
