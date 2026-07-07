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

function ensureStylesheet() {
    if (document.getElementById('alentioProjectHeaderActionsStyles')) return;

    const link = document.createElement('link');
    link.id = 'alentioProjectHeaderActionsStyles';
    link.rel = 'stylesheet';
    link.href = new URL('./project-header-actions.css', import.meta.url).href;
    document.head.appendChild(link);
}

function cleanProjectUrlAndReload() {
    sessionStorage.removeItem('alentio:selected-project');

    const url = new URL(window.location.href);
    url.searchParams.delete('project');
    window.location.replace(url.href);
}

function userLabel(user) {
    return user.displayName || user.username || 'Usuario';
}

function createMembersPanel() {
    const panel = document.createElement('section');
    panel.className = 'project-members-popover';
    panel.dataset.projectMembersPopover = '';
    panel.hidden = true;
    panel.innerHTML = `
        <header>
            <div>
                <p>Proyecto</p>
                <h2>Miembros</h2>
            </div>
            <button type="button" aria-label="Cerrar miembros" data-project-members-close>x</button>
        </header>

        <div class="project-members-list" data-project-members-list></div>

        <form class="project-member-assign" data-project-member-assign-form>
            <label>
                <span>Asignar usuario registrado</span>
                <select data-project-member-select name="userId"></select>
            </label>

            <button type="submit" data-project-member-assign-submit>
                Asignar
            </button>
        </form>

        <p class="project-members-error" data-project-members-error aria-live="polite"></p>
    `;

    return panel;
}

function renderMembers({ members, assignableUsers }, panel) {
    const list = panel.querySelector('[data-project-members-list]');
    const select = panel.querySelector('[data-project-member-select]');
    const form = panel.querySelector('[data-project-member-assign-form]');

    if (list) {
        list.innerHTML = '';

        if (!members.length) {
            const empty = document.createElement('p');
            empty.className = 'project-members-empty';
            empty.textContent = 'Todavia no hay miembros asignados.';
            list.appendChild(empty);
        }

        members.forEach((member) => {
            const row = document.createElement('div');
            row.className = 'project-member-row';
            const roles = Array.isArray(member.roles) ? member.roles.join(', ') : '';

            row.innerHTML = `
                <div>
                    <strong></strong>
                    <span></span>
                </div>
                <em></em>
            `;

            row.querySelector('strong').textContent = userLabel(member);
            row.querySelector('span').textContent = member.username || '';
            row.querySelector('em').textContent = roles || 'user';
            list.appendChild(row);
        });
    }

    if (select) {
        select.innerHTML = '';

        assignableUsers.forEach((user) => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${userLabel(user)} (${user.username})`;
            select.appendChild(option);
        });
    }

    if (form) form.hidden = assignableUsers.length === 0;
}

async function loadMembers(project, panel) {
    const errorNode = panel.querySelector('[data-project-members-error]');
    if (errorNode) errorNode.textContent = '';

    try {
        const data = await fetchProjectApi(`/api/projects/${encodeURIComponent(project.id)}/members`);
        renderMembers(data, panel);
    } catch (error) {
        if (errorNode) errorNode.textContent = error.message || 'No se pudieron cargar los miembros.';
    }
}

function findHeaderTarget() {
    return document.querySelector('.project-workspace-session')
        || document.querySelector('header.a2-topbar .backend-status-wrap')
        || document.querySelector('header.a2-topbar')
        || document.body;
}

function mountActionsNode(project, panel) {
    const actions = document.createElement('div');
    actions.className = 'project-header-actions';
    actions.dataset.projectHeaderActions = '';
    actions.innerHTML = `
        <button type="button" data-project-select>Seleccionar proyecto</button>
        <button type="button" data-project-members>Miembros</button>
    `;

    actions.querySelector('[data-project-select]')?.addEventListener('click', cleanProjectUrlAndReload);
    actions.querySelector('[data-project-members]')?.addEventListener('click', async () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) await loadMembers(project, panel);
    });

    const target = findHeaderTarget();
    if (target.classList?.contains('backend-status-wrap')) {
        target.insertBefore(actions, target.firstChild);
    } else if (target.classList?.contains('project-workspace-session')) {
        target.insertBefore(actions, target.firstChild);
    } else {
        target.appendChild(actions);
    }

    return actions;
}

function bindMembersPanel(project, panel) {
    const closeButton = panel.querySelector('[data-project-members-close]');
    const assignForm = panel.querySelector('[data-project-member-assign-form]');
    const assignSubmit = panel.querySelector('[data-project-member-assign-submit]');
    const errorNode = panel.querySelector('[data-project-members-error]');

    closeButton?.addEventListener('click', () => {
        panel.hidden = true;
    });

    assignForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (errorNode) errorNode.textContent = '';

        const data = new FormData(assignForm);
        const userId = String(data.get('userId') || '').trim();
        if (!userId) return;

        try {
            if (assignSubmit) {
                assignSubmit.disabled = true;
                assignSubmit.textContent = 'Asignando';
            }

            await fetchProjectApi(`/api/projects/${encodeURIComponent(project.id)}/members`, {
                method: 'POST',
                body: JSON.stringify({ userId })
            });

            await loadMembers(project, panel);
        } catch (error) {
            if (errorNode) errorNode.textContent = error.message || 'No se pudo asignar el usuario.';
        } finally {
            if (assignSubmit) {
                assignSubmit.disabled = false;
                assignSubmit.textContent = 'Asignar';
            }
        }
    });
}

export function mountProjectHeaderActions(project) {
    if (!project) return;

    ensureStylesheet();

    document.querySelector('[data-project-header-actions]')?.remove();
    document.querySelector('[data-project-members-popover]')?.remove();

    const panel = createMembersPanel();
    bindMembersPanel(project, panel);
    document.body.appendChild(panel);

    mountActionsNode(project, panel);
}
