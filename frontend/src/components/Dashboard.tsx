import { useState, useEffect } from 'react';
import { 
  FolderOpen, 
  Layers, 
  TrendingDown, 
  Activity,
  Boxes,
  CheckCircle,
  AlertCircle,
  XCircle,
  Radio,
  AlertOctagon,
  Copy,
  ExternalLink,
  Check
} from 'lucide-react';

interface DashboardData {
  summary: {
    categories: number;
    skus: number;
    activeSkus: number;
    outofstockSkus: number;
    inactiveSkus: number;
    permanentInactiveSkus?: number;
    totalSets: number;
    totalPieces: number;
    addedToday: { sets: number; pieces: number };
    reducedToday: { sets: number; pieces: number };
  };
  categoryBreakdown: Array<{
    id: number;
    name: string;
    skuCount: number;
    totalSets: number;
    totalPieces: number;
  }>;
  recentActivity: Array<{
    id: number;
    change_type: 'addition' | 'reduction' | 'status_change';
    sets_changed: number;
    pieces_changed: number;
    previous_available?: boolean;
    new_available?: boolean;
    created_at: string;
    sku_id: string;
    category_name: string;
    username: string;
  }>;
  trends: Array<{
    date: string;
    sets_added: number;
    sets_reduced: number;
  }>;
}

interface DashboardProps {
  token: string;
}

export default function Dashboard({ token }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showcaseSummary, setShowcaseSummary] = useState<{
    showcaseItemCount: number;
    activeLinksCount: number;
    activeLink: any;
  } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [suspendMsg, setSuspendMsg] = useState('');

  useEffect(() => {
    fetchDashboardData();
    fetchShowcase();
    const interval = setInterval(() => {
      fetchDashboardData();
      fetchShowcase();
    }, 30000); // refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // 1-second interval to decrement remaining_seconds smoothly on screen
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchShowcase = async () => {
    try {
      const res = await fetch('/api/admin/showcase/summary', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const sum = await res.json();
        setShowcaseSummary(sum);
        if (sum.activeLink?.expires_at) {
          const diff = Math.max(0, Math.floor((new Date(sum.activeLink.expires_at).getTime() - Date.now()) / 1000));
          setRemainingSeconds(diff);
        } else {
          setRemainingSeconds(0);
        }
      }
    } catch (e) {}
  };

  const handleSuspendShowcase = async () => {
    if (!showcaseSummary?.activeLink) return;
    if (!window.confirm('Suspend this active showcase link immediately? Customers will be blocked from viewing catalog designs and shown the contact notice.')) return;
    setSuspending(true);
    try {
      const res = await fetch(`/api/admin/showcase/links/${showcaseSummary.activeLink.token}/suspend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuspendMsg('Showcase page suspended immediately! Customer access is blocked.');
        setTimeout(() => setSuspendMsg(''), 4000);
        fetchShowcase();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSuspending(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const resData = await response.json();
        setData(resData);
      }
    } catch (e) {
      console.error('Failed to load dashboard statistics', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading Dashboard Overview...</p>
      </div>
    );
  }

  // Find max value in trends to scale SVG chart heights
  const maxTrendVal = Math.max(
    ...data.trends.map(t => Math.max(Number(t.sets_added), Number(t.sets_reduced))),
    10 // minimum default scale
  );

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Title */}
      <div className="flex-between">
        <div>
          <h1>Stock Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Real-time inventory overview and audit tracking</p>
        </div>
        <button onClick={fetchDashboardData} className="btn btn-secondary">
          Refresh Data
        </button>
      </div>

      {/* Active Showcase Monitor Banner */}
      {showcaseSummary?.activeLink && remainingSeconds > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 4px 20px rgba(16, 185, 129, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid #10b981',
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Radio size={20} color="#34d399" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Live Client Showcase Page Active
                </span>
                <span style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  color: '#34d399',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  ⏱️ {Math.floor(remainingSeconds / 3600).toString().padStart(2, '0')}h : {Math.floor((remainingSeconds % 3600) / 60).toString().padStart(2, '0')}m : {(remainingSeconds % 60).toString().padStart(2, '0')}s remaining
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '1rem' }}>
                <span>Token: <strong style={{ color: '#fff' }}>{showcaseSummary.activeLink.token}</strong></span>
                <span>Designs: <strong style={{ color: '#fff' }}>{showcaseSummary.activeLink.item_count || showcaseSummary.showcaseItemCount}</strong></span>
                <span>Views: <strong style={{ color: '#38bdf8' }}>{showcaseSummary.activeLink.views_count || 0}</strong></span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => {
                const url = showcaseSummary.activeLink.token 
                  ? `${window.location.origin}/showcase/${showcaseSummary.activeLink.token}`
                  : showcaseSummary.activeLink.url;
                navigator.clipboard.writeText(url);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
              }}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {copiedLink ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copiedLink ? 'Copied!' : 'Copy Link'}
            </button>

            <a
              href={`${window.location.origin}/showcase/${showcaseSummary.activeLink.token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.8rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
            >
              <ExternalLink size={14} /> Preview
            </a>

            <button
              onClick={handleSuspendShowcase}
              disabled={suspending}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#f87171',
                fontWeight: 700,
                fontSize: '0.8rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
              title="Suspend this showcase page immediately before 24h expires"
            >
              <AlertOctagon size={14} />
              {suspending ? 'Suspending...' : 'Suspend Before Time'}
            </button>
          </div>
        </div>
      )}

      {suspendMsg && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          color: '#f87171',
          padding: '0.65rem 1rem',
          borderRadius: '8px',
          fontSize: '0.85rem'
        }}>
          {suspendMsg}
        </div>
      )}

      {/* Metrics Row */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <div>
            <div className="stat-title">Catalog Folders</div>
            <div className="stat-value">{data.summary.categories}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active design sections</p>
          </div>
          <div className="stat-icon">
            <FolderOpen size={24} />
          </div>
        </div>

        <div className="glass-card stat-card">
          <div>
            <div className="stat-title">Total SKU Designs</div>
            <div className="stat-value">{data.summary.skus}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unique design articles</p>
          </div>
          <div className="stat-icon" style={{ color: 'var(--color-secondary)' }}>
            <Layers size={24} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--color-success)' }}>Available (AV)</div>
            <div className="stat-value" style={{ color: 'var(--color-success)' }}>{data.summary.activeSkus}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Available &amp; &gt; 0 sets</p>
          </div>
          <div className="stat-icon" style={{ color: 'var(--color-success)' }}>
            <CheckCircle size={24} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--color-warning)' }}>Out of Stock (OS)</div>
            <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{data.summary.outofstockSkus}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Available but 0 sets</p>
          </div>
          <div className="stat-icon" style={{ color: 'var(--color-warning)' }}>
            <AlertCircle size={24} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}>
          <div>
            <div className="stat-title" style={{ color: 'var(--color-danger)' }}>Inactive (INA)</div>
            <div className="stat-value" style={{ color: 'var(--color-danger)' }}>{data.summary.inactiveSkus}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Temporary Disabled</p>
          </div>
          <div className="stat-icon" style={{ color: 'var(--color-danger)' }}>
            <XCircle size={24} />
          </div>
        </div>

        <div className="glass-card stat-card" style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}>
          <div>
            <div className="stat-title" style={{ color: '#c084fc' }}>Permanent Inactive (P-INA)</div>
            <div className="stat-value" style={{ color: '#c084fc' }}>{data.summary.permanentInactiveSkus ?? 0}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Retired / Never Restock</p>
          </div>
          <div className="stat-icon" style={{ color: '#c084fc' }}>
            <XCircle size={24} />
          </div>
        </div>

        <div className="glass-card stat-card">
          <div>
            <div className="stat-title">Current Sets Stock</div>
            <div className="stat-value">{data.summary.totalSets}</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>
              ({data.summary.totalPieces} total pieces)
            </p>
          </div>
          <div className="stat-icon" style={{ color: 'var(--color-success)' }}>
            <Boxes size={24} />
          </div>
        </div>

        <div className="glass-card stat-card">
          <div>
            <div className="stat-title">Today's Sales (Sets)</div>
            <div className="stat-value" style={{ color: 'var(--color-danger)' }}>
              -{data.summary.reducedToday.sets}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>
              -{data.summary.reducedToday.pieces} pieces sold
            </p>
          </div>
          <div className="stat-icon" style={{ color: 'var(--color-danger)' }}>
            <TrendingDown size={24} />
          </div>
        </div>
      </div>

      {/* Charts & Breakdown Row */}
      <div className="grid-2">
        {/* SVG Activity Trend Chart */}
        <div className="glass-card">
          <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={20} color="var(--color-primary)" />
            7-Day Inventory Activity (Sets)
          </h3>
          {data.trends.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>No stock activity recorded in the last 7 days</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ position: 'relative', height: '200px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
                {data.trends.map((day, idx) => {
                  const addHeight = (Number(day.sets_added) / maxTrendVal) * 160;
                  const redHeight = (Number(day.sets_reduced) / maxTrendVal) * 160;
                  
                  // Format Date to short string e.g. "May 24"
                  const dateObj = new Date(day.date);
                  const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12%', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ display: 'flex', gap: '4px', width: '100%', height: '160px', alignItems: 'flex-end', justifyContent: 'center' }}>
                        {/* Addition Bar */}
                        <div 
                          className="chart-bar"
                          style={{ 
                            height: `${addHeight}px`, 
                            width: '40%', 
                            background: 'linear-gradient(to top, #10b981, #34d399)', 
                            borderRadius: '4px 4px 0 0',
                            position: 'relative'
                          }}
                          title={`Added: ${day.sets_added} sets`}
                        />
                        {/* Reduction Bar */}
                        <div 
                          className="chart-bar"
                          style={{ 
                            height: `${redHeight}px`, 
                            width: '40%', 
                            background: 'linear-gradient(to top, #f43f5e, #fb7185)', 
                            borderRadius: '4px 4px 0 0',
                            position: 'relative'
                          }}
                          title={`Sold: ${day.sets_reduced} sets`}
                        />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {dateStr}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--color-success)', borderRadius: '3px' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Sets Added</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--color-danger)', borderRadius: '3px' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Sets Sold</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Category breakdown (folders view) */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3>Category Folders Inventory</h3>
          <div style={{ overflowY: 'auto', maxHeight: '250px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.categoryBreakdown.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No category folders created yet.</p>
            ) : (
              data.categoryBreakdown.map((cat, idx) => (
                <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                  <div className="flex-between" style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'Outfit' }}>{cat.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{cat.skuCount} articles</span>
                  </div>
                  <div className="flex-between" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>Sets: <strong style={{ color: 'var(--text-primary)' }}>{cat.totalSets}</strong></span>
                    <span>Total Pieces: <strong style={{ color: 'var(--text-primary)' }}>{cat.totalPieces}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent stock updates audit trail */}
      <div className="glass-card">
        <h3 style={{ marginBottom: '1.5rem' }}>Recent Stock Updates Activity</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User / Stockist</th>
                <th>Category Folder</th>
                <th>SKU ID</th>
                <th>Action Type</th>
                <th>Quantity Change</th>
              </tr>
            </thead>
            <tbody>
              {data.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No inventory changes recorded yet.
                  </td>
                </tr>
              ) : (
                data.recentActivity.map((log) => {
                  const date = new Date(log.created_at);
                  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                  return (
                    <tr key={log.id}>
                      <td>{timeStr}</td>
                      <td style={{ fontWeight: 600 }}>{log.username}</td>
                      <td>{log.category_name}</td>
                      <td style={{ fontFamily: 'Outfit', fontWeight: 600 }}>{log.sku_id}</td>
                      <td>
                        <span className={`badge ${
                          log.change_type === 'addition' ? 'badge-success' : 
                          log.change_type === 'reduction' ? 'badge-danger' : 'badge-info'
                        }`}>
                          {log.change_type}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: log.change_type === 'addition' ? 'var(--color-success)' : log.change_type === 'reduction' ? 'var(--color-danger)' : (log.new_available === false ? '#ef4444' : '#10b981') }}>
                        {log.change_type === 'status_change' ? (
                          log.new_available === false ? 'Marked Inactive (Out of Stock)' : 'Marked Active (In Stock)'
                        ) : (
                          log.change_type === 'addition' ? `+${log.sets_changed} sets` : `${log.sets_changed} sets`
                        )}
                        {log.change_type !== 'status_change' && (
                          <div style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
                            ({log.pieces_changed > 0 ? `+${log.pieces_changed}` : log.pieces_changed} pieces)
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
