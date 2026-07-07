const TOKEN_KEY = 'milu:auth:token:v1';

function apiUrl(pathname) {
    const pathnameCurrent = String(window.location.pathname || '/');
    const basePath = /^\/milu(\/|$)/i.test(pathnameCurrent) ? '/milu' : '';
    return `${basePath}${pathname}`;
}

function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchProjectApi(pathname, options = {}) {
    const response = await fetch(apiUrl(pathname), {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
}

export async function listProjects() {
    const data = await fetchProjectApi('/api/projects');
    return Array.isArray(data.projects) ? data.projects : [];
}

export async function createProject(input) {
    const data = await fetchProjectApi('/api/projects', {
        method: 'POST',
        body: JSON.stringify(input)
    });

    return data.project;
}

export async function deleteProject(projectId) {
    const data = await fetchProjectApi(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE'
    });

    return data.project;
}
