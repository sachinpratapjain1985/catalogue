import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db';
import sharp from 'sharp';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Apply admin guard to all routes in this file
router.use(authenticateToken);
router.use(requireRole(['superadmin', 'manager']));

// Setup Multer for image uploads
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'sku-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed!'));
  },
});

// ==========================================
// 1. DASHBOARD & REPORTS ENDPOINTS
// ==========================================

router.get('/dashboard', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Basic stats
    const categoriesCount = await query('SELECT COUNT(*) FROM categories');
    const itemsCount = await query('SELECT COUNT(*) FROM items');
    const stockStats = await query(
      'SELECT SUM(sets_count) as total_sets, SUM(total_pieces) as total_pieces FROM stock WHERE is_available = true'
    );

    // Aging Stock count (older than 60 days)
    const agingCount = await query(
      `SELECT COUNT(*) FROM items WHERE original_created_at <= CURRENT_DATE - INTERVAL '60 days'`
    );

    // Additions & Reductions today
    const additionsToday = await query(
      `SELECT SUM(sets_changed) as sets, SUM(pieces_changed) as pieces 
       FROM stock_logs 
       WHERE change_type = 'addition' AND created_at >= CURRENT_DATE`
    );
    const reductionsToday = await query(
      `SELECT SUM(ABS(sets_changed)) as sets, SUM(ABS(pieces_changed)) as pieces 
       FROM stock_logs 
       WHERE change_type = 'reduction' AND created_at >= CURRENT_DATE`
    );

    // Category breakdown
    const categoryBreakdown = await query(
      `SELECT c.id, c.name, COUNT(i.id) as sku_count, 
              COALESCE(SUM(s.sets_count), 0) as total_sets, 
              COALESCE(SUM(s.total_pieces), 0) as total_pieces
       FROM categories c
       LEFT JOIN items i ON i.category_id = c.id
       LEFT JOIN stock s ON s.item_id = i.id
       GROUP BY c.id, c.name
       ORDER BY c.name ASC`
    );

    // Recent activity logs (Last 10 updates)
    const recentActivity = await query(
      `SELECT sl.id, sl.change_type, sl.sets_changed, sl.pieces_changed, sl.created_at,
              i.sku_id, c.name as category_name, u.username
       FROM stock_logs sl
       JOIN items i ON sl.item_id = i.id
       JOIN categories c ON i.category_id = c.id
       JOIN users u ON sl.user_id = u.id
       ORDER BY sl.created_at DESC
       LIMIT 10`
    );

    // 7-Day Activity Trends
    const trends = await query(
      `SELECT DATE(created_at) as date,
              SUM(CASE WHEN change_type = 'addition' THEN sets_changed ELSE 0 END) as sets_added,
              SUM(CASE WHEN change_type = 'reduction' THEN ABS(sets_changed) ELSE 0 END) as sets_reduced
       FROM stock_logs
       WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`
    );

    res.json({
      summary: {
        categories: parseInt(categoriesCount.rows[0].count),
        skus: parseInt(itemsCount.rows[0].count),
        totalSets: parseInt(stockStats.rows[0].total_sets || '0'),
        totalPieces: parseInt(stockStats.rows[0].total_pieces || '0'),
        agingCount: parseInt(agingCount.rows[0].count),
        addedToday: {
          sets: parseInt(additionsToday.rows[0].sets || '0'),
          pieces: parseInt(additionsToday.rows[0].pieces || '0'),
        },
        reducedToday: {
          sets: parseInt(reductionsToday.rows[0].sets || '0'),
          pieces: parseInt(reductionsToday.rows[0].pieces || '0'),
        },
      },
      categoryBreakdown: categoryBreakdown.rows.map(row => ({
        id: row.id,
        name: row.name,
        skuCount: parseInt(row.sku_count),
        totalSets: parseInt(row.total_sets),
        totalPieces: parseInt(row.total_pieces),
      })),
      recentActivity: recentActivity.rows,
      trends: trends.rows,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/reports/additions
router.get('/reports/additions', async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate, categoryId, search } = req.query;
  let sql = `
    SELECT sl.id, sl.sets_changed, sl.pieces_changed, sl.created_at, sl.previous_sets, sl.new_sets,
           i.sku_id, i.pieces_per_set, c.name as category_name, u.username as stockist_name
    FROM stock_logs sl
    JOIN items i ON sl.item_id = i.id
    JOIN categories c ON i.category_id = c.id
    JOIN users u ON sl.user_id = u.id
    WHERE sl.change_type = 'addition'
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (startDate) {
    sql += ` AND sl.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    sql += ` AND sl.created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (categoryId) {
    sql += ` AND i.category_id = $${paramCount}`;
    params.push(categoryId);
    paramCount++;
  }
  if (search) {
    sql += ` AND i.sku_id ILIKE $${paramCount}`;
    params.push(`%${search}%`);
    paramCount++;
  }

  sql += ' ORDER BY sl.created_at DESC';

  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch additions report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/reports/reductions (Sold Report)
router.get('/reports/reductions', async (req: AuthenticatedRequest, res: Response) => {
  const { startDate, endDate, categoryId, search } = req.query;
  let sql = `
    SELECT sl.id, ABS(sl.sets_changed) as sets_changed, ABS(sl.pieces_changed) as pieces_changed, 
           sl.created_at, sl.previous_sets, sl.new_sets,
           i.sku_id, i.pieces_per_set, c.name as category_name, u.username as stockist_name
    FROM stock_logs sl
    JOIN items i ON sl.item_id = i.id
    JOIN categories c ON i.category_id = c.id
    JOIN users u ON sl.user_id = u.id
    WHERE sl.change_type = 'reduction'
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (startDate) {
    sql += ` AND sl.created_at >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }
  if (endDate) {
    sql += ` AND sl.created_at <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }
  if (categoryId) {
    sql += ` AND i.category_id = $${paramCount}`;
    params.push(categoryId);
    paramCount++;
  }
  if (search) {
    sql += ` AND i.sku_id ILIKE $${paramCount}`;
    params.push(`%${search}%`);
    paramCount++;
  }

  sql += ' ORDER BY sl.created_at DESC';

  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch reductions report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/reports/aging - Aging stock report
router.get('/reports/aging', async (req: Request, res: Response) => {
  const { categoryId, search, minAgeDays } = req.query;
  
  let sql = `
    SELECT i.id, i.sku_id, i.pieces_per_set, i.description, i.material, i.rate, 
           i.original_created_at, i.created_at,
           c.name as category_name,
           s.sets_count, s.total_pieces, s.is_available,
           (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days
    FROM items i
    JOIN categories c ON i.category_id = c.id
    LEFT JOIN stock s ON s.item_id = i.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramCount = 1;

  if (categoryId) {
    sql += ` AND i.category_id = $${paramCount}`;
    params.push(categoryId);
    paramCount++;
  }
  if (search) {
    sql += ` AND i.sku_id ILIKE $${paramCount}`;
    params.push(`%${search}%`);
    paramCount++;
  }
  if (minAgeDays) {
    sql += ` AND (CURRENT_DATE - DATE(i.original_created_at)) >= $${paramCount}`;
    params.push(parseInt(minAgeDays as string));
    paramCount++;
  }

  sql += ' ORDER BY age_in_days DESC, i.sku_id ASC';

  try {
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch aging report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 2. USER MANAGEMENT ENDPOINTS
// ==========================================

// GET /api/admin/users
router.get('/users', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    // Get all users
    const usersRes = await query(
      `SELECT id, username, role, status, working_hours_start, working_hours_end, created_at 
       FROM users 
       ORDER BY role ASC, username ASC`
    );
    const users = usersRes.rows;

    // Get user category assignments
    const ucRes = await query(
      `SELECT uc.user_id, c.id as category_id, c.name as category_name 
       FROM user_categories uc
       JOIN categories c ON uc.category_id = c.id`
    );

    // Map categories to users
    const userCategoriesMap: Record<number, any[]> = {};
    ucRes.rows.forEach(row => {
      if (!userCategoriesMap[row.user_id]) {
        userCategoriesMap[row.user_id] = [];
      }
      userCategoriesMap[row.user_id].push({
        id: row.category_id,
        name: row.category_name,
      });
    });

    // Merge categories into user objects
    const result = users.map(user => ({
      ...user,
      assignedCategories: userCategoriesMap[user.id] || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/users
router.post('/users', requireRole(['superadmin']), async (req: Request, res: Response): Promise<void> => {
  const { username, password, role, status, workingHoursStart, workingHoursEnd, categoryIds } = req.body;

  if (!username || !password || !role) {
    res.status(400).json({ error: 'Username, password, and role are required' });
    return;
  }

  try {
    const userExists = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    // Insert user
    const insertRes = await query(
      `INSERT INTO users (username, password_hash, role, status, working_hours_start, working_hours_end)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, role, status, working_hours_start, working_hours_end`,
      [
        username,
        hash,
        role,
        status || 'active',
        workingHoursStart || '00:00:00',
        workingHoursEnd || '23:59:59',
      ]
    );

    const newUser = insertRes.rows[0];

    // Assign categories if role is stockist/both/manager and categories provided
    if ((role === 'stockist' || role === 'both' || role === 'manager') && Array.isArray(categoryIds) && categoryIds.length > 0) {
      for (const catId of categoryIds) {
        await query(
          'INSERT INTO user_categories (user_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [newUser.id, catId]
        );
      }
    }

    res.status(201).json({
      ...newUser,
      assignedCategories: categoryIds || [],
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', requireRole(['superadmin']), async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id);
  const { password, role, status, workingHoursStart, workingHoursEnd, categoryIds } = req.body;

  try {
    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userRes.rows[0];

    let updateQuery = `
      UPDATE users 
      SET role = $1, status = $2, working_hours_start = $3, working_hours_end = $4, updated_at = CURRENT_TIMESTAMP
    `;
    const params: any[] = [
      role || user.role,
      status || user.status,
      workingHoursStart || user.working_hours_start,
      workingHoursEnd || user.working_hours_end,
    ];
    let paramIndex = 5;

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      updateQuery += `, password_hash = $${paramIndex}`;
      params.push(hash);
      paramIndex++;
    }

    updateQuery += ` WHERE id = $${paramIndex} RETURNING id, username, role, status, working_hours_start, working_hours_end`;
    params.push(userId);

    const updatedUserRes = await query(updateQuery, params);
    const updatedUser = updatedUserRes.rows[0];

    // Manage category assignments for stockists/both/manager
    if ((role === 'stockist' || role === 'both' || role === 'manager') && Array.isArray(categoryIds)) {
      // Clear old permissions
      await query('DELETE FROM user_categories WHERE user_id = $1', [userId]);
      // Insert new ones
      for (const catId of categoryIds) {
        await query('INSERT INTO user_categories (user_id, category_id) VALUES ($1, $2)', [userId, catId]);
      }
    } else {
      // If no longer stockist, remove all category links
      await query('DELETE FROM user_categories WHERE user_id = $1', [userId]);
    }

    res.json({
      ...updatedUser,
      assignedCategories: categoryIds || [],
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireRole(['superadmin']), async (req: Request, res: Response): Promise<void> => {
  const userId = parseInt(req.params.id);

  try {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 3. DEVICE AUTHORIZATION ENDPOINTS
// ==========================================

// GET /api/admin/devices
router.get('/devices', requireRole(['superadmin']), async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT d.id, d.device_uuid, d.device_name, d.status, d.created_at, d.updated_at,
              u.id as user_id, u.username, u.role
       FROM devices d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.status ASC, d.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/devices/:id
router.put('/devices/:id', requireRole(['superadmin']), async (req: Request, res: Response): Promise<void> => {
  const deviceId = parseInt(req.params.id);
  const { status } = req.body;

  if (!status || !['approved', 'blocked', 'pending'].includes(status)) {
    res.status(400).json({ error: 'Valid status is required' });
    return;
  }

  try {
    const result = await query(
      `UPDATE devices 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, device_uuid, status`,
      [status, deviceId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/devices/:id
router.delete('/devices/:id', requireRole(['superadmin']), async (req: Request, res: Response): Promise<void> => {
  const deviceId = parseInt(req.params.id);

  try {
    const result = await query('DELETE FROM devices WHERE id = $1 RETURNING id', [deviceId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({ message: 'Device registration removed' });
  } catch (error) {
    console.error('Delete device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 4. CATEGORY (FOLDER) MANAGEMENT
// ==========================================

// GET /api/admin/categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/categories
router.post('/categories', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;

  if (!name || name.trim() === '') {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  try {
    const result = await query(
      'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name.trim()]
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: 'Category already exists' });
      return;
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/categories/:id
router.put('/categories/:id', async (req: Request, res: Response): Promise<void> => {
  const categoryId = parseInt(req.params.id);
  const { name } = req.body;

  if (!name || name.trim() === '') {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  try {
    const result = await query(
      'UPDATE categories SET name = $1 WHERE id = $2 RETURNING *',
      [name.trim(), categoryId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', async (req: Request, res: Response): Promise<void> => {
  const categoryId = parseInt(req.params.id);

  try {
    // Delete SKU images from disk first
    const itemsRes = await query('SELECT image_path FROM items WHERE category_id = $1', [categoryId]);
    for (const item of itemsRes.rows) {
      const fullPath = path.join(uploadDir, path.basename(item.image_path));
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.error('Failed to delete file', fullPath, e);
        }
      }
      
      // Also delete thumbnail
      const ext = path.extname(item.image_path);
      const baseName = path.basename(item.image_path, ext);
      const thumbPath = path.join(uploadDir, `${baseName}-thumb${ext}`);
      if (fs.existsSync(thumbPath)) {
        try {
          fs.unlinkSync(thumbPath);
        } catch (e) {
          console.error('Failed to delete thumbnail file', thumbPath, e);
        }
      }
    }

    const result = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [categoryId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json({ message: 'Category and all associated SKU designs deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==========================================
// 5. SKU / CATALOG DESIGN MANAGEMENT
// ==========================================

// GET /api/admin/items - List all SKU items
router.get('/items', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.rate, i.original_created_at, i.created_at,
              c.name as category_name,
              s.sets_count, s.total_pieces, s.is_available, s.updated_at as stock_updated_at,
              u.username as updated_by_user
       FROM items i
       JOIN categories c ON i.category_id = c.id
       LEFT JOIN stock s ON s.item_id = i.id
       LEFT JOIN users u ON s.updated_by = u.id
       ORDER BY i.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/items - Upload new SKU
router.post('/items', upload.single('image'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { skuId, categoryId, piecesPerSet, description, material, rate, originalCreatedAt } = req.body;

  if (!skuId || !categoryId || !req.file) {
    res.status(400).json({ error: 'SKU ID, Category ID, and image file are required' });
    return;
  }

  const clientUserId = req.user?.id || 1; // Fallback to admin
  const finalDescription = description && description.trim() !== '' ? description.trim() : 'DESUKA by VS FASHION Gandhi Nagar Delhi.';
  const finalRate = parseInt(rate || '0');
  let originalDate = new Date();
  if (originalCreatedAt) {
    originalDate = new Date(originalCreatedAt);
  }

  const ext = path.extname(req.file.filename);
  const baseName = path.basename(req.file.filename, ext);
  const thumbFilename = `${baseName}-thumb${ext}`;
  const thumbPath = path.join(uploadDir, thumbFilename);

  try {
    // Check unique SKU ID
    const skuExists = await query('SELECT id FROM items WHERE sku_id = $1', [skuId]);
    if (skuExists.rows.length > 0) {
      // Remove uploaded file if SKU already exists
      fs.unlinkSync(req.file.path);
      res.status(400).json({ error: `SKU ID '${skuId}' already exists. Please choose a unique SKU.` });
      return;
    }

    // Generate thumbnail using sharp
    try {
      await sharp(req.file.path)
        .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
        .toFile(thumbPath);
      console.log(`[Thumbnail] Generated thumbnail at ${thumbPath}`);
    } catch (thumbErr) {
      console.error('[Thumbnail] Failed to generate thumbnail:', thumbErr);
    }

    const imagePath = `/uploads/${req.file.filename}`;
    const pieces = parseInt(piecesPerSet || '4');

    // Insert Item
    const itemRes = await query(
      `INSERT INTO items (sku_id, category_id, image_path, pieces_per_set, description, material, rate, original_created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [skuId, parseInt(categoryId), imagePath, pieces, finalDescription, material || '', finalRate, originalDate]
    );

    const newItem = itemRes.rows[0];

    // Initialize stock (available: true, sets: 0, pieces: 0)
    await query(
      `INSERT INTO stock (item_id, sets_count, total_pieces, is_available, updated_by)
       VALUES ($1, 0, 0, TRUE, $2)`,
      [newItem.id, clientUserId]
    );

    // Log the initial stock setup
    await query(
      `INSERT INTO stock_logs (item_id, user_id, change_type, sets_changed, pieces_changed, 
                               previous_sets, new_sets, previous_available, new_available)
       VALUES ($1, $2, 'status_change', 0, 0, 0, 0, FALSE, TRUE)`,
      [newItem.id, clientUserId]
    );

    res.status(201).json({
      ...newItem,
      sets_count: 0,
      total_pieces: 0,
      is_available: true,
    });
  } catch (error) {
    console.error('Create SKU design error:', error);
    // Cleanup files in case of crash
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath);
      } catch (e) {}
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/items/:id
router.delete('/items/:id', async (req: Request, res: Response): Promise<void> => {
  const itemId = parseInt(req.params.id);

  try {
    const itemRes = await query('SELECT image_path FROM items WHERE id = $1', [itemId]);
    if (itemRes.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const item = itemRes.rows[0];
    const fullPath = path.join(uploadDir, path.basename(item.image_path));
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        console.error('Failed to delete image file', fullPath, e);
      }
    }

    // Also delete thumbnail
    const ext = path.extname(item.image_path);
    const baseName = path.basename(item.image_path, ext);
    const thumbPath = path.join(uploadDir, `${baseName}-thumb${ext}`);
    if (fs.existsSync(thumbPath)) {
      try {
        fs.unlinkSync(thumbPath);
      } catch (e) {
        console.error('Failed to delete thumbnail file', thumbPath, e);
      }
    }

    await query('DELETE FROM items WHERE id = $1', [itemId]);
    res.json({ message: 'SKU and its image design deleted successfully' });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/items/:id - Update SKU details, rate, or stock (Manager/Admin)
router.put('/items/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const itemId = parseInt(req.params.id);
  const userId = req.user?.id || 1;
  const { skuId, categoryId, piecesPerSet, description, material, rate, setsCount, isAvailable, originalCreatedAt } = req.body;

  try {
    // 1. Get current item and stock state
    const currentRes = await query(
      `SELECT i.*, s.sets_count, s.total_pieces, s.is_available 
       FROM items i
       LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.id = $1`,
      [itemId]
    );

    if (currentRes.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const item = currentRes.rows[0];

    // 2. Update items metadata if provided
    let updateFields: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (skuId !== undefined) {
      updateFields.push(`sku_id = $${paramIndex}`);
      params.push(skuId.trim());
      paramIndex++;
    }
    if (categoryId !== undefined) {
      updateFields.push(`category_id = $${paramIndex}`);
      params.push(parseInt(categoryId));
      paramIndex++;
    }
    if (piecesPerSet !== undefined) {
      updateFields.push(`pieces_per_set = $${paramIndex}`);
      params.push(parseInt(piecesPerSet));
      paramIndex++;
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex}`);
      params.push(description.trim());
      paramIndex++;
    }
    if (material !== undefined) {
      updateFields.push(`material = $${paramIndex}`);
      params.push(material.trim());
      paramIndex++;
    }
    if (rate !== undefined) {
      updateFields.push(`rate = $${paramIndex}`);
      params.push(parseInt(rate));
      paramIndex++;
    }
    if (originalCreatedAt !== undefined) {
      updateFields.push(`original_created_at = $${paramIndex}`);
      params.push(new Date(originalCreatedAt));
      paramIndex++;
    }

    if (updateFields.length > 0) {
      params.push(itemId);
      const queryStr = `UPDATE items SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`;
      await query(queryStr, params);
    }

    // 3. Log rate change if rate changed
    if (rate !== undefined && parseInt(rate) !== item.rate) {
      await query(
        `INSERT INTO rate_logs (item_id, user_id, old_rate, new_rate) VALUES ($1, $2, $3, $4)`,
        [itemId, userId, item.rate, parseInt(rate)]
      );
      console.log(`[Rate Log] Rate for item ${itemId} changed from ${item.rate} to ${rate} by user ${userId}`);
    }

    // 4. Update stock levels if provided
    const targetSets = setsCount !== undefined ? parseInt(setsCount) : item.sets_count;
    const targetAvailable = isAvailable !== undefined ? !!isAvailable : item.is_available;
    const piecesPerSetVal = piecesPerSet !== undefined ? parseInt(piecesPerSet) : item.pieces_per_set;
    const targetPieces = targetSets * piecesPerSetVal;

    const setsDiff = targetSets - item.sets_count;
    const piecesDiff = targetPieces - item.total_pieces;

    if (setsDiff !== 0 || targetAvailable !== item.is_available) {
      let logType: 'addition' | 'reduction' | 'status_change' = 'status_change';
      if (setsDiff > 0) {
        logType = 'addition';
      } else if (setsDiff < 0) {
        logType = 'reduction';
      }

      await query(
        `UPDATE stock 
         SET sets_count = $1, total_pieces = $2, is_available = $3, updated_at = CURRENT_TIMESTAMP, updated_by = $4
         WHERE item_id = $5`,
        [targetSets, targetPieces, targetAvailable, userId, itemId]
      );

      await query(
        `INSERT INTO stock_logs (item_id, user_id, change_type, sets_changed, pieces_changed, 
                                 previous_sets, new_sets, previous_available, new_available)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          itemId,
          userId,
          logType,
          setsDiff,
          piecesDiff,
          item.sets_count,
          targetSets,
          item.is_available,
          targetAvailable,
        ]
      );
    }

    // Fetch updated row
    const updatedRes = await query(
      `SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.rate, i.original_created_at,
              c.name as category_name,
              s.sets_count, s.total_pieces, s.is_available
       FROM items i
       JOIN categories c ON i.category_id = c.id
       LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.id = $1`,
      [itemId]
    );

    res.json(updatedRes.rows[0]);
  } catch (error) {
    console.error('Update item details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
