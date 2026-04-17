import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Timer, 
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Bucket {
  name: string;
  emoji: string;
  count: number;
  supply: number;
}

interface Stats {
  totalTracked: number;
  lastProcessedRound: number;
  censusTotal: number;
  currentCount: number;
  thresholdAlgo: number;
}

interface Distribution {
  total_supply: number;
  buckets: Bucket[];
  unknown: { count: number; supply: number };
}

function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dist, setDist] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [bucketDetails, setBucketDetails] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [statsRes, distRes] = await Promise.all([
        fetch('http://localhost:3000/api/stats'),
        fetch('http://localhost:3000/api/distribution')
      ]);
      const statsData = await statsRes.json();
      const distData = await distRes.json();
      setStats(statsData);
      setDist(distData);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleExpand = async (bucketName: string) => {
    if (expandedBucket === bucketName) {
      setExpandedBucket(null);
      return;
    }
    setExpandedBucket(bucketName);
    setBucketDetails(null); // loading state
    
    try {
      const res = await fetch(`http://localhost:3000/api/bucket/${encodeURIComponent(bucketName)}`);
      const details = await res.json();
      setBucketDetails(details);
    } catch (e) {
      console.error(e);
    }
  };

  const renderAddress = (addr: string) => addr.substring(0, 8) + '...' + addr.substring(addr.length - 8);

  const formatAlgo = (val: number) => {
    return Math.floor(val).toLocaleString();
  };

  if (loading) return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="dot" style={{ width: 40, height: 40 }}></div>
    </div>
  );

  const progress = stats && stats.censusTotal > 0 
    ? (stats.currentCount / stats.censusTotal) * 100 
    : 0;


  return (
    <div className="dashboard-container">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="live-indicator">
            <span className="dot"></span> LIVE NETWORK ANALYZER
          </div>
          <h1>Supply Inertia</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="card-label">Last Round</p>
          <p style={{ fontSize: '1.2rem', fontWeight: 600 }}>{stats?.lastProcessedRound?.toLocaleString() || '--'}</p>
        </div>
      </motion.header>

      <div className="stats-grid">
        <motion.div className="card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          <div className="card-label"><Wallet size={16} color="#00d2ff"/> Tracked Supply</div>
          <div className="card-value">{dist ? formatAlgo(dist.total_supply / 1000000) : '--'} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>ALGO</span></div>
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <div className="card-label"><Database size={16} color="#9d50bb"/> Wallets</div>
          <div className="card-value">{stats?.totalTracked.toLocaleString()}</div>
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <div className="card-label"><Timer size={16} color="#ffa500"/> Threshold</div>
          <div className="card-value">≥ {stats?.thresholdAlgo.toLocaleString()} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>ALGO</span></div>
        </motion.div>
      </div>

      {progress < 100 && (
        <motion.div 
          className="chart-container progress-section"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3 className="card-label"><Activity size={16}/> Initial Sync Progress</h3>
            <span className="badge">{progress.toFixed(1)}%</span>
          </div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <p style={{ marginTop: 15, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Processing deep account history: {stats?.currentCount} / {stats?.censusTotal} accounts
          </p>
        </motion.div>
      )}

      <motion.div 
        className="chart-container"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="chart-header">
          <h2 style={{ fontSize: '1.5rem', marginBottom: 10 }}>Activity Spectrum</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Distribution of ALGO based on time since last wallet movement.</p>
        </div>

        <div className="bucket-list">
          <AnimatePresence>
            {dist?.buckets.map((b, idx) => (
              <React.Fragment key={b.name}>
                <motion.div 
                  className="bucket-item"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleExpand(b.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                    <span style={{ fontSize: '1.2rem' }}>{b.emoji}</span> {b.name}
                  </div>
                  
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${dist.total_supply > 0 ? (b.supply * 1000000 / dist.total_supply) * 100 : 0}%` }}
                      style={{ 
                        height: '100%', 
                        background: b.name === 'Inert' || b.name === 'Frozen' ? '#555577' : 'var(--accent-primary)',
                        borderRadius: 10 
                      }}
                    />
                  </div>

                  <div style={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatAlgo(b.supply)} <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ALGO</span>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span className="badge" style={{ backgroundColor: 'rgba(0, 210, 255, 0.05)' }}>
                      {b.count} wlt
                    </span>
                  </div>
                </motion.div>
                
                <AnimatePresence>
                  {expandedBucket === b.name && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bucket-details"
                    >
                      {!bucketDetails ? (
                        <p style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading details...</p>
                      ) : (
                        <div style={{ padding: '20px' }}>
                           <p style={{ color: 'var(--accent-primary)', marginBottom: '20px', fontWeight: 600 }}>
                             <Activity size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 5}}/> 
                             Criteria: {bucketDetails.criteria}
                           </p>

                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                             {/* Top Balances */}
                             <div>
                               <h4 style={{ marginBottom: '15px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.85rem' }}>🔥 Top 10 by Balance</h4>
                               <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                 {bucketDetails.topBalance.map((a: any) => (
                                    <li key={a.address} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}>
                                      <code style={{ color: '#aaa'}}>{renderAddress(a.address)}</code>
                                      <strong style={{ color: '#fff'}}>{formatAlgo(a.balance_micro / 1000000)} ALGO</strong>
                                    </li>
                                 ))}
                                 {bucketDetails.topBalance.length === 0 && <span style={{ color: '#555' }}>None found.</span>}
                               </ul>
                             </div>

                             {/* Top Recent */}
                             <div>
                               <h4 style={{ marginBottom: '15px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.85rem' }}>⏱️ Most Upcoming/Recent</h4>
                               <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                 {bucketDetails.topRecent.map((a: any) => (
                                    <li key={a.address} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}>
                                      <code style={{ color: '#aaa'}}>{renderAddress(a.address)}</code>
                                      <span style={{ color: 'var(--text-secondary)'}}>{a.last_activity_ts ? new Date(a.last_activity_ts * 1000).toISOString().split('T')[0] : 'N/A'}</span>
                                    </li>
                                 ))}
                                 {bucketDetails.topRecent.length === 0 && <span style={{ color: '#555' }}>None found.</span>}
                               </ul>
                             </div>
                           </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      <footer style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', paddingTop: 20 }}>
        Powered by Algorand Agent Skills • Live behavioral analysis on Mainnet
      </footer>
    </div>
  );
}

export default App;
