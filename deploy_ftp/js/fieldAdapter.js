const FALLBACK_ALIASES = {
    pn_final: ["pn_final", "PART NO.", "pn_excel", "pn_raw"],
    source_page: ["source_page", "Source Page", "page4"],
    measure_error: ["measure_error", "measurement_error"],
    is_gesa_excel: ["is_gesa_excel", "isgesa_excel", "gesa"],
    ruta_esquemas_pos: ["ruta_esquemas_pos", "exp_imagenes"],
};

let registryState = {
    aliasesByNew: new Map(),
    preferredByAlias: new Map(),
};

function normalizeFieldName(name) {
    const value = String(name || "").trim();
    if (!value) return "";
    if (value === "Source Page") return "source_page";
    if (value === "measurement_error") return "measure_error";
    if (value.startsWith("isgesa_")) return value.replace("isgesa_", "is_gesa_");
    return value;
}

function asAliasVariants(name) {
    const raw = String(name || "").trim();
    if (!raw) return [];
    const normalized = normalizeFieldName(raw);
    if (normalized && normalized !== raw) return [raw, normalized];
    return [raw];
}

function unique(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

function canonicalAction(raw) {
    const v = String(raw || "").trim().toLowerCase();
    const normalized = v
        .replaceAll("á", "a")
        .replaceAll("à", "a")
        .replaceAll("ä", "a")
        .replaceAll("±", "n");
    if (normalized === "copiar" || normalized === "copy") return "copy";
    if (normalized === "añadir" || normalized === "anadir" || normalized === "add") return "add";
    if (normalized === "eliminar" || normalized === "delete") return "delete";
    return normalized;
}

function hydrateRegistryState(registryPayload) {
    const aliasesByNew = new Map();
    const preferredByAlias = new Map();

    const fields = Array.isArray(registryPayload?.fields) ? registryPayload.fields : [];

    for (const field of fields) {
        if (canonicalAction(field?.action) === "delete") continue;

        const newName = normalizeFieldName(field?.new_name);
        if (!newName) continue;

        const aliases = [];
        aliases.push(newName);

        if (field?.current_name) aliases.push(...asAliasVariants(field.current_name));

        if (Array.isArray(field?.legacy_names)) {
            for (const alias of field.legacy_names) aliases.push(...asAliasVariants(alias));
        }

        if (newName === "source_page") aliases.push("Source Page", "page4");
        if (newName === "measure_error") aliases.push("measurement_error");
        if (newName.startsWith("is_gesa_")) aliases.push(newName.replace("is_gesa_", "isgesa_"));
        if (newName === "is_gesa_excel") aliases.push("gesa");
        if (newName === "ruta_esquemas_pos") aliases.push("exp_imagenes");

        const uniqueAliases = unique(aliases.filter(Boolean));
        aliasesByNew.set(newName, uniqueAliases);

        for (const alias of uniqueAliases) {
            if (!preferredByAlias.has(alias)) preferredByAlias.set(alias, newName);
            const canonicalAlias = normalizeFieldName(alias);
            if (canonicalAlias && !preferredByAlias.has(canonicalAlias)) {
                preferredByAlias.set(canonicalAlias, newName);
            }
        }
    }

    for (const [newName, aliases] of Object.entries(FALLBACK_ALIASES)) {
        const normalizedName = normalizeFieldName(newName);
        const normalizedAliases = unique(aliases.flatMap(asAliasVariants));
        if (!aliasesByNew.has(normalizedName)) {
            aliasesByNew.set(normalizedName, normalizedAliases);
        }
        for (const alias of normalizedAliases) {
            if (!preferredByAlias.has(alias)) preferredByAlias.set(alias, normalizedName);
        }
    }

    registryState = { aliasesByNew, preferredByAlias };
}

function resolvePreferredFieldName(fieldName) {
    const normalized = normalizeFieldName(fieldName);
    if (!normalized) return normalized;
    if (registryState.aliasesByNew.has(normalized)) return normalized;
    return registryState.preferredByAlias.get(normalized) || normalized;
}

function configureFieldRegistry(registryPayload) {
    hydrateRegistryState(registryPayload || {});
}

function getFieldAliases(fieldName) {
    const preferred = resolvePreferredFieldName(fieldName);
    const aliases = registryState.aliasesByNew.get(preferred);
    if (aliases?.length) return [...aliases];
    return [preferred];
}

function hasField(record, fieldName) {
    if (!record || typeof record !== "object") return false;
    const aliases = getFieldAliases(fieldName);
    return aliases.some((alias) => Object.prototype.hasOwnProperty.call(record, alias));
}

function getField(record, fieldName) {
    if (!record || typeof record !== "object") return undefined;
    const aliases = getFieldAliases(fieldName);
    for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(record, alias)) {
            return record[alias];
        }
    }
    return undefined;
}

function setField(record, fieldName, value) {
    if (!record || typeof record !== "object") {
        throw new TypeError("setField expects a record object");
    }
    const preferred = resolvePreferredFieldName(fieldName);
    record[preferred] = value;
    return preferred;
}

hydrateRegistryState({ fields: [] });

const api = {
    configureFieldRegistry,
    getFieldAliases,
    hasField,
    getField,
    setField,
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}

if (typeof window !== "undefined") {
    window.fieldAdapter = api;
}
