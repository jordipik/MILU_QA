'use strict';

const fs = require('node:fs');
const path = require('node:path');

const WORKSPACES_DIR = path.join(__dirname, 'data', 'workspaces');

function cleanProjectId(projectId) {
    return String(projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function workspacePath(projectId) {
    const cleanId = cleanProjectId(projectId);
    if (!cleanId) {
        const error = new Error('Proyecto no valido.');
        error.status = 400;
        throw error;
    }

    return path.join(WORKSPACES_DIR, `${cleanId}.json`);
}

function ensureWorkspaceDir() {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

function normalizeRow(row, index) {
    const geometry = row?.geometry && typeof row.geometry === 'object' ? row.geometry : {};
    const cells = row?.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) ? row.cells : {};
    const cellGeometry = row?.cellGeometry && typeof row.cellGeometry === 'object' && !Array.isArray(row.cellGeometry)
        ? row.cellGeometry
        : {};
    const wordpressMatch = row?.wordpressMatch && typeof row.wordpressMatch === 'object' && !Array.isArray(row.wordpressMatch)
        ? row.wordpressMatch
        : null;

    return {
        id: String(row?.id || `row-${index + 1}`).slice(0, 80),
        page: String(row?.page || ''),
        pos: String(row?.pos || ''),
        partNo: String(row?.partNo || ''),
        designation: String(row?.designation || ''),
        modelType: String(row?.modelType || ''),
        qty: String(row?.qty || ''),
        units: String(row?.units || ''),
        weight: String(row?.weight || ''),
        fn: String(row?.fn || ''),
        measurement: String(row?.measurement || ''),
        standard: String(row?.standard || ''),
        cells: Object.fromEntries(Object.entries(cells).map(([key, value]) => [
            String(key).slice(0, 60),
            String(value || '').slice(0, 1000)
        ])),
        cellGeometry: Object.fromEntries(Object.entries(cellGeometry).map(([key, value]) => {
            const cell = value && typeof value === 'object' ? value : {};
            return [
                String(key).slice(0, 60),
                {
                    page: Number(cell.page || row?.page || 0),
                    x1: Number(cell.x1 || 0),
                    x2: Number(cell.x2 || 0),
                    y1: Number(cell.y1 || 0),
                    y2: Number(cell.y2 || 0),
                    pageWidth: Number(cell.pageWidth || geometry.pageWidth || 0),
                    pageHeight: Number(cell.pageHeight || geometry.pageHeight || 0)
                }
            ];
        })),
        status: String(row?.status || 'Pendiente').slice(0, 40),
        edited: Boolean(row?.edited),
        wordpressMatch: wordpressMatch ? {
            checked: Boolean(wordpressMatch.checked),
            exists: Boolean(wordpressMatch.exists),
            partNumber: String(wordpressMatch.partNumber || '').slice(0, 120),
            source: String(wordpressMatch.source || '').slice(0, 160),
            checkedAt: String(wordpressMatch.checkedAt || '').slice(0, 40),
            matches: Array.isArray(wordpressMatch.matches)
                ? wordpressMatch.matches.slice(0, 5).map((match) => ({
                    id: String(match?.id || '').slice(0, 80),
                    title: String(match?.title || '').slice(0, 180),
                    url: String(match?.url || '').slice(0, 500)
                }))
                : []
        } : null,
        geometry: {
            page: Number(geometry.page || row?.page || 0),
            y1: Number(geometry.y1 || 0),
            y2: Number(geometry.y2 || 0),
            pageWidth: Number(geometry.pageWidth || 0),
            pageHeight: Number(geometry.pageHeight || 0)
        }
    };
}

function normalizeColumns(value) {
    if (!Array.isArray(value)) return [];

    return value
        .map((column, index) => ({
            key: String(column?.key || `col_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60),
            label: String(column?.label || column?.key || `Columna ${index + 1}`).slice(0, 120)
        }))
        .filter((column) => column.key && column.label)
        .slice(0, 40);
}

function normalizeHeaderLabels(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(Object.entries(value).map(([key, label]) => [
        String(key).slice(0, 40),
        String(label || '').slice(0, 80)
    ]));
}

function emptyWorkspace(projectId) {
    return {
        version: 1,
        projectId: cleanProjectId(projectId),
        fileName: '',
        pageCount: 0,
        headerLabels: {},
        columns: [],
        rows: [],
        updatedAt: null
    };
}

function readProjectWorkspace(projectId) {
    const fallback = emptyWorkspace(projectId);
    const filePath = workspacePath(projectId);

    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = raw ? JSON.parse(raw) : fallback;

        return {
            version: 1,
            projectId: cleanProjectId(projectId),
            fileName: String(parsed?.fileName || '').slice(0, 180),
            pageCount: Number(parsed?.pageCount || 0),
            headerLabels: normalizeHeaderLabels(parsed?.headerLabels),
            columns: normalizeColumns(parsed?.columns),
            rows: Array.isArray(parsed?.rows) ? parsed.rows.map(normalizeRow) : [],
            updatedAt: parsed?.updatedAt || null
        };
    } catch (_) {
        return fallback;
    }
}

function saveProjectWorkspace(projectId, input) {
    ensureWorkspaceDir();

    const workspace = {
        version: 1,
        projectId: cleanProjectId(projectId),
        fileName: String(input?.fileName || '').slice(0, 180),
        pageCount: Number(input?.pageCount || 0),
        headerLabels: normalizeHeaderLabels(input?.headerLabels),
        columns: normalizeColumns(input?.columns),
        rows: Array.isArray(input?.rows) ? input.rows.map(normalizeRow) : [],
        updatedAt: new Date().toISOString()
    };

    const filePath = workspacePath(projectId);
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8');
    fs.renameSync(tmpPath, filePath);

    return workspace;
}

module.exports = {
    readProjectWorkspace,
    saveProjectWorkspace
};
