const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'wordpress');

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        return fallback;
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeCsv(filePath, rows, headers) {
    const escapeCell = (value) => {
        const text = String(value == null ? '' : value);
        if (text.includes('"') || text.includes(';') || text.includes('\n') || text.includes('\r')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    const lines = [];
    lines.push(headers.join(';'));
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCell(row[h])).join(';'));
    }
    fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeText(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
}

function collapseSpaces(value) {
    return normalizeText(value).replace(/\s+/g, ' ');
}

function getPn(row) {
    return normalizeText(row['PART NO.'] || row.pn || row.pn_final);
}

function getDesignation(row) {
    return collapseSpaces(row.designation_final || row.designation_gesa || row.DESIGNATION);
}

function getMeasure(row) {
    const fromGesa = collapseSpaces(row.dimensions_gesa);
    if (fromGesa) return fromGesa;
    const fromRaw = collapseSpaces(row['MEASUREMENT / STANDARD']);
    if (fromRaw) return fromRaw;
    return collapseSpaces(row.measure_final || row.measurement_final);
}

function getWeight(row) {
    return collapseSpaces(row.weight_final || row.WEIGHT || row.weight_gesa);
}

function getQaAction(row) {
    return normalizeKey(row.qa_revision_accion);
}

function getQaState(row) {
    return normalizeKey(row.qa_revision_estado);
}

function getSupersededType(row) {
    return normalizeText(row.sust_hierarchie || row.sust_status).toLowerCase();
}

function collectImages(row) {
    const raw = normalizeText(row.exp_imagenes || row.ruta_foto);
    if (!raw) return [];
    return raw
        .split(',')
        .map((item) => normalizeText(item))
        .filter(Boolean);
}

function isValidImageUrl(value) {
    return /^https?:\/\//i.test(value) || /^\//.test(value);
}

function findLatestProductExport() {
    const candidates = fs
        .readdirSync(REPO_ROOT)
        .filter((name) => /^product-export-.*\.json$/i.test(name))
        .map((name) => {
            const filePath = path.join(REPO_ROOT, name);
            const stat = fs.statSync(filePath);
            return { name, filePath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return candidates[0] || null;
}

function loadReferenceSet(fileName, fieldName) {
    const filePath = path.join(REPO_ROOT, fileName);
    const data = readJson(filePath, []);
    if (!Array.isArray(data)) return new Set();
    return new Set(data.map((item) => normalizeKey(item[fieldName])).filter(Boolean));
}

function buildSourceData() {
    const rows = [];
    for (const fileName of ENGINE_JSON_FILES) {
        const filePath = path.join(REPO_ROOT, fileName);
        const parsed = readJson(filePath, []);
        if (!Array.isArray(parsed)) continue;
        for (const row of parsed) {
            rows.push({ ...row, __engine_file: fileName });
        }
    }
    return rows;
}

function scoreRowQuality(row) {
    let score = 0;
    if (getDesignation(row)) score += 3;
    if (getMeasure(row)) score += 1;
    if (getWeight(row)) score += 1;
    if (collectImages(row).length > 0) score += 1;
    const action = getQaAction(row);
    if (action === 'importar' || action === 'mantener' || action === 'actualizar') score += 2;
    if (action === 'revisar') score -= 2;
    if (action === 'eliminar' || action === 'descartar') score -= 5;
    return score;
}

function chooseRepresentative(rows) {
    return [...rows].sort((a, b) => scoreRowQuality(b) - scoreRowQuality(a))[0];
}

function unique(values) {
    return [...new Set(values.filter(Boolean))];
}

function slugify(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function makePostContent(canonical) {
    const lines = [
        `Engine: ${canonical.engine_model || ''}`,
        `Part Number: ${canonical.sku || ''}`,
        `Designation: ${canonical.designation_final || ''}`,
        `Measurement: ${canonical.measure_final || ''}`,
        `Weight: ${canonical.weight_final || ''}`,
        `Source Page: ${canonical.source_page || ''}`,
        `BOM: ${canonical.bom || ''}`,
        `Substitution Status: ${canonical.sust_status || ''}`,
        `New Part Number: ${canonical.sust_new_part_number || ''}`,
        `Superseded List: ${canonical.sust_superseded_list || ''}`
    ];
    return lines.join('\n');
}

function hasSupersededSignal(groupRows) {
    return groupRows.some((row) => {
        const hierarchy = normalizeKey(row.sust_hierarchie);
        const status = normalizeKey(row.sust_status);
        return hierarchy === 'superseded' || status === 'si';
    });
}

function hasDominantSuperseded(groupRows) {
    const supersededRows = groupRows.filter((row) => normalizeKey(row.sust_hierarchie) === 'superseded');
    return supersededRows.length > 0;
}

function hasClearSupersededRelation(groupRows) {
    return groupRows.some((row) => {
        const newPn = normalizeText(row.sust_new_part_number || row['New Part Number']);
        const oldList = normalizeText(row.sust_superseded_list || row['Superseded Part Number']);
        return Boolean(newPn || oldList);
    });
}

function collectConflictFlags(groupRows) {
    const designationSet = new Set(groupRows.map((row) => getDesignation(row)).filter(Boolean));
    const measureSet = new Set(groupRows.map((row) => getMeasure(row)).filter(Boolean));
    const weightSet = new Set(groupRows.map((row) => getWeight(row)).filter(Boolean));

    const flags = [];
    if (designationSet.size > 1) flags.push('designation_conflict');
    if (measureSet.size > 1) flags.push('measure_conflict');
    if (weightSet.size > 1) flags.push('weight_conflict');
    return flags;
}

function buildCanonicalRow(row, metadata) {
    const images = collectImages(row);
    const imageList = unique(images).join(', ');
    const categories = unique(
        [normalizeText(row.exp_categorias), normalizeText(row.categoria), normalizeText(row.atributo)]
            .join(',')
            .split(',')
            .map((item) => normalizeText(item))
    );

    const engineModel = normalizeText(row.engine_model || row.model || row.engine);
    const sourcePage = normalizeText(row['Source Page']);

    return {
        sku: metadata.sku,
        post_title: getDesignation(row),
        post_name: metadata.slug,
        post_status: 'publish',
        post_content: '',
        post_excerpt: getDesignation(row),
        regular_price: '',
        categories: categories.join(', '),
        tags: unique([engineModel, normalizeText(row.sust_hierarchie), normalizeText(row.qa_revision_accion)]).join(', '),
        product_type: 'simple',
        images: imageList,
        'meta:engine_model': engineModel,
        'meta:source_page': sourcePage,
        'meta:pos': normalizeText(row.POS),
        'meta:bom': normalizeText(row['BOM-No.']),
        'meta:designation_final': getDesignation(row),
        'meta:measure_final': getMeasure(row),
        'meta:weight_final': getWeight(row),
        'meta:sust_status': normalizeText(row.sust_status),
        'meta:sust_new_part_number': normalizeText(row.sust_new_part_number || row['New Part Number']),
        'meta:sust_superseded_list': normalizeText(row.sust_superseded_list || row['Superseded Part Number']),
        'meta:qa_revision_estado': normalizeText(row.qa_revision_estado),
        'meta:qa_revision_accion': normalizeText(row.qa_revision_accion),
        'meta:import_decision': metadata.decision,
        'meta:import_reason': metadata.reason,
        import_decision: metadata.decision,
        import_reason: metadata.reason,
        source_engine_file: normalizeText(row.__engine_file),
        source_id: normalizeText(row.ID),
        source_page: sourcePage,
        pn_final: normalizeText(row.pn_final),
        designation_final: getDesignation(row),
        measure_final: getMeasure(row),
        weight_final: getWeight(row),
        sust_status: normalizeText(row.sust_status),
        sust_hierarchie: normalizeText(row.sust_hierarchie),
        sust_new_part_number: normalizeText(row.sust_new_part_number || row['New Part Number']),
        sust_superseded_list: normalizeText(row.sust_superseded_list || row['Superseded Part Number']),
        qa_revision_estado: normalizeText(row.qa_revision_estado),
        qa_revision_accion: normalizeText(row.qa_revision_accion),
        image_url_valid: images.length > 0 && images.every(isValidImageUrl) ? 'yes' : 'no'
    };
}

function run() {
    ensureDir(OUTPUT_DIR);

    const rows = buildSourceData();
    const latestProductExport = findLatestProductExport();
    const productExportRows = latestProductExport ? readJson(latestProductExport.filePath, []) : [];
    const productExportList = Array.isArray(productExportRows)
        ? productExportRows
        : Array.isArray(productExportRows.products)
            ? productExportRows.products
            : [];

    const existingSkuSet = new Set(
        productExportList
            .map((item) => normalizeKey(item.sku || item.post_name))
            .filter(Boolean)
    );

    const miluNewSet = loadReferenceSet('MILU_New_v506.json', 'pn');
    const miluSupSet = loadReferenceSet('MILU_Superseded_v506.json', 'pn');
    const syntheticNewSet = loadReferenceSet('qa_synthetic_new.json', 'pn');
    const syntheticSupSet = loadReferenceSet('qa_synthetic_superseded.json', 'pn');

    const byPn = new Map();
    const noPnRows = [];

    for (const row of rows) {
        const pn = getPn(row);
        if (!pn) {
            noPnRows.push(row);
            continue;
        }
        const key = normalizeKey(pn);
        if (!byPn.has(key)) byPn.set(key, []);
        byPn.get(key).push(row);
    }

    const newRows = [];
    const supersededRows = [];
    const pendingRows = [];
    const discardedRows = [];

    const slugSeen = new Map();
    const skuSeen = new Map();

    const report = {
        generated_at: new Date().toISOString(),
        source: {
            engine_files: ENGINE_JSON_FILES,
            rows_read: rows.length,
            rows_without_pn: noPnRows.length,
            unique_pn: byPn.size,
            latest_product_export: latestProductExport ? latestProductExport.name : null
        },
        totals: {
            new_exportable: 0,
            superseded_exportable: 0,
            pending_review: 0,
            discarded: noPnRows.length,
            duplicated_pn_keys: 0,
            missing_designation_final: 0,
            without_valid_image: 0,
            already_in_wordpress: 0
        },
        differences_against_references: {
            milu_new_not_in_synthetic: [...miluNewSet].filter((pn) => !syntheticNewSet.has(pn)).length,
            synthetic_new_not_in_milu: [...syntheticNewSet].filter((pn) => !miluNewSet.has(pn)).length,
            milu_superseded_not_in_synthetic: [...miluSupSet].filter((pn) => !syntheticSupSet.has(pn)).length,
            synthetic_superseded_not_in_milu: [...syntheticSupSet].filter((pn) => !miluSupSet.has(pn)).length
        },
        duplicate_examples: [],
        frequent_conflicts: {},
        recommendations: []
    };

    for (const row of noPnRows) {
        const metadata = {
            sku: '',
            slug: `missing-pn-${normalizeText(row.ID || Math.random())}`,
            decision: 'discard',
            reason: 'PN ausente. No cumple campos minimos para importacion.'
        };
        discardedRows.push(buildCanonicalRow(row, metadata));
    }

    const conflictCounter = new Map();

    for (const [pnKey, groupRows] of byPn.entries()) {
        const representative = chooseRepresentative(groupRows);
        const pn = getPn(representative);
        const designation = getDesignation(representative);
        const qaActions = unique(groupRows.map((row) => getQaAction(row)).filter(Boolean));
        const qaStates = unique(groupRows.map((row) => getQaState(row)).filter(Boolean));
        const conflictFlags = collectConflictFlags(groupRows);
        const hasDuplicate = groupRows.length > 1;

        if (hasDuplicate) {
            report.totals.duplicated_pn_keys += 1;
            if (report.duplicate_examples.length < 12) {
                report.duplicate_examples.push({
                    pn,
                    rows: groupRows.length,
                    conflict_flags: conflictFlags
                });
            }
        }

        for (const flag of conflictFlags) {
            conflictCounter.set(flag, (conflictCounter.get(flag) || 0) + 1);
        }

        const hasMixedActions = qaActions.length > 1;
        const markedDiscard = qaActions.includes('eliminar') || qaActions.includes('descartar');
        const markedReview = qaActions.includes('revisar') || qaStates.includes('pendiente') || qaStates.includes('en revisión') || qaStates.includes('en revision');
        const existsInWp = existingSkuSet.has(pnKey);
        const supersededSignal = hasSupersededSignal(groupRows);
        const supersededDominant = hasDominantSuperseded(groupRows);
        const clearSuperseded = hasClearSupersededRelation(groupRows);
        const images = unique(groupRows.flatMap(collectImages));
        const missingImage = images.length === 0 || !images.every(isValidImageUrl);

        if (!designation) report.totals.missing_designation_final += 1;
        if (missingImage) report.totals.without_valid_image += 1;
        if (existsInWp) report.totals.already_in_wordpress += 1;

        let decision = 'pending_review';
        const reasons = [];

        if (!pn) {
            decision = 'discard';
            reasons.push('PN ausente');
        }

        if (!designation) {
            decision = 'discard';
            reasons.push('designation_final vacio');
        }

        if (markedDiscard) {
            decision = 'discard';
            reasons.push('marcado para eliminar/descartar en QA');
        }

        if (hasMixedActions) {
            decision = 'pending_review';
            reasons.push('acciones QA contradictorias para el mismo PN');
        }

        if (markedReview && decision !== 'discard') {
            decision = 'pending_review';
            reasons.push('estado QA requiere revision manual');
        }

        if (conflictFlags.length > 0 && decision !== 'discard') {
            decision = 'pending_review';
            reasons.push(`conflictos detectados: ${conflictFlags.join(', ')}`);
        }

        if (existsInWp && decision !== 'discard') {
            decision = 'pending_review';
            reasons.push('ya existe en WordPress/product-export');
        }

        if (supersededSignal) {
            if (supersededDominant) {
                if (clearSuperseded && decision !== 'discard') {
                    decision = 'import_superseded';
                    reasons.push('relacion superseded clara');
                } else if (decision !== 'discard') {
                    decision = 'pending_review';
                    reasons.push('superseded ambiguo sin relacion completa');
                }
            }
        }

        if (!supersededDominant && decision === 'pending_review' && reasons.length === 0) {
            decision = 'import_new';
            reasons.push('cumple condiciones para articulo nuevo');
        }

        if (!supersededSignal && !markedReview && !markedDiscard && !existsInWp && conflictFlags.length === 0 && designation) {
            decision = 'import_new';
            reasons.push('PN y designation_final validos, sin conflictos criticos');
        }

        if (missingImage && (decision === 'import_new' || decision === 'import_superseded')) {
            decision = 'pending_review';
            reasons.push('imagen ausente o no valida para publicacion');
        }

        const baseSku = pn || `NO-PN-${normalizeText(representative.ID)}`;
        const skuCount = (skuSeen.get(normalizeKey(baseSku)) || 0) + 1;
        skuSeen.set(normalizeKey(baseSku), skuCount);
        const sku = skuCount === 1 ? baseSku : `${baseSku}-DUP${skuCount}`;

        const baseSlug = slugify(baseSku || `${representative.ID}`) || `item-${normalizeText(representative.ID)}`;
        const slugCount = (slugSeen.get(baseSlug) || 0) + 1;
        slugSeen.set(baseSlug, slugCount);
        const slug = slugCount === 1 ? baseSlug : `${baseSlug}-${slugCount}`;

        const metadata = {
            sku,
            slug,
            decision,
            reason: reasons.length > 0 ? unique(reasons).join(' | ') : 'sin observaciones'
        };

        const canonical = buildCanonicalRow(representative, metadata);

        if (decision === 'import_new') {
            newRows.push(canonical);
            report.totals.new_exportable += 1;
        } else if (decision === 'import_superseded') {
            supersededRows.push(canonical);
            report.totals.superseded_exportable += 1;
        } else if (decision === 'discard') {
            discardedRows.push(canonical);
            report.totals.discarded += 1;
        } else {
            pendingRows.push(canonical);
            report.totals.pending_review += 1;
        }
    }

    report.frequent_conflicts = Object.fromEntries(
        [...conflictCounter.entries()].sort((a, b) => b[1] - a[1])
    );

    report.recommendations = [
        'Revisar primero los pendientes por conflictos de designation/weight para PN duplicado.',
        'Confirmar politica de imagen obligatoria antes de mover pendientes a importables.',
        'Para PN ya existentes en WordPress, decidir entre update_existing o keep_existing antes de exportar.',
        'Usar qa_revision_accion=eliminar para exclusiones definitivas y qa_revision_accion=revisar para circuito humano.'
    ];

    const headers = [
        'sku',
        'post_title',
        'post_name',
        'post_status',
        'post_content',
        'post_excerpt',
        'regular_price',
        'categories',
        'tags',
        'product_type',
        'images',
        'meta:engine_model',
        'meta:source_page',
        'meta:pos',
        'meta:bom',
        'meta:designation_final',
        'meta:measure_final',
        'meta:weight_final',
        'meta:sust_status',
        'meta:sust_new_part_number',
        'meta:sust_superseded_list',
        'meta:qa_revision_estado',
        'meta:qa_revision_accion',
        'meta:import_decision',
        'meta:import_reason',
        'import_decision',
        'import_reason',
        'source_engine_file',
        'source_id',
        'source_page',
        'pn_final',
        'designation_final',
        'measure_final',
        'weight_final',
        'sust_status',
        'sust_hierarchie',
        'sust_new_part_number',
        'sust_superseded_list',
        'qa_revision_estado',
        'qa_revision_accion',
        'image_url_valid'
    ];

    for (const row of [...newRows, ...supersededRows]) {
        row.post_content = makePostContent({
            sku: row.sku,
            engine_model: row['meta:engine_model'],
            designation_final: row['meta:designation_final'],
            measure_final: row['meta:measure_final'],
            weight_final: row['meta:weight_final'],
            source_page: row['meta:source_page'],
            bom: row['meta:bom'],
            sust_status: row['meta:sust_status'],
            sust_new_part_number: row['meta:sust_new_part_number'],
            sust_superseded_list: row['meta:sust_superseded_list']
        });
    }

    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_new_import.csv'), newRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_superseded_import.csv'), supersededRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_pending_review.csv'), pendingRows, headers);
    writeCsv(path.join(OUTPUT_DIR, 'milu_wp_discarded.csv'), discardedRows, headers);

    writeJson(path.join(OUTPUT_DIR, 'milu_wp_new_import.json'), newRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_superseded_import.json'), supersededRows);
    writeJson(path.join(OUTPUT_DIR, 'milu_wp_export_report.json'), report);

    const summary = [
        '# MILU WordPress Export Summary',
        '',
        `Generated at: ${report.generated_at}`,
        '',
        '## Totals',
        `- Rows read: ${report.source.rows_read}`,
        `- Unique PN: ${report.source.unique_pn}`,
        `- New exportable: ${report.totals.new_exportable}`,
        `- Superseded exportable: ${report.totals.superseded_exportable}`,
        `- Pending review: ${report.totals.pending_review}`,
        `- Discarded: ${report.totals.discarded}`,
        `- Duplicate PN keys: ${report.totals.duplicated_pn_keys}`,
        `- Missing designation_final: ${report.totals.missing_designation_final}`,
        `- Without valid image: ${report.totals.without_valid_image}`,
        `- Already in WordPress: ${report.totals.already_in_wordpress}`,
        '',
        '## Reference Differences',
        `- MILU_New not in synthetic: ${report.differences_against_references.milu_new_not_in_synthetic}`,
        `- Synthetic new not in MILU_New: ${report.differences_against_references.synthetic_new_not_in_milu}`,
        `- MILU_Superseded not in synthetic: ${report.differences_against_references.milu_superseded_not_in_synthetic}`,
        `- Synthetic superseded not in MILU_Superseded: ${report.differences_against_references.synthetic_superseded_not_in_milu}`,
        '',
        '## Recommendations',
        ...report.recommendations.map((item) => `- ${item}`)
    ].join('\n');

    fs.writeFileSync(path.join(OUTPUT_DIR, 'milu_wp_export_summary.md'), `${summary}\n`, 'utf8');

    console.log('WordPress export generated in data/output/wordpress');
    console.log(JSON.stringify(report.totals, null, 2));
}

if (require.main === module) {
    run();
}
