'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

const DEFAULT_PROJECTS = [
    {
        id: 'milu-qa-demo',
        key: 'milu',
        name: 'MILU QA',
        description: 'Demo operativo de revision, productos, importaciones y control QA.',
        icon: 'M',
        requiredRole: 'admin',
        template: 'milu',
        builtIn: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
    }
];

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function nowIso() {
    return new Date().toISOString();
}

function randomId() {
    return crypto.randomBytes(12).toString('hex');
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
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

function normalizeProject(project) {
    return {
        id: String(project?.id || '').trim(),
        key: slugify(project?.key || project?.name || project?.id),
        name: String(project?.name || '').trim().slice(0, 80),
        description: String(project?.description || '').trim().slice(0, 180),
        icon: String(project?.icon || project?.name || 'P').trim().slice(0, 2).toUpperCase(),
        requiredRole: String(project?.requiredRole || '').trim(),
        template: String(project?.template || 'milu-project').trim() || 'milu-project',
        builtIn: Boolean(project?.builtIn),
        createdAt: String(project?.createdAt || nowIso()),
        updatedAt: String(project?.updatedAt || project?.createdAt || nowIso())
    };
}

function emptyStore() {
    return {
        version: 1,
        projects: DEFAULT_PROJECTS
    };
}

function readStore() {
    const store = readJsonFile(PROJECTS_FILE, emptyStore());
    const storedProjects = Array.isArray(store.projects) ? store.projects : [];
    const byId = new Map();

    [...DEFAULT_PROJECTS, ...storedProjects].forEach((project) => {
        const normalized = normalizeProject(project);
        if (normalized.id) byId.set(normalized.id, normalized);
    });

    return {
        version: 1,
        projects: [...byId.values()]
    };
}

function writeStore(store) {
    writeJsonAtomic(PROJECTS_FILE, {
        version: 1,
        projects: Array.isArray(store.projects) ? store.projects.map(normalizeProject) : []
    });
}

function userRoles(user) {
    return Array.isArray(user?.roles) ? user.roles : [];
}

function userProjectIds(user) {
    return Array.isArray(user?.projectIds) ? user.projectIds : [];
}

function isAdmin(user) {
    return userRoles(user).includes('admin');
}

function canAccessProject(user, project) {
    const roles = userRoles(user);

    if (isAdmin(user)) return true;
    if (project.requiredRole && roles.includes(project.requiredRole)) return true;

    return userProjectIds(user).includes(project.id);
}

function listProjects(user) {
    const store = readStore();
    return store.projects.filter((project) => canAccessProject(user, project));
}

function getProjectById(projectId) {
    const store = readStore();
    return store.projects.find((project) => project.id === String(projectId || '').trim()) || null;
}

function validateProjectInput(input) {
    const name = String(input?.name || '').trim();
    const key = slugify(input?.key || name);
    const description = String(input?.description || '').trim();

    if (name.length < 2 || name.length > 80) {
        return 'El nombre debe tener entre 2 y 80 caracteres.';
    }

    if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(key)) {
        return 'La clave debe tener 2-48 caracteres: letras, numeros y guiones.';
    }

    if (description.length > 180) {
        return 'La descripcion no puede superar 180 caracteres.';
    }

    return '';
}

function createProject(user, input) {
    if (!isAdmin(user)) {
        const error = new Error('Solo un administrador puede crear proyectos.');
        error.status = 403;
        throw error;
    }

    const validationError = validateProjectInput(input);
    if (validationError) {
        const error = new Error(validationError);
        error.status = 400;
        throw error;
    }

    const store = readStore();
    const key = slugify(input?.key || input?.name);

    if (store.projects.some((project) => project.key === key)) {
        const error = new Error('Ya existe un proyecto con esa clave.');
        error.status = 409;
        throw error;
    }

    const createdAt = nowIso();
    const project = normalizeProject({
        id: `project-${randomId()}`,
        key,
        name: input.name,
        description: input.description || 'Nuevo espacio de trabajo.',
        icon: input.icon || input.name,
        requiredRole: 'admin',
        template: 'milu-project',
        builtIn: false,
        createdAt,
        updatedAt: createdAt
    });

    store.projects.push(project);
    writeStore(store);

    return project;
}

function deleteProject(user, projectId) {
    if (!isAdmin(user)) {
        const error = new Error('Solo un administrador puede borrar proyectos.');
        error.status = 403;
        throw error;
    }

    const cleanProjectId = String(projectId || '').trim();
    const store = readStore();
    const project = store.projects.find((entry) => entry.id === cleanProjectId);

    if (!project) {
        const error = new Error('Proyecto no encontrado.');
        error.status = 404;
        throw error;
    }

    if (project.builtIn) {
        const error = new Error('Este proyecto base no se puede borrar.');
        error.status = 400;
        throw error;
    }

    store.projects = store.projects.filter((entry) => entry.id !== cleanProjectId);
    writeStore(store);

    return project;
}

module.exports = {
    canAccessProject,
    createProject,
    deleteProject,
    getProjectById,
    listProjects
};
