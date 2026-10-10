import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Limit sharp image processing to 1 concurrent thread to prevent CPU starvation
sharp.concurrency(1);

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres_password',
  database: process.env.DB_NAME || 'catalogue_db',
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
  } else {
    console.log('Successfully connected to database');
    release();
  }
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export const runMigrations = async () => {
  console.log('[Migration] Checking database schema migrations...');
  try {
    // 1. Drop existing users_role_check constraint and add the new one
    await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
    await pool.query(`
      ALTER TABLE users 
      ADD CONSTRAINT users_role_check 
      CHECK (role IN ('superadmin', 'manager', 'both', 'stockist', 'sales'))
    `);
    console.log('[Migration] Users role constraint updated.');

    // 2. Add rate and original_created_at to items
    await pool.query('ALTER TABLE items ADD COLUMN IF NOT EXISTS rate INTEGER NOT NULL DEFAULT 0');
    await pool.query(`
      ALTER TABLE items 
      ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('[Migration] Items table columns verified.');

    // 2b. Add can_edit_rates & can_access_real_images to users
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_rates BOOLEAN NOT NULL DEFAULT FALSE');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_real_images BOOLEAN NOT NULL DEFAULT TRUE');
    console.log('[Migration] Users columns verified.');

    // 3. Create rate_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rate_logs (
          id SERIAL PRIMARY KEY,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          old_rate INTEGER,
          new_rate INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] rate_logs table verified.');

    // 3b. Create item_real_images table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_real_images (
          id SERIAL PRIMARY KEY,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          image_path TEXT NOT NULL,
          watermarked_path TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] item_real_images table verified.');

    // 3c. Create works master table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS works (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] works master table verified.');

    // 3d. Add work column to items table
    await pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS work VARCHAR(100) NOT NULL DEFAULT ''");
    console.log('[Migration] items.work column verified.');

    // 3e. Add revised_rate column to items table
    await pool.query('ALTER TABLE items ADD COLUMN IF NOT EXISTS revised_rate INTEGER DEFAULT NULL');
    console.log('[Migration] items.revised_rate column verified.');

    // 3f. Create item_image_features table for visual reverse image search
    await pool.query(`
      CREATE TABLE IF NOT EXISTS item_image_features (
          id SERIAL PRIMARY KEY,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          image_type VARCHAR(20) NOT NULL DEFAULT 'primary',
          image_path TEXT NOT NULL,
          feature_vector JSONB NOT NULL,
          dhash VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT unique_item_image UNIQUE(item_id, image_path)
      )
    `);
    console.log('[Migration] item_image_features table verified.');

    // 3g. Add can_manage_proforma to users (Default TRUE so authorized staff can use it immediately)
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_proforma BOOLEAN NOT NULL DEFAULT TRUE');
    await pool.query('UPDATE users SET can_manage_proforma = TRUE WHERE can_manage_proforma IS NULL');
    console.log('[Migration] users.can_manage_proforma column verified.');

    // 3h. Create proforma_invoices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proforma_invoices (
          id SERIAL PRIMARY KEY,
          invoice_number VARCHAR(50) UNIQUE NOT NULL,
          invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
          valid_until DATE,
          customer_name VARCHAR(255) NOT NULL,
          business_name VARCHAR(255),
          city VARCHAR(100),
          address TEXT,
          gst_number VARCHAR(50),
          phone VARCHAR(50),
          state VARCHAR(100) DEFAULT 'Delhi',
          state_code VARCHAR(10) DEFAULT '07',
          company_name VARCHAR(255) DEFAULT 'VS FASHION',
          company_brand VARCHAR(255) DEFAULT 'DESUKA',
          company_address TEXT DEFAULT 'IX-6362 Netaji Gali Gandhi nagar Delhi-110031',
          company_gst VARCHAR(50) DEFAULT '',
          company_phone VARCHAR(50) DEFAULT '9718503340',
          company_email VARCHAR(100) DEFAULT 'wholesale@desukafashion.com',
          bank_name VARCHAR(100) DEFAULT 'HDFC BANK',
          bank_account_no VARCHAR(50) DEFAULT '',
          bank_ifsc VARCHAR(50) DEFAULT '',
          bank_branch VARCHAR(100) DEFAULT 'Gandhi Nagar, Delhi',
          total_sets INTEGER NOT NULL DEFAULT 0,
          total_pieces INTEGER NOT NULL DEFAULT 0,
          subtotal_taxable NUMERIC(12, 2) NOT NULL DEFAULT 0,
          total_gst_5 NUMERIC(12, 2) NOT NULL DEFAULT 0,
          total_gst_18 NUMERIC(12, 2) NOT NULL DEFAULT 0,
          total_gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          round_off NUMERIC(6, 2) NOT NULL DEFAULT 0,
          grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
          is_interstate BOOLEAN NOT NULL DEFAULT FALSE,
          status VARCHAR(50) NOT NULL DEFAULT 'draft',
          notes TEXT,
          terms_conditions TEXT DEFAULT '1. Goods once sold will not be taken back or exchanged.\n2. Payment terms: 100% advance before dispatch.\n3. Subject to Delhi jurisdiction only.',
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] proforma_invoices table verified.');

    // Update company contact details to new accurate information if old defaults exist
    await pool.query(`
      UPDATE proforma_invoices 
      SET company_address = 'IX-6362 Netaji Gali Gandhi nagar Delhi-110031' 
      WHERE company_address LIKE '%6344%' OR company_address LIKE '%Subhash Mohalla%' OR company_address IS NULL;
    `).catch(() => {});
    await pool.query(`
      UPDATE proforma_invoices 
      SET company_phone = '9718503340' 
      WHERE company_phone LIKE '%99992%' OR company_phone LIKE '%49455%' OR company_phone IS NULL;
    `).catch(() => {});
    await pool.query(`
      UPDATE proforma_invoices 
      SET company_email = 'wholesale@desukafashion.com' 
      WHERE company_email LIKE '%sales@desukafashion.com%' OR company_email IS NULL;
    `).catch(() => {});

    // 3i. Create proforma_invoice_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proforma_invoice_items (
          id SERIAL PRIMARY KEY,
          proforma_id INTEGER NOT NULL REFERENCES proforma_invoices(id) ON DELETE CASCADE,
          item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
          article_number VARCHAR(100) NOT NULL,
          description TEXT DEFAULT '',
          pieces_per_set INTEGER NOT NULL DEFAULT 1,
          sets INTEGER NOT NULL DEFAULT 1,
          quantity INTEGER NOT NULL DEFAULT 1,
          rate NUMERIC(10, 2) NOT NULL DEFAULT 0,
          taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 5,
          gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[Migration] proforma_invoice_items table verified.');

    // 4. Create performance indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_items_original_created_at ON items(original_created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_items_work ON items(work)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_items_revised_rate ON items(revised_rate) WHERE revised_rate IS NOT NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rate_logs_item ON rate_logs(item_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_real_images_item ON item_real_images(item_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_image_features_item ON item_image_features(item_id)');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_user_uuid ON devices (user_id, device_uuid)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_proforma_created_by ON proforma_invoices(created_by)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_proforma_date ON proforma_invoices(invoice_date DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_proforma_items_proforma_id ON proforma_invoice_items(proforma_id)');
    console.log('[Migration] Performance indexes verified.');

    // 5. Auto-seed standard works if table is empty
    const worksCount = await pool.query('SELECT COUNT(*) FROM works');
    if (parseInt(worksCount.rows[0].count) === 0) {
      const defaultWorks = [
        'Handwork',
        'Mirror Work',
        'Thread Embroidery',
        'Zari Work',
        'Digital Print',
        'Sequins',
        'Chikankari',
        'Gota Patti',
        'Cutwork',
        'Plain / Solid'
      ];
      for (const w of defaultWorks) {
        await pool.query('INSERT INTO works (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [w]);
      }
      console.log('[Migration] Default work master entries seeded.');
    }

    // 6. Update items to clear default descriptions
    await pool.query("UPDATE items SET description = '' WHERE description = 'DESUKA by VS FASHION Gandhi Nagar Delhi.'");
    console.log('[Migration] Cleared default descriptions from existing items.');

    console.log('[Migration] Database migrations completed successfully!');

    // Run background generation of missing thumbnails for 800+ products
    generateMissingThumbnails().catch(err => {
      console.error('[Thumbnail Migration] Background thumbnail generation failed:', err);
    });

    // Run background indexing of visual search features
    import('./services/visualSearch').then(vs => {
      vs.syncAllCatalogVisualFeatures().catch(err => {
        console.error('[Visual Index] Background visual feature sync failed:', err);
      });
    }).catch(e => {});
  } catch (err) {
    console.error('[Migration] Error running database migrations:', err);
    throw err;
  }
};

export const generateMissingThumbnails = async () => {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
  console.log('[Thumbnail Migration] Checking for missing thumbnails in:', uploadDir);
  try {
    const res = await pool.query('SELECT id, sku_id, image_path FROM items');
    let generatedCount = 0;
    let missingOriginals = 0;
    let alreadyExists = 0;

    for (const row of res.rows) {
      const imagePath = row.image_path; // e.g. "/uploads/filename.jpg"
      if (!imagePath) continue;

      const filename = path.basename(imagePath);
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);
      const thumbFilename = `${baseName}-thumb${ext}`;

      const originalFullPath = path.join(uploadDir, filename);
      const thumbFullPath = path.join(uploadDir, thumbFilename);

      if (fs.existsSync(thumbFullPath)) {
        alreadyExists++;
        continue;
      }

      if (fs.existsSync(originalFullPath)) {
        try {
          let sharpObj = sharp(originalFullPath)
            .resize(320, 320, { fit: 'inside', withoutEnlargement: true });

          const extension = ext.toLowerCase();
          if (extension === '.png') {
            sharpObj = sharpObj.png({ quality: 70, compressionLevel: 6 });
          } else if (extension === '.webp') {
            sharpObj = sharpObj.webp({ quality: 70 });
          } else {
            sharpObj = sharpObj.jpeg({ quality: 70, progressive: true });
          }

          await sharpObj.toFile(thumbFullPath);
          generatedCount++;
          console.log(`[Thumbnail Migration] Generated thumbnail for ${row.sku_id} (${filename})`);
        } catch (err) {
          console.error(`[Thumbnail Migration] Failed to generate thumbnail for ${row.sku_id}:`, err);
        }
      } else {
        missingOriginals++;
        console.warn(`[Thumbnail Migration] Original image not found for ${row.sku_id} at ${originalFullPath}`);
      }
    }
    console.log(`[Thumbnail Migration] Scan complete. Generated: ${generatedCount}, Already existed: ${alreadyExists}, Missing originals: ${missingOriginals}`);
  } catch (err) {
    console.error('[Thumbnail Migration] Error during thumbnail generation:', err);
  }
};

export default pool;
