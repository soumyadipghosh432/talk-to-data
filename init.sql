-- Core User Account Tables
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    user_name VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NULL, -- Nullable to seamlessly accommodate future SSO migration
    access_type VARCHAR(50) DEFAULT 'User' NOT NULL, -- Core role: 'User' or 'Admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Advanced Access Rules Engine (RBAC)
CREATE TABLE IF NOT EXISTS rules (
    rule_id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    sql_predicate TEXT NOT NULL -- Contains the exact clause snippet, e.g., "geographic_region = 'US'"
);

CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_rules_mapping (
    role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
    rule_id INTEGER REFERENCES rules(rule_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, rule_id)
);

CREATE TABLE IF NOT EXISTS user_roles_mapping (
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- Chat Context Tracking (Structured JSONB Storage)
CREATE TABLE IF NOT EXISTS chat_history (
    chat_id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    history_data JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array format: [{"role": "user", "content": "..."}, {"role": "ai", "content": "..."}]
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Quality Assurance Feedback Repository
CREATE TABLE IF NOT EXISTS feedback (
    feedback_id SERIAL PRIMARY KEY,
    chat_id UUID REFERENCES chat_history(chat_id) ON DELETE CASCADE,
    thumbs_up BOOLEAN DEFAULT FALSE NOT NULL,
    thumbs_down BOOLEAN DEFAULT FALSE NOT NULL,
    user_question TEXT NOT NULL,
    ai_response TEXT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Comprehensive Enterprise Telemetry Ledger
CREATE TABLE IF NOT EXISTS execution_log (
    log_id SERIAL PRIMARY KEY,
    chat_id UUID,
    user_id INTEGER,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    latency_ms INTEGER NOT NULL,
    throughput_tps NUMERIC(10, 2), -- Tokens per second
    llm_provider_utilized VARCHAR(100) NOT NULL,
    generated_sql_statement TEXT,
    execution_status VARCHAR(50) NOT NULL, -- 'SUCCESS', 'GUARDRAIL_DENIED', 'SQL_ERROR', etc.
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Business Data Tables (5 tables for Q&A)
CREATE TABLE IF NOT EXISTS customers (
    customer_id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    geographic_region VARCHAR(50) NOT NULL, -- e.g., 'US', 'EMEA', 'APAC'
    registration_date DATE DEFAULT CURRENT_DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Active' NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- e.g., 'Electronics', 'Apparel', 'Home Office'
    price NUMERIC(10, 2) NOT NULL,
    stock_quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
    order_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending' NOT NULL, -- e.g., 'Completed', 'Pending', 'Cancelled'
    geographic_region VARCHAR(50) NOT NULL, -- Matches user regions / shipping rules
    total_amount NUMERIC(12, 2) DEFAULT 0.00 NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
    review_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES customers(customer_id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    review_text TEXT,
    review_date DATE DEFAULT CURRENT_DATE NOT NULL
);
