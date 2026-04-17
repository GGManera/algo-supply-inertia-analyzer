import { CONFIG } from './config.js';

export interface IndexerAccount {
  address: string;
  amount: number;
  status: string;
  'created-at-round': number;
  'auth-addr'?: string;
}

export interface IndexerTxn {
  sender: string;
  'tx-type': string;
  'round-time': number;
  'confirmed-round': number;
  'payment-transaction'?: { receiver: string };
  'asset-transfer-transaction'?: { receiver: string };
}

async function apiFetch<T>(url: string, retries = CONFIG.RETRY_ATTEMPTS): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('Rate limit exceeded');
        }
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      return await res.json() as T;
    } catch (err: any) {
      if (i === retries) throw err;
      const delay = CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, i);
      console.warn(`[Indexer] Error fetching ${url}: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

export const Indexer = {
  async fetchAccountsPage(minBalanceMicro: number, nextToken?: string): Promise<{ accounts: IndexerAccount[], nextToken?: string, currentRound: number }> {
    let url = `${CONFIG.INDEXER_BASE}/v2/accounts?currency-greater-than=${minBalanceMicro}&limit=${CONFIG.ACCOUNTS_PAGE_SIZE}&exclude=all`;
    if (nextToken) url += `&next=${encodeURIComponent(nextToken)}`;
    
    const data = await apiFetch<any>(url);
    return {
      accounts: data.accounts || [],
      nextToken: data['next-token'],
      currentRound: data['current-round']
    };
  },

  async fetchLastTransaction(address: string): Promise<{ roundTime: number, confirmedRound: number } | null> {
    const url = `${CONFIG.INDEXER_BASE}/v2/accounts/${address}/transactions?limit=1`;
    const data = await apiFetch<any>(url);
    const txns = data.transactions || [];
    if (txns.length === 0) return null;
    return {
      roundTime: txns[0]['round-time'],
      confirmedRound: txns[0]['confirmed-round']
    };
  },

  async fetchTransactionsSince(minRound: number, nextToken?: string): Promise<{ transactions: IndexerTxn[], nextToken?: string }> {
    let url = `${CONFIG.INDEXER_BASE}/v2/transactions?min-round=${minRound}&limit=${CONFIG.TXN_PAGE_SIZE}`;
    if (nextToken) url += `&next=${encodeURIComponent(nextToken)}`;
    
    const data = await apiFetch<any>(url);
    return {
      transactions: data.transactions || [],
      nextToken: data['next-token']
    };
  },

  async fetchAccount(address: string): Promise<{ account: IndexerAccount, currentRound: number } | null> {
    try {
      const url = `${CONFIG.INDEXER_BASE}/v2/accounts/${address}?exclude=all`;
      const data = await apiFetch<any>(url);
      return { account: data.account, currentRound: data['current-round'] };
    } catch (e: any) {
      if (e.message.includes('404')) return null;
      throw e;
    }
  }
};
