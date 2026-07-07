const SPLASH_TEMPLATE_URL = new URL('./splash-ui.html', import.meta.url).href;

let splashTemplatePromise = null;

function ensureSplashStylesheet() {
    if (document.getElementById('alentioSplashStyles')) return;

    const link = document.createElement('link');
    link.id = 'alentioSplashStyles';
    link.rel = 'stylesheet';
    link.href = new URL('./splash-ui.css', import.meta.url).href;
    document.head.appendChild(link);
}

async function loadSplashTemplate() {
    if (!splashTemplatePromise) {
        splashTemplatePromise = fetch(SPLASH_TEMPLATE_URL).then(async (response) => {
            if (!response.ok) {
                throw new Error(`No se pudo cargar splash-ui.html (${response.status})`);
            }

            const holder = document.createElement('div');
            holder.innerHTML = await response.text();
            return holder;
        });
    }

    return splashTemplatePromise;
}

export async function showAlentioSplash(options = {}) {
    ensureSplashStylesheet();

    const holder = await loadSplashTemplate();
    const template = holder.querySelector('#alentioSplashTemplate');
    if (!template) return;

    const splash = template.content.firstElementChild.cloneNode(true);
    document.body.appendChild(splash);

    await new Promise((resolve) => setTimeout(resolve, 2100));

    if (typeof options.beforeExit === 'function') {
        await options.beforeExit();
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    splash.classList.add('is-leaving');
    await new Promise((resolve) => setTimeout(resolve, 760));
    splash.remove();
}
