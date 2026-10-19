--tiswagaze databizo
BEGIN;

-- USERS: people who use the system.
CREATE TABLE IF NOT EXISTS users (
    user_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    phone           VARCHAR(30),
    role            VARCHAR(20) NOT NULL DEFAULT 'ATTENDEE'
                    CHECK (role IN ('ATTENDEE', 'ORGANIZER', 'ADMIN', 'CHECK_IN_STAFF')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- VENUES: physical or online places where events happen.
CREATE TABLE IF NOT EXISTS venues (
    venue_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venue_name      VARCHAR(180) NOT NULL,
    address         TEXT,
    city            VARCHAR(100),
    country         VARCHAR(100) DEFAULT 'Malawi',
    capacity         INTEGER CHECK (capacity IS NULL OR capacity > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- EVENTS: each event has an organizer and may have a venue.
CREATE TABLE IF NOT EXISTS events (
    event_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organizer_id      BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    venue_id          BIGINT REFERENCES venues(venue_id) ON DELETE SET NULL,
    title             VARCHAR(200) NOT NULL,
    description       TEXT,
    category          VARCHAR(100),
    venue             VARCHAR(150),
    location          VARCHAR(255),
    capacity          INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
    tickets_issued    INTEGER NOT NULL DEFAULT 0 CHECK (tickets_issued >= 0),
    event_type        VARCHAR(20) NOT NULL DEFAULT 'IN_PERSON'
                      CHECK (event_type IN ('IN_PERSON', 'ONLINE', 'HYBRID')),
    online_event_url  TEXT,
    start_at          TIMESTAMPTZ NOT NULL,
    end_at            TIMESTAMPTZ NOT NULL,
    sales_start_at    TIMESTAMPTZ,
    sales_end_at      TIMESTAMPTZ,
    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED')),
    banner_url        TEXT,
    published_at      TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_at > start_at),
    CHECK (tickets_issued <= capacity),
    CHECK (sales_end_at IS NULL OR sales_start_at IS NULL OR sales_end_at > sales_start_at),
    CHECK (event_type <> 'ONLINE' OR online_event_url IS NOT NULL)
);

-- TICKET TYPES: ticket categories and inventory for each event.
-- available = quantity_total - quantity_sold - quantity_reserved.
-- quantity_reserved is managed by backend purchase/expiry transactions.
CREATE TABLE IF NOT EXISTS ticket_types (
    ticket_type_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id          BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    type_name         VARCHAR(100) NOT NULL,
    description       TEXT,
    price             NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    currency          CHAR(3) NOT NULL DEFAULT 'MWK',
    quantity_total    INTEGER NOT NULL CHECK (quantity_total >= 0),
    quantity_sold     INTEGER NOT NULL DEFAULT 0 CHECK (quantity_sold >= 0),
    quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    per_order_limit   INTEGER NOT NULL DEFAULT 10 CHECK (per_order_limit > 0),
    sales_start_at    TIMESTAMPTZ,
    sales_end_at      TIMESTAMPTZ,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (quantity_sold + quantity_reserved <= quantity_total),
    CHECK (sales_end_at IS NULL OR sales_start_at IS NULL OR sales_end_at > sales_start_at),
    UNIQUE (event_id, type_name)
);

-- ORDERS: one checkout/purchase attempt by an attendee.
CREATE TABLE IF NOT EXISTS orders (
    order_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_number      VARCHAR(40) NOT NULL UNIQUE,
    buyer_id          BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'FAILED')),
    subtotal          NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    fees              NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
    total_amount      NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    currency          CHAR(3) NOT NULL DEFAULT 'MWK',
    expires_at        TIMESTAMPTZ,
    paid_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (total_amount = subtotal + fees)
);

-- ORDER ITEMS: records ticket type, quantity and price at checkout time.
-- Price is copied here so later ticket-price changes don't alter old orders.
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id          BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    ticket_type_id    BIGINT NOT NULL REFERENCES ticket_types(ticket_type_id) ON DELETE RESTRICT,
    quantity          INTEGER NOT NULL CHECK (quantity > 0),
    unit_price        NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total        NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    UNIQUE (order_id, ticket_type_id)
);

-- PAYMENTS: records payment-provider references and payment outcomes.
-- Do not save card numbers, CVV, PINs, or banking passwords.
CREATE TABLE IF NOT EXISTS payments (
    payment_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id             BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
    provider             VARCHAR(80) NOT NULL,
    provider_reference   VARCHAR(200) UNIQUE,
    amount               NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency             CHAR(3) NOT NULL DEFAULT 'MWK',
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED')),
    payment_method       VARCHAR(50),
    provider_response    JSONB,
    paid_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- TICKETS: each issued ticket gets its own unique QR token.
-- qr_token should be a cryptographically random, unguessable value generated by the backend.
CREATE TABLE IF NOT EXISTS tickets (
    ticket_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_number     VARCHAR(50) NOT NULL UNIQUE,
    order_item_id     BIGINT NOT NULL REFERENCES order_items(order_item_id) ON DELETE RESTRICT,
    event_id          BIGINT NOT NULL REFERENCES events(event_id) ON DELETE RESTRICT,
    ticket_type_id    BIGINT NOT NULL REFERENCES ticket_types(ticket_type_id) ON DELETE RESTRICT,
    owner_id          BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    qr_token          UUID NOT NULL UNIQUE,
    status            VARCHAR(20) NOT NULL DEFAULT 'ISSUED'
                      CHECK (status IN ('ISSUED', 'USED', 'CANCELLED', 'REFUNDED')),
    issued_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_in_at     TIMESTAMPTZ
);

-- TICKET VALIDATIONS: history of scan/check-in attempts.
CREATE TABLE IF NOT EXISTS ticket_validations (
    validation_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id         BIGINT NOT NULL REFERENCES tickets(ticket_id) ON DELETE RESTRICT,
    checked_by        BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    result            VARCHAR(20) NOT NULL
                      CHECK (result IN ('ACCEPTED', 'ALREADY_USED', 'CANCELLED', 'REFUNDED', 'INVALID')),
    scanned_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes             TEXT
);

-- AUDIT LOG: optional history for important administrative/system actions.
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id     BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    action            VARCHAR(100) NOT NULL,
    entity_type       VARCHAR(80) NOT NULL,
    entity_id         VARCHAR(80),
    details           JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes used by common event browsing, order history and ticket scans.
CREATE INDEX IF NOT EXISTS idx_events_status_start ON events(status, start_at);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_expiry ON orders(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner_id);
CREATE INDEX IF NOT EXISTS idx_validations_ticket_scanned ON ticket_validations(ticket_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

COMMIT;

