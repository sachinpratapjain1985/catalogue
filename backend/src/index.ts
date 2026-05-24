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

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
