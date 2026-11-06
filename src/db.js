const Database = require('better-sqlite3');
const config = require('./config');
const { ensureDir } = require('./services/fileUtils');
const { siteKindCheck } = require('./services/fileTypes');

let db;

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName);
}

function ensureBaselineSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN (${siteKindCheck()})),
      root_path TEXT NOT NULL,
      entry_file TEXT NOT NULL DEFAULT 'index.html',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      file_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function applyMigration(version, up) {
  const exists = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  if (exists) return;

  const run = db.transaction(() => {
    up();
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(version, new Date().toISOString());
  });

  run();
}

function applyMigrationWithForeignKeysOff(version, up) {
  const exists = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  if (exists) return;

  db.pragma('foreign_keys = OFF');
  try {
    const run = db.transaction(() => {
      up();
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, new Date().toISOString());
    });
    run();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function runMigrations() {
  ensureBaselineSchema();

  applyMigration(1, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')) DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        approved_at TEXT,
        approved_by TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `);
  });

  applyMigration(2, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_folders_name ON folders(name);
    `);

    if (!hasColumn('sites', 'folder_id')) {
      db.exec('ALTER TABLE sites ADD COLUMN folder_id TEXT');
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_sites_folder_id ON sites(folder_id)');
  });

  applyMigration(3, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    const defaults = [
      ['site_name', 'DemoHub'],
      ['logo_url', ''],
      ['theme', 'light']
    ];

    const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)');
    for (const [key, value] of defaults) {
      insert.run(key, value, now, now);
    }
  });

  applyMigration(4, () => {
    if (!hasColumn('sites', 'visit_count')) {
      db.exec('ALTER TABLE sites ADD COLUMN visit_count INTEGER NOT NULL DEFAULT 0');
    }
    if (!hasColumn('sites', 'last_visited_at')) {
      db.exec('ALTER TABLE sites ADD COLUMN last_visited_at TEXT');
    }
  });

  applyMigration(5, () => {
    if (!hasColumn('sites', 'access_days')) {
      db.exec('ALTER TABLE sites ADD COLUMN access_days INTEGER NOT NULL DEFAULT 365');
    }
  });

  applyMigration(6, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        visited_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_visits_site ON visits(site_id);
      CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visited_at);
    `);
  });

  applyMigration(7, () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get();
    const legacyNames = ['静态网页托管系统', '网页托管系统', '托管系统'];
    if (row && legacyNames.includes(row.value)) {
      db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?')
        .run('DemoHub', new Date().toISOString(), 'site_name');
    }
  });

  applyMigration(8, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS nav_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nav_links (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (group_id) REFERENCES nav_groups(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nav_links_group ON nav_links(group_id);
      CREATE INDEX IF NOT EXISTS idx_nav_links_order ON nav_links(group_id, sort_order);
    `);
  });

  applyMigration(9, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS portals (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        logo_url TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
        layout TEXT NOT NULL DEFAULT 'topbar' CHECK (layout IN ('topbar', 'sidebar')),
        login_required INTEGER NOT NULL DEFAULT 0,
        login_message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portal_pages (
        id TEXT PRIMARY KEY,
        portal_id TEXT NOT NULL,
        parent_id TEXT,
        site_id TEXT NOT NULL,
        route_path TEXT NOT NULL,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY (portal_id) REFERENCES portals(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_portal_pages_portal ON portal_pages(portal_id);
      CREATE INDEX IF NOT EXISTS idx_portal_pages_parent ON portal_pages(parent_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_pages_route ON portal_pages(portal_id, route_path);
    `);
  });

  applyMigration(10, () => {
    db.exec(`
      CREATE TABLE portal_pages_v2 (
        id TEXT PRIMARY KEY,
        portal_id TEXT NOT NULL,
        parent_id TEXT,
        site_id TEXT,
        route_path TEXT NOT NULL,
        title TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '',
        is_default INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        visible INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        link_type TEXT NOT NULL DEFAULT 'site' CHECK (link_type IN ('site', 'url')),
        external_url TEXT NOT NULL DEFAULT '',
        open_mode TEXT NOT NULL DEFAULT 'embed' CHECK (open_mode IN ('embed', 'blank')),
        FOREIGN KEY (portal_id) REFERENCES portals(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      INSERT INTO portal_pages_v2 (
        id, portal_id, parent_id, site_id, route_path, title, icon, is_default, sort_order, visible, created_at,
        link_type, external_url, open_mode
      )
      SELECT
        id, portal_id, parent_id, site_id, route_path, title, icon, is_default, sort_order, visible, created_at,
        'site', '', 'embed'
      FROM portal_pages;

      DROP TABLE portal_pages;
      ALTER TABLE portal_pages_v2 RENAME TO portal_pages;

      CREATE INDEX IF NOT EXISTS idx_portal_pages_portal ON portal_pages(portal_id);
      CREATE INDEX IF NOT EXISTS idx_portal_pages_parent ON portal_pages(parent_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_pages_route ON portal_pages(portal_id, route_path);
    `);
  });

  applyMigrationWithForeignKeysOff(11, () => {
    db.exec(`
      CREATE TABLE portals_v2 (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        logo_url TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT 'blue' CHECK (theme IN ('light', 'dark', 'blue', 'red', 'green', 'white', 'orange', 'cyan', 'purple')),
        layout TEXT NOT NULL DEFAULT 'topbar' CHECK (layout IN ('topbar', 'sidebar')),
        login_required INTEGER NOT NULL DEFAULT 0,
        login_message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO portals_v2 (
        id, slug, name, description, logo_url, theme, layout, login_required, login_message, status, created_at, updated_at
      )
      SELECT
        id, slug, name, description, logo_url, theme, layout, login_required, login_message, status, created_at, updated_at
      FROM portals;

      DROP TABLE portals;
      ALTER TABLE portals_v2 RENAME TO portals;
    `);
  });

  applyMigrationWithForeignKeysOff(12, () => {
    db.exec(`
      CREATE TABLE portals_v3 (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        logo_url TEXT NOT NULL DEFAULT '',
        theme TEXT NOT NULL DEFAULT 'jingtai' CHECK (theme IN ('jingtai', 'lotus', 'vivid', 'newyear', 'soe', 'ink', 'fashion', 'china', 'youth')),
        layout TEXT NOT NULL DEFAULT 'topbar' CHECK (layout IN ('topbar', 'sidebar')),
        login_required INTEGER NOT NULL DEFAULT 0,
        login_message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO portals_v3 (
        id, slug, name, description, logo_url, theme, layout, login_required, login_message, status, created_at, updated_at
      )
      SELECT
        id, slug, name, description, logo_url,
        CASE theme
          WHEN 'jingtai' THEN 'jingtai'
          WHEN 'lotus' THEN 'lotus'
          WHEN 'vivid' THEN 'vivid'
          WHEN 'newyear' THEN 'newyear'
          WHEN 'soe' THEN 'soe'
          WHEN 'ink' THEN 'ink'
          WHEN 'fashion' THEN 'fashion'
          WHEN 'china' THEN 'china'
          WHEN 'youth' THEN 'youth'
          WHEN 'blue' THEN 'jingtai'
          WHEN 'light' THEN 'jingtai'
          WHEN 'white' THEN 'jingtai'
          WHEN 'red' THEN 'vivid'
          WHEN 'orange' THEN 'vivid'
          WHEN 'green' THEN 'lotus'
          WHEN 'cyan' THEN 'fashion'
          WHEN 'purple' THEN 'fashion'
          WHEN 'dark' THEN 'ink'
          ELSE 'jingtai'
        END,
        layout, login_required, login_message, status, created_at, updated_at
      FROM portals;

      DROP TABLE portals;
      ALTER TABLE portals_v3 RENAME TO portals;
    `);
  });

  applyMigrationWithForeignKeysOff(13, () => {
    db.exec(`
      CREATE TABLE sites_v13 (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (${siteKindCheck()})),
        root_path TEXT NOT NULL,
        entry_file TEXT NOT NULL DEFAULT 'index.html',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        file_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        folder_id TEXT,
        visit_count INTEGER NOT NULL DEFAULT 0,
        last_visited_at TEXT,
        access_days INTEGER NOT NULL DEFAULT 365
      );

      INSERT INTO sites_v13 (
        id, original_name, kind, root_path, entry_file, size_bytes, file_count,
        created_at, updated_at, folder_id, visit_count, last_visited_at, access_days
      )
      SELECT
        id, original_name, kind, root_path, entry_file, size_bytes, file_count,
        created_at, updated_at, folder_id, visit_count, last_visited_at, access_days
      FROM sites;

      DROP TABLE sites;
      ALTER TABLE sites_v13 RENAME TO sites;
      CREATE INDEX IF NOT EXISTS idx_sites_folder_id ON sites(folder_id);
    `);
  });

  applyMigrationWithForeignKeysOff(14, () => {
    db.exec(`
      CREATE TABLE sites_v14 (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN (${siteKindCheck()})),
        root_path TEXT NOT NULL,
        entry_file TEXT NOT NULL DEFAULT 'index.html',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        file_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        folder_id TEXT,
        visit_count INTEGER NOT NULL DEFAULT 0,
        last_visited_at TEXT,
        access_days INTEGER NOT NULL DEFAULT 365
      );

      INSERT INTO sites_v14 (
        id, original_name, kind, root_path, entry_file, size_bytes, file_count,
        created_at, updated_at, folder_id, visit_count, last_visited_at, access_days
      )
      SELECT
        id, original_name, kind, root_path, entry_file, size_bytes, file_count,
        created_at, updated_at, folder_id, visit_count, last_visited_at, access_days
      FROM sites;

      DROP TABLE sites;
      ALTER TABLE sites_v14 RENAME TO sites;
      CREATE INDEX IF NOT EXISTS idx_sites_folder_id ON sites(folder_id);
    `);
  });
}

async function initDb() {
  await ensureDir(config.dataDir);
  await ensureDir(config.uploadsDir);
  await ensureDir(config.sitesDir);
  await ensureDir(config.logoDir);
  await ensureDir(config.navIconDir);

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations();

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('数据库尚未初始化');
  }
  return db;
}

module.exports = {
  initDb,
  getDb
};
