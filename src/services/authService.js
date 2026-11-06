const crypto = require('crypto');
const { promisify } = require('util');
const { getDb } = require('../db');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'static_html_host_session';
const SESSION_DAYS = 7;
const PASSWORD_PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 };

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  return crypto.randomUUID();
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeUsername(username) {
  return String(username || '').trim();
}

function validateUsername(username) {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3 || normalized.length > 32) {
    throw new Error('用户名长度需为 3-32 个字符');
  }
  if (!/^[\p{L}\p{N}_.-]+$/u.test(normalized)) {
    throw new Error('用户名只能包含文字、数字、下划线、点或短横线');
  }
  return normalized;
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 6) {
    throw new Error('密码至少需要 6 个字符');
  }
  if (value.length > 128) {
    throw new Error('密码不能超过 128 个字符');
  }
  return value;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derivedKey = await scrypt(password, salt, PASSWORD_PARAMS.keyLength, {
    N: PASSWORD_PARAMS.N,
    r: PASSWORD_PARAMS.r,
    p: PASSWORD_PARAMS.p
  });
  return `scrypt$${PASSWORD_PARAMS.N}$${PASSWORD_PARAMS.r}$${PASSWORD_PARAMS.p}$${salt}$${derivedKey.toString('base64url')}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, n, r, p, salt, expected] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;

  const expectedBuffer = Buffer.from(expected, 'base64url');
  const actualBuffer = await scrypt(password, salt, expectedBuffer.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });

  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function countUsers() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

function countApprovedAdmins(excludeUserId) {
  if (excludeUserId) {
    return getDb().prepare(`
      SELECT COUNT(*) AS count FROM users
      WHERE role = 'admin' AND status = 'approved' AND id != ?
    `).get(excludeUserId).count;
  }

  return getDb().prepare(`
    SELECT COUNT(*) AS count FROM users
    WHERE role = 'admin' AND status = 'approved'
  `).get().count;
}

function getUserByUsername(username) {
  return getDb().prepare(`
    SELECT id, username, password_hash AS passwordHash, role, status, created_at AS createdAt,
      updated_at AS updatedAt, approved_at AS approvedAt, approved_by AS approvedBy
    FROM users
    WHERE username = ? COLLATE NOCASE
  `).get(username);
}

function getUserById(id) {
  return getDb().prepare(`
    SELECT id, username, role, status, created_at AS createdAt,
      updated_at AS updatedAt, approved_at AS approvedAt, approved_by AS approvedBy
    FROM users
    WHERE id = ?
  `).get(id);
}

async function createUserByAdmin({ username, password, role, adminId }) {
  const normalizedUsername = validateUsername(username);
  const normalizedPassword = validatePassword(password);
  const passwordHash = await hashPassword(normalizedPassword);
  const timestamp = nowIso();
  const user = {
    id: randomId(),
    username: normalizedUsername,
    passwordHash,
    role: role === 'admin' ? 'admin' : 'user',
    status: 'approved',
    createdAt: timestamp,
    updatedAt: timestamp,
    approvedAt: timestamp,
    approvedBy: adminId || null
  };

  try {
    getDb().prepare(`
      INSERT INTO users (
        id, username, password_hash, role, status,
        created_at, updated_at, approved_at, approved_by
      ) VALUES (
        @id, @username, @passwordHash, @role, @status,
        @createdAt, @updatedAt, @approvedAt, @approvedBy
      )
    `).run(user);
    return getUserById(user.id);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('用户名已存在');
    }
    throw error;
  }
}

async function registerUser({ username, password }) {
  const normalizedUsername = validateUsername(username);
  const normalizedPassword = validatePassword(password);
  const passwordHash = await hashPassword(normalizedPassword);
  const timestamp = nowIso();

  const transaction = getDb().transaction(() => {
    const isFirstUser = countUsers() === 0;
    const user = {
      id: randomId(),
      username: normalizedUsername,
      passwordHash,
      role: isFirstUser ? 'admin' : 'user',
      status: isFirstUser ? 'approved' : 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      approvedAt: isFirstUser ? timestamp : null,
      approvedBy: null
    };

    getDb().prepare(`
      INSERT INTO users (
        id, username, password_hash, role, status,
        created_at, updated_at, approved_at, approved_by
      ) VALUES (
        @id, @username, @passwordHash, @role, @status,
        @createdAt, @updatedAt, @approvedAt, @approvedBy
      )
    `).run(user);

    return getUserById(user.id);
  });

  try {
    return transaction();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('用户名已存在');
    }
    throw error;
  }
}

async function authenticateUser(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const user = getUserByUsername(normalizedUsername);
  if (!user) {
    throw new Error('用户名或密码错误');
  }

  const ok = await verifyPassword(String(password || ''), user.passwordHash);
  if (!ok) {
    throw new Error('用户名或密码错误');
  }

  if (user.status === 'pending') {
    throw new Error('账户正在等待管理员审批');
  }
  if (user.status === 'rejected') {
    throw new Error('账户注册申请已被拒绝');
  }
  if (user.status === 'disabled') {
    throw new Error('账户已被禁用');
  }

  return getUserById(user.id);
}

function createSession(userId) {
  const token = randomToken();
  const csrfToken = randomToken(24);
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  getDb().prepare(`
    INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, expires_at, last_seen_at)
    VALUES (@id, @userId, @tokenHash, @csrfToken, @createdAt, @expiresAt, @lastSeenAt)
  `).run({
    id: randomId(),
    userId,
    tokenHash: hashToken(token),
    csrfToken,
    createdAt: timestamp,
    expiresAt,
    lastSeenAt: timestamp
  });

  return { token, csrfToken, expiresAt };
}

function getSessionByToken(token) {
  if (!token) return null;

  const session = getDb().prepare(`
    SELECT
      sessions.id,
      sessions.user_id AS userId,
      sessions.csrf_token AS csrfToken,
      sessions.expires_at AS expiresAt,
      users.username,
      users.role,
      users.status
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).get(hashToken(token));

  if (!session) return null;

  if (new Date(session.expiresAt).getTime() <= Date.now() || session.status !== 'approved') {
    deleteSession(token);
    return null;
  }

  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), session.id);

  return {
    id: session.id,
    csrfToken: session.csrfToken,
    user: {
      id: session.userId,
      username: session.username,
      role: session.role,
      status: session.status
    }
  };
}

function deleteSession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

function listUsers() {
  return getDb().prepare(`
    SELECT id, username, role, status, created_at AS createdAt,
      updated_at AS updatedAt, approved_at AS approvedAt, approved_by AS approvedBy
    FROM users
    ORDER BY created_at ASC
  `).all();
}

function approveUser(userId, adminId) {
  const timestamp = nowIso();
  getDb().prepare(`
    UPDATE users
    SET status = 'approved', updated_at = ?, approved_at = ?, approved_by = ?
    WHERE id = ? AND status != 'approved'
  `).run(timestamp, timestamp, adminId, userId);
}

function rejectUser(userId, adminId) {
  if (userId === adminId) {
    throw new Error('不能拒绝自己的账户');
  }
  const user = getUserById(userId);
  if (user?.role === 'admin' && countApprovedAdmins(userId) === 0) {
    throw new Error('不能拒绝最后一个管理员');
  }
  getDb().prepare(`
    UPDATE users
    SET status = 'rejected', updated_at = ?, approved_by = ?
    WHERE id = ?
  `).run(nowIso(), adminId, userId);
}

function disableUser(userId, adminId) {
  if (userId === adminId) {
    throw new Error('不能禁用自己的账户');
  }
  const user = getUserById(userId);
  if (user?.role === 'admin' && countApprovedAdmins(userId) === 0) {
    throw new Error('不能禁用最后一个管理员');
  }
  const run = getDb().transaction(() => {
    getDb().prepare(`
      UPDATE users
      SET status = 'disabled', updated_at = ?, approved_by = ?
      WHERE id = ?
    `).run(nowIso(), adminId, userId);
    getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  });
  run();
}

module.exports = {
  SESSION_COOKIE,
  SESSION_DAYS,
  countUsers,
  registerUser,
  createUserByAdmin,
  authenticateUser,
  createSession,
  getSessionByToken,
  deleteSession,
  listUsers,
  approveUser,
  rejectUser,
  disableUser
};
