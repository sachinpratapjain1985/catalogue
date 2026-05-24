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
        `SELECT c.id, c.name, COUNT(i.id) as sku_count
         FROM categories c
         JOIN user_categories uc ON uc.category_id = c.id
         LEFT JOIN items i ON i.category_id = c.id
         WHERE uc.user_id = $1
         GROUP BY c.id, c.name
         ORDER BY c.name ASC`,
        [userId]
      );
    } else {
      // Superadmin & Sales see all folders
      result = await query(
        `SELECT c.id, c.name, COUNT(i.id) as sku_count
         FROM categories c
         LEFT JOIN items i ON i.category_id = c.id
         GROUP BY c.id, c.name
         ORDER BY c.name ASC`
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Get catalog categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/catalog/categories/:id/items - Retrieve SKU designs under a category
router.get('/categories/:id/items', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const categoryId = parseInt(req.params.id);
  const userId = req.user?.id;
  const role = req.user?.role;

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
    if (role === 'sales') {
      // Sales user only sees available stock items
      itemsRes = await query(
        `SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material,
                s.sets_count, s.total_pieces, s.is_available
         FROM items i
         JOIN stock s ON s.item_id = i.id
         WHERE i.category_id = $1 AND s.is_available = TRUE
         ORDER BY i.sku_id ASC`,
        [categoryId]
      );
    } else {
      // Stockists and Admins see all items to maintain stock
      itemsRes = await query(
        `SELECT i.id, i.sku_id, i.category_id, i.image_path, i.pieces_per_set, i.description, i.material,
                s.sets_count, s.total_pieces, s.is_available
         FROM items i
         JOIN stock s ON s.item_id = i.id
         WHERE i.category_id = $1
         ORDER BY i.sku_id ASC`,
        [categoryId]
      );
    }

    res.json(itemsRes.rows);
  } catch (error) {
    console.error('Get catalog items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/catalog/items/:id/stock - Update SKU stock (Stockist only)
router.post('/items/:id/stock', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const itemId = parseInt(req.params.id);
  const userId = req.user?.id || 0;
  const role = req.user?.role;
  const { setsCount, isAvailable } = req.body;

  if (role !== 'stockist' && role !== 'superadmin') {
    res.status(403).json({ error: 'Only stockists or admins can modify stock levels' });
    return;
  }

  try {
    // Get current item and stock state
    const currentRes = await query(
      `SELECT i.id, i.category_id, i.pieces_per_set, s.sets_count, s.total_pieces, s.is_available 
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
      updated_by: userId,
    });
  } catch (error) {
    console.error('Update SKU stock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
