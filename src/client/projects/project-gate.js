import { createProject, deleteProject, listProjects } from './project-api.js';

const PROJECT_TEMPLATE_URL = new URL('./project-gate.html', import.meta.url).href;
const TOKEN_KEY = 'milu:auth:token:v1';

let projectTemplatePromise = null;
let projectsCache = null;

function ensureProjectStylesheet() {
    if (document.getElementById('alentioProjectGateStyles')) return;

    const link = document.createElement('link');
    link.id = 'alentioProjectGateStyles';
    link.rel = 'stylesheet';
    link.href = new URL('./project-gate.css', import.meta.url).href;
    document.head.appendChild(link);
}

async function loadProjectTemplate() {
    if (!projectTemplatePromise) {
        projectTemplatePromise = fetch(PROJECT_TEMPLATE_URL).then(async (response) => {
            if (!response.ok) {
                throw new Error(`No se pudo cargar project-gate.html (${response.status})`);
            }

            const holder = document.createElement('div');
            holder.innerHTML = await response.text();

            return holder;
        });
    }

    return projectTemplatePromise;
}

async function getProjects() {
    if (!projectsCache) {
        projectsCache = await listProjects();
    }

    return projectsCache;
}

function userIsAdmin(user) {
    return Array.isArray(user?.roles) && user.roles.includes('admin');
}

function userLabel(user) {
    return user?.displayName || user?.username || 'Usuario';
}

function apiUrl(pathname) {
    const pathnameCurrent = String(window.location.pathname || '/');
    const basePath = /^\/milu(\/|$)/i.test(pathnameCurrent) ? '/milu' : '';
    return `${basePath}${pathname}`;
}

async function logoutFromProjectGate() {
    const token = localStorage.getItem(TOKEN_KEY);

    try {
        await fetch(apiUrl('/api/auth/logout'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: '{}'
        });
    } catch (_) {
        // La sesion local se limpia igualmente aunque el backend no responda.
    }

    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('alentio:selected-project');

    const url = new URL(window.location.href);
    url.searchParams.delete('project');
    window.location.replace(url.href);
}

function buildProjectUrl(project) {
    const url = new URL(window.location.href);
    url.searchParams.set('project', project.id);
    return url.href;
}

export async function getSelectedProject() {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project') || '';

    if (!projectId) return null;

    const projects = await getProjects();
    return projects.find((project) => project.id === projectId) || null;
}

function setCurrentProject(project) {
    sessionStorage.setItem('alentio:selected-project', project.id);
    window.history.replaceState({}, '', buildProjectUrl(project));
}

function renderProjectCard(project, cardTemplate, { canDelete = false } = {}) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    const projectInitial = project.icon || project.name.slice(0, 1).toUpperCase();

    card.dataset.projectId = project.id;
    card.dataset.projectKey = project.key || project.id || '';

    const icon = card.querySelector('[data-project-icon]');
    const name = card.querySelector('[data-project-name]');
    const description = card.querySelector('[data-project-description]');
    const previewFrame = card.querySelector('[data-project-preview-frame]');
    const deleteButton = card.querySelector('[data-project-delete]');

    if (icon) icon.textContent = projectInitial;
    if (name) name.textContent = project.name;
    if (description) description.textContent = project.description || '';
    if (previewFrame) previewFrame.src = buildProjectUrl(project);
    if (deleteButton) deleteButton.hidden = !canDelete;

    return card;
}

function normalizeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
}

function renderProjects(projects, list, cardTemplate, gate, user, empty) {
    list.innerHTML = '';

    projects.forEach((project) => {
        const card = renderProjectCard(project, cardTemplate, {
            canDelete: userIsAdmin(user) && !project.builtIn
        });
        const deleteButton = card.querySelector('[data-project-delete]');

        const selectProject = () => {
            setCurrentProject(project);

            gate.dispatchEvent(new CustomEvent('project:selected', {
                detail: project
            }));
        };

        deleteButton?.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            const confirmed = window.confirm(`Borrar el proyecto "${project.name}"? Esta accion no se puede deshacer.`);
            if (!confirmed) return;

            try {
                deleteButton.disabled = true;
                deleteButton.textContent = 'Borrando';
                await deleteProject(project.id);

                projectsCache = (projectsCache || []).filter((entry) => entry.id !== project.id);
                renderProjects(projectsCache, list, cardTemplate, gate, user, empty);
                empty.hidden = projectsCache.length !== 0;
            } catch (error) {
                window.alert(error.message || 'No se pudo borrar el proyecto.');
                deleteButton.disabled = false;
                deleteButton.textContent = 'Borrar';
            }
        });

        card.addEventListener('click', selectProject);
        card.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;

            if (event.target === deleteButton) return;

            event.preventDefault();
            selectProject();
        });

        list.appendChild(card);
    });
}

function bindProjectGateSession(user, gate) {
    const userNode = gate.querySelector('[data-project-gate-user]');
    const logoutButton = gate.querySelector('[data-project-gate-logout]');

    if (userNode) userNode.textContent = userLabel(user);
    logoutButton?.addEventListener('click', logoutFromProjectGate);
}

function bindCreateProjectForm({ user, gate, list, empty, cardTemplate }) {
    const createButton = gate.querySelector('[data-project-create-open]');
    const form = gate.querySelector('[data-project-create-form]');
    const cancelButton = gate.querySelector('[data-project-create-cancel]');
    const backdrop = gate.querySelector('[data-project-create-backdrop]');
    const errorNode = gate.querySelector('[data-project-create-error]');
    const nameInput = gate.querySelector('[data-project-create-name]');
    const keyInput = gate.querySelector('[data-project-create-key]');
    const submitButton = gate.querySelector('[data-project-create-submit]');

    if (!userIsAdmin(user)) {
        createButton?.remove();
        form?.remove();
        backdrop?.remove();
        return;
    }

    const setError = (message) => {
        if (errorNode) errorNode.textContent = message || '';
    };

    const openCreatePopup = () => {
        if (!form) return;

        form.hidden = false;
        if (backdrop) backdrop.hidden = false;
        if (createButton) createButton.hidden = true;

        setError('');

        setTimeout(() => {
            nameInput?.focus();
        }, 0);
    };

    const closeCreatePopup = () => {
        if (!form) return;

        form.hidden = true;
        if (backdrop) backdrop.hidden = true;
        if (createButton) createButton.hidden = false;

        form.reset();
        keyInput?.removeAttribute('data-touched');
        setError('');
    };

    createButton?.addEventListener('click', openCreatePopup);
    cancelButton?.addEventListener('click', closeCreatePopup);
    backdrop?.addEventListener('click', closeCreatePopup);

    gate.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        if (!form || form.hidden) return;

        event.preventDefault();
        closeCreatePopup();
    });

    nameInput?.addEventListener('input', () => {
        if (!keyInput || keyInput.dataset.touched === 'true') return;
        keyInput.value = normalizeKey(nameInput.value);
    });

    keyInput?.addEventListener('input', () => {
        keyInput.dataset.touched = 'true';
        keyInput.value = normalizeKey(keyInput.value);
    });

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        setError('');

        const data = new FormData(form);

        try {
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Creando';
            }

            const project = await createProject({
                name: data.get('name'),
                key: data.get('key'),
                description: data.get('description'),
                icon: data.get('icon')
            });

            projectsCache = [...(projectsCache || []), project];

            renderProjects(projectsCache, list, cardTemplate, gate, user, empty);
            empty.hidden = projectsCache.length !== 0;

            closeCreatePopup();
        } catch (error) {
            setError(error.message || 'No se pudo crear el proyecto.');
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Crear proyecto';
            }
        }
    });
}

export async function showProjectGate(user) {
    ensureProjectStylesheet();

    const holder = await loadProjectTemplate();
    const gateTemplate = holder.querySelector('#projectGateTemplate');
    const cardTemplate = holder.querySelector('#projectCardTemplate');

    if (!gateTemplate || !cardTemplate) {
        throw new Error('No se encontraron los templates de proyectos.');
    }

    const gate = gateTemplate.content.firstElementChild.cloneNode(true);
    const list = gate.querySelector('[data-project-list]');
    const empty = gate.querySelector('[data-project-empty]');

    if (!list || !empty) {
        throw new Error('El template de proyectos no tiene los contenedores necesarios.');
    }

    const projects = await getProjects();
    renderProjects(projects, list, cardTemplate, gate, user, empty);
    bindProjectGateSession(user, gate);
    bindCreateProjectForm({ user, gate, list, empty, cardTemplate });
    empty.hidden = projects.length !== 0;

    document.body.appendChild(gate);

    return new Promise((resolve) => {
        gate.addEventListener('project:selected', (event) => {
            gate.classList.add('is-leaving');

            setTimeout(() => {
                gate.remove();
                resolve(event.detail);
            }, 320);
        }, { once: true });
    });
}
