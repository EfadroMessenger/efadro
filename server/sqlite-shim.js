/* ============================================================
   efadro — better-sqlite3 compatibility shim over node:sqlite
   ------------------------------------------------------------
   better-sqlite3 is a native module; on machines where its
   prebuilt binary cannot be installed (no network, no toolchain,
   exotic platform) efadro falls back to this small adapter over
   Node's built-in `node:sqlite` (Node >= 22.5).

   It implements the subset of the better-sqlite3 API efadro uses:
   new Database(path), .pragma(), .exec(), .prepare(), statement
   .run()/.get()/.all(), and returns better-sqlite3-shaped results
   (plain objects, { changes, lastInsertRowid } with numeric ids,
   SQLITE_CONSTRAINT* error codes). Everything else — SQL — is
   plain SQLite and behaves identically.
   ============================================================ */

import { DatabaseSync } from 'node:sqlite';

/* Map sqlite3 extended result codes to better-sqlite3 error code strings. */
const CONSTRAINT_CODES = new Map([
  [19, 'SQLITE_CONSTRAINT'],
  [1555, 'SQLITE_CONSTRAINT_PRIMARYKEY'],
  [2067, 'SQLITE_CONSTRAINT_UNIQUE'],
  [787, 'SQLITE_CONSTRAINT_FOREIGNKEY'],
  [1299, 'SQLITE_CONSTRAINT_NOTNULL'],
  [275, 'SQLITE_CONSTRAINT_CHECK'],
  [1811, 'SQLITE_CONSTRAINT_TRIGGER'],
]);

function rethrow(err) {
  const code = CONSTRAINT_CODES.get(err?.errcode);
  if (!code || (err && err.code === code)) throw err;
  const wrapped = new Error(err.message);
  wrapped.code = code;
  wrapped.errcode = err.errcode;
  wrapped.stack = err.stack;
  throw wrapped;
}

function toPlain(row) {
  return row ? Object.assign({}, row) : row;
}

/* node:sqlite binds `undefined` as-is (and errors on it in some versions);
   better-sqlite3 treats undefined as NULL — match that behaviour. */
function normalizeParams(params) {
  if (!params) return params;
  return params.map((p) => (p === undefined ? null : p));
}

class Statement {
  constructor(stmt) {
    this._s = stmt;
  }

  run(...params) {
    try {
      const res = this._s.run(...normalizeParams(params));
      return {
        changes: Number(res.changes) || 0,
        lastInsertRowid: Number(res.lastInsertRowid) || 0,
      };
    } catch (err) {
      rethrow(err);
    }
  }

  get(...params) {
    try {
      return toPlain(this._s.get(...normalizeParams(params)));
    } catch (err) {
      rethrow(err);
    }
  }

  all(...params) {
    try {
      return this._s.all(...normalizeParams(params)).map(toPlain);
    } catch (err) {
      rethrow(err);
    }
  }
}

export default class Database {
  constructor(file) {
    this._db = new DatabaseSync(file);
  }

  pragma(sql) {
    this._db.exec(`PRAGMA ${sql}`);
    return this;
  }

  exec(sql) {
    this._db.exec(sql);
    return this;
  }

  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }

  /* better-sqlite3 style transaction wrapper: run fn with BEGIN/COMMIT
     (ROLLBACK on throw). Statements prepared on this db share the same
     connection, so everything fn does is part of the transaction. */
  transaction(fn) {
    const db = this;
    return (...args) => {
      db._db.exec('BEGIN');
      try {
        const res = fn(...args);
        db._db.exec('COMMIT');
        return res;
      } catch (err) {
        try { db._db.exec('ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    };
  }

  close() {
    this._db.close();
  }
}
