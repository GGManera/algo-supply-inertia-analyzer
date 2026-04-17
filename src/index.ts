import { DB } from './db.js';
import { runCensus } from './census.js';
import { runIncremental } from './incremental.js';
import { generateClassificationReport } from './classifier.js';
import { printAndSaveReport } from './report.js';
import { startServer } from './server.js';
import { CONFIG } from './config.js';

async function main() {
  const args = process.argv.slice(2);
  const forceCensus = args.includes('--force-census');
    const lastProcessedRound = DB.getMetaInt('last_processed_round');
  const storedThreshold = DB.getMetaInt('threshold_micro');
  const currentThreshold = CONFIG.MIN_BALANCE_MICRO;
  
  // If threshold decreased, we MUST do a census to catch wallets that were previously ignored.
  const thresholdChanged = storedThreshold && currentThreshold < storedThreshold;

  // Start the dashboard server in the background
  startServer();

  try {
    if (!lastProcessedRound || forceCensus || thresholdChanged) {
      if (thresholdChanged) console.log(`[Analyzer] Threshold lowered from ${storedThreshold/1000000} to ${currentThreshold/1000000}. Triggering live Census merge...`);
      await runCensus();
      DB.setMeta('threshold_micro', currentThreshold); // update memory
      console.log(`[Analyzer] Census complete. Generating report...`);
      printAndSaveReport(generateClassificationReport());
    }
    
    // Always ensure DB threshold is up to date
    DB.setMeta('threshold_micro', currentThreshold);

    console.log(`[Analyzer] Entering Continuous Sync Mode. Press Ctrl+C to exit.`);
    console.log(`[Dashboard] Try opening http://localhost:3000 in your browser.`);
    
    // Run incremental immediately if we didn't just do a census
    if (lastProcessedRound && !forceCensus && !thresholdChanged) {
      await runIncremental();
      printAndSaveReport(generateClassificationReport());
    }

    // Keep syncing periodically
    let isProcessing = false;

    setInterval(async () => {
      if (isProcessing) return;
      isProcessing = true;
      
      try {
        await runIncremental();
        
        // Check if we need to run a background census (every 12 hours)
        const lastCensusTs = DB.getMetaInt('last_census_ts') || 0;
        const twelveHoursInMs = 12 * 60 * 60 * 1000;
        const now = Date.now();
        
        if (now - lastCensusTs > twelveHoursInMs) {
          console.log(`[Analyzer] 12 hours passed since last census. Running background refresh...`);
          await runCensus();
          DB.setMeta('last_census_ts', now);
          console.log(`[Analyzer] Background census complete.`);
        }

        printAndSaveReport(generateClassificationReport());
      } catch (err: any) {
        console.error(`[Sync Loop Error] ${err.message}`);
      } finally {
        isProcessing = false;
      }
    }, 30000); // 30 seconds interval

    // Mark current run as a census point if it's the first time
    if (!DB.getMetaInt('last_census_ts')) {
      DB.setMeta('last_census_ts', Date.now());
    }

  } catch (err: any) {
    console.error(`\n[FATAL ERROR] ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
