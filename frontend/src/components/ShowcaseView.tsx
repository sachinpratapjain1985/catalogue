import { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Clock, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  ExternalLink, 
  MessageSquare, 
  ZoomIn, 
  X, 
  Share2,
  Bookmark
} from 'lucide-react';

const InstagramIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e1306c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

const YoutubeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff0000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
    <polygon points="10 15 15 12 10 9 10 15"/>
  </svg>
);

interface ShowcaseItem {
  id: number;
  sku_id: string;
  image_path: string;
  work?: string;
  category_name: string;
}

interface SalesContact {
  name: string;
  phone: string;
  rawPhone: string;
}

interface CallContact {
  name: string;
  phone: string;
  rawPhone: string;
  note: string;
  isPrimary?: boolean;
}

interface ShowcaseResponse {
  notFound?: boolean;
  disappeared?: boolean;
  expired?: boolean;
  message?: string;
  token?: string;
  expires_at?: string;
  created_at?: string;
  items?: ShowcaseItem[];
  salesContacts: SalesContact[];
  callContact: CallContact;
  callContacts?: CallContact[];
  communityLink: string;
  brandDetails: {
    company: string;
    brand: string;
    address: string;
    gstNumber?: string;
    email: string;
    website: string;
    instagram: string;
    facebook: string;
    youtube: string;
    googleMaps: string;
    googleSearchTitle: string;
    verifiedOn: string[];
    hours: string;
  };
}

interface ShowcaseViewProps {
  token: string;
}

// Helpers for WhatsApp, Call, and fast thumbnails
export const formatWhatsAppUrl = (rawPhone: string, text?: string) => {
  let clean = (rawPhone || '').replace(/\D/g, '');
  if (clean.length === 10) {
    clean = '91' + clean;
  }
  const baseUrl = `https://wa.me/${clean}`;
  return text ? `${baseUrl}?text=${encodeURIComponent(text)}` : baseUrl;
};

export const formatCallUrl = (rawPhone: string) => {
  const clean = (rawPhone || '').replace(/\D/g, '');
  return clean.length === 10 ? `tel:+91${clean}` : `tel:+${clean}`;
};

export const getThumbnailUrl = (imagePath: string) => {
  if (!imagePath) return '';
  const lastDotIndex = imagePath.lastIndexOf('.');
  if (lastDotIndex !== -1 && !imagePath.includes('-thumb.')) {
    return imagePath.substring(0, lastDotIndex) + '-thumb' + imagePath.substring(lastDotIndex);
  }
  return imagePath;
};

// Pattern hierarchy ordered as requested: PL -> AK -> CTP -> LH -> SKT -> SP -> Others
export const getPatternInfo = (skuId: string = '', categoryName: string = ''): { rank: number; pattern: string } => {
  const cleanSku = (skuId || '').trim();
  const match = cleanSku.match(/^[a-zA-Z]+/);
  if (match) {
    const prefix = match[0].toUpperCase();
    if (prefix === 'PL') return { rank: 1, pattern: 'PL' };
    if (prefix === 'AK') return { rank: 2, pattern: 'AK' };
    if (prefix === 'CTP') return { rank: 3, pattern: 'CTP' };
    if (prefix === 'LH') return { rank: 4, pattern: 'LH' };
    if (prefix === 'SKT' || prefix === 'SK') return { rank: 5, pattern: 'SKT' };
    if (prefix === 'SP') return { rank: 6, pattern: 'SP' };
  }

  const cat = (categoryName || '').toUpperCase();
  if (cat.includes('PLAZO') || cat.includes('PALAZZO')) return { rank: 1, pattern: 'PL' };
  if (cat.includes('ANARKALI')) return { rank: 2, pattern: 'AK' };
  if (cat.includes('CROP TOP') || cat.includes('CTP')) return { rank: 3, pattern: 'CTP' };
  if (cat.includes('LEHENGA') || cat.includes('LAHANGA')) return { rank: 4, pattern: 'LH' };
  if (cat.includes('SKIRT')) return { rank: 5, pattern: 'SKT' };
  if (cat.includes('SHARARA')) return { rank: 6, pattern: 'SP' };

  return { rank: 7, pattern: match ? match[0].toUpperCase() : 'OTHER' };
};

export const compareShowcaseItems = (a: ShowcaseItem, b: ShowcaseItem): number => {
  const rankA = getPatternInfo(a.sku_id, a.category_name).rank;
  const rankB = getPatternInfo(b.sku_id, b.category_name).rank;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  return a.sku_id.localeCompare(b.sku_id, undefined, { numeric: true, sensitivity: 'base' });
};

export default function ShowcaseView({ token }: ShowcaseViewProps) {
  const [data, setData] = useState<ShowcaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageModal, setActiveImageModal] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [isClientLockedOut, setIsClientLockedOut] = useState(false);
  const [isDisappeared, setIsDisappeared] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<string>('ALL');

  // Dynamic session rotation offset so the primary/first contact rotates across different visits/requests
  const [sessionRotationOffset] = useState(() => Math.floor(Math.random() * 3));

  // Ordered items by pattern hierarchy: PL -> AK -> CTP -> LH -> SKT -> SP
  const sortedItems = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort(compareShowcaseItems);
  }, [data?.items]);

  // Extract unique patterns present in this showcase
  const availablePatterns = useMemo(() => {
    if (!sortedItems.length) return [];
    const countMap: Record<string, number> = {};
    sortedItems.forEach(item => {
      const p = getPatternInfo(item.sku_id, item.category_name).pattern;
      countMap[p] = (countMap[p] || 0) + 1;
    });

    const orderedKnown = ['PL', 'AK', 'CTP', 'LH', 'SKT', 'SP'];
    const result: { pattern: string; count: number }[] = [];
    
    orderedKnown.forEach(p => {
      if (countMap[p]) {
        result.push({ pattern: p, count: countMap[p] });
        delete countMap[p];
      }
    });

    Object.keys(countMap).sort().forEach(p => {
      result.push({ pattern: p, count: countMap[p] });
    });

    return result;
  }, [sortedItems]);

  // Filtered items based on pattern tab
  const displayedItems = useMemo(() => {
    if (selectedPattern === 'ALL') return sortedItems;
    return sortedItems.filter(item => getPatternInfo(item.sku_id, item.category_name).pattern === selectedPattern);
  }, [sortedItems, selectedPattern]);

  // Fallback defaults if data is null
  const brand = data?.brandDetails || {
    company: 'VS FASHION',
    brand: 'DESUKA',
    address: 'IX/6362, Netaji Gali, Gandhi Nagar, Delhi — 110031',
    gstNumber: '07AKCPJ2754N1ZX',
    email: 'wholesale@desukafashion.com',
    website: 'https://www.desukafashion.com',
    instagram: 'https://instagram.com/desukab2b',
    facebook: 'https://facebook.com/desukab2b',
    youtube: 'https://youtube.com/@DesukaByVSFashion',
    googleMaps: 'https://share.google/8egrK2LC6jGeJjAVa',
    googleSearchTitle: 'VS Fashion DESUKA / VS Fashion Gandhi Nagar Delhi',
    verifiedOn: ['IndiaMart', 'JustDial', 'TradeIndia'],
    hours: '10 AM – 7 PM | Daily — Except Monday',
  };

  const salesContacts = data?.salesContacts || [
    { name: 'VS FASHION Sales Desk 1', phone: '+918796333844', rawPhone: '8796333844' },
    { name: 'VS FASHION Sales Desk 2', phone: '+918796893844', rawPhone: '8796893844' },
    { name: 'VS FASHION Sales Desk 3', phone: '+918796443844', rawPhone: '8796443844' },
  ];

  const callContacts = data?.callContacts || [
    {
      name: 'Direct Team Desk (Daytime)',
      phone: '+919240202545',
      rawPhone: '9240202545',
      timing: 'Office Timings: 10:00 AM – 7:00 PM for Call',
      note: 'Office Timings: 10:00 AM – 7:00 PM for Call',
      isPrimary: true
    },
    {
      name: 'Wholesale Helpdesk (24x7)',
      phone: '+919718503340',
      rawPhone: '9718503340',
      timing: 'Call for any query anytime',
      note: 'Call for any query anytime (24x7 Helpdesk)',
      isPrimary: false
    }
  ];

  const primaryCallContact = callContacts[0];
  const secondaryCallContact = callContacts[1] || callContacts[0];

  const communityLink = data?.communityLink || 'https://chat.whatsapp.com/CdsyxZokQzo39x4hBzW6O0';

  // Rotated sales contacts list for contact lists and cards
  const rotatedSalesContacts = useMemo(() => {
    if (!salesContacts || salesContacts.length === 0) return [];
    const shift = sessionRotationOffset % salesContacts.length;
    return [...salesContacts.slice(shift), ...salesContacts.slice(0, shift)];
  }, [salesContacts, sessionRotationOffset]);

  // Helper to pick rotated sales number per article so articles strictly alternate 1 -> 2 -> 3 -> 1 -> 2 -> 3
  const getRotatedSalesNumber = (index: number) => {
    if (rotatedSalesContacts.length === 0) {
      return { name: 'VS FASHION Sales Desk', phone: '+918796333844', rawPhone: '8796333844' };
    }
    return rotatedSalesContacts[index % rotatedSalesContacts.length];
  };

  useEffect(() => {
    // 24-hour client-side local timer tracking
    const storageKey = `showcase_first_visit_${token}`;
    const storedFirstVisit = localStorage.getItem(storageKey);
    const now = Date.now();

    if (!storedFirstVisit) {
      localStorage.setItem(storageKey, String(now));
    } else {
      const firstVisitTime = parseInt(storedFirstVisit, 10);
      const elapsed = now - firstVisitTime;
      // If 7 days have elapsed, mark as disappeared
      // If 30 days (1 month) have elapsed, mark as disappeared
      if (elapsed > 30 * 24 * 60 * 60 * 1000) {
        setIsDisappeared(true);
      } else if (elapsed > 24 * 60 * 60 * 1000) {
        // If 24 hours have elapsed since the user's first visit, mark as expired locally
        setIsClientLockedOut(true);
      }
    }

    fetchShowcase();
  }, [token]);

  // Live countdown timer based on server expires_at
  useEffect(() => {
    if (!data?.expires_at || data.expired || isClientLockedOut || isDisappeared) return;

    const interval = setInterval(() => {
      const diff = new Date(data.expires_at!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        setIsClientLockedOut(true);
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data, isClientLockedOut, isDisappeared]);

  const fetchShowcase = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/public/showcase/${token}`);
      const json: ShowcaseResponse = await res.json();
      setData(json);
      if (json.disappeared) {
        setIsDisappeared(true);
      }
      if (json.created_at) {
        const linkAge = Date.now() - new Date(json.created_at).getTime();
        if (linkAge > 30 * 24 * 60 * 60 * 1000) {
          setIsDisappeared(true);
        }
      }
      if (res.status === 404 && !json.disappeared) {
        setError(json.message || 'Showcase link not found');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load showcase');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'DESUKA by VS FASHION — 24h Showcase',
        text: '📢 ये सारे सैंपल कलेक्शन हैं, और डिटेल्स में देखने के लिए नीचे दिए हुए नंबर पर संपर्क करें।\nLooking for more wholesale designs or customized sets? Chat directly with our Gandhi Nagar sales desk on WhatsApp:\n',
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const isExpired = isDisappeared || isClientLockedOut || !!data?.expired;

  // Render Loading
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0b0f19',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        padding: '2rem'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTop: '3px solid #6366f1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <h3 style={{ marginTop: '1.5rem', letterSpacing: '2px', fontWeight: 600 }}>DESUKA</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.5rem' }}>Loading VIP Collection...</p>
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Render Error
  if (error && !data) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0b0f19',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'rgba(244, 63, 94, 0.15)',
          color: '#f43f5e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem'
        }}>
          <Clock size={28} />
        </div>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>
          Exclusive Showcase Link Expired or Unavailable
        </h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '420px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          {error}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%', maxWidth: '340px' }}>
          <a 
            href="tel:+919240202545"
            style={{
              background: 'linear-gradient(135deg, #25d366, #128c7e)',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)'
            }}
          >
            <Phone size={18} />
            Direct Call Desk: +91 9240202545
          </a>
          <a 
            href="tel:+919718503340"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#f8fafc',
              padding: '0.6rem 1.25rem',
              borderRadius: '10px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <Phone size={15} />
            Helpdesk: +91 9718503340
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0b0f19',
      color: '#f8fafc',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      paddingBottom: '3rem'
    }}>
      {/* Top Brand Bar */}
      <header style={{
        background: 'rgba(18, 24, 38, 0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '0.85rem 1.25rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
      }}>
        <a
          href="https://www.desukafashion.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}
        >
          <div style={{
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
          }}>
            <Sparkles size={20} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, letterSpacing: '1.5px', color: '#fff' }}>
              DESUKA
            </div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.5px' }}>
              BY VS FASHION • GANDHI NAGAR DELHI
            </div>
          </div>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={handleShare}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#f8fafc',
              padding: '0.45rem 0.75rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer'
            }}
          >
            <Share2 size={14} />
            {copiedLink ? 'Copied!' : 'Share'}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem' }}>
        
        {/* State 1: Link Expired View (> 24 hours or disappeared > 7 days) */}
        {isExpired ? (
          <div style={{
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
            borderRadius: '16px',
            border: isDisappeared ? '1px solid rgba(244, 63, 94, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
            padding: '2.5rem 1.25rem',
            textAlign: 'center',
            marginTop: '1rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: isDisappeared ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: isDisappeared ? '2px solid rgba(244, 63, 94, 0.4)' : '2px solid rgba(245, 158, 11, 0.4)',
              color: isDisappeared ? '#f43f5e' : '#fbbf24',
              marginBottom: '1rem'
            }}>
              <Clock size={32} />
            </div>

            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', marginBottom: '0.4rem' }}>
              {isDisappeared ? 'यह लिंक समाप्त हो चुका है (1 महीना पूरा होने पर हटा दिया गया है)' : 'कैटलॉग लिंक समाप्त हो चुका है'}
            </h2>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              Exclusive Catalog Showcase Link Has Expired
            </div>

            {/* Exact Hindi Notice Box as Requested */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(99, 102, 241, 0.15))',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '12px',
              padding: '1.1rem 1.25rem',
              maxWidth: '620px',
              margin: '0 auto 1.5rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
            }}>
              <div style={{
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#34d399',
                lineHeight: 1.5
              }}>
                लेटेस्ट कैटलॉग के लिए नीचे दिए हुए WhatsApp नंबर से हमारी टीम से संपर्क करें
              </div>
              <div style={{
                fontSize: '0.8rem',
                color: '#cbd5e1',
                marginTop: '6px'
              }}>
                (Latest catalog ke liye niche diye hue WhatsApp number se hamari team se sampark karein)
              </div>
            </div>

            {/* Direct Call Desk (Primary Daytime + Helpdesk) */}
            <div style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '14px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              maxWidth: '520px',
              margin: '0 auto 1.5rem'
            }}>
              <div style={{
                fontSize: '0.78rem',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: '#94a3b8',
                marginBottom: '0.85rem',
                fontWeight: 600
              }}>
                Direct Call Helpline
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Primary: 9240202545 Direct Daytime */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.12), rgba(16, 185, 129, 0.18))',
                  border: '1px solid rgba(37, 211, 102, 0.4)',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '0.7rem', color: '#86efac', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ⚡ Direct Team Desk (Office Timings: 10:00 AM – 7:00 PM)
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                      +91 {primaryCallContact.rawPhone.replace(/\D/g, '').slice(-10)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
                      Call between 10:00 AM – 7:00 PM for direct team assistance
                    </div>
                  </div>
                  <a
                    href={formatCallUrl(primaryCallContact.rawPhone)}
                    style={{
                      background: 'linear-gradient(135deg, #25d366, #128c7e)',
                      color: '#fff',
                      padding: '0.6rem 1.1rem',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 10px rgba(37, 211, 102, 0.3)'
                    }}
                  >
                    <Phone size={16} />
                    Call Now
                  </a>
                </div>

                {/* Secondary: 9718503340 Wholesale Helpdesk */}
                {secondaryCallContact && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem'
                  }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                        🏢 Wholesale Helpdesk (Call for any query anytime)
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>
                        +91 {secondaryCallContact.rawPhone.replace(/\D/g, '').slice(-10)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Bookmark size={11} />
                        Call for any query anytime (24x7 Helpdesk)
                      </div>
                    </div>
                    <a
                      href={formatCallUrl(secondaryCallContact.rawPhone)}
                      style={{
                        background: 'rgba(99, 102, 241, 0.2)',
                        border: '1px solid rgba(99, 102, 241, 0.4)',
                        color: '#a5b4fc',
                        padding: '0.5rem 0.9rem',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Phone size={14} />
                      Call
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Rotated Sales Team WhatsApp Contact Buttons */}
            <div style={{ maxWidth: '500px', margin: '0 auto 1.5rem' }}>
              <p style={{
                fontSize: '0.78rem',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: '#94a3b8',
                marginBottom: '0.75rem',
                fontWeight: 600
              }}>
                Connect on WhatsApp (Direct Sales Desk)
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {rotatedSalesContacts.map(contact => (
                  <a
                    key={contact.phone}
                    href={formatWhatsAppUrl(
                      contact.rawPhone,
                      'नमस्ते VS FASHION टीम, मुझे आपका कैटलॉग देखना है। कृपया लेटेस्ट होलसेल डिज़ाइन शेयर करें।'
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'linear-gradient(135deg, #25d366, #128c7e)',
                      color: '#fff',
                      padding: '0.85rem 1.25rem',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 15px rgba(37, 211, 102, 0.25)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <MessageSquare size={20} />
                      {contact.name} (+91 {contact.rawPhone.replace(/\D/g, '').slice(-10)})
                    </span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.9, background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      Chat on WhatsApp →
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* WhatsApp Community Join Button */}
            <div style={{ maxWidth: '500px', margin: '0 auto' }}>
              <a
                href={communityLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  color: '#a5b4fc',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                👥 Join Our WhatsApp Community for Daily New Drops
              </a>
            </div>
          </div>
        ) : (
          /* State 2: Active 24-Hour Showcase View */
          <>
            {/* VIP Access Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              marginBottom: '1.25rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(99, 102, 241, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a5b4fc'
                }}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                    VIP Exclusive Showcase Collection
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Curated latest drops for wholesale buyers • Direct Gandhi Nagar Manufacturer
                  </div>
                </div>
              </div>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#34d399',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '0.3rem 0.65rem',
                borderRadius: '6px'
              }}>
                B2B Wholesale Only
              </span>
            </div>

            {/* Sample Collection Notice Banner as Requested */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(99, 102, 241, 0.12))',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '12px',
              padding: '0.9rem 1.15rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fbbf24'
              }}>
                <Sparkles size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '0.98rem',
                  fontWeight: 800,
                  color: '#fef08a',
                  lineHeight: 1.45
                }}>
                  📢 ये सारे सैंपल कलेक्शन हैं, और डिटेल्स में देखने के लिए नीचे दिए हुए नंबर पर संपर्क करें
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: '#cbd5e1',
                  marginTop: '4px'
                }}>
                  (Ye saare sample collection hain, aur details mein dekhne ke liye neeche diye hue number par sampark karein)
                </div>
              </div>
            </div>

            {/* Pattern Quick Filters */}
            {availablePatterns.length > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                overflowX: 'auto',
                paddingBottom: '0.65rem',
                marginBottom: '1.15rem',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch'
              }}>
                <button
                  onClick={() => setSelectedPattern('ALL')}
                  style={{
                    background: selectedPattern === 'ALL' ? '#6366f1' : 'rgba(255, 255, 255, 0.06)',
                    color: '#fff',
                    border: selectedPattern === 'ALL' ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '0.4rem 0.85rem',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    boxShadow: selectedPattern === 'ALL' ? '0 2px 10px rgba(99, 102, 241, 0.4)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>All Patterns</span>
                  <span style={{
                    background: selectedPattern === 'ALL' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '10px',
                    fontSize: '0.7rem'
                  }}>
                    {sortedItems.length}
                  </span>
                </button>

                {availablePatterns.map(({ pattern, count }) => {
                  const isSelected = selectedPattern === pattern;
                  return (
                    <button
                      key={pattern}
                      onClick={() => setSelectedPattern(pattern)}
                      style={{
                        background: isSelected ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(255, 255, 255, 0.06)',
                        color: isSelected ? '#000' : '#f8fafc',
                        border: isSelected ? '1px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.1)',
                        padding: '0.4rem 0.85rem',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: isSelected ? '0 2px 10px rgba(245, 158, 11, 0.35)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{pattern}</span>
                      <span style={{
                        background: isSelected ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '10px',
                        fontSize: '0.7rem'
                      }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Catalog Grid (Clean default images ONLY, NO prices, NO set counts, NO quantities) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.85rem',
              marginBottom: '2rem'
            }}>
              {displayedItems && displayedItems.length > 0 ? (
                displayedItems.map((item, index) => {
                  const salesRep = getRotatedSalesNumber(index);
                  const whatsappMsg = `Hello VS FASHION, I am interested in design SKU: ${item.sku_id} from your curated showcase: ${window.location.href}`;
                  const whatsappUrl = formatWhatsAppUrl(salesRep.rawPhone, whatsappMsg);

                  return (
                    <div
                      key={item.id}
                      style={{
                        background: 'rgba(18, 24, 38, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                        transition: 'transform 0.2s ease, border-color 0.2s ease'
                      }}
                    >
                      {/* Image Frame */}
                      <div
                        onClick={() => setActiveImageModal(item.image_path)}
                        style={{
                          position: 'relative',
                          width: '100%',
                          paddingTop: '133%', // 3:4 aspect ratio
                          background: '#1e293b',
                          cursor: 'pointer',
                          overflow: 'hidden'
                        }}
                      >
                        <img
                          src={getThumbnailUrl(item.image_path)}
                          alt={item.sku_id}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (target.src !== item.image_path) {
                              target.src = item.image_path;
                            }
                          }}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                        />

                        {/* Zoom Hint */}
                        <div style={{
                          position: 'absolute',
                          bottom: '6px',
                          right: '6px',
                          background: 'rgba(0, 0, 0, 0.6)',
                          backdropFilter: 'blur(4px)',
                          borderRadius: '6px',
                          padding: '4px',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          <ZoomIn size={14} />
                        </div>

                        {/* Work Badge (if available) */}
                        {item.work && (
                          <div style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(4px)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: '#e2e8f0'
                          }}>
                            {item.work}
                          </div>
                        )}
                      </div>

                      {/* Card Content: Strictly SKU and Category ONLY (NO PRICE, NO QTY) */}
                      <div style={{ padding: '0.75rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.4rem'
                          }}>
                            <div style={{
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              color: '#fff',
                              letterSpacing: '0.5px'
                            }}>
                              {item.sku_id}
                            </div>
                            <span style={{
                              background: 'rgba(99, 102, 241, 0.2)',
                              border: '1px solid rgba(99, 102, 241, 0.35)',
                              color: '#a5b4fc',
                              fontSize: '0.62rem',
                              fontWeight: 800,
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px',
                              letterSpacing: '0.5px'
                            }}>
                              {getPatternInfo(item.sku_id, item.category_name).pattern}
                            </span>
                          </div>
                          <div style={{
                            fontSize: '0.7rem',
                            color: '#94a3b8',
                            marginTop: '2px'
                          }}>
                            {item.category_name}
                          </div>
                        </div>

                        {/* WhatsApp Inquire Button */}
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            marginTop: '0.65rem',
                            background: '#25d366',
                            color: '#fff',
                            padding: '0.45rem',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)'
                          }}
                        >
                          <MessageSquare size={13} />
                          WhatsApp Quote
                        </a>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  No showcase items available right now. Connect directly with sales team below.
                </div>
              )}
            </div>

            {/* Quick Sticky WhatsApp Action Bar at Bottom of Active View */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '14px',
              padding: '1.35rem 1.1rem',
              marginBottom: '2rem',
              textAlign: 'center',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
            }}>
              {/* Hindi Notice Reminder */}
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '0.55rem 0.85rem',
                marginBottom: '1rem',
                display: 'inline-block',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#fef08a'
              }}>
                📢 ये सारे सैंपल कलेक्शन हैं, और डिटेल्स में देखने के लिए नीचे दिए हुए नंबर पर संपर्क करें
              </div>

              {/* Hindi Headline */}
              <div style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: '#38bdf8',
                lineHeight: 1.4,
                marginBottom: '0.25rem'
              }}>
                क्या आप और होलसेल डिज़ाइन्स या कस्टमाइज़्ड सेट्स देखना चाहते हैं?
              </div>
              {/* English Headline requested by user */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '0.6rem' }}>
                Looking for more wholesale designs or customized sets?
              </h4>

              {/* Hindi Subtitle */}
              <div style={{
                fontSize: '0.85rem',
                color: '#86efac',
                fontWeight: 600,
                lineHeight: 1.4,
                marginBottom: '0.25rem'
              }}>
                लाइव वीडियो प्रीव्यू और पूरे कैटलॉग के लिए हमारे गांधी नगर सेल्स डेस्क से WhatsApp पर सीधे चैट करें:
              </div>
              {/* English Subtitle requested by user */}
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '1rem' }}>
                Chat directly with our Gandhi Nagar sales desk on WhatsApp for live video preview and catalogs:
              </p>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', justifyContent: 'center' }}>
                {rotatedSalesContacts.map(c => (
                  <a
                    key={c.phone}
                    href={formatWhatsAppUrl(
                      c.rawPhone,
                      'नमस्ते VS FASHION, मुझे और होलसेल डिज़ाइन्स / कस्टमाइज़्ड सेट्स देखने हैं। कृपया लाइव वीडियो कॉल या कैटलॉग शेयर करें।'
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'linear-gradient(135deg, #25d366, #128c7e)',
                      color: '#fff',
                      padding: '0.65rem 1.05rem',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      boxShadow: '0 3px 10px rgba(37, 211, 102, 0.3)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <MessageSquare size={16} />
                    {c.name} (+91 {c.rawPhone.replace(/\D/g, '').slice(-10)})
                  </a>
                ))}
              </div>

              {/* Direct call desk quick connect */}
              <div style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.8rem',
                flexWrap: 'wrap'
              }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Direct Call Desk:</span>
                <a
                  href={formatCallUrl(primaryCallContact.rawPhone)}
                  style={{
                    color: '#60a5fa',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                  title="Direct Team Desk (Office Timings: 10:00 AM – 7:00 PM)"
                >
                  <Phone size={14} />
                  +91 {primaryCallContact.rawPhone.replace(/\D/g, '').slice(-10)} (10 AM – 7 PM)
                </a>
                {secondaryCallContact && (
                  <a
                    href={formatCallUrl(secondaryCallContact.rawPhone)}
                    style={{
                      color: '#cbd5e1',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                    title="Wholesale Helpdesk (Call for any query anytime)"
                  >
                    +91 {secondaryCallContact.rawPhone.replace(/\D/g, '').slice(-10)} (Anytime)
                  </a>
                )}
              </div>
            </div>
          </>
        )}

        {/* Brand, Trust, Verification & Social Profiles Footer (Clickable Links) */}
        <footer style={{
          background: 'rgba(18, 24, 38, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '1.5rem 1.25rem',
          marginTop: '1.5rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '1px' }}>
              {brand.company} — {brand.brand}
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              Wholesale Garment Manufacturers & Suppliers
            </p>
          </div>

          {/* Contact Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            fontSize: '0.85rem',
            color: '#cbd5e1',
            marginBottom: '1.5rem'
          }}>
            {/* Address & Google Maps */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <MapPin size={18} color="#6366f1" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#fff' }}>Address:</strong>
                <div>{brand.address}</div>
                <a
                  href={brand.googleMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#38bdf8',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.75rem',
                    marginTop: '0.25rem'
                  }}
                >
                  📍 Open Location on Google Maps <ExternalLink size={12} />
                </a>

                {/* GST Number (Credibility & Trust Badge directly below address) */}
                <div style={{
                  marginTop: '0.55rem',
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.45rem'
                }}>
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#34d399',
                    padding: '0.22rem 0.55rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}>
                    <span>GSTIN:</span>
                    <strong style={{ fontFamily: 'monospace', color: '#fff' }}>
                      {brand.gstNumber || '07AKCPJ2754N1ZX'}
                    </strong>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#86efac', fontWeight: 600 }}>
                    ✓ Govt. Verified B2B Wholesale
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Call & Email */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <Phone size={18} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#fff' }}>Direct Call Helpline:</strong>
                <div>
                  <a href={formatCallUrl(primaryCallContact.rawPhone)} style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 700 }}>
                    +91 {primaryCallContact.rawPhone.replace(/\D/g, '').slice(-10)}
                  </a>
                  <span style={{ fontSize: '0.7rem', color: '#86efac', marginLeft: '0.4rem', fontWeight: 600 }}>
                    (Daytime Direct Desk)
                  </span>
                </div>
                {secondaryCallContact && (
                  <div style={{ marginTop: '0.2rem' }}>
                    <a href={formatCallUrl(secondaryCallContact.rawPhone)} style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600 }}>
                      +91 {secondaryCallContact.rawPhone.replace(/\D/g, '').slice(-10)}
                    </a>
                    <span style={{ fontSize: '0.68rem', color: '#fbbf24', marginLeft: '0.35rem' }}>
                      (Helpdesk)
                    </span>
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '2px' }}>
                  ⭐ Please save these numbers for future connect
                </div>
                <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Mail size={14} color="#94a3b8" />
                  <a href={`mailto:${brand.email}`} style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.75rem' }}>
                    {brand.email}
                  </a>
                </div>
              </div>
            </div>

            {/* Business Hours & Website */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <Clock size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#fff' }}>Team Working Hours:</strong>
                <div>{brand.hours}</div>
                <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Globe size={14} color="#6366f1" />
                  <a 
                    href="https://www.desukafashion.com" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 700 }}
                  >
                    https://www.desukafashion.com <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Social Profiles & Google Search */}
          <div style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '1.25rem',
            marginBottom: '1.25rem'
          }}>
            <p style={{
              fontSize: '0.75rem',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: '#94a3b8',
              textAlign: 'center',
              marginBottom: '0.85rem'
            }}>
              Follow Our Official Channels & Reviews
            </p>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.75rem'
            }}>
              {/* Instagram */}
              <a
                href={brand.instagram}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <InstagramIcon />
                @desukab2b
              </a>

              {/* Facebook */}
              <a
                href={brand.facebook}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <FacebookIcon />
                @desukab2b
              </a>

              {/* YouTube */}
              <a
                href={brand.youtube}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                <YoutubeIcon />
                @DesukaByVSFashion
              </a>

              {/* Google Search Profile */}
              <a
                href={brand.googleMaps}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#f8fafc',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
              >
                🔍 Google GMB Profile
              </a>

              {/* WhatsApp Community */}
              <a
                href={communityLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: 'rgba(37, 211, 102, 0.15)',
                  border: '1px solid rgba(37, 211, 102, 0.35)',
                  color: '#25d366',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontWeight: 600
                }}
              >
                💬 Join WhatsApp Community
              </a>
            </div>
          </div>

          {/* B2B Verified Badges */}
          <div style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '1rem',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#94a3b8'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>🏪 Verified On:</span>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#34d399',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  fontFamily: 'monospace'
                }}
              >
                ✓ GSTIN: {brand.gstNumber || '07AKCPJ2754N1ZX'}
              </span>
              {brand.verifiedOn.map(v => (
                <span
                  key={v}
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    fontWeight: 600
                  }}
                >
                  ✓ {v}
                </span>
              ))}
            </div>
            {/* Discrete Bottom Refresh Indicator */}
            {!isExpired && timeLeft && (
              <div style={{
                marginTop: '1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '0.35rem 0.85rem',
                borderRadius: '20px',
                fontSize: '0.72rem',
                color: '#64748b'
              }}>
                <Clock size={12} color="#64748b" />
                <span>Showcase session refreshes in: {String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s</span>
              </div>
            )}
            <div style={{ marginTop: '0.75rem', opacity: 0.6, fontSize: '0.7rem' }}>
              © {new Date().getFullYear()} VS FASHION • All rights reserved. Wholesale Fashion Delhi.
            </div>
          </div>
        </footer>
      </main>

      {/* Lightbox Zoom Modal */}
      {activeImageModal && (
        <div
          onClick={() => setActiveImageModal(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <button
            onClick={() => setActiveImageModal(null)}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#fff',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={24} />
          </button>
          <img
            src={activeImageModal}
            alt="Preview"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '96vw',
              maxHeight: '92vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 0 30px rgba(0,0,0,0.8)'
            }}
          />
        </div>
      )}
    </div>
  );
}
