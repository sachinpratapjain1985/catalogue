import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: 'superadmin' | 'manager' | 'both' | 'stockist' | 'sales';
    deviceUuid?: string;
    can_edit_rates?: boolean;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: number;
      username: string;
      role: 'superadmin' | 'stockist' | 'sales';
      deviceUuid?: string;
    };

    // 1. Fetch user status and working hours from database to ensure fresh state
    const userRes = await query(
      'SELECT id, username, role, status, working_hours_start, working_hours_end, can_edit_rates FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const user = userRes.rows[0];

    // 2. Check if user is active
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Your account has been disabled' });
      return;
    }

    // 3. Working hours check (forcing Indian Standard Time - Asia/Kolkata)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const hours = parts.find(p => p.type === 'hour')?.value || '00';
    const minutes = parts.find(p => p.type === 'minute')?.value || '00';
    const seconds = parts.find(p => p.type === 'second')?.value || '00';
    
    // In case hour12: false returns "24" instead of "00"
    const normalizedHour = hours === '24' ? '00' : hours;
    const currentTimeStr = `${normalizedHour}:${minutes}:${seconds}`;

    const start = user.working_hours_start;
    const end = user.working_hours_end;

    if (start && end) {
      if (currentTimeStr < start || currentTimeStr > end) {
        res.status(403).json({ error: `Access restricted. Allowed working hours: ${start} - ${end}` });
        return;
      }
    }

    // 4. Device verification for mobile roles (stockist, sales, both)
    // Managers only undergo device verification if they are on mobile (x-device-uuid header is present)
    const isMobileOnlyRole = user.role === 'stockist' || user.role === 'sales' || user.role === 'both';
    const hasDeviceContext = !!req.headers['x-device-uuid'] || !!decoded.deviceUuid;

    if (isMobileOnlyRole || (user.role === 'manager' && hasDeviceContext)) {
      const deviceUuid = req.headers['x-device-uuid'] as string || decoded.deviceUuid;

      if (!deviceUuid) {
        res.status(403).json({ error: 'Device identity missing. Action denied.' });
        return;
      }

      // Check device authorization in the database
      const deviceRes = await query(
        'SELECT status FROM devices WHERE user_id = $1 AND device_uuid = $2',
        [user.id, deviceUuid]
      );

      if (deviceRes.rows.length === 0) {
        res.status(403).json({ error: 'Device not registered. Please log in to request activation.' });
        return;
      }

      const deviceStatus = deviceRes.rows[0].status;
      if (deviceStatus !== 'approved') {
        res.status(403).json({ error: `Device status is currently: ${deviceStatus}. Access denied.` });
        return;
      }
      
      decoded.deviceUuid = deviceUuid;
    }

    // Determine active role override
    let activeRole = user.role;
    const headerRole = req.headers['x-active-role'] as string;
    if (headerRole === 'stockist' || headerRole === 'sales') {
      if (user.role === 'both' || user.role === 'manager' || user.role === 'superadmin') {
        activeRole = headerRole;
      }
    } else if (user.role === 'both') {
      activeRole = 'sales';
    }

    // Attach user information to request
    req.user = {
      id: user.id,
      username: user.username,
      role: activeRole as any,
      deviceUuid: decoded.deviceUuid,
      can_edit_rates: user.role === 'superadmin' || user.role === 'manager' || !!user.can_edit_rates
    };

    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (roles: Array<'superadmin' | 'manager' | 'both' | 'stockist' | 'sales'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Unauthorized to perform this action' });
      return;
    }
    next();
  };
};
