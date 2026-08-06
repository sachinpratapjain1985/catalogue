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

    // 2b. Add can_edit_rates to users
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_rates BOOLEAN NOT NULL DEFAULT FALSE');
    console.log('[Migration] Users can_edit_rates column verified.');

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

    // 4. Create performance indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_items_original_created_at ON items(original_created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rate_logs_item ON rate_logs(item_id)');
    console.log('[Migration] Performance indexes verified.');

    // 5. Update items to clear default descriptions
    await pool.query("UPDATE items SET description = '' WHERE description = 'DESUKA by VS FASHION Gandhi Nagar Delhi.'");
    console.log('[Migration] Cleared default descriptions from existing items.');

    // 6. Deduplicate existing device records by (user_id, device_name), keeping the latest entry
    await pool.query(`
      DELETE FROM devices
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM devices
        GROUP BY user_id, device_name
      )
    `);
    console.log('[Migration] Deduplicated existing device records.');

    console.log('[Migration] Database migrations completed successfully!');

    // Run background generation of missing thumbnails for 800+ products
    generateMissingThumbnails().catch(err => {
      console.error('[Thumbnail Migration] Background thumbnail generation failed:', err);
    });
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
