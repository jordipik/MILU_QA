'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
const WORDPRESS_FILE = path.join(DATA_DIR, 'wordpress-connections.json');
const WORDPRESS_OAUTH_AUTHORIZE_URL = 'https://public-api.wordpress.com/oauth2/authorize';
const WORDPRESS_OAUTH_TOKEN_URL = 'https://public-api.wordpress.com/oauth2/token';
const WORDPRESS_API_ROOT = 'https://public-api.wordpress.com/rest/v1.1';
const WORDPRESS_OAUTH_SCOPE = 'global';

function ensureDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function cleanProjectId(projectId) {
    return String(projectId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
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

function normalizeSiteUrl(value) {
    const raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) return '';

    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
    } catch (_) {
        return '';
    }
}

function authHeader(username, applicationPassword) {
    return `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}`;
}

function readStore() {
    const store = readJsonFile(WORDPRESS_FILE, { version: 1, connections: {}, oauthStates: {}, oauthAccounts: {} });
    return {
        version: 1,
        connections: store && typeof store.connections === 'object' && !Array.isArray(store.connections)
            ? store.connections
            : {},
        oauthStates: store && typeof store.oauthStates === 'object' && !Array.isArray(store.oauthStates)
            ? store.oauthStates
            : {},
        oauthAccounts: store && typeof store.oauthAccounts === 'object' && !Array.isArray(store.oauthAccounts)
            ? store.oauthAccounts
            : {}
    };
}

function publicConnection(connection) {
    if (!connection) return null;

    return {
        connected: true,
        mode: connection.mode || 'application-password',
        siteId: connection.siteId || null,
        siteUrl: connection.siteUrl,
        username: connection.username,
        siteName: connection.siteName || connection.siteUrl,
        connectedAt: connection.connectedAt || null,
        lastCheckedAt: connection.lastCheckedAt || null
    };
}

function getWordPressConnection(projectId) {
    const cleanId = cleanProjectId(projectId);
    if (!cleanId) return null;

    return publicConnection(readStore().connections[cleanId] || null);
}

function publicOAuthSites(projectId) {
    const cleanId = cleanProjectId(projectId);
    const account = readStore().oauthAccounts[cleanId];
    if (!account) return [];

    return Array.isArray(account.sites)
        ? account.sites.map((site) => ({
            id: String(site.id || ''),
            name: String(site.name || site.title || site.URL || site.url || 'WordPress'),
            url: String(site.URL || site.url || ''),
            visible: site.visible !== false
        })).filter((site) => site.id && site.url)
        : [];
}

function getPrivateWordPressConnection(projectId) {
    const cleanId = cleanProjectId(projectId);
    if (!cleanId) return null;

    return readStore().connections[cleanId] || null;
}

async function fetchWordPressJson(connection, pathname, searchParams = {}) {
    const url = new URL(pathname, `${connection.siteUrl}/`);
    Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });

    const headers = { Accept: 'application/json' };
    if (connection.username && connection.applicationPassword) {
        headers.Authorization = authHeader(connection.username, connection.applicationPassword);
    }

    const response = await fetch(url, {
        headers
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.message || `WordPress HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return data;
}

async function fetchWordPressBridgeJson(connection, pathname, searchParams = {}) {
    const url = new URL(pathname, `${connection.siteUrl}/`);
    Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });

    const headers = { Accept: 'application/json' };
    const bridgeToken = String(process.env.WORDPRESS_BRIDGE_TOKEN || '').trim();
    if (bridgeToken) headers['X-Alentio-Token'] = bridgeToken;
    if (connection.accessToken) headers.Authorization = `Bearer ${connection.accessToken}`;
    if (connection.username && connection.applicationPassword) {
        headers.Authorization = authHeader(connection.username, connection.applicationPassword);
    }

    const response = await fetch(url, { headers });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.message || `WordPress bridge HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return data;
}

async function fetchWordPressComJson(accessToken, pathname, searchParams = {}) {
    const url = new URL(`${WORDPRESS_API_ROOT}${pathname}`);
    Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });

    const response = await fetch(url, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`
        }
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const message = data?.message || data?.error_description || `WordPress.com HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return data;
}

function getOAuthConfig() {
    const clientId = String(process.env.WORDPRESS_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.WORDPRESS_CLIENT_SECRET || '').trim();

    if (!clientId || !clientSecret) {
        const error = new Error('Faltan WORDPRESS_CLIENT_ID y WORDPRESS_CLIENT_SECRET en el servidor.');
        error.status = 500;
        throw error;
    }

    return { clientId, clientSecret };
}

function getBaseUrl(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'http';
    return `${proto}://${req.get('host')}`;
}

function getOAuthRedirectUri(req) {
    return `${getBaseUrl(req)}/api/projects/wordpress/oauth/callback`;
}

function createWordPressOAuthStart(projectId, input, req) {
    const cleanId = cleanProjectId(projectId);
    const { clientId } = getOAuthConfig();
    const returnUrl = String(input?.returnUrl || '').trim() || `${getBaseUrl(req)}/`;
    const redirectUri = getOAuthRedirectUri(req);
    const state = `${cleanId}.${Date.now()}.${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const store = readStore();

    store.oauthStates[state] = {
        projectId: cleanId,
        returnUrl,
        redirectUri,
        createdAt: new Date().toISOString()
    };
    writeJsonAtomic(WORDPRESS_FILE, store);

    const url = new URL(WORDPRESS_OAUTH_AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', WORDPRESS_OAUTH_SCOPE);
    url.searchParams.set('state', state);

    return url.href;
}

async function exchangeWordPressCode(code, redirectUri) {
    const { clientId, clientSecret } = getOAuthConfig();
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
    });

    const response = await fetch(WORDPRESS_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.access_token) {
        const message = data?.message || data?.error_description || data?.error || 'No se pudo iniciar sesion en WordPress.com.';
        const error = new Error(message);
        error.status = response.status || 500;
        throw error;
    }

    return data;
}

function normalizeWordPressComSites(data) {
    const rawSites = Array.isArray(data?.sites) ? data.sites : [];
    return rawSites.map((site) => ({
        id: String(site.ID || site.id || ''),
        name: String(site.name || site.title || site.URL || site.url || 'WordPress'),
        URL: String(site.URL || site.url || ''),
        visible: site.visible !== false
    })).filter((site) => site.id && site.URL);
}

async function finishWordPressOAuth(input) {
    const state = String(input?.state || '');
    const code = String(input?.code || '');
    const store = readStore();
    const stateRecord = store.oauthStates[state];

    if (!stateRecord || !code) {
        const error = new Error('Sesion de WordPress caducada o no valida.');
        error.status = 400;
        throw error;
    }

    delete store.oauthStates[state];
    const token = await exchangeWordPressCode(code, stateRecord.redirectUri);
    const me = await fetchWordPressComJson(token.access_token, '/me');
    const sitesResponse = await fetchWordPressComJson(token.access_token, '/me/sites');
    const sites = normalizeWordPressComSites(sitesResponse);

    store.oauthAccounts[stateRecord.projectId] = {
        accessToken: token.access_token,
        tokenType: token.token_type || 'bearer',
        blogId: token.blog_id || null,
        blogUrl: token.blog_url || '',
        username: me?.username || me?.display_name || '',
        userId: me?.ID || me?.id || null,
        sites,
        connectedAt: new Date().toISOString()
    };
    writeJsonAtomic(WORDPRESS_FILE, store);

    return {
        returnUrl: stateRecord.returnUrl,
        sites: publicOAuthSites(stateRecord.projectId)
    };
}

function selectWordPressSite(projectId, siteId) {
    const cleanId = cleanProjectId(projectId);
    const store = readStore();
    const account = store.oauthAccounts[cleanId];
    const site = (account?.sites || []).find((candidate) => String(candidate.id) === String(siteId));

    if (!account || !site) {
        const error = new Error('No se encontro ese sitio de WordPress en la cuenta conectada.');
        error.status = 404;
        throw error;
    }

    const now = new Date().toISOString();
    store.connections[cleanId] = {
        mode: 'wordpress-com-oauth',
        siteId: site.id,
        siteUrl: site.URL,
        siteName: site.name,
        username: account.username,
        accessToken: account.accessToken,
        connectedAt: now,
        lastCheckedAt: null
    };
    writeJsonAtomic(WORDPRESS_FILE, store);

    return publicConnection(store.connections[cleanId]);
}

async function connectWordPress(projectId, input) {
    const cleanId = cleanProjectId(projectId);
    const siteUrl = normalizeSiteUrl(input?.siteUrl);
    const username = String(input?.username || '').trim();
    const applicationPassword = String(input?.applicationPassword || '').trim();

    if (!cleanId || !siteUrl || !username || !applicationPassword) {
        const error = new Error('URL, usuario y application password son obligatorios.');
        error.status = 400;
        throw error;
    }

    const draftConnection = { siteUrl, username, applicationPassword };
    const me = await fetchWordPressJson(draftConnection, '/wp-json/wp/v2/users/me', { context: 'edit' });
    const site = await fetchWordPressJson(draftConnection, '/wp-json');
    const store = readStore();
    const now = new Date().toISOString();

    store.connections[cleanId] = {
        siteUrl,
        username,
        applicationPassword,
        siteName: String(site?.name || me?.name || siteUrl),
        connectedAt: now,
        lastCheckedAt: null
    };
    writeJsonAtomic(WORDPRESS_FILE, store);

    return publicConnection(store.connections[cleanId]);
}

function normalizePartNumber(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function itemContainsPartNumber(item, normalizedPartNumber) {
    const candidates = [
        item?.sku,
        item?.slug,
        item?.title?.rendered,
        item?.title,
        item?.name,
        item?.title,
        item?.content,
        item?.url,
        item?.link,
        item?.URL,
        item?.short_URL,
        item?.excerpt?.rendered,
        item?.description
    ];

    return candidates.some((value) => normalizePartNumber(value).includes(normalizedPartNumber));
}

function customerName(customer) {
    const parts = [
        customer?.first_name,
        customer?.last_name
    ].map((value) => String(value || '').trim()).filter(Boolean);

    return String(customer?.name || customer?.display_name || parts.join(' ') || customer?.username || customer?.email || 'Cliente').trim();
}

function normalizeWooCustomer(customer) {
    const billing = customer?.billing && typeof customer.billing === 'object' ? customer.billing : {};
    const totalSpent = Number(customer?.total_spent || 0);
    const orderCount = Number(customer?.orders_count || 0);

    return {
        id: String(customer?.id || customer?.ID || ''),
        name: customerName(customer),
        username: String(customer?.username || customer?.slug || ''),
        orderCount,
        ordersLabel: 'Ver pedidos',
        lastActivity: String(customer?.last_order_date || customer?.date_modified || ''),
        registeredAt: String(customer?.date_created || customer?.registered_date || ''),
        email: String(customer?.email || billing.email || ''),
        totalSpent,
        averageOrderValue: orderCount > 0 ? totalSpent / orderCount : 0,
        country: String(billing.country || ''),
        city: String(billing.city || ''),
        region: String(billing.state || ''),
        postcode: String(billing.postcode || '')
    };
}

function normalizeBridgeCustomer(customer) {
    const orderCount = Number(customer?.orderCount ?? customer?.order_count ?? customer?.ordersCount ?? customer?.orders_count ?? 0);
    const totalSpent = Number(customer?.totalSpent ?? customer?.total_spent ?? 0);
    const averageOrderValue = Number(customer?.averageOrderValue ?? customer?.average_order_value ?? (orderCount > 0 ? totalSpent / orderCount : 0));

    return {
        id: String(customer?.id || customer?.ID || ''),
        name: String(customer?.name || customer?.nombre || customerName(customer)).trim(),
        username: String(customer?.username || customer?.usuario || customer?.user_login || ''),
        orderCount,
        lastActivity: String(customer?.lastActivity || customer?.last_activity || customer?.ultimo_login || ''),
        registeredAt: String(customer?.registeredAt || customer?.registered_at || customer?.registro || ''),
        email: String(customer?.email || customer?.correo || ''),
        totalSpent,
        averageOrderValue,
        country: String(customer?.country || customer?.pais || ''),
        city: String(customer?.city || customer?.ciudad || ''),
        region: String(customer?.region || customer?.state || customer?.region_estado || ''),
        postcode: String(customer?.postcode || customer?.postalCode || customer?.cp || '')
    };
}

function normalizeMoney(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
}

function normalizeAnalysisPoint(point) {
    return {
        date: String(point?.date || point?.day || ''),
        value: normalizeMoney(point?.value ?? point?.total ?? point?.count)
    };
}

function normalizeAnalysisProduct(product) {
    return {
        id: String(product?.id || product?.productId || product?.product_id || ''),
        name: String(product?.name || product?.title || product?.product || 'Producto'),
        quantity: Number(product?.quantity ?? product?.itemsSold ?? product?.items_sold ?? 0),
        total: normalizeMoney(product?.total ?? product?.sales ?? product?.revenue),
        image: String(product?.image || product?.imageUrl || product?.image_url || product?.thumbnail || '')
    };
}

function normalizeAnalysisOrderItem(item) {
    const specs = Array.isArray(item?.specs)
        ? item.specs
            .map((spec) => ({
                name: String(spec?.name || spec?.key || '').trim(),
                value: String(spec?.value || '').trim()
            }))
            .filter((spec) => spec.name && spec.value)
        : [];

    return {
        id: String(item?.id || item?.productId || item?.product_id || ''),
        name: String(item?.name || item?.title || 'Producto'),
        sku: String(item?.sku || ''),
        quantity: Number(item?.quantity ?? item?.qty ?? 0),
        total: normalizeMoney(item?.total ?? item?.sales ?? item?.lineTotal),
        image: String(item?.image || item?.imageUrl || item?.image_url || item?.thumbnail || ''),
        url: String(item?.url || item?.permalink || ''),
        specs
    };
}

function normalizeAnalysisOrder(order) {
    const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.products) ? order.products : [];

    return {
        id: String(order?.id || order?.orderId || order?.order_id || ''),
        number: String(order?.number || order?.orderNumber || order?.order_number || order?.id || ''),
        date: String(order?.date || order?.createdAt || order?.created_at || ''),
        status: String(order?.status || ''),
        customer: {
            id: String(order?.customer?.id || order?.customerId || order?.customer_id || ''),
            name: String(order?.customer?.name || order?.customerName || order?.customer_name || 'Cliente'),
            email: String(order?.customer?.email || order?.customerEmail || order?.customer_email || ''),
            orderCount: Number(order?.customer?.orderCount ?? order?.customerOrderCount ?? 0),
            type: String(order?.customer?.type || order?.customerType || '')
        },
        total: normalizeMoney(order?.total ?? order?.sales ?? order?.netSales),
        itemCount: Number(order?.itemCount ?? order?.itemsSold ?? order?.items_sold ?? items.reduce((sum, item) => sum + Number(item?.quantity ?? item?.qty ?? 0), 0)),
        coupons: Array.isArray(order?.coupons) ? order.coupons.map(String) : [],
        url: String(order?.url || order?.editUrl || order?.edit_url || ''),
        items: items.map(normalizeAnalysisOrderItem)
    };
}

function normalizeVisitCountry(country) {
    return {
        code: String(country?.code || country?.countryCode || country?.country_code || '').toUpperCase(),
        name: String(country?.name || country?.country || country?.label || 'Desconocido'),
        visits: Number(country?.visits ?? country?.value ?? country?.count ?? 0)
    };
}

function normalizeAnalysisSummary(data) {
    const summary = data?.summary && typeof data.summary === 'object' ? data.summary : data || {};
    const series = data?.series && typeof data.series === 'object' ? data.series : {};
    const products = Array.isArray(data?.products)
        ? data.products
        : Array.isArray(data?.topProducts)
            ? data.topProducts
            : [];
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    const countries = Array.isArray(data?.countries)
        ? data.countries
        : Array.isArray(data?.visitsByCountry)
            ? data.visitsByCountry
            : Array.isArray(data?.countriesRanking)
                ? data.countriesRanking
                : [];

    return {
        range: {
            start: String(data?.range?.start || data?.start || ''),
            end: String(data?.range?.end || data?.end || '')
        },
        metrics: {
            totalSales: normalizeMoney(summary.totalSales ?? summary.total_sales ?? summary.sales),
            grossSales: normalizeMoney(summary.grossSales ?? summary.gross_sales ?? summary.gross),
            refunds: normalizeMoney(summary.refunds ?? summary.refunded ?? summary.totalRefunds),
            taxes: normalizeMoney(summary.taxes ?? summary.tax ?? summary.totalTax),
            shipping: normalizeMoney(summary.shipping ?? summary.shippingTotal ?? summary.totalShipping),
            coupons: normalizeMoney(summary.coupons ?? summary.discount ?? summary.discountTotal),
            orderCount: Number(summary.orderCount ?? summary.orders ?? summary.ordersCount ?? 0),
            productsSold: Number(summary.productsSold ?? summary.itemsSold ?? summary.items_sold ?? 0),
            visits: Number(summary.visits ?? 0)
        },
        series: {
            sales: (Array.isArray(series.sales) ? series.sales : []).map(normalizeAnalysisPoint),
            orders: (Array.isArray(series.orders) ? series.orders : []).map(normalizeAnalysisPoint),
            visits: (Array.isArray(series.visits) ? series.visits : []).map(normalizeAnalysisPoint)
        },
        products: products.map(normalizeAnalysisProduct)
            .sort((a, b) => b.quantity - a.quantity || b.total - a.total),
        orders: orders.map(normalizeAnalysisOrder),
        countries: countries.map(normalizeVisitCountry)
            .filter((country) => country.visits > 0)
            .sort((a, b) => b.visits - a.visits)
    };
}

function normalizeWordPressUser(user) {
    return {
        id: String(user?.ID || user?.id || ''),
        name: customerName(user),
        username: String(user?.login || user?.username || user?.slug || ''),
        orderCount: 0,
        ordersLabel: 'Ver pedidos',
        lastActivity: String(user?.last_seen || user?.date || ''),
        registeredAt: String(user?.registered_date || user?.date || ''),
        email: String(user?.email || ''),
        totalSpent: 0,
        averageOrderValue: 0,
        country: '',
        city: '',
        region: '',
        postcode: ''
    };
}

async function listDirectWooCustomers(connection) {
    const customers = [];

    for (let page = 1; page <= 20; page += 1) {
        const data = await fetchWordPressJson(connection, '/wp-json/wc/v3/customers', {
            per_page: 100,
            page
        });
        const pageItems = Array.isArray(data) ? data : [];
        customers.push(...pageItems.map(normalizeWooCustomer));
        if (pageItems.length < 100) break;
    }

    return customers;
}

async function listDirectWordPressUsers(connection) {
    const data = await fetchWordPressJson(connection, '/wp-json/wp/v2/users', {
        context: 'edit',
        per_page: 100
    });

    return Array.isArray(data) ? data.map(normalizeWordPressUser) : [];
}

async function listWordPressComUsers(connection) {
    const data = await fetchWordPressComJson(connection.accessToken, `/sites/${encodeURIComponent(connection.siteId)}/users`, {
        number: 100
    });
    const users = Array.isArray(data?.users) ? data.users : [];

    return users.map(normalizeWordPressUser);
}

async function listBridgeCustomers(connection) {
    const data = await fetchWordPressBridgeJson(connection, '/wp-json/alentio/v1/customers', {
        limit: 1000
    });
    const customers = Array.isArray(data?.customers) ? data.customers : Array.isArray(data) ? data : [];

    return customers.map(normalizeBridgeCustomer);
}

async function listWordPressCustomers(projectId) {
    const cleanId = cleanProjectId(projectId);
    const connection = getPrivateWordPressConnection(cleanId);
    if (!connection) {
        const error = new Error('Este proyecto no tiene WordPress conectado.');
        error.status = 400;
        throw error;
    }

    const attempts = [];
    attempts.push(() => listBridgeCustomers(connection));
    if (connection.mode === 'wordpress-com-oauth') {
        attempts.push(() => listWordPressComUsers(connection));
    }
    attempts.push(() => listDirectWooCustomers(connection));
    attempts.push(() => listDirectWordPressUsers(connection));

    for (const attempt of attempts) {
        try {
            const customers = await attempt();
            if (customers.length) {
                return {
                    connection: publicConnection(connection),
                    customers,
                    source: connection.mode === 'wordpress-com-oauth' ? 'wordpress-com-users' : 'site-rest'
                };
            }
        } catch (_) {
            // Probamos la siguiente ruta disponible para esta conexion.
        }
    }

    return {
        connection: publicConnection(connection),
        customers: [],
        source: 'none'
    };
}

async function getWordPressAnalysisSummary(projectId, input = {}) {
    const cleanId = cleanProjectId(projectId);
    const connection = getPrivateWordPressConnection(cleanId);
    if (!connection) {
        const error = new Error('Este proyecto no tiene WordPress conectado.');
        error.status = 400;
        throw error;
    }

    const start = String(input.start || '').slice(0, 10);
    const end = String(input.end || '').slice(0, 10);
    const data = await fetchWordPressBridgeJson(connection, '/wp-json/alentio/v1/analytics-summary', {
        start,
        end
    });

    return {
        connection: publicConnection(connection),
        summary: normalizeAnalysisSummary(data)
    };
}

async function queryPartNumber(connection, partNumber) {
    const normalized = normalizePartNumber(partNumber);
    if (!normalized) return { exists: false, matches: [] };

    if (connection.mode === 'wordpress-com-oauth') {
        const oauthQueries = [
            ['/posts/', { type: 'product', search: partNumber, number: 20 }],
            ['/posts/', { search: partNumber, number: 20 }]
        ];

        for (const [pathname, params] of oauthQueries) {
            try {
                const data = await fetchWordPressComJson(connection.accessToken, `/sites/${encodeURIComponent(connection.siteId)}${pathname}`, params);
                const items = Array.isArray(data?.posts) ? data.posts : [];
                const matches = items.filter((item) => itemContainsPartNumber(item, normalized));
                if (matches.length) {
                    return {
                        exists: true,
                        source: `wordpress.com:${pathname}`,
                        matches: matches.slice(0, 5).map((item) => ({
                            id: item.ID || item.id,
                            title: item?.title || item?.name || '',
                            url: item?.URL || item?.short_URL || ''
                        }))
                    };
                }
            } catch (_) {
                // Algunas webs no exponen productos como posts por la API de WordPress.com.
            }
        }
    }

    const queries = [
        ['/wp-json/wc/v3/products', { sku: partNumber, per_page: 5 }],
        ['/wp-json/wp/v2/search', { search: partNumber, subtype: 'product', per_page: 10 }],
        ['/wp-json/wp/v2/product', { search: partNumber, per_page: 10 }],
        ['/wp-json/wp/v2/posts', { search: partNumber, per_page: 10 }]
    ];

    for (const [pathname, params] of queries) {
        try {
            const data = await fetchWordPressJson(connection, pathname, params);
            const items = Array.isArray(data) ? data : [];
            const matches = items.filter((item) => itemContainsPartNumber(item, normalized));
            if (matches.length) {
                return {
                    exists: true,
                    source: pathname,
                    matches: matches.slice(0, 5).map((item) => ({
                        id: item.id,
                        title: item?.name || item?.title?.rendered || item?.title || '',
                        url: item?.permalink || item?.url || item?.link || ''
                    }))
                };
            }
        } catch (_) {
            // Algunas rutas dependen de WooCommerce o de tipos REST habilitados.
        }
    }

    return { exists: false, matches: [] };
}

async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(runners);
    return results;
}

async function checkWordPressPartNumbers(projectId, partNumbers) {
    const cleanId = cleanProjectId(projectId);
    const connection = getPrivateWordPressConnection(cleanId);
    if (!connection) {
        const error = new Error('Este proyecto no tiene WordPress conectado.');
        error.status = 400;
        throw error;
    }

    const uniquePartNumbers = [...new Set((Array.isArray(partNumbers) ? partNumbers : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))]
        .slice(0, 500);
    const results = {};

    const checkedResults = await mapWithConcurrency(uniquePartNumbers, 8, async (partNumber) => ({
        partNumber,
        result: await queryPartNumber(connection, partNumber)
    }));
    checkedResults.forEach(({ partNumber, result }) => {
        results[partNumber] = result;
    });

    const store = readStore();
    if (store.connections[cleanId]) {
        store.connections[cleanId].lastCheckedAt = new Date().toISOString();
        writeJsonAtomic(WORDPRESS_FILE, store);
    }

    return {
        connection: publicConnection(store.connections[cleanId] || connection),
        results
    };
}

module.exports = {
    checkWordPressPartNumbers,
    connectWordPress,
    createWordPressOAuthStart,
    finishWordPressOAuth,
    getWordPressAnalysisSummary,
    getWordPressConnection,
    listWordPressCustomers,
    publicOAuthSites,
    selectWordPressSite
};
