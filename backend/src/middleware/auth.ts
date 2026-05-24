import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: 'superadmin' | 'stockist' | 'sales';
    deviceUuid?: string;
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
      'SELECT id, username, role, status, working_hours_start, working_hours_end FROM users WHERE id = $1',
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

    // 3. Working hours check
    const now = new Date();
    // Format current local time as "HH:MM:SS"
    const currentTimeStr = now.toTimeString().split(' ')[0];
    const start = user.working_hours_start;
    const end = user.working_hours_end;

    if (start && end) {
      if (currentTimeStr < start || currentTimeStr > end) {
        res.status(403).json({ error: `Access restricted. Allowed working hours: ${start} - ${end}` });
        return;
      }
    }

    // 4. Device verification for mobile roles (stockist and sales)
    if (user.role === 'stockist' || user.role === 'sales') {
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

    // Attach user information to request
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      deviceUuid: decoded.deviceUuid,
    };

    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (roles: Array<'superadmin' | 'stockist' | 'sales'>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Unauthorized to perform this action' });
      return;
    }
    next();
  };
};
