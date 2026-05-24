-- Database Schema for Catalog Management System

-- Create Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'stockist', 'sales')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    working_hours_start TIME DEFAULT '00:00:00',
    working_hours_end TIME DEFAULT '23:59:59',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Devices table for device ID whitelisting
CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_uuid VARCHAR(100) NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_device UNIQUE(user_id, device_uuid)
);

-- Create Categories table (equivalent to folders)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create User-Category permission table (for Stockist folder assignment)
CREATE TABLE IF NOT EXISTS user_categories (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, category_id)
);

-- Create Items table (SKU inventory metadata)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    sku_id VARCHAR(100) UNIQUE NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    image_path VARCHAR(255) NOT NULL,
    pieces_per_set INTEGER NOT NULL DEFAULT 4 CHECK (pieces_per_set > 0),
    description TEXT,
    material VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create Stock table (current levels)
CREATE TABLE IF NOT EXISTS stock (
    item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    sets_count INTEGER NOT NULL DEFAULT 0 CHECK (sets_count >= 0),
    total_pieces INTEGER NOT NULL DEFAULT 0 CHECK (total_pieces >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Create Stock Logs table (addition and sales audit logs)
CREATE TABLE IF NOT EXISTS stock_logs (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('addition', 'reduction', 'status_change')),
    sets_changed INTEGER NOT NULL DEFAULT 0,
    pieces_changed INTEGER NOT NULL DEFAULT 0,
    previous_sets INTEGER NOT NULL DEFAULT 0,
    new_sets INTEGER NOT NULL DEFAULT 0,
    previous_available BOOLEAN NOT NULL,
    new_available BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stock_logs_item ON stock_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_logs_user ON stock_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_uuid ON devices(device_uuid);

-- Insert default admin user (username: admin, password: adminpassword)
-- Password hash generated using bcrypt ($2a$10$tMh5t5mE/wM/CcrC720kEuqE9j.u1DsnmF0q12cR1w1F7d1D1Gvq6)
INSERT INTO users (username, password_hash, role, status)
VALUES ('admin', '$2a$10$tMh5t5mE/wM/CcrC720kEuqE9j.u1DsnmF0q12cR1w1F7d1D1Gvq6', 'superadmin', 'active')
ON CONFLICT (username) DO NOTHING;
