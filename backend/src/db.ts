import { Pool } from 'pg';
import dotenv from 'dotenv';

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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rate_logs_item ON rate_logs(item_id)');
    console.log('[Migration] Performance indexes verified.');

    console.log('[Migration] Database migrations completed successfully!');
  } catch (err) {
    console.error('[Migration] Error running database migrations:', err);
    throw err;
  }
};

export default pool;
