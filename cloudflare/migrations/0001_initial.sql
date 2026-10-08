CREATE TABLE business (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, customer TEXT NOT NULL,
 bid_contact_name TEXT, bid_contact_phone TEXT, customer_contact_name TEXT, customer_contact_phone TEXT,
 service_content TEXT, bid_amount REAL NOT NULL DEFAULT 0, service_people INTEGER NOT NULL DEFAULT 0,
 document_url TEXT, previous_suppliers TEXT, registration_time TEXT, bid_time TEXT,
 document_status TEXT NOT NULL DEFAULT '未获取', bid_status TEXT NOT NULL DEFAULT '未报名',
 priority TEXT NOT NULL DEFAULT '低', payment_status TEXT, created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, updated_by TEXT, notes TEXT
);
CREATE TABLE status_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, business_id INTEGER NOT NULL REFERENCES business(id) ON DELETE CASCADE,
 field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, changed_at TEXT NOT NULL, changed_by TEXT, notes TEXT
);
CREATE TABLE app_user (
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')), is_active INTEGER NOT NULL DEFAULT 1,
 avatar_url TEXT
);
CREATE TABLE session (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE login_attempt (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX business_created ON business(created_at DESC, id DESC);
CREATE INDEX business_registration ON business(registration_time);
CREATE INDEX business_bid ON business(bid_time);
CREATE INDEX history_business ON status_history(business_id, changed_at DESC);
CREATE INDEX session_expiry ON session(expires_at);
