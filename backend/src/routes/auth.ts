import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod';

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password, deviceUuid, deviceName } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    // Fetch user
    const userRes = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const user = userRes.rows[0];

    // Check account status
    if (user.status !== 'active') {
      res.status(403).json({ error: 'Account is disabled. Contact your administrator.' });
      return;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    // Check device authorization for mobile users (stockist & sales)
    if (user.role === 'stockist' || user.role === 'sales') {
      if (!deviceUuid) {
        res.status(400).json({ error: 'Device UUID is required for mobile login' });
        return;
      }

      // Check if device already registered
      const deviceRes = await query(
        'SELECT status FROM devices WHERE user_id = $1 AND device_uuid = $2',
        [user.id, deviceUuid]
      );

      if (deviceRes.rows.length === 0) {
        // Register new device as pending
        await query(
          'INSERT INTO devices (user_id, device_uuid, device_name, status) VALUES ($1, $2, $3, $4)',
          [user.id, deviceUuid, deviceName || 'Unknown Device', 'pending']
        );

        res.status(403).json({
          status: 'device_pending',
          error: 'This device is pending admin approval. Please ask your admin to authorize it.',
          deviceUuid,
        });
        return;
      }

      const deviceStatus = deviceRes.rows[0].status;
      if (deviceStatus === 'pending') {
        res.status(403).json({
          status: 'device_pending',
          error: 'This device is still pending administrator approval.',
          deviceUuid,
        });
        return;
      } else if (deviceStatus === 'blocked') {
        res.status(403).json({
          status: 'device_blocked',
          error: 'This device has been blocked from accessing the application.',
          deviceUuid,
        });
        return;
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        deviceUuid: (user.role === 'stockist' || user.role === 'sales') ? deviceUuid : undefined,
      },
      JWT_SECRET,
      { expiresIn: '30d' } // Long-lived tokens for convenience, check on each call
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me - Verify token and return user info
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
