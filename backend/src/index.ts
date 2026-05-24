import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import catalogRoutes from './routes/catalog';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*', // For internal mobile app & deployment simplicity
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-uuid']
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup uploads serving
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/catalog', catalogRoutes);

// Serve Static Frontend Assets in Production
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  console.log('Serving frontend from', publicPath);
  app.use(express.static(publicPath));
  
  // Fallback to index.html for React SPA Router
  app.get('*', (req, res, next) => {
    // If request is an API request that didn't match any route, return 404
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
} else {
  console.log('Static frontend directory not found. API only mode active.');
  app.get('/', (req, res) => {
    res.json({ message: 'Catalog Management API is running.' });
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Function to auto-seed/enforce the admin user
import bcrypt from 'bcryptjs';
import { query } from './db';

async function seedAdmin(retries = 10, delay = 3000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      // Check if users table exists
      const tableCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);

      if (tableCheck.rows[0].exists) {
        const adminCheck = await query('SELECT id FROM users WHERE username = $1', ['admin']);
        const adminHash = await bcrypt.hash('adminpassword', 10);

        if (adminCheck.rows.length === 0) {
          console.log('[Auto-Seed] Seeding default admin user...');
          await query(
            `INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, $3, $4)`,
            ['admin', adminHash, 'superadmin', 'active']
          );
          console.log('[Auto-Seed] Default admin user seeded successfully!');
        } else {
          console.log('[Auto-Seed] Enforcing default admin credentials...');
          await query(
            'UPDATE users SET password_hash = $1, status = $2, role = $3 WHERE username = $4',
            [adminHash, 'active', 'superadmin', 'admin']
          );
          console.log('[Auto-Seed] Default admin credentials verified & updated successfully!');
        }
        return; // Success, exit
      } else {
        console.log(`[Auto-Seed] Users table does not exist yet (attempt ${i + 1}/${retries}). Waiting for schema to initialize...`);
      }
    } catch (err) {
      console.warn(`[Auto-Seed] DB check failed (attempt ${i + 1}/${retries}):`, err);
    }
    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  console.error('[Auto-Seed] Failed to verify or seed admin user after maximum retries.');
}

// Secure Server Bootloader (HTTP / HTTPS auto-detection)
import https from 'https';
import http from 'http';

const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/lms.desukafashion.com/fullchain.pem';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/lms.desukafashion.com/privkey.pem';

let server;
let isHttps = false;

if (fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
  try {
    console.log(`[SSL] Certificates detected at: ${SSL_CERT_PATH}. Initializing HTTPS...`);
    const sslOptions = {
      cert: fs.readFileSync(SSL_CERT_PATH),
      key: fs.readFileSync(SSL_KEY_PATH)
    };
    server = https.createServer(sslOptions, app);
    isHttps = true;
  } catch (err) {
    console.error('[SSL] Failed to initialize HTTPS server, falling back to HTTP:', err);
    server = http.createServer(app);
  }
} else {
  console.log('[SSL] Certificates not detected. Initializing standard HTTP server...');
  server = http.createServer(app);
}

// Start Server
server.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT} via ${isHttps ? 'HTTPS' : 'HTTP'}`);
  // Run admin seed in the background on startup
  seedAdmin();
});

