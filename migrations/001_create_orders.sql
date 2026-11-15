CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY,
  customer_name TEXT        NOT NULL CHECK (length(customer_name) > 0),
  status        TEXT        NOT NULL CHECK (status IN ('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELED')),
  total_cents   BIGINT      NOT NULL CHECK (total_cents >= 0),
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id         UUID    NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL,
  sku              TEXT    NOT NULL,
  name             TEXT    NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  PRIMARY KEY (order_id, position),
  UNIQUE (order_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders (status, created_at DESC);
