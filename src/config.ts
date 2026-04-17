import 'dotenv/config';

export const CONFIG = {
  INDEXER_BASE: process.env.INDEXER_BASE || 'https://mainnet-idx.algonode.cloud',
  MIN_BALANCE_ALGO: Number(process.env.THRESHOLD_ALGO) || 5_000,
  get MIN_BALANCE_MICRO() { return this.MIN_BALANCE_ALGO * 1_000_000 },
  
  PORT: Number(process.env.PORT) || 3000,
  DB_PATH: process.env.DB_PATH || './data/supply.db',
  
  ACCOUNTS_PAGE_SIZE: 1000,
  TXN_PAGE_SIZE: 1000,
  CONCURRENCY: Number(process.env.CONCURRENCY) || 30,
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1000,
  
  EXCLUDED_ADDRESSES: [
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ', // Zero address
  ],
  
  INERTIA_BUCKETS: [
    { name: 'Hot',     emoji: '⚡', maxDays: 1 },
    { name: 'Active',  emoji: '🟢', maxDays: 7 },
    { name: 'Warm',    emoji: '🟡', maxDays: 30 },
    { name: 'Cooling', emoji: '🟠', maxDays: 90 },
    { name: 'Cold',    emoji: '🔴', maxDays: 180 },
    { name: 'Frozen',  emoji: '🧊', maxDays: 365 },
    { name: 'Inert',   emoji: '💀', maxDays: Infinity },
  ],
};
