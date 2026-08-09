-- Schema + read-only role for the SQL Agent.
-- Runs automatically on first postgres container boot via /docker-entrypoint-initdb.d/.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS business;
SET search_path TO business, public;

CREATE TABLE customers (
    customer_id   SERIAL PRIMARY KEY,
    name          TEXT   NOT NULL,
    city          TEXT   NOT NULL,
    state         TEXT   NOT NULL,
    join_date     DATE   NOT NULL
);

CREATE TABLE products (
    product_id    SERIAL PRIMARY KEY,
    product_name  TEXT   NOT NULL,
    category      TEXT   NOT NULL,
    price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE orders (
    order_id      SERIAL PRIMARY KEY,
    customer_id   INT    NOT NULL REFERENCES customers(customer_id),
    order_date    DATE   NOT NULL,
    total_amount  NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    status        TEXT   NOT NULL CHECK (status IN ('pending','paid','shipped','delivered','cancelled'))
);

CREATE TABLE order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id      INT    NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id    INT    NOT NULL REFERENCES products(product_id),
    quantity      INT    NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX idx_orders_customer     ON orders(customer_id);
CREATE INDEX idx_orders_date         ON orders(order_date);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

DO $$
DECLARE
    pw TEXT := coalesce(current_setting('agent.readonly_password', true), '');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_readonly') THEN
        IF pw = '' THEN
            EXECUTE 'CREATE ROLE agent_readonly LOGIN';
        ELSE
            EXECUTE format('CREATE ROLE agent_readonly LOGIN PASSWORD %L', pw);
        END IF;
    END IF;
END $$;

GRANT CONNECT ON DATABASE shop_db TO agent_readonly;
GRANT USAGE   ON SCHEMA business  TO agent_readonly;
GRANT SELECT  ON ALL TABLES IN SCHEMA business TO agent_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA business GRANT SELECT ON TABLES TO agent_readonly;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON ALL TABLES IN SCHEMA business FROM agent_readonly;
REVOKE CREATE ON SCHEMA business FROM agent_readonly;

ALTER ROLE agent_readonly SET search_path TO business, public;
