import { Router, Response } from 'express';
import { query } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all endpoints
router.use(authenticateToken);

// GET /api/catalog/categories - Retrieve categories folders based on user permissions
router.get('/categories', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const role = req.user?.role;

  try {
    let result;
    if (role === 'stockist') {
      // Stockist only gets folders assigned to them
      result = await query(
        `SELECT c.id, c.name, 
                CAST(COUNT(i.id) AS INTEGER) as sku_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count > 0 THEN 1 ELSE 0 END) AS INTEGER) as active_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count = 0 THEN 1 ELSE 0 END) AS INTEGER) as os_count,
                CAST(SUM(CASE WHEN s.is_available = FALSE THEN 1 ELSE 0 END) AS INTEGER) as na_count
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
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count > 0 THEN 1 ELSE 0 END) AS INTEGER) as active_count,
                CAST(SUM(CASE WHEN s.is_available = TRUE AND s.sets_count = 0 THEN 1 ELSE 0 END) AS INTEGER) as os_count,
                CAST(SUM(CASE WHEN s.is_available = FALSE THEN 1 ELSE 0 END) AS INTEGER) as na_count
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

// GET /api/catalog/categories/:id/items - Retrieve SKU designs under a category (with pagination and age calculation)
router.get('/categories/:id/items', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const categoryId = parseInt(req.params.id);
  const userId = req.user?.id;
  const role = req.user?.role;
  const page = req.query.page ? parseInt(req.query.page as string) : null;
  const limit = req.query.limit ? parseInt(req.query.limit as string) : null;
  const offset = page && limit ? (page - 1) * limit : null;
  const search = req.query.search ? (req.query.search as string).trim() : null;
  const status = req.query.status ? (req.query.status as string).trim() : null;


  try {
    // If stockist, verify folder assignment permission
    if (role === 'stockist') {
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
         SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.rate, i.original_created_at,
                (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
                s.sets_count, s.total_pieces, s.is_available
         FROM items i
         JOIN stock s ON s.item_id = i.id
         WHERE i.category_id = $1 AND s.is_available = TRUE
      `;
      if (search) {
        paramCount++;
        queryStr += ` AND (i.sku_id ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR i.material ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }
      queryStr += ` ORDER BY (s.sets_count > 0) DESC, substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, i.sku_id ASC`;
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
         SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material, i.rate, i.original_created_at,
                (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
                s.sets_count, s.total_pieces, s.is_available
         FROM items i
         JOIN stock s ON s.item_id = i.id
         WHERE i.category_id = $1
      `;
      if (search) {
        paramCount++;
        queryStr += ` AND (i.sku_id ILIKE $${paramCount} OR i.description ILIKE $${paramCount} OR i.material ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }
      if (status) {
        if (status === 'A') {
          queryStr += ` AND s.is_available = TRUE AND s.sets_count > 0`;
        } else if (status === 'OS') {
          queryStr += ` AND s.is_available = TRUE AND s.sets_count = 0`;
        } else if (status === 'NA') {
          queryStr += ` AND s.is_available = FALSE`;
        }
      }
      queryStr += ` ORDER BY s.is_available DESC, (s.sets_count > 0) DESC, substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, i.sku_id ASC`;
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

    res.json(itemsRes.rows);
  } catch (error) {
    console.error('Get catalog items error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

// POST /api/catalog/items/:id/stock - Update SKU stock & optional rate (Stockist/Manager/Admin)
router.post('/items/:id/stock', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const itemId = parseInt(req.params.id);
  const userId = req.user?.id || 0;
  const role = req.user?.role;
  const { setsCount, isAvailable, rate } = req.body;

  if (role !== 'stockist' && role !== 'superadmin' && role !== 'manager') {
    res.status(403).json({ error: 'Only stockists, managers or admins can modify stock levels or rates' });
    return;
  }

  try {
    // Get current item and stock state
    const currentRes = await query(
      `SELECT i.id, i.category_id, i.pieces_per_set, i.rate, s.sets_count, s.total_pieces, s.is_available 
       FROM items i
       JOIN stock s ON s.item_id = i.id
       WHERE i.id = $1`,
      [itemId]
    );

    if (currentRes.rows.length === 0) {
      res.status(404).json({ error: 'SKU not found' });
      return;
    }

    const item = currentRes.rows[0];

    // If stockist, verify permission for this category
    if (role === 'stockist') {
      const permissionCheck = await query(
        'SELECT 1 FROM user_categories WHERE user_id = $1 AND category_id = $2',
        [userId, item.category_id]
      );
      if (permissionCheck.rows.length === 0) {
        res.status(403).json({ error: 'Permission denied for this category folder' });
        return;
      }
    }

    // Handle optional rate update
    let updatedRate = item.rate;
    if (rate !== undefined) {
      const rateVal = parseInt(rate);
      if (rateVal !== item.rate) {
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

    // Determine updates
    const targetSets = setsCount !== undefined ? parseInt(setsCount) : item.sets_count;
    const targetAvailable = isAvailable !== undefined ? !!isAvailable : item.is_available;
    const targetPieces = targetSets * item.pieces_per_set;

    const setsDiff = targetSets - item.sets_count;
    const piecesDiff = targetPieces - item.total_pieces;

    let logType: 'addition' | 'reduction' | 'status_change' = 'status_change';
    if (setsDiff > 0) {
      logType = 'addition';
    } else if (setsDiff < 0) {
      logType = 'reduction';
    }

    // Update DB
    await query(
      `UPDATE stock 
       SET sets_count = $1, total_pieces = $2, is_available = $3, updated_at = CURRENT_TIMESTAMP, updated_by = $4
       WHERE item_id = $5`,
      [targetSets, targetPieces, targetAvailable, userId, itemId]
    );

    // Only log if something actually changed
    if (setsDiff !== 0 || targetAvailable !== item.is_available) {
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
      rate: updatedRate,
      updated_by: userId,
    });
  } catch (error) {
    console.error('Update SKU stock error:', error);
    res.status(500).json({ error: (error as any).message || 'Internal server error' });
  }
});

export default router;
