import { Router, Response } from 'express';
import { query } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

import multer from 'multer';
import { searchCatalogByImage, syncAllCatalogVisualFeatures, removeCachedVisualFeature } from '../services/visualSearch';

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const router = Router();

// Apply authentication middleware to all endpoints
router.use(authenticateToken);

// GET /api/catalog/stats - Retrieve overall catalog statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const totalRes = await query('SELECT COUNT(*) FROM items');
    const availableRes = await query('SELECT COUNT(*) FROM stock WHERE is_available = true AND sets_count > 0 AND (is_permanent_inactive IS NOT TRUE)');
    const osRes = await query('SELECT COUNT(*) FROM stock WHERE is_available = true AND sets_count = 0 AND (is_permanent_inactive IS NOT TRUE)');
    const inactiveRes = await query('SELECT COUNT(*) FROM stock WHERE is_available = false AND (is_permanent_inactive IS NOT TRUE)');
    const permanentInactiveRes = await query('SELECT COUNT(*) FROM stock WHERE is_permanent_inactive = true');

    res.json({
      total: parseInt(totalRes.rows[0].count || '0'),
      available: parseInt(availableRes.rows[0].count || '0'),
      outofstock: parseInt(osRes.rows[0].count || '0'),
      inactive: parseInt(inactiveRes.rows[0].count || '0'),
      permanent_inactive: parseInt(permanentInactiveRes.rows[0].count || '0')
    });
  } catch (error) {
    console.error('Get catalog stats error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});


// GET /api/catalog/search - Global search by SKU number/query across ALL folders
router.get('/search', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const page = req.query.page ? parseInt(req.query.page as string) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const offset = page && limit ? (page - 1) * limit : 0;
  const search = req.query.search ? (req.query.search as string).trim() : '';
  const work = req.query.work ? (req.query.work as string).trim() : null;
  const minRate = req.query.minRate ? parseInt(req.query.minRate as string) : null;
  const maxRate = req.query.maxRate ? parseInt(req.query.maxRate as string) : null;

  try {
    let categoryCondition = '';
    const params: any[] = [];
    let paramCount = 0;

    // Non-superadmin restricted to permitted folders
    if (role !== 'superadmin') {
      paramCount++;
      categoryCondition = `AND i.category_id IN (SELECT category_id FROM user_categories WHERE user_id = $${paramCount})`;
      params.push(userId);
    }

    let queryStr = `
       SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.work, i.stitcher_name, i.rate, i.revised_rate, i.original_created_at,
              COALESCE(i.is_in_showcase, false) as is_in_showcase,
              c.name as category_name,
              (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
              s.sets_count, s.total_pieces, s.is_available,
              COALESCE(s.is_permanent_inactive, false) as is_permanent_inactive,
              COALESCE(ri.real_count, 0) as real_image_count
       FROM items i
       JOIN categories c ON i.category_id = c.id
       JOIN stock s ON s.item_id = i.id
       LEFT JOIN (
           SELECT item_id, CAST(COUNT(*) AS INTEGER) as real_count 
           FROM item_real_images 
           GROUP BY item_id
       ) ri ON ri.item_id = i.id
       WHERE 1=1
    `;

    if (role === 'sales') {
      queryStr += ` AND s.is_available = TRUE AND (s.is_permanent_inactive IS NOT TRUE)`;
    }

    queryStr += ` ${categoryCondition}`;

    if (search) {
      paramCount++;
      queryStr += ` AND (i.sku_id ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR i.material ILIKE $${paramCount} OR i.work ILIKE $${paramCount} OR c.name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (work) {
      paramCount++;
      queryStr += ` AND i.work = $${paramCount}`;
      params.push(work);
    }
    if (minRate !== null && !isNaN(minRate)) {
      paramCount++;
      queryStr += ` AND COALESCE(i.revised_rate, i.rate) >= $${paramCount}`;
      params.push(minRate);
    }
    if (maxRate !== null && !isNaN(maxRate)) {
      paramCount++;
      queryStr += ` AND COALESCE(i.revised_rate, i.rate) <= $${paramCount}`;
      params.push(maxRate);
    }

    queryStr += ` ORDER BY s.is_permanent_inactive ASC, s.is_available DESC, (s.sets_count > 0) DESC, 
      CASE 
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'PL' OR UPPER(c.name) LIKE '%PLAZO%' OR UPPER(c.name) LIKE '%PALAZZO%' THEN 1
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'AK' OR UPPER(c.name) LIKE '%ANARKALI%' THEN 2
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'CTP' OR UPPER(c.name) LIKE '%CROP TOP%' THEN 3
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'LH' OR UPPER(c.name) LIKE '%LEHENGA%' OR UPPER(c.name) LIKE '%LAHANGA%' THEN 4
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) IN ('SKT', 'SK') OR UPPER(c.name) LIKE '%SKIRT%' THEN 5
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'SP' OR UPPER(c.name) LIKE '%SHARARA%' THEN 6
        ELSE 7
      END ASC, 
      substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, 
      COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, 
      i.sku_id ASC`;

    if (limit) {
      paramCount++;
      const limitParam = `$${paramCount}`;
      paramCount++;
      const offsetParam = `$${paramCount}`;
      queryStr += ` LIMIT ${limitParam} OFFSET ${offsetParam}`;
      params.push(limit, offset);
    }

    const itemsRes = await query(queryStr, params);
    const canAccessRealImages = req.user?.role === 'superadmin' || req.user?.can_access_real_images !== false;
    let finalItems = itemsRes.rows;

    if (canAccessRealImages && finalItems.length > 0) {
      const itemIds = finalItems.map(it => it.id);
      const realImagesRes = await query(
        `SELECT id, item_id, watermarked_path as image_path FROM item_real_images WHERE item_id = ANY($1) ORDER BY id ASC`,
        [itemIds]
      );
      const realImagesMap: Record<number, string[]> = {};
      realImagesRes.rows.forEach(r => {
        if (!realImagesMap[r.item_id]) realImagesMap[r.item_id] = [];
        realImagesMap[r.item_id].push(r.image_path);
      });
      finalItems = finalItems.map(it => ({
        ...it,
        real_images: realImagesMap[it.id] || []
      }));
    } else {
      finalItems = finalItems.map(it => ({
        ...it,
        real_image_count: 0,
        real_images: []
      }));
    }

    res.json(finalItems);
  } catch (error) {
    console.error('Global SKU search error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});


// GET /api/catalog/items/:id/medium - Download medium-compressed version of design
router.get('/items/:id/medium', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const itemId = parseInt(req.params.id);
  try {
    const itemRes = await query('SELECT image_path, sku_id FROM items WHERE id = $1', [itemId]);
    if (itemRes.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    const item = itemRes.rows[0];
    const imagePath = item.image_path; // e.g. "/uploads/filename.jpg"
    const filename = path.basename(imagePath);
    const originalFilePath = path.join(uploadDir, filename);

    if (!fs.existsSync(originalFilePath)) {
      res.status(404).json({ error: 'Original image file not found on server' });
      return;
    }

    // Determine medium compressed file name and path
    const ext = path.extname(filename);
    const base = filename.substring(0, filename.length - ext.length);
    const mediumFilename = `${base}-medium${ext}`;
    const mediumFilePath = path.join(uploadDir, mediumFilename);

    // If medium compressed version doesn't exist, generate it using sharp (max 1600px width/height, 80% quality)
    if (!fs.existsSync(mediumFilePath)) {
      try {
        let sharpObj = sharp(originalFilePath)
          .rotate()
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true });

        const extension = ext.toLowerCase();
        if (extension === '.png') {
          sharpObj = sharpObj.png({ compressionLevel: 2 });
        } else if (extension === '.webp') {
          sharpObj = sharpObj.webp({ quality: 95 });
        } else {
          sharpObj = sharpObj.jpeg({ quality: 95, chromaSubsampling: '4:4:4' });
        }

        await sharpObj.toFile(mediumFilePath);
        console.log(`[Medium Compression] Generated compressed version at ${mediumFilePath}`);
      } catch (sharpErr) {
        console.error('[Medium Compression] Failed to generate medium compressed image:', sharpErr);
        res.sendFile(originalFilePath);
        return;
      }
    }

    res.sendFile(mediumFilePath);
  } catch (error) {
    console.error('Get medium compressed design error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// GET /api/catalog/categories - Retrieve categories folders based on user permissions
router.get('/categories', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const baseRole = req.user?.baseRole;

  try {
    let result;
    if (role !== 'superadmin') {
      // Non-superadmin users (sales, stockist, both, manager) strictly get folders assigned to them in user_categories
      result = await query(
        `SELECT c.id, c.name, 
                CAST(COUNT(i.id) AS INTEGER) as sku_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count > 0 AND (s.is_permanent_inactive IS NOT TRUE) THEN 1 ELSE 0 END) AS INTEGER) as active_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count = 0 AND (s.is_permanent_inactive IS NOT TRUE) THEN 1 ELSE 0 END) AS INTEGER) as os_count,
                CAST(SUM(CASE WHEN s.is_available = FALSE AND (s.is_permanent_inactive IS NOT TRUE) THEN 1 ELSE 0 END) AS INTEGER) as na_count,
                CAST(SUM(CASE WHEN s.is_permanent_inactive = TRUE THEN 1 ELSE 0 END) AS INTEGER) as pina_count
         FROM categories c
         JOIN user_categories uc ON uc.category_id = c.id
         LEFT JOIN items i ON i.category_id = c.id
         LEFT JOIN stock s ON s.item_id = i.id
         WHERE uc.user_id = $1
         GROUP BY c.id, c.name
         ORDER BY c.name ASC`,
        [userId]
      );
    } else {
      // Superadmin & Sales see all folders
      result = await query(
        `SELECT c.id, c.name, 
                CAST(COUNT(i.id) AS INTEGER) as sku_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count > 0 AND (s.is_permanent_inactive IS NOT TRUE) THEN 1 ELSE 0 END) AS INTEGER) as active_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count = 0 AND (s.is_permanent_inactive IS NOT TRUE) THEN 1 ELSE 0 END) AS INTEGER) as os_count,
                CAST(SUM(CASE WHEN s.is_available = FALSE AND (s.is_permanent_inactive IS NOT TRUE) THEN 1 ELSE 0 END) AS INTEGER) as na_count,
                CAST(SUM(CASE WHEN s.is_permanent_inactive = TRUE THEN 1 ELSE 0 END) AS INTEGER) as pina_count
         FROM categories c
         LEFT JOIN items i ON i.category_id = c.id
         LEFT JOIN stock s ON s.item_id = i.id
         GROUP BY c.id, c.name
         ORDER BY c.name ASC`
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get catalog categories error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// GET /api/catalog/works - Retrieve active works master list for app and web dropdowns
router.get('/works', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM works ORDER BY name ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get catalog works error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// GET /api/catalog/revised-items - Retrieve all revised rate (Offer) items across folders
router.get('/revised-items', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const role = req.user?.role;
  const page = req.query.page ? parseInt(req.query.page as string) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : null;
  const offset = page && limit ? (page - 1) * limit : null;
  const search = req.query.search ? (req.query.search as string).trim() : null;
  const work = req.query.work ? (req.query.work as string).trim() : null;
  const minRate = req.query.minRate ? parseInt(req.query.minRate as string) : null;
  const maxRate = req.query.maxRate ? parseInt(req.query.maxRate as string) : null;

  try {
    let categoryCondition = '';
    const params: any[] = [];
    let paramCount = 0;

    if (role !== 'superadmin') {
      paramCount++;
      categoryCondition = `AND i.category_id IN (SELECT category_id FROM user_categories WHERE user_id = $${paramCount})`;
      params.push(userId);
    }

    let queryStr = `
       SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.work, i.stitcher_name, i.rate, i.revised_rate, i.original_created_at,
              COALESCE(i.is_in_showcase, false) as is_in_showcase,
              c.name as category_name,
              (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
              s.sets_count, s.total_pieces, s.is_available,
              COALESCE(s.is_permanent_inactive, false) as is_permanent_inactive,
              COALESCE(ri.real_count, 0) as real_image_count
       FROM items i
       JOIN categories c ON i.category_id = c.id
       JOIN stock s ON s.item_id = i.id
       LEFT JOIN (
           SELECT item_id, CAST(COUNT(*) AS INTEGER) as real_count 
           FROM item_real_images 
           GROUP BY item_id
       ) ri ON ri.item_id = i.id
       WHERE i.revised_rate IS NOT NULL AND i.revised_rate > 0
    `;

    if (role === 'sales') {
      queryStr += ` AND s.is_available = TRUE AND (s.is_permanent_inactive IS NOT TRUE)`;
    }

    queryStr += ` ${categoryCondition}`;

    if (search) {
      paramCount++;
      queryStr += ` AND (i.sku_id ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR i.material ILIKE $${paramCount} OR i.work ILIKE $${paramCount} OR c.name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    if (work) {
      paramCount++;
      queryStr += ` AND i.work = $${paramCount}`;
      params.push(work);
    }
    if (minRate !== null && !isNaN(minRate)) {
      paramCount++;
      queryStr += ` AND COALESCE(i.revised_rate, i.rate) >= $${paramCount}`;
      params.push(minRate);
    }
    if (maxRate !== null && !isNaN(maxRate)) {
      paramCount++;
      queryStr += ` AND COALESCE(i.revised_rate, i.rate) <= $${paramCount}`;
      params.push(maxRate);
    }

    queryStr += ` ORDER BY s.is_permanent_inactive ASC, s.is_available DESC, (s.sets_count > 0) DESC, 
      CASE 
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'PL' OR UPPER(c.name) LIKE '%PLAZO%' OR UPPER(c.name) LIKE '%PALAZZO%' THEN 1
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'AK' OR UPPER(c.name) LIKE '%ANARKALI%' THEN 2
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'CTP' OR UPPER(c.name) LIKE '%CROP TOP%' THEN 3
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'LH' OR UPPER(c.name) LIKE '%LEHENGA%' OR UPPER(c.name) LIKE '%LAHANGA%' THEN 4
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) IN ('SKT', 'SK') OR UPPER(c.name) LIKE '%SKIRT%' THEN 5
        WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'SP' OR UPPER(c.name) LIKE '%SHARARA%' THEN 6
        ELSE 7
      END ASC, 
      substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, 
      COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, 
      i.sku_id ASC`;

    if (limit !== null && offset !== null) {
      paramCount++;
      const limitParam = `$${paramCount}`;
      paramCount++;
      const offsetParam = `$${paramCount}`;
      queryStr += ` LIMIT ${limitParam} OFFSET ${offsetParam}`;
      params.push(limit, offset);
    }

    const itemsRes = await query(queryStr, params);

    const canAccessRealImages = req.user?.role === 'superadmin' || req.user?.can_access_real_images !== false;
    let finalItems = itemsRes.rows;

    if (canAccessRealImages && finalItems.length > 0) {
      const itemIds = finalItems.map(it => it.id);
      const realImagesRes = await query(
        `SELECT id, item_id, watermarked_path as image_path FROM item_real_images WHERE item_id = ANY($1) ORDER BY id ASC`,
        [itemIds]
      );
      const realImagesMap: Record<number, string[]> = {};
      realImagesRes.rows.forEach(r => {
        if (!realImagesMap[r.item_id]) realImagesMap[r.item_id] = [];
        realImagesMap[r.item_id].push(r.image_path);
      });
      finalItems = finalItems.map(it => ({
        ...it,
        real_images: realImagesMap[it.id] || []
      }));
    } else {
      finalItems = finalItems.map(it => ({
        ...it,
        real_image_count: 0,
        real_images: []
      }));
    }

    res.json(finalItems);
  } catch (error) {
    console.error('Get revised catalog items error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// GET /api/catalog/categories/:id/items - Retrieve SKU designs under a category (with pagination and age calculation)
router.get('/categories/:id/items', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const categoryId = parseInt(req.params.id);
  const userId = req.user?.id;
  const role = req.user?.role;
  const baseRole = req.user?.baseRole;
  const page = req.query.page ? parseInt(req.query.page as string) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : null;
  const offset = page && limit ? (page - 1) * limit : null;
  const search = req.query.search ? (req.query.search as string).trim() : null;
  const status = req.query.status ? (req.query.status as string).trim() : null;
  const work = req.query.work ? (req.query.work as string).trim() : null;
  const minRate = req.query.minRate ? parseInt(req.query.minRate as string) : null;
  const maxRate = req.query.maxRate ? parseInt(req.query.maxRate as string) : null;


  try {
    // If non-superadmin user, verify folder assignment permission
    if (role !== 'superadmin') {
      const permissionCheck = await query(
        'SELECT 1 FROM user_categories WHERE user_id = $1 AND category_id = $2',
        [userId, categoryId]
      );
      if (permissionCheck.rows.length === 0) {
        res.status(403).json({ error: 'Permission denied for this category folder' });
        return;
      }
    }

    let itemsRes;
    const params: any[] = [categoryId];
    let paramCount = 1;

    if (role === 'sales') {
      // Sales user only sees available stock items
      let queryStr = `
         SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.work, i.stitcher_name, i.rate, i.revised_rate, i.original_created_at,
                COALESCE(i.is_in_showcase, false) as is_in_showcase,
                (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
                s.sets_count, s.total_pieces, s.is_available,
                COALESCE(ri.real_count, 0) as real_image_count
         FROM items i
         JOIN stock s ON s.item_id = i.id
         LEFT JOIN (
             SELECT item_id, CAST(COUNT(*) AS INTEGER) as real_count 
             FROM item_real_images 
             GROUP BY item_id
         ) ri ON ri.item_id = i.id
         WHERE i.category_id = $1 AND s.is_available = TRUE AND (s.is_permanent_inactive IS NOT TRUE)
      `;
      if (search) {
        paramCount++;
        queryStr += ` AND (i.sku_id ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR i.material ILIKE $${paramCount} OR i.work ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }
      if (work) {
        paramCount++;
        queryStr += ` AND i.work = $${paramCount}`;
        params.push(work);
      }
      if (minRate !== null && !isNaN(minRate)) {
        paramCount++;
        queryStr += ` AND COALESCE(i.revised_rate, i.rate) >= $${paramCount}`;
        params.push(minRate);
      }
      if (maxRate !== null && !isNaN(maxRate)) {
        paramCount++;
        queryStr += ` AND COALESCE(i.revised_rate, i.rate) <= $${paramCount}`;
        params.push(maxRate);
      }
      queryStr += ` ORDER BY (s.sets_count > 0) DESC, 
        CASE 
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'PL' THEN 1
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'AK' THEN 2
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'CTP' THEN 3
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'LH' THEN 4
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) IN ('SKT', 'SK') THEN 5
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'SP' THEN 6
          ELSE 7
        END ASC, 
        substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, 
        COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, 
        i.sku_id ASC`;
      if (limit !== null && offset !== null) {
        paramCount++;
        const limitParam = `$${paramCount}`;
        paramCount++;
        const offsetParam = `$${paramCount}`;
        queryStr += ` LIMIT ${limitParam} OFFSET ${offsetParam}`;
        params.push(limit, offset);
      }
      itemsRes = await query(queryStr, params);
    } else {
      // Stockists and Admins see all items to maintain stock
      let queryStr = `
         SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.work, i.stitcher_name, i.rate, i.revised_rate, i.original_created_at,
                COALESCE(i.is_in_showcase, false) as is_in_showcase,
                (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
                COALESCE(s.sets_count, 0) as sets_count, 
                COALESCE(s.total_pieces, 0) as total_pieces, 
                COALESCE(s.is_available, true) as is_available,
                COALESCE(s.is_permanent_inactive, false) as is_permanent_inactive,
                COALESCE(ri.real_count, 0) as real_image_count
         FROM items i
         LEFT JOIN stock s ON s.item_id = i.id
         LEFT JOIN (
             SELECT item_id, CAST(COUNT(*) AS INTEGER) as real_count 
             FROM item_real_images 
             GROUP BY item_id
         ) ri ON ri.item_id = i.id
         WHERE i.category_id = $1
      `;
      if (search) {
        paramCount++;
        queryStr += ` AND (i.sku_id ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR i.material ILIKE $${paramCount} OR i.work ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }
      if (status) {
        if (status === 'A' || status === 'AV') {
          queryStr += ` AND s.is_available = TRUE AND s.sets_count > 0 AND (s.is_permanent_inactive IS NOT TRUE)`;
        } else if (status === 'OS') {
          queryStr += ` AND s.is_available = TRUE AND s.sets_count = 0 AND (s.is_permanent_inactive IS NOT TRUE)`;
        } else if (status === 'NA' || status === 'INA') {
          queryStr += ` AND s.is_available = FALSE AND (s.is_permanent_inactive IS NOT TRUE)`;
        } else if (status === 'PINA' || status === 'P-INA') {
          queryStr += ` AND s.is_permanent_inactive = TRUE`;
        }
      }
      if (work) {
        paramCount++;
        queryStr += ` AND i.work = $${paramCount}`;
        params.push(work);
      }
      if (minRate !== null && !isNaN(minRate)) {
        paramCount++;
        queryStr += ` AND COALESCE(i.revised_rate, i.rate) >= $${paramCount}`;
        params.push(minRate);
      }
      if (maxRate !== null && !isNaN(maxRate)) {
        paramCount++;
        queryStr += ` AND COALESCE(i.revised_rate, i.rate) <= $${paramCount}`;
        params.push(maxRate);
      }
      queryStr += ` ORDER BY s.is_permanent_inactive ASC, s.is_available DESC, (s.sets_count > 0) DESC, 
        CASE 
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'PL' THEN 1
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'AK' THEN 2
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'CTP' THEN 3
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'LH' THEN 4
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) IN ('SKT', 'SK') THEN 5
          WHEN UPPER(TRIM(substring(TRIM(i.sku_id) from '^[a-zA-Z]+'))) = 'SP' THEN 6
          ELSE 7
        END ASC, 
        substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, 
        COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, 
        i.sku_id ASC`;
      if (limit !== null && offset !== null) {
        paramCount++;
        const limitParam = `$${paramCount}`;
        paramCount++;
        const offsetParam = `$${paramCount}`;
        queryStr += ` LIMIT ${limitParam} OFFSET ${offsetParam}`;
        params.push(limit, offset);
      }
      itemsRes = await query(queryStr, params);
    }

    const canAccessRealImages = req.user?.role === 'superadmin' || req.user?.can_access_real_images !== false;
    let finalItems = itemsRes.rows;

    if (canAccessRealImages && finalItems.length > 0) {
      const itemIds = finalItems.map(it => it.id);
      const realImagesRes = await query(
        `SELECT id, item_id, watermarked_path as image_path FROM item_real_images WHERE item_id = ANY($1) ORDER BY id ASC`,
        [itemIds]
      );
      const realImagesMap: Record<number, string[]> = {};
      realImagesRes.rows.forEach(r => {
        if (!realImagesMap[r.item_id]) realImagesMap[r.item_id] = [];
        realImagesMap[r.item_id].push(r.image_path);
      });
      finalItems = finalItems.map(it => ({
        ...it,
        real_images: realImagesMap[it.id] || []
      }));
    } else {
      finalItems = finalItems.map(it => ({
        ...it,
        real_image_count: 0,
        real_images: []
      }));
    }

    res.json(finalItems);
  } catch (error) {
    console.error('Get catalog items error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// POST /api/catalog/items/:id/stock - Update SKU stock & optional rate (Stockist/Manager/Admin/Both)
router.post('/items/:id/stock', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const itemId = parseInt(req.params.id);
  const userId = req.user?.id || 0;
  const role = req.user?.role;
  const baseRole = req.user?.baseRole;
  const { setsCount, isAvailable, isPermanentInactive, rate, revisedRate } = req.body;

  if (role !== 'stockist' && role !== 'superadmin' && role !== 'manager' && role !== 'both') {
    res.status(403).json({ error: 'Only stockists, managers or admins can modify stock levels or rates' });
    return;
  }

  try {
    // Get current item and stock state (LEFT JOIN so missing stock row doesn't block saving)
    const currentRes = await query(
      `SELECT i.id, i.category_id, i.pieces_per_set, i.rate, i.revised_rate, 
              COALESCE(s.sets_count, 0) as sets_count, 
              COALESCE(s.total_pieces, 0) as total_pieces, 
              COALESCE(s.is_available, true) as is_available, 
              COALESCE(s.is_permanent_inactive, false) as is_permanent_inactive 
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

    // If non-superadmin user, verify permission for this category
    if (role !== 'superadmin') {
      const permissionCheck = await query(
        'SELECT 1 FROM user_categories WHERE user_id = $1 AND category_id = $2',
        [userId, item.category_id]
      );
      if (permissionCheck.rows.length === 0) {
        res.status(403).json({ error: 'Permission denied for this category folder' });
        return;
      }
    }

    // Handle optional rate update (only verify permission if rate is actually changing)
    let updatedRate = item.rate;
    if (rate !== undefined && rate !== null) {
      const rateVal = parseInt(rate);
      if (!isNaN(rateVal) && rateVal !== item.rate) {
        // Check if user is allowed to edit rates
        const userCheck = await query('SELECT role, can_edit_rates FROM users WHERE id = $1', [userId]);
        const userRecord = userCheck.rows[0];
        const canUserEditRates = userRecord && (userRecord.role === 'superadmin' || userRecord.role === 'manager' || !!userRecord.can_edit_rates);
        
        if (!canUserEditRates) {
          res.status(403).json({ error: 'You are not authorized to update pricing rates.' });
          return;
        }

        await query(
          'UPDATE items SET rate = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [rateVal, itemId]
        );
        await query(
          'INSERT INTO rate_logs (item_id, user_id, old_rate, new_rate) VALUES ($1, $2, $3, $4)',
          [itemId, userId, item.rate, rateVal]
        );
        updatedRate = rateVal;
        console.log(`[Rate Log] Rate for item ${itemId} changed from ${item.rate} to ${rateVal} by user ${userId} via mobile/catalog route`);
      }
    }

    // Handle optional revised rate update (only verify permission if revisedRate is actually changing)
    let updatedRevisedRate = item.revised_rate;
    if (revisedRate !== undefined) {
      const parsedRevised = (revisedRate === null || revisedRate === '' || parseInt(revisedRate) <= 0) ? null : parseInt(revisedRate);
      if (parsedRevised !== item.revised_rate) {
        const userCheck = await query('SELECT role, can_edit_rates FROM users WHERE id = $1', [userId]);
        const userRecord = userCheck.rows[0];
        const canUserEditRates = userRecord && (userRecord.role === 'superadmin' || userRecord.role === 'manager' || !!userRecord.can_edit_rates);
        
        if (!canUserEditRates) {
          res.status(403).json({ error: 'You are not authorized to update pricing rates.' });
          return;
        }

        await query(
          'UPDATE items SET revised_rate = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [parsedRevised, itemId]
        );
        await query(
          'INSERT INTO rate_logs (item_id, user_id, old_rate, new_rate) VALUES ($1, $2, $3, $4)',
          [itemId, userId, item.revised_rate ?? item.rate, parsedRevised ?? item.rate]
        );
        updatedRevisedRate = parsedRevised;
        console.log(`[Rate Log] Revised Rate for item ${itemId} changed to ${parsedRevised} by user ${userId} via mobile/catalog route`);
      }
    }

    // Determine updates
    let targetPermanentInactive = item.is_permanent_inactive;
    if (isPermanentInactive !== undefined) {
      targetPermanentInactive = isPermanentInactive === true || isPermanentInactive === 'true';
    }
    let targetAvailable = isAvailable !== undefined ? !!isAvailable : item.is_available;
    if (targetPermanentInactive) {
      targetAvailable = false;
    }
    const targetSets = setsCount !== undefined ? parseInt(setsCount) : item.sets_count;
    const targetPieces = targetSets * item.pieces_per_set;

    const setsDiff = targetSets - item.sets_count;
    const piecesDiff = targetPieces - item.total_pieces;

    let logType: 'addition' | 'reduction' | 'status_change' = 'status_change';
    if (setsDiff > 0) {
      logType = 'addition';
    } else if (setsDiff < 0) {
      logType = 'reduction';
    }

    // Upsert into stock table so missing rows never block saving
    await query(
      `INSERT INTO stock (item_id, sets_count, total_pieces, is_available, is_permanent_inactive, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (item_id) DO UPDATE 
       SET sets_count = EXCLUDED.sets_count, 
           total_pieces = EXCLUDED.total_pieces, 
           is_available = EXCLUDED.is_available, 
           is_permanent_inactive = EXCLUDED.is_permanent_inactive, 
           updated_at = CURRENT_TIMESTAMP, 
           updated_by = EXCLUDED.updated_by`,
      [itemId, targetSets, targetPieces, targetAvailable, targetPermanentInactive, userId]
    );

    // Only log if something actually changed
    if (setsDiff !== 0 || targetAvailable !== item.is_available || targetPermanentInactive !== item.is_permanent_inactive) {
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

    res.json({
      item_id: itemId,
      sets_count: targetSets,
      total_pieces: targetPieces,
      is_available: targetAvailable,
      is_permanent_inactive: targetPermanentInactive,
      rate: updatedRate,
      revised_rate: updatedRevisedRate,
      updated_by: userId,
    });
  } catch (error) {
    console.error('Update SKU stock error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// DELETE /api/catalog/real-images/:id - Delete a real photo from mobile or web (Admin/Manager/Permitted)
router.delete('/real-images/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const imageId = parseInt(req.params.id);
  const userRole = req.user?.role;

  if (userRole !== 'superadmin' && userRole !== 'manager' && userRole !== 'both' && userRole !== 'stockist') {
    res.status(403).json({ error: 'Permission denied to delete photos' });
    return;
  }

  try {
    const imgRes = await query('SELECT * FROM item_real_images WHERE id = $1', [imageId]);
    if (imgRes.rows.length === 0) {
      res.status(404).json({ error: 'Photo not found' });
      return;
    }
    const img = imgRes.rows[0];

    const rawDiskPath = path.join(uploadDir, '..', img.image_path);
    const wmDiskPath = path.join(uploadDir, '..', img.watermarked_path);
    if (fs.existsSync(rawDiskPath)) {
      try { fs.unlinkSync(rawDiskPath); } catch (e) {}
    }
    if (fs.existsSync(wmDiskPath) && wmDiskPath !== rawDiskPath) {
      try { fs.unlinkSync(wmDiskPath); } catch (e) {}
    }

    removeCachedVisualFeature(img.item_id, img.watermarked_path);
    await query('DELETE FROM item_image_features WHERE item_id = $1 AND image_path = $2', [img.item_id, img.watermarked_path]);
    await query('DELETE FROM item_real_images WHERE id = $1', [imageId]);
    res.json({ success: true, id: imageId, item_id: img.item_id });
  } catch (error) {
    console.error('Delete real image error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// POST /api/catalog/search-by-image - Search catalog using an image captured via camera or gallery
router.post('/search-by-image', memUpload.single('image'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    let imageBuffer: Buffer | null = null;

    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.body.imageBase64) {
      const cleanBase64 = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(cleanBase64, 'base64');
    }

    if (!imageBuffer) {
      res.status(400).json({ error: 'Please provide an image file (multipart `image`) or `imageBase64` string.' });
      return;
    }

    const userId = req.user?.id;
    const role = req.user?.role;
    const minConfidence = req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : 35;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const matches = await searchCatalogByImage(imageBuffer, userId, role, minConfidence, limit);
    res.json({
      total: matches.length,
      matches
    });
  } catch (error) {
    console.error('Search by image error:', error);
    res.status(500).json({ error: (error as any).message || 'Failed to analyze image for catalog search' });
  }
});

// POST /api/catalog/sync-features - Sync and index missing catalog visual features
router.post('/sync-features', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await syncAllCatalogVisualFeatures();
    res.json(result);
  } catch (error) {
    console.error('Sync visual features error:', error);
    res.status(500).json({ error: (error as any).message || 'Failed to sync visual features' });
  }
});

export default router;
