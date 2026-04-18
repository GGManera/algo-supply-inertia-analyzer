import express from 'express';
import cors from 'cors';
import { DB } from './db.js';
import { CONFIG } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = CONFIG.PORT;

app.use(cors());
app.use(express.json());

// Simple In-Memory Cache to prevent heavy DB scans on every request
let cache: any = {
  stats: null,
  distribution: null,
  buckets: {},
  hodl: {},
  lastUpdate: 0
};

const CACHE_TTL = 10000; // 10 seconds

app.get('/api/stats', (req, res) => {
  try {
    const now = Date.now();
    if (cache.stats && (now - cache.lastUpdate < CACHE_TTL)) {
       return res.json(cache.stats);
    }

    const accounts = DB.getAllAccounts();
    const lastProcessedRound = DB.getMetaInt('last_processed_round');
    const censusTotal = DB.getMetaInt('census_total') || 0;
    
    const stats = {
      totalTracked: accounts.filter(a => a.balance_micro >= CONFIG.MIN_BALANCE_MICRO).length,
      lastProcessedRound,
      censusTotal,
      currentCount: accounts.length,
      thresholdAlgo: CONFIG.MIN_BALANCE_ALGO
    };
    
    cache.stats = stats;
    cache.lastUpdate = now;
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/distribution', (req, res) => {
    try {
        const nowMs = Date.now();
        if (cache.distribution && (nowMs - cache.lastUpdate < CACHE_TTL)) {
            return res.json(cache.distribution);
        }

        const accounts = DB.getAllAccounts();
        const now = Math.floor(nowMs / 1000);
        
        const buckets = [...CONFIG.INERTIA_BUCKETS].map(b => ({
            name: b.name,
            emoji: b.emoji,
            maxDays: b.maxDays,
            count: 0,
            supply_micro: 0
        }));
        
        let total_supply = 0;
        const unknown = { name: 'Unknown', emoji: '❓', count: 0, supply_micro: 0 };

        for (const acc of accounts) {
            if (acc.balance_micro < CONFIG.MIN_BALANCE_MICRO) continue;
            total_supply += acc.balance_micro;

            if (!acc.last_activity_ts) {
                unknown.count++;
                unknown.supply_micro += acc.balance_micro;
                continue;
            }

            const daysSince = (now - acc.last_activity_ts) / (86400);
            let assigned = false;
            for (const b of buckets) {
                if (daysSince <= b.maxDays) {
                    b.count++;
                    b.supply_micro += acc.balance_micro;
                    assigned = true;
                    break;
                }
            }
        }

        const result = {
            total_supply,
            buckets: buckets.map(b => ({ name: b.name, emoji: b.emoji, count: b.count, supply: b.supply_micro / 1000000 })),
            unknown: { count: unknown.count, supply: unknown.supply_micro / 1000000 }
        };
        
        cache.distribution = result;
        cache.lastUpdate = nowMs;
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bucket/:name', (req, res) => {
  try {
    const bucketName = req.params.name;
    const nowMs = Date.now();
    
    if (cache.buckets[bucketName] && (nowMs - cache.buckets[bucketName].ts < CACHE_TTL)) {
      return res.json(cache.buckets[bucketName].data);
    }

    const bucketIdx = CONFIG.INERTIA_BUCKETS.findIndex(b => b.name === bucketName);
    if (bucketIdx === -1 && bucketName !== 'Unknown') return res.status(404).json({ error: 'Bucket not found' });
    
    const maxDays = bucketName === 'Unknown' ? -1 : CONFIG.INERTIA_BUCKETS[bucketIdx].maxDays;
    const minDays = bucketName === 'Unknown' ? -1 : (bucketIdx > 0 ? CONFIG.INERTIA_BUCKETS[bucketIdx - 1].maxDays : 0);
    
    let criteria = '';
    if (bucketName === 'Unknown') criteria = 'No last transaction timestamp available.';
    else if (minDays === 0) criteria = `Moved funds within the last ${maxDays} days.`;
    else if (maxDays === Infinity) criteria = `No activity for over ${minDays} days.`;
    else criteria = `Inactive for ${minDays} to ${maxDays} days.`;

    const accounts = DB.getAllAccounts().filter(a => a.balance_micro >= CONFIG.MIN_BALANCE_MICRO);
    const now = Math.floor(nowMs / 1000);
    
    let bucketAccounts = [];
    if (bucketName === 'Unknown') {
      bucketAccounts = accounts.filter(a => !a.last_activity_ts);
    } else {
      bucketAccounts = accounts.filter(a => {
        if (!a.last_activity_ts) return false;
        const daysSince = (now - a.last_activity_ts) / 86400;
        return daysSince > minDays && daysSince <= maxDays;
      });
    }

    const topBalance = [...bucketAccounts].sort((a, b) => b.balance_micro - a.balance_micro).slice(0, 10);
    const topRecent = [...bucketAccounts].sort((a, b) => (b.last_activity_ts || 0) - (a.last_activity_ts || 0)).slice(0, 10);

    const result = { criteria, topBalance, topRecent };
    cache.buckets[bucketName] = { data: result, ts: nowMs };
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hodl', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 0;
    const nowMs = Date.now();
    
    if (cache.hodl[days] && (nowMs - cache.hodl[days].ts < CACHE_TTL)) {
      return res.json(cache.hodl[days].data);
    }

    const accounts = DB.getAllAccounts().filter(a => a.balance_micro >= CONFIG.MIN_BALANCE_MICRO);
    const now = Math.floor(nowMs / 1000);
    
    let hodlSupplyMicro = 0;
    let hodlCount = 0;

    for (const a of accounts) {
      if (!a.last_activity_ts) continue;
      const daysSince = (now - a.last_activity_ts) / 86400;
      if (daysSince >= days) {
        hodlSupplyMicro += a.balance_micro;
        hodlCount++;
      }
    }

    const result = { days, supply: hodlSupplyMicro / 1000000, count: hodlCount };
    cache.hodl[days] = { data: result, ts: nowMs };
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend if built
const dashboardDist = path.join(process.cwd(), 'Dashboard/dist');
app.use(express.static(dashboardDist));

app.use((req, res, next) => {
  // If request implies an API call that wasn't handled, return 404 JSON to prevent sending HTML
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  
  res.sendFile(path.join(dashboardDist, 'index.html'), err => {
    if (err) {
      // The browser polling causes 404 for missing assets. We ignore missing sourcemaps or favicons silently.
      if (!req.url.includes('.map') && !req.url.includes('favicon.ico') && !req.url.includes('.well-known')) {
         console.warn(`[Dashboard] Could not serve index.html for request ${req.url}: ${err.message}`);
      }
      res.status(404).send('Dashboard UI not found. Please run "npm run build" in Dashboard folder.');
    }
  });
});

export function startServer() {
  // Listen on all network interfaces (0.0.0.0)
  app.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`[Dashboard] Server running at http://0.0.0.0:${CONFIG.PORT}`);
  });
}
