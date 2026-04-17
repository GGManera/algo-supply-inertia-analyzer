import { DB, AccountState } from './db.js';
import { Indexer, IndexerTxn } from './indexer.js';
import { CONFIG } from './config.js';

export async function runIncremental() {
  const lastProcessedRound = DB.getMetaInt('last_processed_round');
  if (!lastProcessedRound) {
    throw new Error('No last_processed_round found. Must run census first.');
  }

  console.log(`\n======================================`);
  console.log(`[Sync] Starting incremental update`);
  console.log(`[Sync] Resuming from block ${lastProcessedRound}`);
  console.log(`======================================\n`);

  let nextToken: string | undefined = undefined;
  let activeAddresses = new Set<string>();
  const trackedAddresses = DB.getTrackedAddresses();
  let latestRound = lastProcessedRound;
  let txnsProcessed = 0;

  // Phase 1: Sweep all new transactions
  console.log(`[Sync] Phase 1/2: Sweeping blocks...`);
  do {
    const res = await Indexer.fetchTransactionsSince(lastProcessedRound, nextToken);
    nextToken = res.nextToken;
    
    for (const txn of res.transactions) {
      if (txn['confirmed-round'] > latestRound) latestRound = txn['confirmed-round'];
      txnsProcessed++;

      // Check sender
      if (trackedAddresses.has(txn.sender)) {
        activeAddresses.add(txn.sender);
      }
      
      // Check receivers
      if (txn['payment-transaction']?.receiver && trackedAddresses.has(txn['payment-transaction'].receiver)) {
        activeAddresses.add(txn['payment-transaction'].receiver);
      }
      if (txn['asset-transfer-transaction']?.receiver && trackedAddresses.has(txn['asset-transfer-transaction'].receiver)) {
        activeAddresses.add(txn['asset-transfer-transaction'].receiver);
      }
    }
  } while (nextToken);

  console.log(`[Sync] Scanned ${txnsProcessed} transactions. Found ${activeAddresses.size} active tracked accounts.`);

  // Phase 2: Refresh state of active addresses
  if (activeAddresses.size > 0) {
    console.log(`[Sync] Phase 2/2: Refreshing state for ${activeAddresses.size} active accounts...`);
    const addressList = Array.from(activeAddresses);
    let updatedAccounts: (AccountState & { updated_at: number })[] = [];

    for (let i = 0; i < addressList.length; i += CONFIG.CONCURRENCY) {
      const chunk = addressList.slice(i, i + CONFIG.CONCURRENCY);
      
      const chunkResults = await Promise.all(
        chunk.map(async (address) => {
          const accRes = await Indexer.fetchAccount(address);
          if (!accRes) return null; // Account might be fully deleted/closed

          const lastTxn = await Indexer.fetchLastTransaction(address);
          return {
            address: accRes.account.address,
            balance_micro: accRes.account.amount,
            status: accRes.account.status,
            last_activity_ts: lastTxn ? lastTxn.roundTime : null,
            last_activity_round: lastTxn ? lastTxn.confirmedRound : null,
            created_at_round: accRes.account['created-at-round'],
            is_rekeyed: accRes.account['auth-addr'] ? 1 : 0,
            updated_at: Math.floor(Date.now() / 1000)
          } as AccountState & { updated_at: number };
        })
      );

      const validResults = chunkResults.filter(Boolean) as (AccountState & { updated_at: number })[];
      updatedAccounts.push(...validResults);
    }

    DB.upsertAccounts(updatedAccounts);
    console.log(`[Sync] Successfully refreshed ${updatedAccounts.length} accounts.`);
  } else {
    console.log(`[Sync] Phase 2/2: Skip. No tracked accounts moved.`);
  }

  DB.setMeta('last_processed_round', latestRound);
  console.log(`\n[Sync] Sync complete! Network at round ${latestRound}.\n`);
}
