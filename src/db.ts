import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { CONFIG } from './config.js';

// Ensure data directory exists
mkdirSync(dirname(CONFIG.DB_PATH), { recursive: true });

const db = new Database(CONFIG.DB_PATH);

// Initialize schema
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    address           TEXT PRIMARY KEY,
    balance_micro     INTEGER NOT NULL,
    status            TEXT NOT NULL,
    last_activity_ts  INTEGER,
    last_activity_round INTEGER,
    created_at_round  INTEGER,
    is_rekeyed        INTEGER DEFAULT 0,
    updated_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp       INTEGER NOT NULL,
    total_tracked   INTEGER NOT NULL,
    total_supply    REAL NOT NULL,
    distribution    TEXT NOT NULL
  );
`);

export interface AccountState {
  address: string;
  balance_micro: number;
  status: string;
  last_activity_ts: number | null;
  last_activity_round: number | null;
  created_at_round: number;
  is_rekeyed: number;
}

const stmts = {
  upsertAccount: db.prepare(`
    INSERT INTO accounts (address, balance_micro, status, last_activity_ts, last_activity_round, created_at_round, is_rekeyed, updated_at)
    VALUES (@address, @balance_micro, @status, @last_activity_ts, @last_activity_round, @created_at_round, @is_rekeyed, @updated_at)
    ON CONFLICT(address) DO UPDATE SET
      balance_micro = excluded.balance_micro,
      status = excluded.status,
      last_activity_ts = COALESCE(excluded.last_activity_ts, accounts.last_activity_ts),
      last_activity_round = COALESCE(excluded.last_activity_round, accounts.last_activity_round),
      updated_at = excluded.updated_at
  `),
  getTrackedAddresses: db.prepare(`SELECT address FROM accounts`),
  getAccounts: db.prepare(`SELECT * FROM accounts`),
  getMeta: db.prepare(`SELECT value FROM meta WHERE key = ?`),
  setMeta: db.prepare(`INSERT INTO meta (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
  insertSnapshot: db.prepare(`
    INSERT INTO snapshots (timestamp, total_tracked, total_supply, distribution)
    VALUES (@timestamp, @total_tracked, @total_supply, @distribution)
  `)
};

export const DB = {
  upsertAccounts(accounts: (AccountState & { updated_at: number })[]) {
    const transaction = db.transaction((accs) => {
      for (const acc of accs) {
        stmts.upsertAccount.run(acc);
      }
    });
    transaction(accounts);
  },
  
  getTrackedAddresses(): Set<string> {
    const rows = stmts.getTrackedAddresses.all() as {address: string}[];
    return new Set(rows.map(r => r.address));
  },

  getAllAccounts(): AccountState[] {
    return stmts.getAccounts.all() as AccountState[];
  },

  getMetaInt(key: string): number | null {
    const row = stmts.getMeta.get(key) as {value: string} | undefined;
    if (!row) return null;
    return parseInt(row.value, 10);
  },

  setMeta(key: string, value: string | number) {
    stmts.setMeta.run({ key, value: String(value) });
  },

  insertSnapshot(timestamp: number, total_tracked: number, total_supply: number, distribution: string) {
    stmts.insertSnapshot.run({ timestamp, total_tracked, total_supply, distribution });
  }
};
