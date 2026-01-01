-- KASHPOS v2.0 Database Schema Update v6
-- Run this SQL in your Supabase SQL Editor
-- 
-- This update adds:
-- 1. Volume (ml) as a new unit type
-- 2. OPEX (Operating Expenses) table
-- 3. OPEX settings table for target sales
-- 4. Transaction number column for formatted IDs
-- 5. OPEX cost tracking in sales and products

-- ============================================
-- 1. UPDATE UNIT TYPE CHECK CONSTRAINT
-- ============================================
-- Add 'volume' for milliliters support

-- First drop the old constraint on products table
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_type_check;

-- Add new constraint with volume option
ALTER TABLE products ADD CONSTRAINT products_unit_type_check 
  CHECK (unit_type IN ('weight', 'quantity', 'volume'));

-- Update sales table constraint too
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_unit_type_check;

ALTER TABLE sales ADD CONSTRAINT sales_unit_type_check 
  CHECK (unit_type IN ('weight', 'quantity', 'volume'));

-- ============================================
-- 2. CREATE OPEX TABLE
-- ============================================
-- Stores operating expenses (rent, electricity, etc.)

CREATE TABLE IF NOT EXISTS opex (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_opex_updated_at ON opex;
CREATE TRIGGER update_opex_updated_at
  BEFORE UPDATE ON opex
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE opex ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
DROP POLICY IF EXISTS "Allow all operations on opex" ON opex;
CREATE POLICY "Allow all operations on opex" ON opex
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 3. CREATE OPEX SETTINGS TABLE
-- ============================================
-- Stores target monthly sales for OPEX calculation

CREATE TABLE IF NOT EXISTS opex_settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  target_monthly_sales INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_opex_settings_updated_at ON opex_settings;
CREATE TRIGGER update_opex_settings_updated_at
  BEFORE UPDATE ON opex_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE opex_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
DROP POLICY IF EXISTS "Allow all operations on opex_settings" ON opex_settings;
CREATE POLICY "Allow all operations on opex_settings" ON opex_settings
  FOR ALL USING (true) WITH CHECK (true);

-- Insert default settings if not exists
INSERT INTO opex_settings (target_monthly_sales) 
SELECT 100 WHERE NOT EXISTS (SELECT 1 FROM opex_settings);

-- ============================================
-- 4. ADD OPEX_COST TO FINISHED_PRODUCTS
-- ============================================
-- Stores the OPEX cost per unit for each product (editable)

ALTER TABLE finished_products 
ADD COLUMN IF NOT EXISTS opex_cost DECIMAL(10, 2) DEFAULT 0;

-- ============================================
-- 5. ADD TRANSACTION_NUMBER AND OPEX_COST TO SALES
-- ============================================
-- For formatted transaction IDs (YY-MM-XXXXX)
-- And tracking OPEX cost per sale

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS transaction_number TEXT;

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS opex_cost DECIMAL(10, 2) DEFAULT 0;

-- Create index for transaction_number lookups
CREATE INDEX IF NOT EXISTS idx_sales_transaction_number ON sales(transaction_number);

-- ============================================
-- 6. ADD IMAGE_URL TO PRODUCTS (INVENTORY)
-- ============================================
-- Already exists but ensure it's there

-- No action needed - column already exists

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'Schema update v6 completed - OPEX and ML support added!' as status;

-- Verify opex table
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'opex'
) as opex_table_exists;

-- Verify opex_settings table
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'opex_settings'
) as opex_settings_table_exists;

-- Check new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'finished_products' AND column_name = 'opex_cost';

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sales' AND column_name IN ('transaction_number', 'opex_cost');

