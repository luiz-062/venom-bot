const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'data', 'bot.sqlite');
let dbPromise;

function getDb() {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    } catch (err) {
      return reject(err);
    }

    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        return reject(err);
      }

      db.run(
        `CREATE TABLE IF NOT EXISTS sent_offers (
          id INTEGER PRIMARY KEY,
          item_id TEXT UNIQUE,
          name TEXT,
          affiliate_link TEXT,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (createErr) => {
          if (createErr) {
            reject(createErr);
          } else {
            resolve(db);
          }
        }
      );
    });
  });

  return dbPromise;
}

function alreadySent(db, itemId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT 1 FROM sent_offers WHERE item_id = ? LIMIT 1',
      [itemId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(Boolean(row));
        }
      }
    );
  });
}

function markSent(db, offer) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO sent_offers (item_id, name, affiliate_link) VALUES (?, ?, ?)',
      [offer.item_id, offer.name, offer.affiliate_link],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

module.exports = {
  getDb,
  alreadySent,
  markSent,
  DB_PATH,
};
