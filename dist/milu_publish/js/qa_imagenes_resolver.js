// Reuse the same token and schema candidate strategy used in milu_qa (schemas.js)
// to avoid parallel image path logic in QA Imagenes.

function uniquePush(list, seen, item) {
    if (!item) return;
    const key = `${item.type}|${item.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(item);
}

export function splitMediaTokens(rawValue) {
    if (Array.isArray(rawValue)) {
        return rawValue
            .map((v) => String(v || "").trim())
            .filter(Boolean);
    }
    return String(rawValue || "")
        .split(/[,;|\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export function normalizeBook(bookValue) {
    return String(bookValue || "").trim().replace(/\.pdf$/i, "");
}

export function stripFileExtension(value) {
    return String(value || "").trim().replace(/\.(png|webp|jpg|jpeg)$/i, "");
}

export function extractFileNameFromPath(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        return decodeURIComponent(parsed.pathname.split("/").pop() || "").trim();
    } catch {
        return decodeURIComponent(raw.replace(/\\/g, "/").split("/").pop() || "").trim();
    }
}

export function normalizePath(value) {
    return String(value || "").trim().replace(/\\/g, "/");
}

export function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
}

export function isPlaceholderPath(value) {
    return /(^|[/\\])sin[_-]?imagen\.(png|webp|jpg|jpeg)$|placeholder/i.test(String(value || "").toLowerCase());
}

export function buildSchemaImageCandidates(bookValue, schemaToken) {
    const book = normalizeBook(bookValue);
    const token = String(schemaToken || "").trim();
    if (!book || !token) return [];

    const tokenNoExt = stripFileExtension(token);
    const folder = `esquemas/${encodeURIComponent(book)}_esquemas/`;
    const extensions = ["png", "webp", "jpg", "jpeg"];
    const names = [tokenNoExt];
    if (!tokenNoExt.toLowerCase().startsWith(`${book.toLowerCase()}-`)) {
        names.push(`${book}-${tokenNoExt}`);
    }

    const paths = [];
    const seen = new Set();
    if (/\.(png|webp|jpg|jpeg)$/i.test(token)) {
        const direct = `${folder}${encodeURIComponent(token)}`;
        seen.add(direct);
        paths.push(direct);
    }
    names.forEach((name) => {
        extensions.forEach((ext) => {
            const path = `${folder}${encodeURIComponent(name)}.${ext}`;
            if (!seen.has(path)) {
                seen.add(path);
                paths.push(path);
            }
        });
    });
    return paths;
}

export function buildSchemaPosImageCandidates(bookValue, rawTokenOrPath) {
    const book = normalizeBook(bookValue);
    const raw = String(rawTokenOrPath || "").trim();
    if (!book || !raw) return [];

    const tokenFromPath = extractFileNameFromPath(raw) || raw;
    const tokenNoExt = stripFileExtension(tokenFromPath);
    const tokenExtMatch = tokenFromPath.match(/\.(png|webp|jpg|jpeg)$/i);
    const tokenExt = tokenExtMatch ? tokenExtMatch[1].toLowerCase() : "";
    const folder = `esquemas_pos_circulos/${encodeURIComponent(book)}-POS/`;
    const extensions = tokenExt ? [tokenExt] : ["png", "webp", "jpg", "jpeg"];
    const names = [tokenNoExt];
    if (!tokenNoExt.toLowerCase().startsWith(`${book.toLowerCase()}-`)) {
        names.push(`${book}-${tokenNoExt}`);
    }

    const paths = [];
    const seen = new Set();
    const pushPath = (p) => {
        if (!p || seen.has(p)) return;
        seen.add(p);
        paths.push(p);
    };

    names.forEach((name) => {
        extensions.forEach((ext) => {
            pushPath(`${folder}${encodeURIComponent(name)}.${ext}`);
        });
    });
    return paths;
}

function inferMediaTypeFromToken(token) {
    const clean = String(token || "").toLowerCase();
    const file = extractFileNameFromPath(clean);
    const isPosPattern = /-\d{4}-\d{2}-\d+\.(png|webp|jpg|jpeg)$/i.test(file);
    if (clean.includes("esquemas_pos_circulos/") || isPosPattern) return "esquema_pos";
    if (clean.includes("esquemas/")) return "esquema";
    if (isPlaceholderPath(clean)) return "placeholder";
    return "foto";
}

function buildNormalizedCandidate(rawToken, sourceField, explicitType, inventoryByFile) {
    const token = normalizePath(rawToken);
    if (!token) return null;

    const filename = extractFileNameFromPath(token);
    const fromInventory = filename ? inventoryByFile.get(filename) : null;
    const isHttp = isHttpUrl(token);
    const url = isHttp
        ? token
        : fromInventory?.relative_path
            ? normalizePath(fromInventory.relative_path)
            : token;

    const type = explicitType || inferMediaTypeFromToken(token);
    return {
        sourceField,
        type,
        token,
        filename,
        url,
        isHttp,
        isLocal: !isHttp,
        isPlaceholder: isPlaceholderPath(token) || isPlaceholderPath(filename),
        localFound: Boolean(fromInventory)
    };
}

function collectCandidates(rawRecord, auditRecord, inventoryByFile) {
    const result = [];
    const seen = new Set();
    const book = String(rawRecord?.engine_model || auditRecord?.engine_model || "").trim();

    const addTokenList = (rawValue, sourceField, explicitType) => {
        splitMediaTokens(rawValue).forEach((token) => {
            const item = buildNormalizedCandidate(token, sourceField, explicitType, inventoryByFile);
            if (item) uniquePush(result, seen, item);
        });
    };

    // Primary direct routes
    addTokenList(rawRecord?.ruta_foto ?? auditRecord?.ruta_foto, "ruta_foto", "foto");
    addTokenList(rawRecord?.ruta_esquemas_pos ?? auditRecord?.ruta_esquemas_pos, "ruta_esquemas_pos", "esquema_pos");

    // Exported image bundle may include photo and schema_pos.
    addTokenList(rawRecord?.exp_imagenes, "exp_imagenes", null);

    // Legacy fields from transforms.
    addTokenList(rawRecord?.img_urls, "img_urls", "foto");
    addTokenList(rawRecord?.schema_urls, "schema_urls", "esquema");
    addTokenList(rawRecord?.filename_foto, "filename_foto", "foto");

    // Schemas (book-page) and pos circles tokens resolved with same strategy used in milu_qa.
    splitMediaTokens(rawRecord?.esquemas).forEach((token) => {
        buildSchemaImageCandidates(book, token).forEach((candidate) => {
            const item = buildNormalizedCandidate(candidate, "esquemas", "esquema", inventoryByFile);
            if (item) uniquePush(result, seen, item);
        });
    });

    const posTokens = [
        ...splitMediaTokens(rawRecord?.esquemas_circulos),
        ...splitMediaTokens(rawRecord?.ruta_esquemas_pos),
        ...splitMediaTokens(rawRecord?.exp_imagenes)
    ];
    posTokens.forEach((token) => {
        buildSchemaPosImageCandidates(book, token).forEach((candidate) => {
            const item = buildNormalizedCandidate(candidate, "esquemas_pos", "esquema_pos", inventoryByFile);
            if (item) uniquePush(result, seen, item);
        });
    });

    return result;
}

function pickBest(candidates, preferredType, allowPlaceholder = false) {
    const scoped = candidates.filter((c) => c.type === preferredType);
    if (!scoped.length) return null;

    const withoutPlaceholder = allowPlaceholder ? scoped : scoped.filter((c) => !c.isPlaceholder);
    const source = withoutPlaceholder.length ? withoutPlaceholder : scoped;

    return source.sort((a, b) => {
        const scoreA = (a.localFound ? 5 : 0) + (!a.isPlaceholder ? 3 : 0) + (a.isHttp ? 1 : 0);
        const scoreB = (b.localFound ? 5 : 0) + (!b.isPlaceholder ? 3 : 0) + (b.isHttp ? 1 : 0);
        return scoreB - scoreA;
    })[0];
}

export function resolveRecordMedia(auditRecord, rawRecord, inventoryByFile) {
    const candidates = collectCandidates(rawRecord || {}, auditRecord || {}, inventoryByFile || new Map());

    const selectedPhoto = pickBest(candidates, "foto", false) || pickBest(candidates, "placeholder", true);
    const selectedPos = pickBest(candidates, "esquema_pos", false);
    const selectedSchema = pickBest(candidates, "esquema", false);

    const photoCandidates = candidates.filter((c) => c.type === "foto" || c.type === "placeholder");
    const posCandidates = candidates.filter((c) => c.type === "esquema_pos");
    const schemaCandidates = candidates.filter((c) => c.type === "esquema");

    return {
        allCandidates: candidates,
        photoCandidates,
        posCandidates,
        schemaCandidates,
        selectedPhoto,
        selectedPos,
        selectedSchema,
        hasWordpressUrl: candidates.some((c) => /\/wp-content\/uploads\//i.test(c.url)),
        hasLocalUrl: candidates.some((c) => c.isLocal),
        hasPlaceholder: photoCandidates.some((c) => c.isPlaceholder),
        onlyPlaceholder: photoCandidates.length > 0 && photoCandidates.every((c) => c.isPlaceholder),
        hasPhotoReal: photoCandidates.some((c) => !c.isPlaceholder),
        hasSchemaPos: posCandidates.length > 0,
        hasSchemas: schemaCandidates.length > 0
    };
}
