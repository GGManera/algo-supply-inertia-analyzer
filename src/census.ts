import { CONFIG } from './config.js';
import { DB, AccountState } from './db.js';
import { Indexer, IndexerAccount } from './indexer.js';

export async function runCensus() {
  console.log(`\n======================================`);
  console.log(`[Census] Starting initial account census`);
  console.log(`[Census] Threshold: ≥ ${CONFIG.MIN_BALANCE_ALGO.toLocaleString()} ALGO`);
  console.log(`======================================\n`);

  let nextToken: string | undefined = undefined;
  let accountsToProcess: IndexerAccount[] = [];
  let totalProcessed = 0;
  let lastRound = 0;

  // Phase 1: Sweep all accounts > threshold
  console.log(`[Census] Phase 1/2: Sweeping top accounts...`);
  do {
    const res = await Indexer.fetchAccountsPage(CONFIG.MIN_BALANCE_MICRO, nextToken);
    nextToken = res.nextToken;
    lastRound = res.currentRound;

    const filtered = res.accounts.filter(a => !CONFIG.EXCLUDED_ADDRESSES.includes(a.address));
    accountsToProcess.push(...filtered);

    process.stdout.write(`\r[Census] Fetched ${accountsToProcess.length} accounts...`);
  } while (nextToken);

  console.log(`\n[Census] Found ${accountsToProcess.length} valid accounts. Using round ${lastRound} as baseline.`);
  
  // Optimization: Get existing addresses to avoid redundant transaction lookups
  const existingAddresses = DB.getTrackedAddresses();

  // Phase 2: Probe last activity for each account
  console.log(`\n[Census] Phase 2/2: Probing last activity for ${accountsToProcess.length} accounts`);
  console.log(`[Census] This will take a few minutes. Concurrency: ${CONFIG.CONCURRENCY}\n`);

  for (let i = 0; i < accountsToProcess.length; i += CONFIG.CONCURRENCY) {
    const chunk = accountsToProcess.slice(i, i + CONFIG.CONCURRENCY);
    
    const chunkResults = await Promise.all(
      chunk.map(async (acc) => {
        // Only fetch if we don't have this account yet
        // OR if the account exists but has no activity history
        let lastActivityTs: number | null = null;
        let lastActivityRound: number | null = null;

        if (existingAddresses.has(acc.address)) {
          // If already in DB, we'll keep previous history but update balance from current census
          // This saves thousands of API calls during periodic refreshes
          return {
            address: acc.address,
            balance_micro: acc.amount,
            status: acc.status,
            // Keep existing (handled by DB.upsertAccount logic or we could fetch from DB here)
            // But actually our upsertAccount in db.ts updates everything. 
            // So we need to be careful not to overwrite history with nulls.
            last_activity_ts: undefined, // undefined in our DB logic means "don't update this column" if we tweak it
            last_activity_round: undefined,
            created_at_round: acc['created-at-round'],
            is_rekeyed: acc['auth-addr'] ? 1 : 0,
            updated_at: Math.floor(Date.now() / 1000)
          } as any;
        }

        const lastTxn = await Indexer.fetchLastTransaction(acc.address);
        return {
          address: acc.address,
          balance_micro: acc.amount,
          status: acc.status,
          last_activity_ts: lastTxn ? lastTxn.roundTime : null,
          last_activity_round: lastTxn ? lastTxn.confirmedRound : null,
          created_at_round: acc['created-at-round'],
          is_rekeyed: acc['auth-addr'] ? 1 : 0,
          updated_at: Math.floor(Date.now() / 1000)
        } as AccountState & { updated_at: number };
      })
    );

    // Save batch to DB
    DB.upsertAccounts(chunkResults);
    totalProcessed += chunk.length;
    
    const pct = ((totalProcessed / accountsToProcess.length) * 100).toFixed(1);
    process.stdout.write(`\r[Census] Progress: ${totalProcessed} / ${accountsToProcess.length} (${pct}%) processed...`);
  }

  // ONLY mark as complete when everything is finished
  DB.setMeta('last_processed_round', lastRound);
  DB.setMeta('last_census_ts', Date.now());
  DB.setMeta('census_total', accountsToProcess.length);

  console.log(`\n[Census] Census complete! Tracked supply updated.\n`);
}
