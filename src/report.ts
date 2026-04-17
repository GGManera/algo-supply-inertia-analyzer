import { ClassificationReport } from './classifier.js';
import { DB } from './db.js';
import { CONFIG } from './config.js';

function formatAlgo(microAlgos: number): string {
  const algo = microAlgos / 1_000_000;
  return algo.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function padRight(str: string, len: number): string {
  return str.padEnd(len, ' ');
}

function padLeft(str: string, len: number): string {
  return str.padStart(len, ' ');
}

export function printAndSaveReport(report: ClassificationReport) {
  const dateStr = new Date(report.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
  
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║            ALGORAND SUPPLY INERTIA REPORT                    ║`);
  console.log(`║            ${dateStr}                                ║`);
  console.log(`║            Threshold: ≥ ${CONFIG.MIN_BALANCE_ALGO.toLocaleString()} ALGO                         ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Tracked: ${padRight(report.total_tracked.toLocaleString(), 15)} │  Total: ${padRight(formatAlgo(report.total_supply_micro) + ' ALGO', 19)} ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Bucket      │  Accounts  │  ALGO Balance   │  % of Total    ║`);
  console.log(`╠══════════════╪════════════╪═════════════════╪════════════════╣`);

  for (const b of report.buckets) {
    const bucketStr = ` ${b.emoji} ${b.name}`;
    const countStr = b.count.toLocaleString();
    const balanceStr = formatAlgo(b.supply_micro);
    const pct = report.total_supply_micro > 0 
      ? ((b.supply_micro / report.total_supply_micro) * 100).toFixed(2)
      : '0.00';
    
    console.log(`║ ${padRight(bucketStr, 12)} │ ${padLeft(countStr, 10)} │ ${padLeft(balanceStr, 15)} │ ${padLeft(pct + '%', 13)}  ║`);
  }

  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  
  // Create an insight out of the Frozen + Inert buckets
  const dormantBuckets = report.buckets.filter(b => b.name === 'Frozen' || b.name === 'Inert');
  const dormantSupply = dormantBuckets.reduce((sum, b) => sum + b.supply_micro, 0);
  const dormantPct = report.total_supply_micro > 0 
      ? ((dormantSupply / report.total_supply_micro) * 100).toFixed(2)
      : '0.00';

  console.log(`║  🔑 Key Insight                                              ║`);
  console.log(`║  ${padRight(dormantPct + '% of tracked supply has not moved in 6+ months.', 58)}║`);
  console.log(`║  Of the 💀 Inert accounts, ${padRight(report.online_inert_count.toLocaleString() + ' are Online (consensus).', 32)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);

  // Save to DB
  DB.insertSnapshot(
    report.timestamp,
    report.total_tracked,
    report.total_supply_micro,
    JSON.stringify(report.buckets)
  );

  console.log(`[Report] Snapshot saved to database.`);
}
