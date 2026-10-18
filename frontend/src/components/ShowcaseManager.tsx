import { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Clock, 
  Copy, 
  ExternalLink, 
  Share2, 
  Trash2, 
  RefreshCw, 
  Eye, 
  AlertOctagon, 
  PlayCircle, 
  Check, 
  Layers, 
  Calendar,
  Radio,
  Search,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

interface ShowcaseLinkItem {
  id: number;
  token: string;
  url: string;
  item_count: number;
  item_ids: number[];
  created_at: string;
  expires_at: string;
  views_count: number;
  is_suspended: boolean;
  suspended_at: string | null;
  status: 'active' | 'suspended' | 'expired';
  remaining_seconds: number;
}

interface ShowcaseSummary {
  showcaseItemCount: number;
  activeLinksCount: number;
  activeLink: any;
  settings: Record<string, string>;
}

interface Props {
  token: string;
  user: {
    id: number;
    username: string;
    role: string;
  };
  onNavigateToCatalogs?: () => void;
}

export default function ShowcaseManager({ token, user: _user, onNavigateToCatalogs }: Props) {
  const [links, setLinks] = useState<ShowcaseLinkItem[]>([]);
  const [summary, setSummary] = useState<ShowcaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingToken, setActionLoadingToken] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedShareToken, setCopiedShareToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'expired'>('all');

  // Load summary and links
  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [sumRes, linksRes] = await Promise.all([
        fetch('/api/admin/showcase/summary', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/admin/showcase/links', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        setSummary(sumJson);
      }

      if (linksRes.ok) {
        const linksJson = await linksRes.json();
        setLinks(linksJson);
      }
    } catch (err: any) {
      console.error('Failed to load showcase data:', err);
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto refresh links and views from backend every 20 seconds
    const pollInterval = setInterval(() => loadData(), 20000);
    return () => clearInterval(pollInterval);
  }, []);

  // 1-second interval to decrement remaining_seconds for active links smoothly on screen
  useEffect(() => {
    const timer = setInterval(() => {
      setLinks(prev => prev.map(l => {
        if (l.status === 'active' && l.remaining_seconds > 0) {
          const next = l.remaining_seconds - 1;
          if (next === 0) {
            return { ...l, remaining_seconds: 0, status: 'expired' };
          }
          return { ...l, remaining_seconds: next };
        }
        return l;
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTimer = (seconds: number) => {
    if (seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}h : ${mins.toString().padStart(2, '0')}m : ${secs.toString().padStart(2, '0')}s`;
  };

  const handleSuspend = async (linkToken: string) => {
    if (!window.confirm('Are you sure you want to suspend this showcase link immediately? Customers will be blocked from viewing catalog designs and shown the latest catalog contact notice.')) {
      return;
    }

    setActionLoadingToken(linkToken);
    try {
      const res = await fetch(`/api/admin/showcase/links/${linkToken}/suspend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to suspend link');

      setSuccessMsg('Showcase link suspended immediately. Customer access is blocked.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error suspending link');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoadingToken(null);
    }
  };

  const handleReactivate = async (linkToken: string) => {
    setActionLoadingToken(linkToken);
    try {
      const res = await fetch(`/api/admin/showcase/links/${linkToken}/reactivate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reactivate link');

      setSuccessMsg('Showcase link reactivated successfully with active countdown timer!');
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error reactivating link');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoadingToken(null);
    }
  };

  const handleDelete = async (linkToken: string) => {
    if (!window.confirm('Permanently delete this showcase link from the record?')) {
      return;
    }

    setActionLoadingToken(linkToken);
    try {
      const res = await fetch(`/api/admin/showcase/links/${linkToken}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete link');

      setSuccessMsg('Showcase link deleted successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
      setLinks(prev => prev.filter(l => l.token !== linkToken));
    } catch (err: any) {
      setErrorMsg(err.message || 'Error deleting link');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setActionLoadingToken(null);
    }
  };

  const handleGenerateNew = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/admin/showcase/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate showcase link');

      setSuccessMsg(`Generated fresh 24h showcase link with ${data.count} designs!`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error generating link');
      setTimeout(() => setErrorMsg(''), 4000);
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (url: string, tokenKey: string) => {
    navigator.clipboard.writeText(url);
    setCopiedToken(tokenKey);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const copyWhatsAppText = (url: string, tokenKey: string) => {
    const text = 
      `🌟 *DESUKA by VS FASHION — VIP Wholesale Collection Preview*\n\n` +
      `Namaste! Explore our fresh wholesale collection curated for ready stock and bulk orders.\n\n` +
      `👉 *View Exclusive 24h Showcase:* \n${url}\n\n` +
      `⏰ *Note:* This showcase page is active for a limited time.\n\n` +
      `📍 *VS FASHION* | Netaji Gali, Gandhi Nagar, Delhi — 110031\n` +
      `🧾 GSTIN: 07AKCPJ2754N1ZX (Govt. Verified B2B Wholesale)\n` +
      `📞 Daytime Desk: +91 9240202545 | +91 9718503340\n` +
      `🌐 https://www.desukafashion.com`;
    
    navigator.clipboard.writeText(text);
    setCopiedShareToken(tokenKey);
    setTimeout(() => setCopiedShareToken(null), 2500);
  };

  const filteredLinks = links.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return l.token.toLowerCase().includes(q) || l.url.toLowerCase().includes(q);
    }
    return true;
  });

  const activeLinks = links.filter(l => l.status === 'active');
  const suspendedLinks = links.filter(l => l.status === 'suspended');
  const expiredLinks = links.filter(l => l.status === 'expired');

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
      
      {/* Top Header & Actions */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '1.25rem 1.5rem',
        borderRadius: '14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.45)'
          }}>
            <Radio size={24} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '0.5px' }}>
                Showcase Page Monitor & Timer Controller
              </h1>
              <span style={{
                background: activeLinks.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                border: activeLinks.length > 0 ? '1px solid #10b981' : '1px solid rgba(148, 163, 184, 0.3)',
                color: activeLinks.length > 0 ? '#34d399' : '#94a3b8',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: activeLinks.length > 0 ? '#10b981' : '#94a3b8',
                  animation: activeLinks.length > 0 ? 'pulse 2s infinite' : 'none'
                }}></span>
                {activeLinks.length} Active Now
              </span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Monitor all client showcase pages, live countdown timers, views in real-time, and suspend links before time with 1 click.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem' }}
            title="Refresh link stats and view counts"
          >
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Updating...' : 'Refresh'}
          </button>

          <button
            onClick={handleGenerateNew}
            disabled={generating}
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              padding: '0.6rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
            }}
          >
            <Sparkles size={16} />
            {generating ? 'Generating 24h Link...' : 'Generate Fresh 24h Link'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid #10b981',
          color: '#34d399',
          padding: '0.85rem 1.25rem',
          borderRadius: '10px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle size={18} />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          color: '#f87171',
          padding: '0.85rem 1.25rem',
          borderRadius: '10px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertOctagon size={18} />
          {errorMsg}
        </div>
      )}

      {/* Stats Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '1rem'
      }}>
        {/* Active Links Card */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Active Live Pages
            </span>
            <Clock size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#34d399' }}>
            {activeLinks.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Pages accessible with live countdown timers
          </span>
        </div>

        {/* Suspended Links Card */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Suspended Before Time
            </span>
            <AlertOctagon size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f87171' }}>
            {suspendedLinks.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Manually halted by admin before 24h
          </span>
        </div>

        {/* Total Views Card */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Client Views
            </span>
            <Eye size={18} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#38bdf8' }}>
            {links.reduce((acc, curr) => acc + curr.views_count, 0)}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Recorded customer visits across links
          </span>
        </div>

        {/* Selected Designs for Showcase */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.6)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
              Showcase Catalog Pool
            </span>
            <Layers size={18} color="#a855f7" />
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#c084fc' }}>
            {summary?.showcaseItemCount || 0}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Designs flagged in catalog
            </span>
            {onNavigateToCatalogs && (
              <button
                onClick={onNavigateToCatalogs}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#a855f7',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline'
                }}
              >
                Manage in Catalog →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        background: 'rgba(30, 41, 59, 0.4)',
        padding: '0.85rem 1.25rem',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'active', 'suspended', 'expired'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                background: statusFilter === st ? '#6366f1' : 'rgba(255, 255, 255, 0.06)',
                border: statusFilter === st ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.1)',
                color: statusFilter === st ? '#fff' : '#cbd5e1',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {st === 'all' ? `All Links (${links.length})` : 
               st === 'active' ? `Active (${activeLinks.length})` :
               st === 'suspended' ? `Suspended (${suspendedLinks.length})` :
               `Expired (${expiredLinks.length})`}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          <input
            type="text"
            placeholder="Search by token or URL..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              background: '#0b0f19',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '0.5rem 0.75rem 0.5rem 2rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#fff'
            }}
          />
        </div>
      </div>

      {/* Links List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
          <div>Loading Showcase Pages and Live Timers...</div>
        </div>
      ) : filteredLinks.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1rem',
          background: 'rgba(30, 41, 59, 0.3)',
          border: '1px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '12px'
        }}>
          <Radio size={36} color="#64748b" style={{ marginBottom: '0.75rem' }} />
          <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>No Showcase Links Found</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
            {statusFilter !== 'all' 
              ? `There are currently no links matching the '${statusFilter}' filter.` 
              : 'Generate a 24-hour VIP client showcase link above to start sharing curated designs with buyers.'}
          </p>
          <button
            onClick={handleGenerateNew}
            disabled={generating}
            className="btn btn-primary"
            style={{ fontSize: '0.85rem', padding: '0.55rem 1.2rem' }}
          >
            <Sparkles size={15} style={{ marginRight: '6px' }} />
            Generate First 24h Link
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredLinks.map(link => {
            const isActive = link.status === 'active';
            const isSuspended = link.status === 'suspended';
            const isExpired = link.status === 'expired';
            const isActionLoading = actionLoadingToken === link.token;

            return (
              <div 
                key={link.id}
                style={{
                  background: isActive 
                    ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95))'
                    : isSuspended
                    ? 'rgba(30, 20, 25, 0.6)'
                    : 'rgba(15, 23, 42, 0.6)',
                  border: isActive 
                    ? '1px solid rgba(16, 185, 129, 0.4)' 
                    : isSuspended
                    ? '1px solid rgba(239, 68, 68, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: isActive ? '0 8px 24px rgba(16, 185, 129, 0.08)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Header Row: Status Badge + Live Timer Countdown */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Status Badge */}
                    {isActive ? (
                      <span style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid #10b981',
                        color: '#34d399',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#10b981',
                          animation: 'pulse 1.5s infinite'
                        }}></span>
                        ACTIVE (LIVE FOR CLIENTS)
                      </span>
                    ) : isSuspended ? (
                      <span style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid #ef4444',
                        color: '#f87171',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertOctagon size={13} />
                        SUSPENDED BEFORE TIME
                      </span>
                    ) : (
                      <span style={{
                        background: 'rgba(148, 163, 184, 0.12)',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        color: '#94a3b8',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <Clock size={13} />
                        EXPIRED (24H COMPLETED)
                      </span>
                    )}

                    {/* Token key */}
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                      Token: {link.token}
                    </span>
                  </div>

                  {/* Live Timer Display */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    background: isActive ? '#091512' : '#0b0f19',
                    border: isActive ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '8px'
                  }}>
                    <Clock size={15} color={isActive ? '#34d399' : '#94a3b8'} />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {isActive ? 'Time Remaining:' : isSuspended ? 'Suspended at:' : 'Expired:'}
                    </span>
                    <strong style={{
                      fontSize: '0.95rem',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      color: isActive ? '#10b981' : isSuspended ? '#ef4444' : '#94a3b8'
                    }}>
                      {isActive 
                        ? formatTimer(link.remaining_seconds) 
                        : isSuspended 
                        ? link.suspended_at ? new Date(link.suspended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Before Time'
                        : new Date(link.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </strong>
                  </div>
                </div>

                {/* URL and Instant Actions Row */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    readOnly
                    value={link.url}
                    style={{
                      flex: 1,
                      minWidth: '260px',
                      background: '#070a12',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '0.55rem 0.85rem',
                      fontSize: '0.85rem',
                      color: isActive ? '#38bdf8' : '#94a3b8',
                      borderRadius: '8px',
                      fontFamily: 'monospace'
                    }}
                  />

                  {/* Copy Link */}
                  <button
                    onClick={() => copyLink(link.url, link.token)}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                    title="Copy direct showcase link"
                  >
                    {copiedToken === link.token ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    {copiedToken === link.token ? 'Copied Link!' : 'Copy Link'}
                  </button>

                  {/* Copy WhatsApp Share Message */}
                  <button
                    onClick={() => copyWhatsAppText(link.url, link.token)}
                    className="btn btn-secondary"
                    style={{
                      padding: '0.5rem 0.85rem',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(37, 211, 102, 0.1)',
                      border: '1px solid rgba(37, 211, 102, 0.3)',
                      color: '#25d366'
                    }}
                    title="Copy professional WhatsApp share message ready for customers"
                  >
                    {copiedShareToken === link.token ? <Check size={14} /> : <Share2 size={14} />}
                    {copiedShareToken === link.token ? 'Copied Message!' : 'WhatsApp Text'}
                  </button>

                  {/* Open in new tab */}
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                    title="Open public showcase view in new tab"
                  >
                    <ExternalLink size={14} />
                    Open Page
                  </a>
                </div>

                {/* Metadata & Controller Actions Row */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '0.75rem'
                }}>
                  {/* Meta stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Layers size={14} color="#a5b4fc" />
                      <strong>{link.item_count}</strong> Designs
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Eye size={14} color="#38bdf8" />
                      <strong>{link.views_count}</strong> Client Views
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Calendar size={14} color="#94a3b8" />
                      Created: {new Date(link.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Clock size={14} color="#94a3b8" />
                      Expiry: {new Date(link.expires_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Controller Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {/* SUSPEND BUTTON (Active links) */}
                    {isActive && (
                      <button
                        onClick={() => handleSuspend(link.token)}
                        disabled={isActionLoading}
                        style={{
                          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                          border: 'none',
                          color: '#fff',
                          padding: '0.45rem 1rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.35)'
                        }}
                        title="Immediately cut off customer access before timer runs out"
                      >
                        <AlertOctagon size={14} />
                        {isActionLoading ? 'Suspending...' : 'Suspend Before Time'}
                      </button>
                    )}

                    {/* REACTIVATE BUTTON (Suspended or Expired links) */}
                    {(isSuspended || isExpired) && (
                      <button
                        onClick={() => handleReactivate(link.token)}
                        disabled={isActionLoading}
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid #10b981',
                          color: '#34d399',
                          padding: '0.45rem 0.9rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer'
                        }}
                        title="Reactivate link and give 24 hours extension"
                      >
                        <PlayCircle size={14} />
                        {isActionLoading ? 'Activating...' : 'Reactivate (+24h)'}
                      </button>
                    )}

                    {/* DELETE BUTTON */}
                    <button
                      onClick={() => handleDelete(link.token)}
                      disabled={isActionLoading}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#94a3b8',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Delete link"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Informational callout if suspended */}
                {isSuspended && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    borderLeft: '3px solid #ef4444',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    color: '#fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <HelpCircle size={14} />
                    <span>This page is currently suspended. Anyone opening this link is automatically shown: <em>"लेटेस्ट कैटलॉग के लिए नीचे दिए हुए WhatsApp नंबर से हमारी टीम से संपर्क करें"</em>. Catalog photos remain strictly hidden.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
