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

// API Endpoints
app.get('/api/stats', (req, res) => {
  try {
    const accounts = DB.getAllAccounts();
    const lastProcessedRound = DB.getMetaInt('last_processed_round');
    const censusTotal = DB.getMetaInt('census_total') || 0;
    
    res.json({
      totalTracked: accounts.filter(a => a.balance_micro >= CONFIG.MIN_BALANCE_MICRO).length,
      lastProcessedRound,
      censusTotal,
      currentCount: accounts.length,
      thresholdAlgo: CONFIG.MIN_BALANCE_ALGO
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/distribution', (req, res) => {
    try {
        // We recreate the classification logic for real-time dashboard viewing
        // In a more complex app we'd cache this or use the last snapshot
        const accounts = DB.getAllAccounts();
        const now = Math.floor(Date.now() / 1000);
        
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

        res.json({
            total_supply,
            buckets: buckets.map(b => ({ name: b.name, emoji: b.emoji, count: b.count, supply: b.supply_micro / 1000000 })),
            unknown: { count: unknown.count, supply: unknown.supply_micro / 1000000 }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bucket/:name', (req, res) => {
  try {
    const bucketName = req.params.name;
    const bucketIdx = CONFIG.INERTIA_BUCKETS.findIndex(b => b.name === bucketName);
    if (bucketIdx === -1 && bucketName !== 'Unknown') return res.status(404).json({ error: 'Bucket not found' });
    
    const maxDays = bucketName === 'Unknown' ? -1 : CONFIG.INERTIA_BUCKETS[bucketIdx].maxDays;
    const minDays = bucketName === 'Unknown' ? -1 : (bucketIdx > 0 ? CONFIG.INERTIA_BUCKETS[bucketIdx - 1].maxDays : 0);
    
    // Formatting the criteria string
    let criteria = '';
    if (bucketName === 'Unknown') criteria = 'No last transaction timestamp available.';
    else if (minDays === 0) criteria = `Moved funds within the last ${maxDays} days.`;
    else if (maxDays === Infinity) criteria = `No activity for over ${minDays} days.`;
    else criteria = `Inactive for ${minDays} to ${maxDays} days.`;

    const accounts = DB.getAllAccounts().filter(a => a.balance_micro >= CONFIG.MIN_BALANCE_MICRO);
    const now = Math.floor(Date.now() / 1000);
    
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

    // Top 10 by Balance
    const topBalance = [...bucketAccounts]
      .sort((a, b) => b.balance_micro - a.balance_micro)
      .slice(0, 10);
      
    // Top 10 by Most Recent Activity (highest timestamp)
    const topRecent = [...bucketAccounts]
      .sort((a, b) => (b.last_activity_ts || 0) - (a.last_activity_ts || 0))
      .slice(0, 10);

    res.json({
      criteria,
      topBalance,
      topRecent
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend if built
const dashboardDist = path.join(process.cwd(), 'dashboard/dist');
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
      res.status(404).send('Dashboard UI not found. Please run "npm run build" in dashboard folder.');
    }
  });
});

export function startServer() {
  app.listen(port, () => {
    console.log(`[Dashboard] Server running at http://localhost:${port}`);
  });
}
