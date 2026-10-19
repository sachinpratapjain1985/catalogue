import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { 
  generateShowcaseLink, 
  sendShowcaseEmail, 
  SALES_CONTACTS, 
  CALL_CONTACTS,
  CALL_CONTACT, 
  COMMUNITY_LINK, 
  BRAND_DETAILS 
} from '../services/showcaseScheduler';

export const publicShowcaseRouter = Router();
export const adminShowcaseRouter = Router();

let requestRotationIndex = 0;
// Helper to rotate sales contact numbers systematically per request for equal load balancing
function getRotatedSalesContacts() {
  requestRotationIndex = (requestRotationIndex + 1) % SALES_CONTACTS.length;
  const shift = requestRotationIndex;
  return [...SALES_CONTACTS.slice(shift), ...SALES_CONTACTS.slice(0, shift)];
}

// Helper to dynamically fetch brand details merged with showcase_settings overrides
async function getDynamicBrandDetails() {
  try {
    const sRes = await query("SELECT key, value FROM showcase_settings WHERE key IN ('gst_number', 'company_website', 'company_address')");
    const map: Record<string, string> = {};
    sRes.rows.forEach(r => { map[r.key] = r.value; });
    return {
      ...BRAND_DETAILS,
      ...(map['gst_number'] ? { gstNumber: map['gst_number'] } : {}),
      ...(map['company_website'] ? { website: map['company_website'] } : {}),
      ...(map['company_address'] ? { address: map['company_address'] } : {})
    };
  } catch (e) {
    return BRAND_DETAILS;
  }
}

// ==========================================
// PUBLIC ENDPOINTS (No authentication required)
// ==========================================

// GET /api/public/showcase/:token - Retrieve curated showcase catalog
publicShowcaseRouter.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;

  try {
    const brandDetails = await getDynamicBrandDetails();
    const linkRes = await query(
      `SELECT id, token, item_ids, expires_at, created_at, views_count, is_suspended, suspended_at
       FROM showcase_links 
       WHERE token = $1`,
      [token]
    );

    if (linkRes.rows.length === 0) {
      res.status(404).json({
        notFound: true,
        error: 'Exclusive showcase link not found or has been removed.',
        salesContacts: getRotatedSalesContacts(),
        callContact: CALL_CONTACT,
        callContacts: CALL_CONTACTS,
        communityLink: COMMUNITY_LINK,
        brandDetails
      });
      return;
    }

    const link = linkRes.rows[0];
    const now = new Date();
    const createdAt = new Date(link.created_at);
    const expiresAt = new Date(link.expires_at);
    const isSuspended = link.is_suspended === true;
    const isExpired = now > expiresAt || isSuspended;
    const isDisappeared = (now.getTime() - createdAt.getTime()) > (30 * 24 * 60 * 60 * 1000);

    // If older than 1 month (30 days), the link is permanently removed
    if (isDisappeared) {
      res.status(404).json({
        notFound: true,
        disappeared: true,
        message: 'यह लिंक समाप्त हो चुका है (1 महीना पूरा होने पर हटा दिया गया है)। नवीनतम कैटलॉग के लिए नीचे दिए हुए नंबर पर कॉल या WhatsApp करें।',
        salesContacts: getRotatedSalesContacts(),
        callContact: CALL_CONTACT,
        callContacts: CALL_CONTACTS,
        communityLink: COMMUNITY_LINK,
        brandDetails
      });
      return;
    }

    // Check if 24 hours expired or manually suspended before time
    if (isExpired) {
      res.json({
        expired: true,
        suspended: isSuspended,
        message: 'लेटेस्ट कैटलॉग के लिए नीचे दिए हुए WhatsApp नंबर से हमारी टीम से संपर्क करें',
        expires_at: link.expires_at,
        created_at: link.created_at,
        salesContacts: getRotatedSalesContacts(),
        callContact: CALL_CONTACT,
        callContacts: CALL_CONTACTS,
        communityLink: COMMUNITY_LINK,
        brandDetails
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
       ORDER BY CASE 
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
                i.sku_id ASC`,
      [link.item_ids]
    );

    res.json({
      expired: false,
      token: link.token,
      expires_at: link.expires_at,
      created_at: link.created_at,
      items: itemsRes.rows,
      salesContacts: getRotatedSalesContacts(),
      callContact: CALL_CONTACT,
      callContacts: CALL_CONTACTS,
      communityLink: COMMUNITY_LINK,
      brandDetails
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
    const activeCountRes = await query(
      `SELECT COUNT(*) FROM showcase_links 
       WHERE expires_at > NOW() AND (is_suspended IS FALSE OR is_suspended IS NULL)`
    );
    const activeLinkRes = await query(
      `SELECT token, expires_at, created_at, array_length(item_ids, 1) as item_count, views_count, is_suspended, suspended_at
       FROM showcase_links 
       WHERE expires_at > NOW() AND (is_suspended IS FALSE OR is_suspended IS NULL)
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
      activeLinksCount: parseInt(activeCountRes.rows[0].count || '0'),
      activeLink,
      settings
    });
  } catch (err: any) {
    console.error('Error fetching showcase summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/showcase/links - List all showcase links with live timer status
adminShowcaseRouter.get('/links', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const settingsRes = await query("SELECT value FROM showcase_settings WHERE key = 'base_url'");
    let baseUrl = settingsRes.rows[0]?.value || process.env.BASE_URL;
    if (!baseUrl || baseUrl.includes('lms.desukafashion.com')) {
      const host = req.get('host');
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      if (host && !host.includes('lms.')) {
        baseUrl = `${proto}://${host}`;
      } else {
        baseUrl = 'https://catalog.desukafashion.com';
      }
    }

    const linksRes = await query(
      `SELECT id, token, item_ids, created_at, expires_at, views_count,
              is_suspended, suspended_at,
              array_length(item_ids, 1) as item_count
       FROM showcase_links
       ORDER BY created_at DESC
       LIMIT 60`
    );

    const now = Date.now();
    const links = linksRes.rows.map(link => {
      const expTime = new Date(link.expires_at).getTime();
      const isSuspended = link.is_suspended === true;
      const isExpired = expTime <= now;
      let status: 'active' | 'suspended' | 'expired' = 'active';
      if (isSuspended) {
        status = 'suspended';
      } else if (isExpired) {
        status = 'expired';
      }

      return {
        id: link.id,
        token: link.token,
        url: `${baseUrl}/showcase/${link.token}`,
        item_count: parseInt(link.item_count || '0'),
        item_ids: link.item_ids || [],
        created_at: link.created_at,
        expires_at: link.expires_at,
        views_count: parseInt(link.views_count || '0'),
        is_suspended: isSuspended,
        suspended_at: link.suspended_at,
        status,
        remaining_seconds: isSuspended || isExpired ? 0 : Math.max(0, Math.floor((expTime - now) / 1000))
      };
    });

    res.json(links);
  } catch (err: any) {
    console.error('Error fetching showcase links:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/showcase/links/:token/suspend - Suspend active showcase link before time
adminShowcaseRouter.post('/links/:token/suspend', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { token } = req.params;
  try {
    const result = await query(
      `UPDATE showcase_links
       SET is_suspended = TRUE, suspended_at = NOW()
       WHERE token = $1
       RETURNING id, token, is_suspended, suspended_at, expires_at`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Showcase link not found' });
      return;
    }

    console.log(`[Showcase] Link ${token} suspended manually by admin ${req.user?.username || req.user?.id}`);

    res.json({
      success: true,
      message: 'Showcase link suspended successfully. Anyone visiting this link will now see the expired notice.',
      link: result.rows[0]
    });
  } catch (err: any) {
    console.error('Error suspending showcase link:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/showcase/links/:token/reactivate - Reactivate or extend showcase link
adminShowcaseRouter.post('/links/:token/reactivate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { token } = req.params;
  try {
    const result = await query(
      `UPDATE showcase_links
       SET is_suspended = FALSE,
           suspended_at = NULL,
           expires_at = CASE 
             WHEN expires_at <= NOW() THEN NOW() + INTERVAL '24 hours' 
             ELSE expires_at 
           END
       WHERE token = $1
       RETURNING id, token, is_suspended, suspended_at, expires_at`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Showcase link not found' });
      return;
    }

    console.log(`[Showcase] Link ${token} reactivated by admin ${req.user?.username || req.user?.id}`);

    res.json({
      success: true,
      message: 'Showcase link reactivated successfully with active timer.',
      link: result.rows[0]
    });
  } catch (err: any) {
    console.error('Error reactivating showcase link:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/showcase/links/:token - Delete showcase link
adminShowcaseRouter.delete('/links/:token', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { token } = req.params;
  try {
    const result = await query(
      `DELETE FROM showcase_links WHERE token = $1 RETURNING id, token`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Showcase link not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Showcase link deleted successfully'
    });
  } catch (err: any) {
    console.error('Error deleting showcase link:', err);
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
       ORDER BY CASE 
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
