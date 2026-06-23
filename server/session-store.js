const { Store } = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SqliteSessionStore extends Store {
  constructor(dbPath) {
    super();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS express_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_express_sessions_expired ON express_sessions(expired);
    `);
    this._get = this.db.prepare(
      'SELECT sess FROM express_sessions WHERE sid = ? AND expired > ?'
    );
    this._set = this.db.prepare(`
      INSERT INTO express_sessions (sid, sess, expired) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired
    `);
    this._destroy = this.db.prepare('DELETE FROM express_sessions WHERE sid = ?');
    this._touch = this.db.prepare('UPDATE express_sessions SET expired = ? WHERE sid = ?');
    this._cleanup = this.db.prepare('DELETE FROM express_sessions WHERE expired <= ?');
    const timer = setInterval(() => {
      try { this._cleanup.run(Date.now()); } catch { /* ignore */ }
    }, 3600000);
    if (timer.unref) timer.unref();
  }

  get(sid, cb) {
    try {
      const row = this._get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      this._set.run(sid, JSON.stringify(sess), Date.now() + maxAge);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this._destroy.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const maxAge = sess.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000;
      this._touch.run(Date.now() + maxAge, sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
