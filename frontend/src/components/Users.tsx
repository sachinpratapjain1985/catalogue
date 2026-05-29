import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Smartphone, 
  Trash2, 
  Check, 
  Ban, 
  Clock, 
  FolderOpen,
  Edit2,
  X
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
}

interface User {
  id: number;
  username: string;
  role: 'superadmin' | 'manager' | 'both' | 'stockist' | 'sales';
  status: 'active' | 'disabled';
  working_hours_start: string;
  working_hours_end: string;
  created_at: string;
  assignedCategories: Array<{ id: number; name: string }>;
}

interface Device {
  id: number;
  device_uuid: string;
  device_name: string;
  status: 'pending' | 'approved' | 'blocked';
  created_at: string;
  updated_at: string;
  user_id: number;
  username: string;
  role: string;
}

interface UsersProps {
  token: string;
}

export default function Users({ token }: UsersProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // User form states (Create / Edit)
  const [isEditing, setIsEditing] = useState(false);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'superadmin' | 'manager' | 'both' | 'stockist' | 'sales'>('stockist');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [workingHoursStart, setWorkingHoursStart] = useState('08:00:00');
  const [workingHoursEnd, setWorkingHoursEnd] = useState('20:00:00');
  const [selectedCatIds, setSelectedCatIds] = useState<number[]>([]);

  // UI Messages
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchDevices();
    fetchCategories();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (e) {
      console.error('Failed to load users', e);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/admin/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDevices(data);
      }
    } catch (e) {
      console.error('Failed to load devices', e);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/admin/categories', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || (!isEditing && !password)) {
      showError('Please fill out all required fields');
      return;
    }

    const payload = {
      username: username.trim(),
      password: password || undefined,
      role,
      status,
      workingHoursStart,
      workingHoursEnd,
      categoryIds: (role === 'stockist' || role === 'both') ? selectedCatIds : []
    };

    try {
      const url = isEditing ? `/api/admin/users/${editUserId}` : '/api/admin/users';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        showSuccess(isEditing ? 'User updated successfully' : 'User created successfully');
        resetUserForm();
        fetchUsers();
      } else {
        showError(data.error || 'Failed to save user');
      }
    } catch (err) {
      showError('Network error');
    }
  };

  const handleEditClick = (user: User) => {
    setIsEditing(true);
    setEditUserId(user.id);
    setUsername(user.username);
    setPassword('');
    setRole(user.role);
    setStatus(user.status);
    setWorkingHoursStart(user.working_hours_start || '08:00:00');
    setWorkingHoursEnd(user.working_hours_end || '20:00:00');
    setSelectedCatIds(user.assignedCategories.map(c => c.id));
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? This will also remove their device authorizations!`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        showSuccess('User deleted');
        fetchUsers();
        fetchDevices(); // update device list too
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete user');
      }
    } catch (e) {
      showError('Network error');
    }
  };

  const handleDeviceStatus = async (deviceId: number, targetStatus: 'approved' | 'blocked') => {
    try {
      const response = await fetch(`/api/admin/devices/${deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: targetStatus })
      });

      if (response.ok) {
        showSuccess(`Device access ${targetStatus === 'approved' ? 'authorized' : 'blocked'}`);
        fetchDevices();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to update device status');
      }
    } catch (e) {
      showError('Network error');
    }
  };

  const handleDeleteDevice = async (deviceId: number) => {
    if (!window.confirm('Remove this device registration? The user will have to log in on the device again to trigger registration.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        showSuccess('Device registration removed');
        fetchDevices();
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to delete device');
      }
    } catch (e) {
      showError('Network error');
    }
  };

  const resetUserForm = () => {
    setIsEditing(false);
    setEditUserId(null);
    setUsername('');
    setPassword('');
    setRole('stockist');
    setStatus('active');
    setWorkingHoursStart('08:00:00');
    setWorkingHoursEnd('20:00:00');
    setSelectedCatIds([]);
  };

  const handleCatCheckboxChange = (catId: number) => {
    if (selectedCatIds.includes(catId)) {
      setSelectedCatIds(selectedCatIds.filter(id => id !== catId));
    } else {
      setSelectedCatIds([...selectedCatIds, catId]);
    }
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 5000);
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1>User & Device Permissions</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Create user roles, assign folder accessibility, and approve whitelisted mobile devices</p>
      </div>

      {/* Success/Error Alerts */}
      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--color-success)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: 'var(--color-danger)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
          {errorMsg}
        </div>
      )}

      <div className="grid-2">
        {/* User Form Container */}
        <div className="glass-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <UserPlus size={20} color="var(--color-primary)" />
            {isEditing ? `Edit User: ${username}` : 'Create New User Account'}
          </h3>
          <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Username</label>
                <input 
                  type="text" 
                  placeholder="Enter login name" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={isEditing}
                  required
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>{isEditing ? 'New Password (Optional)' : 'Password'}</label>
                <input 
                  type="password" 
                  placeholder={isEditing ? 'Leave blank to keep same' : 'Enter password'} 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={!isEditing}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>User Role</label>
                <select value={role} onChange={e => setRole(e.target.value as any)}>
                  <option value="stockist">Stockist (Stock Manager)</option>
                  <option value="sales">Sales User (Catalogue Share)</option>
                  <option value="both">Both Rights (Sales + Stock)</option>
                  <option value="manager">Manager (Access both + Web admin)</option>
                  <option value="superadmin">Superadmin (Full Control)</option>
                </select>
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label>Account Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as any)}>
                  <option value="active">Active (Access Allowed)</option>
                  <option value="disabled">Disabled (Immediate Revoke)</option>
                </select>
              </div>
            </div>

            {/* Working hours restriction fields */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={12} />
                  Working Hours Start
                </label>
                <input 
                  type="time" 
                  value={workingHoursStart}
                  onChange={e => setWorkingHoursStart(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Clock size={12} />
                  Working Hours End
                </label>
                <input 
                  type="time" 
                  value={workingHoursEnd}
                  onChange={e => setWorkingHoursEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Folder accessibility checklist for Stockists */}
            {(role === 'stockist' || role === 'both') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--glass-border)', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.01)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem' }}>
                  <FolderOpen size={12} />
                  Assign Folder Accessibility
                </label>
                {categories.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Please create folder categories first.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto' }}>
                    {categories.map(cat => (
                      <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={selectedCatIds.includes(cat.id)}
                          onChange={() => handleCatCheckboxChange(cat.id)}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {cat.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                {isEditing ? 'Update User' : 'Save User Account'}
              </button>
              {isEditing && (
                <button type="button" onClick={resetUserForm} className="btn btn-secondary">
                  <X size={16} />
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Whitelisted Devices Container */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Smartphone size={20} color="var(--color-primary)" />
            Mobile Device Whitelist Approvals
          </h3>
          <div style={{ overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {devices.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No mobile device log-in requests recorded.</p>
            ) : (
              devices.map(device => (
                <div key={device.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="flex-between">
                    <div>
                      <strong style={{ fontFamily: 'Outfit', fontSize: '1rem' }}>{device.device_name}</strong>
                      <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>{device.role}</span>
                    </div>
                    <span className={`badge ${
                      device.status === 'approved' ? 'badge-success' : 
                      device.status === 'blocked' ? 'badge-danger' : 'badge-warning'
                    }`}>
                      {device.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span>Associated User: <strong style={{ color: 'var(--text-primary)' }}>{device.username}</strong></span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>UUID: {device.device_uuid}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '0.5rem' }}>
                    {device.status !== 'approved' && (
                      <button 
                        onClick={() => handleDeviceStatus(device.id, 'approved')} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--color-success)', borderColor: 'rgba(16,185,129,0.2)' }}
                      >
                        <Check size={14} style={{ marginRight: '4px' }} />
                        Approve
                      </button>
                    )}
                    {device.status !== 'blocked' && (
                      <button 
                        onClick={() => handleDeviceStatus(device.id, 'blocked')} 
                        className="btn btn-secondary" 
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--color-danger)', borderColor: 'rgba(244,63,94,0.2)' }}
                      >
                        <Ban size={14} style={{ marginRight: '4px' }} />
                        Block
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteDevice(device.id)} 
                      className="btn btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}
                      title="Remove registration"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Users table list */}
      <div className="glass-card">
        <h3>System User Accounts</h3>
        <div className="table-container" style={{ marginTop: '1.25rem' }}>
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>System Role</th>
                <th>Account Status</th>
                <th>Working Hours Window</th>
                <th>Stockist Folder Access</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>{u.username}</td>
                  <td>
                    <span className="badge badge-info">{u.role}</span>
                  </td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} color="var(--text-secondary)" />
                      {u.working_hours_start.slice(0,5)} - {u.working_hours_end.slice(0,5)}
                    </div>
                  </td>
                  <td style={{ maxWidth: '240px', fontSize: '0.85rem' }}>
                    {(u.role === 'stockist' || u.role === 'both') ? (
                      u.assignedCategories.length === 0 ? (
                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>No folders assigned</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {u.assignedCategories.map(c => (
                            <span key={c.id} style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.75rem' }}>
                              {c.name}
                            </span>
                          ))}
                        </div>
                      )
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>All Folders (Inherited)</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        onClick={() => handleEditClick(u)} 
                        style={{ border: 'none', background: 'none', color: 'var(--color-secondary)', cursor: 'pointer' }}
                        title="Edit user profile"
                      >
                        <Edit2 size={16} />
                      </button>
                      {u.username !== 'admin' && (
                        <button 
                          onClick={() => handleDeleteUser(u.id, u.username)} 
                          style={{ border: 'none', background: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                          title="Delete user"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
