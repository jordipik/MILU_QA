'use strict';

const express = require('express');
const {
    findSessionByToken,
    getAuthStatus,
    loginUser,
    logoutToken,
    registerUser
} = require('./auth-store');

const router = express.Router();

function bearerToken(req) {
    const header = String(req.headers.authorization || '').trim();
    if (!header.toLowerCase().startsWith('bearer ')) return '';
    return header.slice(7).trim();
}

function sendAuthError(res, error) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
        ok: false,
        error: String(error?.message || 'Error de autenticacion')
    });
}

function requireAuth(req, res, next) {
    const token = bearerToken(req);
    if (!token) {
        return res.status(401).json({ ok: false, error: 'Sesion no iniciada.' });
    }

    const auth = findSessionByToken(token);
    if (!auth) {
        return res.status(401).json({ ok: false, error: 'Sesion caducada o invalida.' });
    }

    req.auth = auth;
    return next();
}

router.get('/status', (_req, res) => {
    return res.json({ ok: true, ...getAuthStatus() });
});

router.post('/register', (req, res) => {
    try {
        const user = registerUser({
            username: req.body?.username,
            displayName: req.body?.displayName,
            password: req.body?.password
        });
        const session = loginUser({
            username: req.body?.username,
            password: req.body?.password
        });
        return res.status(201).json({ ok: true, token: session.token, user });
    } catch (error) {
        return sendAuthError(res, error);
    }
});

router.post('/login', (req, res) => {
    try {
        const session = loginUser({
            username: req.body?.username,
            password: req.body?.password
        });
        return res.json({ ok: true, token: session.token, user: session.user });
    } catch (error) {
        return sendAuthError(res, error);
    }
});

router.get('/me', requireAuth, (req, res) => {
    return res.json({ ok: true, user: req.auth.user });
});

router.post('/logout', (req, res) => {
    const token = bearerToken(req);
    if (token) logoutToken(token);
    return res.json({ ok: true });
});

module.exports = {
    authRouter: router,
    requireAuth
};
