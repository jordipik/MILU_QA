const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'ai_review');

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

    const lines = [headers.join(';')];
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCell(row[h])).join(';'));
    }
    fs.writeFileSync(filePath, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function t(value) {
    return String(value == null ? '' : value).trim();
}

function key(value) {
    return t(value).toLowerCase();
}

function getPn(row) {
    return t(row['PART NO.'] || row.pn || row.pn_final);
}

function getDesignation(row) {
    return t(row.designation_final || row.designation_gesa || row.DESIGNATION);
}

function getMeasure(row) {
    return t(row.measure_final || row.dimensions_gesa || row['MEASUREMENT / STANDARD']);
}

function getWeight(row) {
    return t(row.weight_final || row.weight_gesa || row.WEIGHT);
}

function getImage(row) {
    return t(row.exp_imagenes || row.ruta_foto);
}

function getQaAction(row) {
    return key(row.qa_revision_accion);
}

function getQaState(row) {
    return key(row.qa_revision_estado);
}

function listUnique(values) {
    return [...new Set(values.filter(Boolean))];
}

function loadReferenceSet(fileName, fieldName) {
    const filePath = path.join(REPO_ROOT, fileName);
    const data = readJson(filePath, []);
    if (!Array.isArray(data)) return new Set();
    return new Set(data.map((item) => key(item[fieldName])).filter(Boolean));
}

function findLatestProductExportSet() {
    const candidates = fs
        .readdirSync(REPO_ROOT)
        .filter((name) => /^product-export-.*\.json$/i.test(name))
        .map((name) => {
            const filePath = path.join(REPO_ROOT, name);
            const stat = fs.statSync(filePath);
            return { name, filePath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (!candidates[0]) return { name: null, set: new Set() };

    const parsed = readJson(candidates[0].filePath, []);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.products) ? parsed.products : [];
    const set = new Set(rows.map((row) => key(row.sku || row.post_name)).filter(Boolean));
    return { name: candidates[0].name, set };
}

function collectRows() {
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

function hasValueConflict(values) {
    return listUnique(values.map((v) => t(v))).length > 1;
}

function detectConflicts(pn, groupRows, context) {
    const conflicts = [];
    const fields = new Set();

    const designValues = groupRows.flatMap((row) => [row.DESIGNATION, row.designation_gesa, row.designation_final, row.designation_pdf]);
    const measureValues = groupRows.flatMap((row) => [row['MEASUREMENT / STANDARD'], row.dimensions_gesa, row.measure_final, row.measure_pdf]);
    const weightValues = groupRows.flatMap((row) => [row.WEIGHT, row.weight_gesa, row.weight_final, row.weight_pdf]);

    if (!pn) {
        conflicts.push('pn_missing');
        fields.add('PART NO.');
    }

    if (groupRows.length > 1) {
        conflicts.push('pn_duplicate');
        fields.add('PART NO.');
    }

    const pnInGesaNoPdf = groupRows.some((row) => key(row.gesa) === 'si' && !t(row.pn_pdf));
    if (pnInGesaNoPdf) {
        conflicts.push('pn_in_gesa_not_pdf');
        fields.add('pn_pdf');
    }

    const pnInPdfNoGesa = groupRows.some((row) => t(row.pn_pdf) && key(row.gesa) !== 'si');
    if (pnInPdfNoGesa) {
        conflicts.push('pn_in_pdf_not_gesa');
        fields.add('gesa');
    }

    if (hasValueConflict(designValues)) {
        conflicts.push('designation_mismatch_sources');
        fields.add('designation_final');
    }

    const finalMeasure = listUnique(groupRows.map((row) => getMeasure(row)));
    if (finalMeasure.length === 0) {
        conflicts.push('measure_missing_or_weak');
        fields.add('measure_final');
    }

    if (hasValueConflict(weightValues)) {
        conflicts.push('weight_conflict');
        fields.add('weight_final');
    }

    const sustSignals = listUnique(
        groupRows.flatMap((row) => [t(row.sust_status), t(row.sust_hierarchie), t(row.sust_status_pdf)])
    );
    if (sustSignals.length > 1) {
        conflicts.push('sust_status_ambiguous');
        fields.add('sust_status');
    }

    const supersededWithoutNew = groupRows.some((row) => {
        const hierarchy = key(row.sust_hierarchie);
        const status = key(row.sust_status);
        const newPn = t(row.sust_new_part_number || row['New Part Number']);
        return (hierarchy === 'superseded' || status === 'si') && !newPn;
    });
    if (supersededWithoutNew) {
        conflicts.push('superseded_without_new_pn');
        fields.add('sust_new_part_number');
    }

    if (pn && context.wpSkuSet.has(key(pn))) {
        conflicts.push('already_exists_web');
        fields.add('sku');
    }

    const imageValues = listUnique(groupRows.map((row) => getImage(row)));
    if (imageValues.length === 0) {
        conflicts.push('image_missing');
        fields.add('exp_imagenes');
    }

    const hasPlaceholderImage = imageValues.some((value) => /(placeholder|no[-_ ]?image|default|sin[-_ ]?foto)/i.test(value));
    if (hasPlaceholderImage) {
        conflicts.push('image_placeholder');
        fields.add('exp_imagenes');
    }

    const manualReview = groupRows.some((row) => {
        const action = getQaAction(row);
        const state = getQaState(row);
        return action === 'revisar' || state === 'pendiente' || state === 'en revisión' || state === 'en revision';
    });
    if (manualReview) {
        conflicts.push('manual_review_marked');
        fields.add('qa_revision_accion');
    }

    const pnKey = key(pn);
    if (pnKey && (context.miluNewSet.has(pnKey) !== context.syntheticNewSet.has(pnKey))) {
        conflicts.push('diff_milu_new_vs_synthetic');
        fields.add('pn');
    }

    if (pnKey && (context.miluSupSet.has(pnKey) !== context.syntheticSupSet.has(pnKey))) {
        conflicts.push('diff_milu_superseded_vs_synthetic');
        fields.add('pn');
    }

    return {
        conflictCodes: listUnique(conflicts),
        fieldsInConflict: [...fields]
    };
}

function computeDecision(pn, groupRows, conflictCodes, context) {
    const has = (code) => conflictCodes.includes(code);

    const critical = ['pn_missing', 'designation_mismatch_sources', 'superseded_without_new_pn'];
    const medium = ['pn_duplicate', 'measure_missing_or_weak', 'weight_conflict', 'sust_status_ambiguous', 'manual_review_marked'];
    const minor = ['image_missing', 'image_placeholder', 'diff_milu_new_vs_synthetic', 'diff_milu_superseded_vs_synthetic'];

    let score = 1.0;
    for (const code of conflictCodes) {
        if (critical.includes(code)) score -= 0.28;
        else if (medium.includes(code)) score -= 0.15;
        else if (minor.includes(code)) score -= 0.06;
        else score -= 0.1;
    }

    score = Math.max(0.05, Math.min(0.99, score));

    const designation = listUnique(groupRows.map((row) => getDesignation(row)));
    const qaActions = listUnique(groupRows.map((row) => getQaAction(row)));
    const hasSuperseded = groupRows.some((row) => key(row.sust_hierarchie) === 'superseded' || key(row.sust_status) === 'si');
    const hasClearSupersededRelation = groupRows.some((row) => t(row.sust_new_part_number || row['New Part Number']) || t(row.sust_superseded_list));

    let aiDecision = 'pending_review';

    if (!pn || designation.length === 0 || qaActions.includes('eliminar') || qaActions.includes('descartar')) {
        aiDecision = 'discard';
    } else if (has('already_exists_web')) {
        aiDecision = conflictCodes.length >= 3 ? 'update_existing' : 'keep_existing';
    } else if (hasSuperseded && hasClearSupersededRelation && !has('superseded_without_new_pn')) {
        aiDecision = 'import_superseded';
    } else if (!hasSuperseded && score >= 0.75 && !has('manual_review_marked')) {
        aiDecision = 'import_new';
    } else {
        aiDecision = 'pending_review';
    }

    const confidenceLevel = score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low';
    const requiredHuman = aiDecision === 'pending_review' || confidenceLevel === 'low' || has('manual_review_marked');

    let suggestedAction = 'revisar';
    if (aiDecision === 'discard') suggestedAction = 'eliminar';
    else if (aiDecision === 'import_new' || aiDecision === 'import_superseded') suggestedAction = 'importar';
    else if (aiDecision === 'keep_existing') suggestedAction = 'mantener';
    else if (aiDecision === 'update_existing') suggestedAction = 'actualizar';

    const reasons = [];
    if (aiDecision === 'discard') reasons.push('faltan campos criticos o se marco para eliminar');
    if (aiDecision === 'import_new') reasons.push('datos nucleares consistentes y sin contradicciones criticas');
    if (aiDecision === 'import_superseded') reasons.push('relacion de sustitucion clara detectada');
    if (aiDecision === 'keep_existing') reasons.push('el SKU ya existe y no exige sustitucion directa');
    if (aiDecision === 'update_existing') reasons.push('el SKU ya existe y hay inconsistencias menores a corregir');
    if (aiDecision === 'pending_review') reasons.push('se requiere validacion humana por conflictos detectados');

    return {
        aiDecision,
        aiConfidence: Number(score.toFixed(2)),
        aiConfidenceLevel: confidenceLevel,
        aiReason: reasons.join('. '),
        aiRequiredHumanReview: requiredHuman,
        aiSuggestedAction: suggestedAction
    };
}

function run() {
    ensureDir(OUTPUT_DIR);

    const rows = collectRows();

    const miluNewSet = loadReferenceSet('MILU_New_v506.json', 'pn');
    const miluSupSet = loadReferenceSet('MILU_Superseded_v506.json', 'pn');
    const syntheticNewSet = loadReferenceSet('qa_synthetic_new.json', 'pn');
    const syntheticSupSet = loadReferenceSet('qa_synthetic_superseded.json', 'pn');
    const wpExport = findLatestProductExportSet();

    const context = {
        miluNewSet,
        miluSupSet,
        syntheticNewSet,
        syntheticSupSet,
        wpSkuSet: wpExport.set
    };

    const byPn = new Map();
    const noPnRows = [];

    for (const row of rows) {
        const pn = getPn(row);
        if (!pn) {
            noPnRows.push(row);
            continue;
        }
        const k = key(pn);
        if (!byPn.has(k)) byPn.set(k, []);
        byPn.get(k).push(row);
    }

    const full = [];

    for (const row of noPnRows) {
        const { conflictCodes, fieldsInConflict } = detectConflicts('', [row], context);
        const decision = computeDecision('', [row], conflictCodes, context);
        full.push({
            pn: '',
            source_id: t(row.ID),
            source_engine_file: t(row.__engine_file),
            row_count: 1,
            ai_decision: decision.aiDecision,
            ai_confidence: decision.aiConfidence,
            ai_confidence_level: decision.aiConfidenceLevel,
            ai_reason: decision.aiReason,
            ai_conflict_codes: conflictCodes,
            ai_required_human_review: decision.aiRequiredHumanReview,
            ai_suggested_action: decision.aiSuggestedAction,
            ai_fields_in_conflict: fieldsInConflict,
            designation_final: getDesignation(row),
            measure_final: getMeasure(row),
            weight_final: getWeight(row),
            qa_revision_estado: t(row.qa_revision_estado),
            qa_revision_accion: t(row.qa_revision_accion),
            sust_status: t(row.sust_status),
            sust_hierarchie: t(row.sust_hierarchie),
            exists_in_wordpress: false
        });
    }

    for (const [pnKey, groupRows] of byPn.entries()) {
        const pn = getPn(groupRows[0]);
        const { conflictCodes, fieldsInConflict } = detectConflicts(pn, groupRows, context);
        const decision = computeDecision(pn, groupRows, conflictCodes, context);

        const representative = [...groupRows].sort((a, b) => getDesignation(b).length - getDesignation(a).length)[0] || groupRows[0];

        full.push({
            pn,
            source_id: t(representative.ID),
            source_engine_file: t(representative.__engine_file),
            row_count: groupRows.length,
            ai_decision: decision.aiDecision,
            ai_confidence: decision.aiConfidence,
            ai_confidence_level: decision.aiConfidenceLevel,
            ai_reason: decision.aiReason,
            ai_conflict_codes: conflictCodes,
            ai_required_human_review: decision.aiRequiredHumanReview,
            ai_suggested_action: decision.aiSuggestedAction,
            ai_fields_in_conflict: fieldsInConflict,
            designation_final: getDesignation(representative),
            measure_final: getMeasure(representative),
            weight_final: getWeight(representative),
            qa_revision_estado: t(representative.qa_revision_estado),
            qa_revision_accion: t(representative.qa_revision_accion),
            sust_status: t(representative.sust_status),
            sust_hierarchie: t(representative.sust_hierarchie),
            exists_in_wordpress: context.wpSkuSet.has(pnKey)
        });
    }

    const decisionCount = new Map();
    const conflictCount = new Map();

    for (const item of full) {
        decisionCount.set(item.ai_decision, (decisionCount.get(item.ai_decision) || 0) + 1);
        for (const code of item.ai_conflict_codes) {
            conflictCount.set(code, (conflictCount.get(code) || 0) + 1);
        }
    }

    const summaryRows = [...conflictCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({
            conflict_code: code,
            records: count,
            sample_pn: (full.find((item) => item.ai_conflict_codes.includes(code)) || {}).pn || ''
        }));

    const pendingRows = full.filter((item) => item.ai_required_human_review);

    writeJson(path.join(OUTPUT_DIR, 'ai_conflicts_full.json'), full);
    writeCsv(
        path.join(OUTPUT_DIR, 'ai_conflicts_summary.csv'),
        summaryRows,
        ['conflict_code', 'records', 'sample_pn']
    );
    writeCsv(
        path.join(OUTPUT_DIR, 'ai_pending_human_review.csv'),
        pendingRows,
        [
            'pn',
            'source_id',
            'source_engine_file',
            'row_count',
            'ai_decision',
            'ai_confidence',
            'ai_confidence_level',
            'ai_reason',
            'ai_suggested_action',
            'qa_revision_estado',
            'qa_revision_accion',
            'designation_final',
            'measure_final',
            'weight_final'
        ]
    );

    const matrix = [
        {
            decision: 'import_new',
            conditions: 'PN valido, designation_final presente, sin conflicto critico y sin señal superseded dominante.',
            required_fields: 'PART NO., designation_final',
            risks: 'datos secundarios incompletos (medida/peso) pueden requerir mejora posterior.',
            example: (full.find((x) => x.ai_decision === 'import_new') || {}).pn || ''
        },
        {
            decision: 'import_superseded',
            conditions: 'sust_status/sust_hierarchie activo y relacion old->new clara.',
            required_fields: 'PART NO., sust_new_part_number o sust_superseded_list',
            risks: 'relaciones incorrectas pueden crear enlaces erróneos en la web.',
            example: (full.find((x) => x.ai_decision === 'import_superseded') || {}).pn || ''
        },
        {
            decision: 'keep_existing',
            conditions: 'SKU ya presente en WordPress y sin conflicto severo.',
            required_fields: 'sku',
            risks: 'pueden quedar datos desactualizados.',
            example: (full.find((x) => x.ai_decision === 'keep_existing') || {}).pn || ''
        },
        {
            decision: 'update_existing',
            conditions: 'SKU ya presente en WordPress pero con conflictos menores.',
            required_fields: 'sku y campos a corregir',
            risks: 'actualizacion parcial puede romper consistencia entre fuentes.',
            example: (full.find((x) => x.ai_decision === 'update_existing') || {}).pn || ''
        },
        {
            decision: 'discard',
            conditions: 'falta de PN/designation o accion QA de eliminar.',
            required_fields: 'motivo trazable',
            risks: 'descartar de más sin validación humana previa.',
            example: (full.find((x) => x.ai_decision === 'discard') || {}).pn || 'SIN_PN'
        },
        {
            decision: 'pending_review',
            conditions: 'conflictos criticos o contradicciones entre fuentes.',
            required_fields: 'lista de conflictos y campos implicados',
            risks: 'cuello de botella de revisión manual.',
            example: (full.find((x) => x.ai_decision === 'pending_review') || {}).pn || ''
        }
    ];

    const reportLines = [
        '# AI Decision Report',
        '',
        `Generated at: ${new Date().toISOString()}`,
        `Source rows: ${rows.length}`,
        `Unique records analyzed: ${full.length}`,
        `Product export baseline: ${wpExport.name || 'none'}`,
        '',
        '## Decisions',
        ...[...decisionCount.entries()].sort((a, b) => b[1] - a[1]).map(([d, c]) => `- ${d}: ${c}`),
        '',
        '## Top Conflicts',
        ...summaryRows.slice(0, 15).map((row) => `- ${row.conflict_code}: ${row.records}`),
        '',
        '## Low Confidence Items',
        `- Total low confidence: ${full.filter((x) => x.ai_confidence_level === 'low').length}`,
        '',
        '## Automatically Importable',
        `- import_new: ${decisionCount.get('import_new') || 0}`,
        `- import_superseded: ${decisionCount.get('import_superseded') || 0}`,
        '',
        '## Requires Human Review',
        `- pending human review: ${pendingRows.length}`,
        '',
        '## Decision Matrix',
        '| decision | conditions | required_fields | risks | example |',
        '|---|---|---|---|---|',
        ...matrix.map((m) => `| ${m.decision} | ${m.conditions} | ${m.required_fields} | ${m.risks} | ${m.example} |`),
        '',
        '## UI Integration Proposal (qa_milu.html)',
        '- Añadir filtro "IA decision" (todos + 6 decisiones).',
        '- Añadir filtro "IA confidence" (high/medium/low).',
        '- Añadir columna compacta IA: decision + confidence + conflicto principal.',
        '- En panel lateral, mostrar razon completa, codigos de conflicto y accion sugerida.',
        '- Incluir boton "Aplicar sugerencia IA" que solo rellena qa_revision_accion y persiste via /save-json tras confirmacion.',
        '- No persistir campos IA en engine_*.json por defecto; usar exportes en data/output/ai_review como capa de trazabilidad.'
    ];

    fs.writeFileSync(path.join(OUTPUT_DIR, 'ai_decision_report.md'), `${reportLines.join('\n')}\n`, 'utf8');

    console.log('AI conflict outputs generated in data/output/ai_review');
    console.log(JSON.stringify(Object.fromEntries(decisionCount), null, 2));
}

if (require.main === module) {
    run();
}
