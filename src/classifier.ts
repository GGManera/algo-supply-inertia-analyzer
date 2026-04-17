import { DB, AccountState } from './db.js';
import { CONFIG } from './config.js';

export interface BucketStats {
  name: string;
  emoji: string;
  count: number;
  supply_micro: number;
}

export interface ClassificationReport {
  timestamp: number;
  total_tracked: number;
  total_supply_micro: number;
  buckets: BucketStats[];
  online_inert_count: number;
}

export function generateClassificationReport(): ClassificationReport {
  const accounts = DB.getAllAccounts();
  const now = Math.floor(Date.now() / 1000);
  
  let total_supply = 0;
  let online_inert_count = 0;
  
  // Initialize buckets
  const buckets = [...CONFIG.INERTIA_BUCKETS].map(b => ({
    name: b.name,
    emoji: b.emoji,
    maxDays: b.maxDays,
    count: 0,
    supply_micro: 0
  }));
  
  const unknownBucket = { name: 'Unknown', emoji: '❓', count: 0, supply_micro: 0 };

  for (const acc of accounts) {
    if (acc.balance_micro < CONFIG.MIN_BALANCE_MICRO) continue; // Skip dropped balances
    
    total_supply += acc.balance_micro;

    if (!acc.last_activity_ts) {
      unknownBucket.count++;
      unknownBucket.supply_micro += acc.balance_micro;
      continue;
    }

    const daysSince = (now - acc.last_activity_ts) / (60 * 60 * 24);
    
    // Find the right bucket
    let assigned = false;
    for (const b of buckets) {
      if (daysSince <= b.maxDays) {
        b.count++;
        b.supply_micro += acc.balance_micro;
        assigned = true;
        
        // Track Online but Inert
        if (b.name === 'Inert' && acc.status === 'Online') {
          online_inert_count++;
        }
        break;
      }
    }
  }

  // Strip internal maxDays logic and format the final array
  const finalBuckets = buckets.map(b => ({
    name: b.name,
    emoji: b.emoji,
    count: b.count,
    supply_micro: b.supply_micro
  }));
  
  if (unknownBucket.count > 0) {
    finalBuckets.push(unknownBucket);
  }

  return {
    timestamp: now,
    total_tracked: accounts.filter(a => a.balance_micro >= CONFIG.MIN_BALANCE_MICRO).length,
    total_supply_micro: total_supply,
    buckets: finalBuckets,
    online_inert_count
  };
}
