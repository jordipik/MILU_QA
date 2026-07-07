/**
 * Reusable change-control module.
 *
 * Features:
 * - Command-based change tracking with undo/redo
 * - Audit log persisted in localStorage
 * - Optional DOM events for UI updates
 */

const DEFAULT_OPTIONS = {
    namespace: 'app',
    maxUndoEntries: 100,
    maxAuditEntries: 1000,
    storage: typeof window !== 'undefined' ? window.localStorage : null,
    eventTarget: typeof document !== 'undefined' ? document : null,
    eventPrefix: 'change-control',
    onAuditEntry: null
};

function toSafeInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function nowIso() {
    return new Date().toISOString();
}

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeJsonParse(text, fallback) {
    try {
        const parsed = JSON.parse(text);
        return parsed == null ? fallback : parsed;
    } catch (_) {
        return fallback;
    }
}

export function createChangeControl(options = {}) {
    const config = {
        ...DEFAULT_OPTIONS,
        ...options,
        maxUndoEntries: toSafeInt(options.maxUndoEntries, DEFAULT_OPTIONS.maxUndoEntries),
        maxAuditEntries: toSafeInt(options.maxAuditEntries, DEFAULT_OPTIONS.maxAuditEntries)
    };

    const auditStorageKey = `${config.namespace}:audit:v1`;

    const handlersByType = new Map();
    const undoStack = [];
    const redoStack = [];

    function emit(eventName, detail = {}) {
        if (!config.eventTarget || typeof config.eventTarget.dispatchEvent !== 'function') return;
        config.eventTarget.dispatchEvent(new CustomEvent(`${config.eventPrefix}:${eventName}`, {
            detail
        }));
    }

    function readAuditEntries() {
        if (!config.storage) return [];
        const raw = config.storage.getItem(auditStorageKey);
        if (!raw) return [];
        const parsed = safeJsonParse(raw, []);
        return Array.isArray(parsed) ? parsed : [];
    }

    function writeAuditEntries(entries) {
        if (!config.storage) return;
        const capped = entries.slice(-config.maxAuditEntries);
        config.storage.setItem(auditStorageKey, JSON.stringify(capped));
    }

    function pushAudit(entry) {
        const nextEntry = {
            id: uid(),
            timestamp: nowIso(),
            ...entry
        };
        const log = readAuditEntries();
        log.push(nextEntry);
        writeAuditEntries(log);
        emit('audit-recorded', { entry: nextEntry });

        if (typeof config.onAuditEntry === 'function') {
            Promise.resolve(config.onAuditEntry(nextEntry)).then((result) => {
                if (result === false) {
                    throw new Error('Audit sink returned false');
                }
            }).catch((error) => {
                const message = String(error?.message || error || 'Unknown audit sink error');
                console.warn('Change-control audit sink failed:', error);
                emit('audit-persist-failed', { entry: nextEntry, error: message });
            });
        }

        return nextEntry;
    }

    function getUndoState() {
        return {
            canUndo: undoStack.length > 0,
            canRedo: redoStack.length > 0,
            undoCount: undoStack.length,
            redoCount: redoStack.length
        };
    }

    function capUndoStack() {
        if (undoStack.length > config.maxUndoEntries) {
            undoStack.splice(0, undoStack.length - config.maxUndoEntries);
        }
    }

    function assertTypeRegistered(type) {
        if (!handlersByType.has(type)) {
            throw new Error(`Change type not registered: ${type}`);
        }
        return handlersByType.get(type);
    }

    function registerType(type, handlers = {}) {
        const normalizedType = String(type || '').trim();
        if (!normalizedType) throw new Error('Type is required');
        if (typeof handlers.apply !== 'function' || typeof handlers.revert !== 'function') {
            throw new Error(`Type ${normalizedType} must provide apply and revert handlers`);
        }
        handlersByType.set(normalizedType, handlers);
    }

    async function applyAndRecord(change = {}) {
        const type = String(change.type || '').trim();
        if (!type) throw new Error('Change type is required');

        const handlers = assertTypeRegistered(type);
        const entry = {
            id: uid(),
            type,
            module: String(change.module || '').trim(),
            action: String(change.action || '').trim(),
            description: String(change.description || '').trim(),
            target: change.target || {},
            data: change.data || {},
            createdAt: nowIso()
        };

        await handlers.apply(entry);

        undoStack.push(entry);
        capUndoStack();
        redoStack.length = 0;

        pushAudit({
            kind: 'change-applied',
            type,
            module: entry.module,
            action: entry.action,
            description: entry.description,
            target: entry.target,
            changeId: entry.id,
            data: entry.data
        });

        emit('history-updated', getUndoState());
        return entry;
    }

    async function undoLast() {
        if (undoStack.length === 0) return null;

        const entry = undoStack.pop();
        const handlers = assertTypeRegistered(entry.type);
        await handlers.revert(entry);
        redoStack.push(entry);

        pushAudit({
            kind: 'undo',
            type: entry.type,
            module: entry.module,
            action: entry.action,
            description: entry.description,
            target: entry.target,
            changeId: entry.id,
            data: entry.data
        });

        emit('history-updated', getUndoState());
        return entry;
    }

    async function redoLast() {
        if (redoStack.length === 0) return null;

        const entry = redoStack.pop();
        const handlers = assertTypeRegistered(entry.type);
        await handlers.apply(entry);
        undoStack.push(entry);
        capUndoStack();

        pushAudit({
            kind: 'redo',
            type: entry.type,
            module: entry.module,
            action: entry.action,
            description: entry.description,
            target: entry.target,
            changeId: entry.id,
            data: entry.data
        });

        emit('history-updated', getUndoState());
        return entry;
    }

    function listAudit(filters = {}) {
        const entries = readAuditEntries();
        if (!filters || !Object.keys(filters).length) return entries;

        return entries.filter((entry) => {
            if (filters.kind && entry.kind !== filters.kind) return false;
            if (filters.type && entry.type !== filters.type) return false;
            if (filters.module && entry.module !== filters.module) return false;
            if (filters.action && entry.action !== filters.action) return false;
            if (filters.startDate && new Date(entry.timestamp) < new Date(filters.startDate)) return false;
            if (filters.endDate && new Date(entry.timestamp) > new Date(filters.endDate)) return false;
            return true;
        });
    }

    function clearAudit() {
        if (config.storage) {
            config.storage.removeItem(auditStorageKey);
        }
        emit('audit-cleared', {});
    }

    function exportAudit(format = 'json') {
        const entries = readAuditEntries();
        if (format === 'csv') {
            const headers = [
                'id', 'timestamp', 'kind', 'type', 'module', 'action', 'description', 'target', 'changeId'
            ];
            const rows = entries.map((entry) => {
                return [
                    entry.id,
                    entry.timestamp,
                    entry.kind,
                    entry.type,
                    entry.module,
                    entry.action,
                    entry.description,
                    JSON.stringify(entry.target || {}),
                    entry.changeId
                ].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',');
            });
            return [headers.join(','), ...rows].join('\n');
        }
        return JSON.stringify(entries, null, 2);
    }

    return {
        registerType,
        applyAndRecord,
        undoLast,
        redoLast,
        getUndoState,
        listAudit,
        clearAudit,
        exportAudit,
        pushAudit
    };
}
