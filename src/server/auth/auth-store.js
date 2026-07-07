'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function writeJsonAtomic(filePath, value) {
    ensureDataDir();
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);
}

function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeDisplayName(value) {
    return String(value || '').trim().slice(0, 80);
}

function nowIso() {
    return new Date().toISOString();
}

function randomHex(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(
        String(password || ''),
        salt,
        PBKDF2_ITERATIONS,
        PBKDF2_KEYLEN,
        PBKDF2_DIGEST
    ).toString('hex');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function safeEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    if (left.length !== right.length || left.length === 0) return false;
    return crypto.timingSafeEqual(left, right);
}

function emptyStore() {
    return {
        version: 1,
        users: [],
        sessions: []
    };
}

function readStore() {
    const store = readJsonFile(USERS_FILE, emptyStore());
    return {
        version: 1,
        users: Array.isArray(store.users) ? store.users : [],
        sessions: Array.isArray(store.sessions) ? store.sessions : []
    };
}

function getAuthStatus() {
    const store = readStore();
    pruneExpiredSessions(store);
    return {
        hasUsers: store.users.length > 0
    };
}

function writeStore(store) {
    writeJsonAtomic(USERS_FILE, {
        version: 1,
        users: Array.isArray(store.users) ? store.users : [],
        sessions: Array.isArray(store.sessions) ? store.sessions : []
    });
}

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName || '',
        roles: Array.isArray(user.roles) ? user.roles : [],
        projectIds: Array.isArray(user.projectIds) ? user.projectIds : [],
        createdAt: user.createdAt || ''
    };
}

function pruneExpiredSessions(store) {
    const now = Date.now();
    store.sessions = store.sessions.filter((session) => {
        const expiresAt = Date.parse(session.expiresAt || '');
        return Number.isFinite(expiresAt) && expiresAt > now;
    });
}

function validateRegistration({ username, password }) {
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
        return 'El usuario debe tener 3-40 caracteres: letras, numeros, punto, guion o guion bajo.';
    }
    if (String(password || '').length < 8) {
        return 'La contrasena debe tener al menos 8 caracteres.';
    }
    return '';
}

function registerUser({ username, displayName, password }) {
    const cleanUsername = normalizeUsername(username);
    const validationError = validateRegistration({ username: cleanUsername, password });
    if (validationError) {
        const error = new Error(validationError);
        error.status = 400;
        throw error;
    }

    const store = readStore();
    pruneExpiredSessions(store);

    if (store.users.some((user) => normalizeUsername(user.username) === cleanUsername)) {
        const error = new Error('Este usuario ya existe.');
        error.status = 409;
        throw error;
    }

    const isFirstUser = store.users.length === 0;
    const salt = randomHex(16);
    const user = {
        id: randomHex(16),
        username: cleanUsername,
        displayName: normalizeDisplayName(displayName),
        passwordSalt: salt,
        passwordHash: hashPassword(password, salt),
        roles: isFirstUser ? ['admin'] : ['user'],
        projectIds: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
    };

    store.users.push(user);
    writeStore(store);
    return publicUser(user);
}

function createSession(store, user) {
    const token = randomHex(32);
    const createdAtMs = Date.now();
    const session = {
        id: randomHex(16),
        userId: user.id,
        tokenHash: hashToken(token),
        createdAt: new Date(createdAtMs).toISOString(),
        expiresAt: new Date(createdAtMs + SESSION_TTL_MS).toISOString()
    };
    store.sessions.push(session);
    return { token, session };
}

function loginUser({ username, password }) {
    const cleanUsername = normalizeUsername(username);
    const store = readStore();
    pruneExpiredSessions(store);

    const user = store.users.find((entry) => normalizeUsername(entry.username) === cleanUsername);
    const attemptedHash = user ? hashPassword(password, user.passwordSalt) : '';
    if (!user || !safeEqual(attemptedHash, user.passwordHash)) {
        const error = new Error('Usuario o contrasena incorrectos.');
        error.status = 401;
        throw error;
    }

    const { token } = createSession(store, user);
    writeStore(store);
    return { token, user: publicUser(user) };
}

function findSessionByToken(token) {
    const store = readStore();
    pruneExpiredSessions(store);
    const tokenHash = hashToken(token);
    const session = store.sessions.find((entry) => entry.tokenHash === tokenHash);
    if (!session) {
        writeStore(store);
        return null;
    }

    const user = store.users.find((entry) => entry.id === session.userId);
    if (!user) return null;
    writeStore(store);
    return { session, user: publicUser(user) };
}

function logoutToken(token) {
    const store = readStore();
    const tokenHash = hashToken(token);
    const before = store.sessions.length;
    store.sessions = store.sessions.filter((session) => session.tokenHash !== tokenHash);
    if (store.sessions.length !== before) writeStore(store);
}

function listUsers() {
    const store = readStore();
    return store.users.map(publicUser);
}

function assignProjectToUser({ userId, projectId }) {
    const store = readStore();
    const user = store.users.find((entry) => entry.id === String(userId || '').trim());

    if (!user) {
        const error = new Error('Usuario no encontrado.');
        error.status = 404;
        throw error;
    }

    const cleanProjectId = String(projectId || '').trim();
    user.projectIds = Array.isArray(user.projectIds) ? user.projectIds : [];

    if (!user.projectIds.includes(cleanProjectId)) {
        user.projectIds.push(cleanProjectId);
        user.updatedAt = nowIso();
        writeStore(store);
    }

    return publicUser(user);
}

function removeProjectFromUsers(projectId) {
    const cleanProjectId = String(projectId || '').trim();
    if (!cleanProjectId) return;

    const store = readStore();
    let changed = false;

    store.users.forEach((user) => {
        if (!Array.isArray(user.projectIds) || !user.projectIds.includes(cleanProjectId)) return;

        user.projectIds = user.projectIds.filter((id) => id !== cleanProjectId);
        user.updatedAt = nowIso();
        changed = true;
    });

    if (changed) writeStore(store);
}

module.exports = {
    assignProjectToUser,
    findSessionByToken,
    getAuthStatus,
    listUsers,
    loginUser,
    logoutToken,
    removeProjectFromUsers,
    registerUser
};
