import { showAlentioSplash } from '../splash/splash-ui.js';
import { getSelectedProject, showProjectGate } from '../projects/project-gate.js';
import { mountProjectHeaderActions } from '../projects/project-header-actions.js';
import { mountProjectWorkspace } from '../projects/project-workspace.js';

const TOKEN_KEY = 'milu:auth:token:v1';
const AUTH_TEMPLATE_URL = new URL('./auth-ui.html', import.meta.url).href;

let authTemplatePromise = null;

function apiUrl(pathname) {
    const pathnameCurrent = String(window.location.pathname || '/');
    const basePath = /^\/milu(\/|$)/i.test(pathnameCurrent) ? '/milu' : '';
    return `${basePath}${pathname}`;
}

function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAuth(pathname, options = {}) {
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

function ensureAuthStylesheet() {
    if (document.getElementById('miluAuthStyles')) return;

    const link = document.createElement('link');
    link.id = 'miluAuthStyles';
    link.rel = 'stylesheet';
    link.href = new URL('./auth-ui.css', import.meta.url).href;

    document.head.appendChild(link);
}

function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
}

function releaseAuthPendingView() {
    document.documentElement.classList.remove('milu-auth-pending');
}

async function enterAuthenticatedProject(user) {
    renderTopbarSession(user);

    const selectedProject = await getSelectedProject(user);
    if (selectedProject) {
        await mountProjectWorkspace(selectedProject, user);
        mountProjectHeaderActions(selectedProject);
        releaseAuthPendingView();
        return user;
    }

    const project = await showProjectGate(user);
    await mountProjectWorkspace(project, user);
    mountProjectHeaderActions(project);
    releaseAuthPendingView();
    return user;
}

async function loadAuthTemplate() {
    if (!authTemplatePromise) {
        authTemplatePromise = fetch(AUTH_TEMPLATE_URL).then(async (response) => {
            if (!response.ok) {
                throw new Error(`No se pudo cargar auth-ui.html (${response.status})`);
            }

            const html = await response.text();

            const holder = document.createElement('div');
            holder.innerHTML = html;

            return holder;
        });
    }

    return authTemplatePromise;
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderTopbarSession(user) {
    const wrap = document.querySelector('.backend-status-wrap');

    if (!wrap || document.getElementById('miluAuthUser')) return;

    const roles = Array.isArray(user.roles) ? user.roles.join(', ') : '';
    const username = escapeHtml(user.displayName || user.username || 'Usuario');

    const node = document.createElement('div');
    node.id = 'miluAuthUser';
    node.className = 'milu-auth-user';

    node.innerHTML = `
        <span title="${escapeHtml(roles)}">${username}</span>
        <button class="milu-auth-logout" type="button">Salir</button>
    `;

    node.querySelector('button')?.addEventListener('click', async () => {
        try {
            await fetchAuth('/api/auth/logout', {
                method: 'POST',
                body: '{}'
            });
        } catch (_) {
            // Limpia la sesión local aunque el backend no responda.
        }

        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem('alentio:selected-project');

        const url = new URL(window.location.href);
        url.searchParams.delete('project');
        window.location.replace(url.href);
    });

    wrap.appendChild(node);
}

async function buildOverlay(mode) {
    const holder = await loadAuthTemplate();

    const templateId = mode === 'register'
        ? 'miluRegisterTemplate'
        : 'miluLoginTemplate';

    const template = holder.querySelector(`#${templateId}`);

    if (!template) {
        throw new Error(`No existe el template ${templateId} en auth-ui.html`);
    }

    return template.content.firstElementChild.cloneNode(true);
}

async function readCurrentUser() {
    if (!localStorage.getItem(TOKEN_KEY)) return null;

    try {
        const data = await fetchAuth('/api/auth/me');
        return data.user || null;
    } catch (_) {
        localStorage.removeItem(TOKEN_KEY);
        return null;
    }
}

async function readAuthStatus() {
    try {
        return await fetchAuth('/api/auth/status');
    } catch (_) {
        return { hasUsers: true };
    }
}

async function showAuthOverlay(initialMode = 'login') {
    document.body.classList.add('milu-auth-lock');

    return new Promise((resolve) => {
        let mode = initialMode;
        let overlay = null;

        const show = async () => {
            overlay?.remove();

            overlay = await buildOverlay(mode);
            document.body.appendChild(overlay);

            const form = overlay.querySelector('form');
            const errorNode = overlay.querySelector('.milu-auth-error');
            const switchButton = overlay.querySelector('.milu-auth-switch');
            const submitButton = overlay.querySelector('.milu-auth-submit');

            overlay.querySelector('input')?.focus();

            const setError = (message) => {
                if (errorNode) errorNode.textContent = message;
            };

            switchButton?.addEventListener('click', () => {
                mode = switchButton.dataset.authMode || (mode === 'login' ? 'register' : 'login');
                show();
            });

            form?.addEventListener('submit', async (event) => {
                event.preventDefault();

                setError('');

                const data = new FormData(form);

                const username = normalizeUsername(data.get('username'));
                const password = String(data.get('password') || '');
                const passwordConfirm = String(data.get('passwordConfirm') || '');
                const displayName = String(data.get('displayName') || '').trim();

                if (!username || !password) {
                    setError('Usuario y contraseña son obligatorios.');
                    return;
                }

                if (mode === 'register' && password.length < 8) {
                    setError('La contraseña debe tener mínimo 8 caracteres.');
                    return;
                }

                if (mode === 'register' && password !== passwordConfirm) {
                    setError('Las contraseñas no coinciden.');
                    return;
                }

                try {
                    if (submitButton) {
                        submitButton.disabled = true;
                        submitButton.classList.add('is-loading');
                        submitButton.textContent = mode === 'register'
                            ? 'Creando usuario'
                            : 'Entrando';
                    }

                    const endpoint = mode === 'register'
                        ? '/api/auth/register'
                        : '/api/auth/login';

                    const response = await fetchAuth(endpoint, {
                        method: 'POST',
                        body: JSON.stringify({
                            username,
                            password,
                            displayName
                        })
                    });

                    localStorage.setItem(TOKEN_KEY, response.token);

                    overlay?.remove();
                    document.body.classList.remove('milu-auth-lock');

                    const user = await enterAuthenticatedProject(response.user);
                    resolve(user);
                } catch (error) {
                    setError(error.message || 'No se pudo iniciar sesión.');

                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.classList.remove('is-loading');
                        submitButton.textContent = mode === 'register'
                            ? 'Registrarme'
                            : 'Entrar';
                    }
                }
            });
        };

        showAlentioSplash({
            beforeExit: () => show()
        }).catch(() => show());
    });
}

export async function requireServerAuth() {
    ensureAuthStylesheet();

    const currentUser = await readCurrentUser();

    if (currentUser) {
        return enterAuthenticatedProject(currentUser);
    }

    const status = await readAuthStatus();

    return showAuthOverlay(status.hasUsers ? 'login' : 'register');
}




