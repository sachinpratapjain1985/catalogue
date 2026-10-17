import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { 
  generateShowcaseLink, 
  sendShowcaseEmail, 
  SALES_CONTACTS, 
  CALL_CONTACT, 
  COMMUNITY_LINK, 
  BRAND_DETAILS 
} from '../services/showcaseScheduler';

export const publicShowcaseRouter = Router();
export const adminShowcaseRouter = Router();

// Helper to randomly shuffle sales contact numbers for load balancing
function getShuffledSalesContacts() {
  const list = [...SALES_CONTACTS];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ==========================================
// PUBLIC ENDPOINTS (No authentication required)
// ==========================================

// GET /api/public/showcase/:token - Retrieve curated showcase catalog
publicShowcaseRouter.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;

  try {
    const linkRes = await query(
      `SELECT id, token, item_ids, expires_at, created_at, views_count
       FROM showcase_links 
       WHERE token = $1`,
      [token]
    );

    if (linkRes.rows.length === 0) {
      res.status(404).json({
        notFound: true,
        error: 'Exclusive showcase link not found or has been removed.',
        salesContacts: getShuffledSalesContacts(),
        callContact: CALL_CONTACT,
        communityLink: COMMUNITY_LINK,
        brandDetails: BRAND_DETAILS
      });
      return;
    }

    const link = linkRes.rows[0];
    const now = new Date();
    const expiresAt = new Date(link.expires_at);
    const isExpired = now > expiresAt;

    // Check if expired
    if (isExpired) {
      res.json({
        expired: true,
        message: 'VIP 24-Hour Preview Window Has Ended',
        expires_at: link.expires_at,
        salesContacts: getShuffledSalesContacts(),
        callContact: CALL_CONTACT,
        communityLink: COMMUNITY_LINK,
        brandDetails: BRAND_DETAILS
      });
      return;
    }

    // Link is active! Increment view counter asynchronously
    query('UPDATE showcase_links SET views_count = views_count + 1 WHERE id = $1', [link.id]).catch(() => {});

    // Fetch design items
    // IMPORTANT PRIVACY/PRICING RULE: ONLY default catalog image, SKU, category, and work!
    // NO rates, NO revised rates, NO set quantities, NO stock counts!
    const itemsRes = await query(
      `SELECT i.id, i.sku_id, i.image_path, i.work,
              c.name as category_name
       FROM items i
       JOIN categories c ON i.category_id = c.id
       WHERE i.id = ANY($1)
       ORDER BY substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, 
                COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, 
                i.sku_id ASC`,
      [link.item_ids]
    );

    res.json({
      expired: false,
      token: link.token,
      expires_at: link.expires_at,
      created_at: link.created_at,
      items: itemsRes.rows,
      salesContacts: getShuffledSalesContacts(),
      callContact: CALL_CONTACT,
      communityLink: COMMUNITY_LINK,
      brandDetails: BRAND_DETAILS
    });
  } catch (err: any) {
    console.error('Error fetching showcase:', err);
    res.status(500).json({ error: 'Failed to load showcase: ' + err.message });
  }
});

// ==========================================
// ADMIN ENDPOINTS (Requires authentication)
// ==========================================

adminShowcaseRouter.use(authenticateToken);

// GET /api/admin/showcase/summary - Overview stats & active link
adminShowcaseRouter.get('/summary', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const itemCountRes = await query('SELECT COUNT(*) FROM items WHERE is_in_showcase = TRUE');
    const activeLinkRes = await query(
      `SELECT token, expires_at, created_at, array_length(item_ids, 1) as item_count, views_count
       FROM showcase_links 
       WHERE expires_at > NOW() 
       ORDER BY expires_at DESC LIMIT 1`
    );

    const settingsRes = await query('SELECT key, value FROM showcase_settings');
    const settings: Record<string, string> = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });

    let baseUrl = settings['base_url'] || process.env.BASE_URL;
    if (!baseUrl || baseUrl.includes('lms.desukafashion.com')) {
      const host = req.get('host');
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      if (host && !host.includes('lms.')) {
        baseUrl = `${proto}://${host}`;
      } else {
        baseUrl = 'https://catalog.desukafashion.com';
      }
    }

    const activeLink = activeLinkRes.rows[0] ? {
      ...activeLinkRes.rows[0],
      url: `${baseUrl}/showcase/${activeLinkRes.rows[0].token}`
    } : null;

    res.json({
      showcaseItemCount: parseInt(itemCountRes.rows[0].count || '0'),
      activeLink,
      settings
    });
  } catch (err: any) {
    console.error('Error fetching showcase summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/showcase/items - List all items currently flagged for showcase
adminShowcaseRouter.get('/items', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT i.id, i.sku_id, i.category_id, i.image_path, i.work, i.stitcher_name, i.rate, i.revised_rate,
              c.name as category_name,
              s.sets_count, s.is_available,
              i.is_in_showcase
       FROM items i
       JOIN categories c ON i.category_id = c.id
       LEFT JOIN stock s ON s.item_id = i.id
       WHERE i.is_in_showcase = TRUE
       ORDER BY substring(i.sku_id from '^[a-zA-Z\\-]*') ASC, 
                COALESCE(NULLIF(regexp_replace(i.sku_id, '\\D', '', 'g'), ''), '0')::NUMERIC ASC, 
                i.sku_id ASC`
    );
    res.json(result.rows);
  } catch (err: any) {
    console.error('Error fetching showcase items:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/showcase/toggle - Toggle single item showcase flag
adminShowcaseRouter.post('/toggle', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { itemId, state } = req.body;
  if (!itemId) {
    res.status(400).json({ error: 'itemId is required' });
    return;
  }

  try {
    let result;
    if (typeof state === 'boolean') {
      result = await query(
        'UPDATE items SET is_in_showcase = $1 WHERE id = $2 RETURNING id, sku_id, is_in_showcase',
        [state, itemId]
      );
    } else {
      result = await query(
        'UPDATE items SET is_in_showcase = NOT COALESCE(is_in_showcase, false) WHERE id = $1 RETURNING id, sku_id, is_in_showcase',
        [itemId]
      );
    }

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }

    res.json({
      success: true,
      item: result.rows[0]
    });
  } catch (err: any) {
    console.error('Error toggling showcase flag:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/showcase/bulk-toggle - Bulk toggle showcase flags
adminShowcaseRouter.post('/bulk-toggle', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { itemIds, state } = req.body;
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ error: 'itemIds array is required' });
    return;
  }

  try {
    await query(
      'UPDATE items SET is_in_showcase = $1 WHERE id = ANY($2)',
      [state === true, itemIds]
    );

    res.json({
      success: true,
      updatedCount: itemIds.length,
      state: state === true
    });
  } catch (err: any) {
    console.error('Error bulk updating showcase flags:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/showcase/generate - Generate fresh 24h showcase link
adminShowcaseRouter.post('/generate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { itemIds } = req.body;

  try {
    const result = await generateShowcaseLink(userId, Array.isArray(itemIds) && itemIds.length > 0 ? itemIds : undefined);
    
    // Retrieve base URL
    const baseUrlRes = await query("SELECT value FROM showcase_settings WHERE key = 'base_url'");
    let baseUrl = baseUrlRes.rows[0]?.value || process.env.BASE_URL;
    if (!baseUrl || baseUrl.includes('lms.desukafashion.com')) {
      const host = req.get('host');
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      if (host && !host.includes('lms.')) {
        baseUrl = `${proto}://${host}`;
      } else {
        baseUrl = 'https://catalog.desukafashion.com';
      }
    }
    const url = `${baseUrl}/showcase/${result.token}`;

    res.json({
      success: true,
      token: result.token,
      url,
      expires_at: result.expires_at,
      count: result.count
    });
  } catch (err: any) {
    console.error('Error generating showcase link:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/showcase/send-email - Trigger manual email sending
adminShowcaseRouter.post('/send-email', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { token, email } = req.body;

  try {
    let targetToken = token;
    if (!targetToken) {
      // Find latest active link or generate one
      const latestRes = await query(
        `SELECT token FROM showcase_links WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1`
      );
      if (latestRes.rows.length > 0) {
        targetToken = latestRes.rows[0].token;
      } else {
        const gen = await generateShowcaseLink(req.user?.id);
        targetToken = gen.token;
      }
    }

    const emailResult = await sendShowcaseEmail(targetToken, email);
    res.json(emailResult);
  } catch (err: any) {
    console.error('Error triggering showcase email:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/showcase/settings - Get settings
adminShowcaseRouter.get('/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settingsRes = await query('SELECT key, value, updated_at FROM showcase_settings');
    const settings: Record<string, string> = {};
    settingsRes.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err: any) {
    console.error('Error getting showcase settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/showcase/settings - Update settings
adminShowcaseRouter.put('/settings', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Settings object is required' });
    return;
  }

  try {
    for (const [key, value] of Object.entries(updates)) {
      await query(
        `INSERT INTO showcase_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    res.json({ success: true, message: 'Showcase settings updated successfully' });
  } catch (err: any) {
    console.error('Error saving showcase settings:', err);
    res.status(500).json({ error: err.message });
  }
});
