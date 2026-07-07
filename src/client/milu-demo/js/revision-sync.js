const REVISION_SYNC_STORAGE_KEY = 'milu:revision-sync:v1';

export function publishRevisionSync(payload = {}) {
    try {
        const message = {
            id: String(payload?.id || '').trim(),
            engineFile: String(payload?.engineFile || '').trim(),
            estado: payload?.estado,
            accion: payload?.accion,
            source: String(payload?.source || '').trim(),
            ts: Date.now(),
            nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        };
        if (!message.id) return;
        window.localStorage.setItem(REVISION_SYNC_STORAGE_KEY, JSON.stringify(message));
    } catch (_) {
        // Ignore storage errors to avoid blocking the main flow.
    }
}

export function subscribeRevisionSync(onMessage) {
    if (typeof onMessage !== 'function') return () => { };

    const handler = (event) => {
        if (event.key !== REVISION_SYNC_STORAGE_KEY || !event.newValue) return;
        try {
            const message = JSON.parse(event.newValue);
            onMessage(message);
        } catch (_) {
            // Ignore malformed payloads.
        }
    };

    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
}
