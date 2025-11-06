-- Cropto Database Schema Migration
-- Version: 001_init
-- Description: Initial schema for Supabase/PostgreSQL

-- Enable pgcrypto extension for gen_random_uuid()
-- Note: PostgreSQL 13+ has gen_random_uuid() built-in, but this ensures compatibility
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (migrated from file-based storage)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('farmer', 'trader', 'broker')),
    wallet_address TEXT,
    network TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Options table
CREATE TABLE IF NOT EXISTS options (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('CALL', 'PUT')),
    strike DECIMAL(18, 8) NOT NULL,
    qty DECIMAL(18, 8) NOT NULL,
    premium DECIMAL(18, 8) NOT NULL,
    buyer TEXT NOT NULL,
    seller TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FILLED', 'EXPIRED', 'CANCELLED', 'EXERCISED', 'DEFAULTED')),
    commodity TEXT,
    buyer_id TEXT,
    issuer_id TEXT,
    collateral_amount DECIMAL(18, 8),
    last_intrinsic DECIMAL(18, 8),
    payout_accumulated DECIMAL(18, 8) DEFAULT 0,
    is_demo TEXT DEFAULT 'false' CHECK (is_demo IN ('true', 'false')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    option_id VARCHAR(255) NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    buyer TEXT NOT NULL,
    seller TEXT NOT NULL,
    strike DECIMAL(18, 8) NOT NULL,
    qty DECIMAL(18, 8) NOT NULL,
    premium DECIMAL(18, 8) NOT NULL,
    total_value DECIMAL(18, 8) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Settlements table
CREATE TABLE IF NOT EXISTS settlements (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    option_id VARCHAR(255) NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    exercised_by TEXT NOT NULL,
    spot_price DECIMAL(18, 8) NOT NULL,
    strike DECIMAL(18, 8) NOT NULL,
    qty DECIMAL(18, 8) NOT NULL,
    payout DECIMAL(18, 8) NOT NULL,
    profit_loss DECIMAL(18, 8) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    address TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Margin Calls table
CREATE TABLE IF NOT EXISTS margin_calls (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    option_id VARCHAR(255) NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    amount_required DECIMAL(18, 8) NOT NULL,
    intrinsic_value DECIMAL(18, 8) NOT NULL,
    collateral_amount DECIMAL(18, 8) NOT NULL,
    reserved_collateral DECIMAL(18, 8) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'LIQUIDATED')),
    deadline TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    option_id VARCHAR(255) NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('FORCE_SETTLE', 'COLLATERAL_DEDUCTION', 'PAYOUT')),
    from_user_id TEXT,
    to_user_id TEXT,
    amount DECIMAL(18, 8) NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('MARGIN_CALL', 'OPTION_MATCHED', 'OPTION_EXERCISED', 'LIQUIDATION', 'FORCE_SETTLE')),
    message TEXT NOT NULL,
    related_id TEXT,
    read TEXT NOT NULL DEFAULT 'false' CHECK (read IN ('true', 'false')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Feedback table (partner feedback system)
CREATE TABLE IF NOT EXISTS feedback (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    message TEXT NOT NULL,
    screenshot_url TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index Prices table
CREATE TABLE IF NOT EXISTS index_prices (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    commodity TEXT NOT NULL,
    price DECIMAL(18, 8) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT NOW(),
    is_demo TEXT DEFAULT 'false' CHECK (is_demo IN ('true', 'false')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_options_status ON options(status);
CREATE INDEX IF NOT EXISTS idx_options_buyer_id ON options(buyer_id);
CREATE INDEX IF NOT EXISTS idx_options_issuer_id ON options(issuer_id);
CREATE INDEX IF NOT EXISTS idx_options_created_at ON options(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_option_id ON trades(option_id);
CREATE INDEX IF NOT EXISTS idx_settlements_option_id ON settlements(option_id);
CREATE INDEX IF NOT EXISTS idx_margin_calls_option_id ON margin_calls(option_id);
CREATE INDEX IF NOT EXISTS idx_margin_calls_user_id ON margin_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_margin_calls_status ON margin_calls(status);
CREATE INDEX IF NOT EXISTS idx_transactions_option_id ON transactions(option_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_index_prices_commodity ON index_prices(commodity);

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts with authentication and role information';
COMMENT ON TABLE options IS 'Crypto options contracts (CALL/PUT)';
COMMENT ON TABLE trades IS 'Matched option trades between buyers and sellers';
COMMENT ON TABLE settlements IS 'Exercised option settlements with P&L calculations';
COMMENT ON TABLE wallets IS 'Linked cryptocurrency wallet addresses';
COMMENT ON TABLE margin_calls IS 'Margin call notifications for under-collateralized positions';
COMMENT ON TABLE transactions IS 'Financial transaction records for settlements and liquidations';
COMMENT ON TABLE notifications IS 'In-app notification system for users';
COMMENT ON TABLE feedback IS 'Partner feedback and issue reporting';
COMMENT ON TABLE index_prices IS 'Historical commodity price data for option valuation';
