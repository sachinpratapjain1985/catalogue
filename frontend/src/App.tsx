import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FolderOpen, 
  Users as UsersIcon, 
  FileSpreadsheet, 
  LogOut,
  Sparkles,
  Lock
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Catalogs from './components/Catalogs';
import Users from './components/Users';
import Reports from './components/Reports';

export interface UserProfile {
  id: number;
  username: string;
  role: 'superadmin' | 'manager' | 'both' | 'stockist' | 'sales';
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('admin_token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'catalogs' | 'users' | 'reports'>('dashboard');
  
  // Login form state
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      // Validate token and fetch user details
      fetchUser();
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        // Check if user is admin or manager
        if (data.user.role !== 'superadmin' && data.user.role !== 'manager') {
          setLoginError('Access denied. Admin portal only.');
          handleLogout();
        } else {
          setUser(data.user);
        }
      } else {
        handleLogout();
      }
    } catch (e) {
      console.error('Failed to authenticate token', e);
      handleLogout();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.user.role !== 'superadmin' && data.user.role !== 'manager') {
          setLoginError('Access denied. Admin portal only.');
        } else {
          localStorage.setItem('admin_token', data.token);
          setToken(data.token);
          setUser(data.user);
        }
      } else {
        setLoginError(data.error || 'Login failed. Please check credentials.');
      }
    } catch (err) {
      setLoginError('Server connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    setToken(null);
    setUser(null);
    setUsernameInput('');
    setPasswordInput('');
  };

  // Render Login view
  if (!token || !user) {
    return (
      <div className="login-container">
        <div className="glass-card login-card fade-in">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-tertiary)', borderRadius: '50%', marginBottom: '1rem', border: '1px solid var(--glass-border)' }}>
              <Lock size={32} color="var(--color-primary)" />
            </div>
            <h2>Desuka Fashion</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Catalog Admin Management</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input 
                type="text" 
                placeholder="Enter admin username"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Password</label>
              <input 
                type="password" 
                placeholder="Enter password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                required
              />
            </div>

            {loginError && (
              <div style={{ 
                background: 'rgba(244, 63, 94, 0.15)', 
                color: 'var(--color-danger)', 
                padding: '0.75rem', 
                borderRadius: 'var(--radius-sm)', 
                fontSize: '0.85rem',
                marginBottom: '1.5rem',
                border: '1px solid rgba(244, 63, 94, 0.25)'
              }}>
                {loginError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.9rem' }} disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In to Panel'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Main application
  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <Sparkles size={24} color="var(--color-primary)" />
          <span className="logo-text">DESUKA CATALOG</span>
        </div>

        <ul className="nav-links">
          <li>
            <button 
              className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
              style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
            >
              <LayoutDashboard size={20} />
              Dashboard
            </button>
          </li>
          <li>
            <button 
              className={`nav-link ${activeTab === 'catalogs' ? 'active' : ''}`}
              onClick={() => setActiveTab('catalogs')}
              style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
            >
              <FolderOpen size={20} />
              Catalog folders
            </button>
          </li>
          {user.role === 'superadmin' && (
            <li>
              <button 
                className={`nav-link ${activeTab === 'users' ? 'active' : ''}`}
                onClick={() => setActiveTab('users')}
                style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
              >
                <UsersIcon size={20} />
                User & Devices
              </button>
            </li>
          )}
          <li>
            <button 
              className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
              style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left' }}
            >
              <FileSpreadsheet size={20} />
              Stock Reports
            </button>
          </li>
        </ul>

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', padding: '0 0.5rem' }}>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user.username}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{user.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: '100%' }}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard token={token} />}
        {activeTab === 'catalogs' && <Catalogs token={token} />}
        {activeTab === 'users' && <Users token={token} />}
        {activeTab === 'reports' && <Reports token={token} />}
      </main>
    </div>
  );
}

export default App;
