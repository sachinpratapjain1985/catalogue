import { useState, useEffect } from 'react';
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

interface ShowcaseResponse {
  notFound?: boolean;
  expired?: boolean;
  message?: string;
  token?: string;
  expires_at?: string;
  created_at?: string;
  items?: ShowcaseItem[];
  salesContacts: SalesContact[];
  callContact: {
    name: string;
    phone: string;
    rawPhone: string;
    note: string;
  };
  communityLink: string;
  brandDetails: {
    company: string;
    brand: string;
    address: string;
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

export default function ShowcaseView({ token }: ShowcaseViewProps) {
  const [data, setData] = useState<ShowcaseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImageModal, setActiveImageModal] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [isClientLockedOut, setIsClientLockedOut] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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
      // If 24 hours have elapsed since the user's first visit, mark as expired locally
      if (elapsed > 24 * 60 * 60 * 1000) {
        setIsClientLockedOut(true);
      }
    }

    fetchShowcase();
  }, [token]);

  // Live countdown timer based on server expires_at
  useEffect(() => {
    if (!data?.expires_at || data.expired || isClientLockedOut) return;

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
  }, [data, isClientLockedOut]);

  const fetchShowcase = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/public/showcase/${token}`);
      const json: ShowcaseResponse = await res.json();
      setData(json);
      if (res.status === 404) {
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
        text: 'Checkout exclusive wholesale collections from DESUKA by VS FASHION (Valid for 24 hours):',
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const isExpired = isClientLockedOut || data?.expired;

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
        <a 
          href="tel:9718503340"
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
            gap: '0.5rem'
          }}
        >
          <Phone size={18} />
          Call Wholesale Desk: 9718503340
        </a>
      </div>
    );
  }

  // Fallback defaults if data is null
  const brand = data?.brandDetails || {
    company: 'VS FASHION',
    brand: 'DESUKA',
    address: 'IX/6362, Netaji Gali, Gandhi Nagar, Delhi — 110031',
    email: 'wholesale@desukafashion.com',
    website: 'https://desukafashion.com',
    instagram: 'https://instagram.com/desukab2b',
    facebook: 'https://facebook.com/desukab2b',
    youtube: 'https://youtube.com/@DesukaByVSFashion',
    googleMaps: 'https://share.google/8egrK2LC6jGeJjAVa',
    googleSearchTitle: 'VS Fashion DESUKA / VS Fashion Gandhi Nagar Delhi',
    verifiedOn: ['IndiaMart', 'JustDial', 'TradeIndia'],
    hours: '10 AM – 7 PM | Daily — Except Monday',
  };

  const salesContacts = data?.salesContacts || [
    { name: 'VS FASHION Sales 1', phone: '+918796333844', rawPhone: '8796333844' },
    { name: 'VS FASHION Sales 2', phone: '+918796893844', rawPhone: '8796893844' },
    { name: 'VS FASHION Sales 3', phone: '+918796443844', rawPhone: '8796443844' },
  ];

  const callContact = data?.callContact || {
    name: 'VS FASHION Wholesale Desk',
    phone: '+919718503340',
    rawPhone: '9718503340',
    note: 'Please save this number for future connect',
  };

  const communityLink = data?.communityLink || 'https://chat.whatsapp.com/CdsyxZokQzo39x4hBzW6O0';

  // Helper to pick a sales number for item WhatsApp button
  const getRandomSalesNumber = (index: number) => {
    return salesContacts[index % salesContacts.length];
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
        </div>

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
        
        {/* State 1: Link Expired View (> 24 hours) */}
        {isExpired ? (
          <div style={{
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95))',
            borderRadius: '16px',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            padding: '2rem 1.25rem',
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
              background: 'rgba(244, 63, 94, 0.15)',
              border: '2px solid rgba(244, 63, 94, 0.4)',
              color: '#f43f5e',
              marginBottom: '1rem'
            }}>
              <Clock size={32} />
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>
              VIP 24-Hour Preview Window Has Ended
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', maxWidth: '540px', margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
              This exclusive catalog link was valid for 24 hours. To checkout our latest live collections and place wholesale orders, kindly connect directly with our sales team below.
            </p>

            {/* Direct Call Desk */}
            <div style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '12px',
              padding: '1rem',
              marginBottom: '1.5rem',
              maxWidth: '500px',
              margin: '0 auto 1.5rem'
            }}>
              <a
                href={`tel:${callContact.rawPhone}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#60a5fa',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}
              >
                <Phone size={20} />
                CALL: {callContact.rawPhone}
              </a>
              <div style={{
                marginTop: '0.4rem',
                fontSize: '0.75rem',
                color: '#fbbf24',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem'
              }}>
                <Bookmark size={13} />
                {callContact.note}
              </div>
            </div>

            {/* Randomized Sales Team WhatsApp Contact Buttons */}
            <div style={{ maxWidth: '500px', margin: '0 auto 1.5rem' }}>
              <p style={{
                fontSize: '0.75rem',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: '#94a3b8',
                marginBottom: '0.75rem'
              }}>
                Connect on WhatsApp (Instant Response)
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {salesContacts.map(contact => (
                  <a
                    key={contact.phone}
                    href={`https://api.whatsapp.com/send?phone=${contact.rawPhone}&text=${encodeURIComponent(
                      'Hello VS FASHION team, I am viewing your exclusive catalog collection and want to see your latest wholesale designs.'
                    )}`}
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
                      {contact.name} ({contact.rawPhone})
                    </span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.9, background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      Connect Now →
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
            {/* Countdown & VIP Access Banner */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Clock size={18} color="#a5b4fc" />
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                    VIP 24-Hour Exclusive Access
                  </span>
                  <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
                    Curated latest drops for wholesale buyers
                  </div>
                </div>
              </div>

              {timeLeft && (
                <div style={{
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <span>Valid for:</span>
                  <span>{String(timeLeft.hours).padStart(2, '0')}h : {String(timeLeft.minutes).padStart(2, '0')}m : {String(timeLeft.seconds).padStart(2, '0')}s</span>
                </div>
              )}
            </div>

            {/* Catalog Grid (Clean default images ONLY, NO prices, NO set counts, NO quantities) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.85rem',
              marginBottom: '2rem'
            }}>
              {data?.items && data.items.length > 0 ? (
                data.items.map((item, index) => {
                  const salesRep = getRandomSalesNumber(index);
                  const whatsappMsg = `Hello VS FASHION, I am interested in design SKU: ${item.sku_id} from your curated 24h showcase: ${window.location.href}`;
                  const whatsappUrl = `https://api.whatsapp.com/send?phone=${salesRep.rawPhone}&text=${encodeURIComponent(whatsappMsg)}`;

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
                          src={item.image_path}
                          alt={item.sku_id}
                          loading="lazy"
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
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: '#fff',
                            letterSpacing: '0.5px'
                          }}>
                            {item.sku_id}
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
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              padding: '1rem',
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.35rem' }}>
                Looking for more wholesale designs or customized sets?
              </h4>
              <p style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.85rem' }}>
                Chat directly with our Gandhi Nagar sales desk on WhatsApp for live video preview and catalogs:
              </p>
              
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                {salesContacts.map(c => (
                  <a
                    key={c.phone}
                    href={`https://api.whatsapp.com/send?phone=${c.rawPhone}&text=${encodeURIComponent(
                      'Hello VS FASHION, I am browsing your 24h showcase catalog and want to discuss wholesale orders.'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'linear-gradient(135deg, #25d366, #128c7e)',
                      color: '#fff',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <MessageSquare size={15} />
                    {c.name} ({c.rawPhone})
                  </a>
                ))}
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
              </div>
            </div>

            {/* Direct Call & Email */}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <Phone size={18} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#fff' }}>Call Desk:</strong>
                <div>
                  <a href={`tel:${callContact.rawPhone}`} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                    +91 {callContact.rawPhone}
                  </a>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '2px' }}>
                  ⭐ Please save this number for future connect
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
                <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Globe size={14} color="#6366f1" />
                  <a href={brand.website} target="_blank" rel="noopener noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', fontSize: '0.75rem' }}>
                    desukafashion.com <ExternalLink size={11} />
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
