#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ENGINE_JSON_FILES } = require('../engine_files');
const { recomputeEngineErrors } = require('../recompute_engine_errors');

const ROOT_DIR = path.resolve(__dirname, '..');
const PDF_DIR = path.join(ROOT_DIR, 'pdf');

const PDF_CLUSTER_GAP_MAX = 24;
const PDF_LINE_Y_TOLERANCE = 2;

const PDF_FIELD_TO_JSON_KEY = {
    'POS': 'pos_pdf',
    'PART NO.': 'pn_pdf',
    'DESIGNATION': 'designation_pdf',
    'MODEL/TYPE': 'model_type_pdf',
    'QTY': 'qty_pdf',
    'UNITS': 'units_pdf',
    'WEIGHT': 'weight_pdf',
    'FN': 'fn_pdf',
    'MEASUREMENT / STANDARD': 'measure_pdf',
    'FG/FGS': 'fg_fgs_pdf',
    'GESA': 'gesa_pdf',
    'NSN': 'nsn_pdf',
    'NORMALIZADO': 'normalizado_pdf',
    'NORMA': 'norma_pdf',
    'SUST_STATUS': 'sust_status_pdf',
    'HIERARCHI': 'hierarchi_pdf',
    'SUST_NEW_PART_NUMBER': 'sust_new_part_number_pdf',
    'SUST_SUPERSEDED_LIST': 'sust_superseded_list_pdf',
    'BOM-No.': 'bom_pdf'
};

let cachedStandardFontDataUrl = null;

function getPdfStandardFontDataUrl() {
    if (cachedStandardFontDataUrl !== null) return cachedStandardFontDataUrl;

    try {
        const pdfjsPkgPath = require.resolve('pdfjs-dist/package.json');
        const standardFontsDir = path.join(path.dirname(pdfjsPkgPath), 'standard_fonts');
        if (fs.existsSync(standardFontsDir)) {
            cachedStandardFontDataUrl = standardFontsDir.endsWith(path.sep)
                ? standardFontsDir
                : `${standardFontsDir}${path.sep}`;
            return cachedStandardFontDataUrl;
        }
    } catch (_error) {
        // Si no se puede resolver pdfjs-dist, dejamos null y pdf.js usara fallback interno.
    }

    cachedStandardFontDataUrl = null;
    return cachedStandardFontDataUrl;
}

function printUsage() {
    console.log('Uso:');
    console.log('  node scripts/qa_pdf_compare.js --file=<engine_file.json> [--id=<ID>] [--output=<ruta.json>] [--write-pdf] [--recompute-errors] [--no-backup]');
    console.log('');
    console.log('Ejemplos:');
    console.log('  node scripts/qa_pdf_compare.js --file=engine_12V4000M40A.json --id=1101334');
    console.log('  node scripts/qa_pdf_compare.js --file=engine_12V4000M40A.json --write-pdf --recompute-errors');
}

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = {
        file: '',
        id: '',
        output: '',
        writePdf: false,
        recomputeErrors: false,
        backup: true
    };

    for (const arg of args) {
        if (arg === '--write-pdf') {
            out.writePdf = true;
            continue;
        }
        if (arg === '--recompute-errors') {
            out.recomputeErrors = true;
            continue;
        }
        if (arg === '--no-backup') {
            out.backup = false;
            continue;
        }
        if (arg.startsWith('--file=')) {
            out.file = String(arg.slice('--file='.length)).trim();
            continue;
        }
        if (arg.startsWith('--id=')) {
            out.id = String(arg.slice('--id='.length)).trim();
            continue;
        }
        if (arg.startsWith('--output=')) {
            out.output = String(arg.slice('--output='.length)).trim();
            continue;
        }
    }

    return out;
}

function text(value) {
    return String(value ?? '').trim();
}

function normalizeCompareValue(value) {
    return text(value)
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDesignationCompareValue(value) {
    let normalized = normalizeCompareValue(value);
    if (!normalized) return '';

    // OCR / carga GESA a veces separa una sola letra dentro de una palabra:
    // "carbo n" -> "carbon".
    let previous = '';
    while (normalized !== previous) {
        previous = normalized;
        normalized = normalized.replace(/([a-z0-9]{2,})\s([a-z0-9])\b/g, '$1$2');
    }
    return normalized;
}

function isCompareMatch(left, right) {
    const normalizedLeft = normalizeCompareValue(left);
    const normalizedRight = normalizeCompareValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

function isDesignationCompareMatch(left, right) {
    const normalizedLeft = normalizeDesignationCompareValue(left);
    const normalizedRight = normalizeDesignationCompareValue(right);
    return normalizedLeft !== '' && normalizedRight !== '' && normalizedLeft === normalizedRight;
}

function normalizePdfToken(value) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractExactPdfSubstring(sourceText, candidate) {
    const source = String(sourceText ?? '').trim();
    const rawCandidate = String(candidate ?? '').trim();
    if (!source || !rawCandidate) return '';

    const directIndex = source.toLowerCase().indexOf(rawCandidate.toLowerCase());
    if (directIndex >= 0) {
        return source.slice(directIndex, directIndex + rawCandidate.length);
    }

    const pattern = rawCandidate
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => escapeRegExp(part))
        .join('\\s+');
    if (!pattern) return '';

    const regex = new RegExp(pattern, 'i');
    const match = source.match(regex);
    return match?.[0] || '';
}

function tokenMatchesPdf(pageText, candidateValue) {
    if (!pageText || !candidateValue) return false;
    if (pageText === candidateValue) return true;
    if (!pageText.includes(candidateValue)) return false;

    const separatorRegex = /[\s\-\,\.\;\/\(\)]/;
    let searchIndex = pageText.indexOf(candidateValue);
    while (searchIndex !== -1) {
        const endIndex = searchIndex + candidateValue.length;
        const beforeOk = searchIndex === 0 || separatorRegex.test(pageText[searchIndex - 1]);
        const afterOk = endIndex === pageText.length || separatorRegex.test(pageText[endIndex]);
        if (beforeOk && afterOk) return true;
        searchIndex = pageText.indexOf(candidateValue, searchIndex + 1);
    }

    return false;
}

function resolvePdfPageNumber(value) {
    const parsed = Number(String(value ?? '').replace(/[^0-9]/g, ''));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function inferModelFromEngineFile(file) {
    return String(file || '').replace(/^engine_/i, '').replace(/\.json$/i, '').trim();
}

function getGesaPn(row) {
    const isGesaSi = text(row?.gesa).toUpperCase() === 'SI';
    if (!isGesaSi) return null;
    return text(row?.pn_final) || null;
}

function getSustPn(row) {
    const isSustSi = text(row?.sust_status).toUpperCase() === 'SI';
    if (!isSustSi) return null;
    return text(row?.pn_final) || null;
}

function getGesaWeightWithUnits(row) {
    const weight = text(row?.weight_gesa);
    const units = text(row?.units);
    if (weight && units) return `${weight} ${units}`;
    if (weight) return weight;
    return null;
}

function buildComparisonRows(row) {
    return [
        { field: 'POS', raw: row?.POS, gesa: null, sust: null, final: row?.pos_final },
        { field: 'PART NO.', raw: row?.['PART NO.'], gesa: getGesaPn(row), sust: getSustPn(row), final: row?.pn_final },
        { field: 'DESIGNATION', raw: row?.DESIGNATION, gesa: row?.designation_gesa, sust: null, final: row?.designation_final },
        { field: 'MODEL/TYPE', raw: row?.['MODEL/TYPE'], gesa: null, sust: null, final: row?.['MODEL/TYPE'] },
        { field: 'QTY', raw: row?.QTY, gesa: null, sust: null, final: row?.qty_final },
        { field: 'UNITS', raw: row?.UNITS, gesa: null, sust: null, final: row?.UNITS },
        { field: 'WEIGHT', raw: row?.WEIGHT, gesa: getGesaWeightWithUnits(row), sust: null, final: row?.weight_final },
        { field: 'FN', raw: row?.FN, gesa: null, sust: null, final: row?.FN },
        { field: 'MEASUREMENT / STANDARD', raw: row?.['MEASUREMENT / STANDARD'], gesa: row?.dimensions_gesa, sust: null, final: row?.measure_final },
        { field: 'FG/FGS', raw: row?.['FG/FGS'], gesa: null, sust: null, final: row?.['FG/FGS'] },
        { field: 'BOM-No.', raw: row?.['BOM-No.'], gesa: null, sust: null, final: row?.['BOM-No.'] },
        { field: 'GESA', raw: null, gesa: row?.gesa, sust: null, final: row?.gesa },
        { field: 'NSN', raw: null, gesa: row?.nsn, sust: null, final: row?.nsn },
        { field: 'NORMALIZADO', raw: null, gesa: row?.normalizado, sust: null, final: row?.normalizado },
        { field: 'NORMA', raw: null, gesa: row?.norma, sust: null, final: row?.norma },
        { field: 'SUST_STATUS', raw: null, gesa: null, sust: row?.sust_status, final: row?.sust_status },
        { field: 'HIERARCHI', raw: null, gesa: null, sust: row?.hierarchi ?? row?.sust_hierarchie, final: row?.hierarchi ?? row?.sust_hierarchie },
        { field: 'SUST_NEW_PART_NUMBER', raw: null, gesa: null, sust: row?.sust_new_part_number, final: row?.sust_new_part_number },
        { field: 'SUST_SUPERSEDED_LIST', raw: null, gesa: null, sust: row?.sust_superseded_list, final: row?.sust_superseded_list }
    ];
}

function isBomField(fieldName) {
    return String(fieldName ?? '').trim().toLowerCase().includes('bom');
}

function findPdfPnAnchor(row, pageText) {
    if (!pageText || !pageText.normalizedText) return null;

    const pnCandidates = [row?.pn_final, row?.['PART NO.']]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);

    for (const candidate of pnCandidates) {
        const normalized = normalizePdfToken(candidate);
        const clusterMatch = pageText.clusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));
        if (clusterMatch) return { lineIndex: clusterMatch.lineIndex, token: normalized };

        const itemMatch = pageText.items.find((item) => tokenMatchesPdf(item.normalized, normalized));
        if (itemMatch) return { lineIndex: itemMatch.lineIndex, token: normalized };
    }

    return null;
}

function isLikelyDesignationText(value) {
    const raw = text(value);
    if (!raw) return false;
    if (!/[\p{L}]/u.test(raw)) return false;
    if (/^[0-9\s\-\.,/()]+$/.test(raw)) return false;
    return true;
}

function extractDesignationFromPnRight(row, pageText, pnAnchor) {
    if (!pageText || !Array.isArray(pageText.clusters)) return '';
    if (!pnAnchor || !Number.isInteger(pnAnchor.lineIndex)) return '';

    const rowId = text(row?.ID);

    const pnCandidates = [row?.pn_final, row?.['PART NO.']]
        .map((value) => normalizePdfToken(String(value ?? '').trim()))
        .filter(Boolean);
    if (pnCandidates.length === 0) return '';

    const lineClusters = pageText.clusters
        .filter((cluster) => cluster.lineIndex === pnAnchor.lineIndex)
        .sort((a, b) => a.left - b.left);
    if (lineClusters.length === 0) {
        console.info(`[qa_pdf_compare] ID=${rowId} DESIGNATION fallback: sin clusters en linea PN=${pnAnchor.lineIndex}`);
        return '';
    }

    const pnCluster = lineClusters.find((cluster) => pnCandidates.some((candidate) => tokenMatchesPdf(cluster.normalized, candidate)));
    if (!pnCluster) {
        console.info(`[qa_pdf_compare] ID=${rowId} DESIGNATION fallback: PN ancla no localizado dentro de clusters de linea ${pnAnchor.lineIndex}`);
        return '';
    }

    // Case: PN and DESIGNATION merged into same cluster (gap <= PDF_CLUSTER_GAP_MAX).
    // Extract text following the PN within the cluster as the designation candidate.
    for (const pnCandidate of pnCandidates) {
        const idx = pnCluster.normalized.indexOf(pnCandidate);
        if (idx >= 0) {
            const afterPnText = pnCluster.text.slice(idx + pnCandidate.length).trim();
            if (afterPnText && isLikelyDesignationText(afterPnText)) {
                console.info(`[qa_pdf_compare] ID=${rowId} DESIGNATION fallback: extraído de mismo cluster que PN='${pnCluster.text}', resultado='${afterPnText}'`);
                return afterPnText;
            }
            break;
        }
    }

    const rightSide = lineClusters
        .filter((cluster) => cluster.left >= pnCluster.right - 1)
        .filter((cluster) => cluster !== pnCluster);

    console.info(`[qa_pdf_compare] ID=${rowId} DESIGNATION fallback: PN='${pnCluster.text}' linea=${pnAnchor.lineIndex} candidatos_derecha=${rightSide.map((cluster) => `'${cluster.text}'`).join(', ') || '(ninguno)'}`);

    for (const cluster of rightSide) {
        const candidateText = text(cluster.text);
        const candidateNormalized = normalizePdfToken(candidateText);
        if (!candidateText) continue;
        if (pnCandidates.includes(candidateNormalized)) continue;
        if (!isLikelyDesignationText(candidateText)) continue;
        console.info(`[qa_pdf_compare] ID=${rowId} DESIGNATION fallback: seleccionado='${candidateText}'`);
        return candidateText;
    }

    console.info(`[qa_pdf_compare] ID=${rowId} DESIGNATION fallback: sin candidato valido a la derecha del PN`);

    return '';
}

function getPdfValueForRow(row, entry, pageText, pnAnchor) {
    if (!pageText || !pageText.normalizedText) return { value: '-', token: '' };
    if (!pnAnchor) return { value: '-', token: '' };

    const searchClustersLine = isBomField(entry.field)
        ? pageText.clusters
        : pageText.clusters.filter((cluster) => cluster.lineIndex === pnAnchor.lineIndex);
    const searchItemsLine = isBomField(entry.field)
        ? pageText.items
        : pageText.items.filter((item) => item.lineIndex === pnAnchor.lineIndex);

    const searchScopes = [
        { clusters: searchClustersLine, items: searchItemsLine },
        { clusters: pageText.clusters, items: pageText.items }
    ];

    const candidates = [entry.final, entry.gesa, entry.raw]
        .map((value) => String(value ?? '').trim())
        .filter((value) => value && value !== '-');

    const seen = new Set();
    for (const candidate of candidates) {
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const normalized = normalizePdfToken(candidate);
        for (const scope of searchScopes) {
            const clusterMatch = scope.clusters.find((cluster) => tokenMatchesPdf(cluster.normalized, normalized));
            if (clusterMatch) {
                const exactMatch = extractExactPdfSubstring(clusterMatch.text, candidate);
                if (exactMatch) {
                    return { value: exactMatch, token: normalizePdfToken(exactMatch) };
                }
            }

            const itemMatch = scope.items.find((item) => tokenMatchesPdf(item.normalized, normalized));
            if (itemMatch) {
                const exactMatch = extractExactPdfSubstring(itemMatch.text, candidate) || itemMatch.text;
                if (exactMatch) {
                    return { value: exactMatch, token: normalizePdfToken(exactMatch) };
                }
            }
        }

        if (tokenMatchesPdf(pageText.normalizedText, normalized)) {
            return { value: candidate, token: normalized };
        }
    }

    if (entry.field === 'DESIGNATION') {
        console.info(`[qa_pdf_compare] ID=${text(row?.ID)} DESIGNATION exact match no encontrado; intentando fallback por PN en PDF`);
        const designationByLine = extractDesignationFromPnRight(row, pageText, pnAnchor);
        if (designationByLine) {
            return { value: designationByLine, token: normalizePdfToken(designationByLine) };
        }
    }

    return { value: '-', token: '' };
}

function loadJsonArray(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
        throw new Error(`El archivo no contiene un array JSON: ${filePath}`);
    }
    return data;
}

function assignIfChanged(target, key, nextValue) {
    const current = target?.[key];
    if (String(current ?? '') === String(nextValue ?? '')) return false;
    target[key] = nextValue;
    return true;
}

async function loadPdfJsLib() {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
    return mod;
}

async function getPdfPageNormalizedText(pdfjsLib, caches, book, sourcePage) {
    const bookClean = String(book ?? '').trim();
    const pageNum = resolvePdfPageNumber(sourcePage);
    if (!bookClean || !pageNum) {
        return { normalizedText: '', items: [], clusters: [], status: 'missing-book-or-page' };
    }

    const pageCacheKey = `${bookClean}::${pageNum}`;
    if (caches.pageTextCache.has(pageCacheKey)) {
        return caches.pageTextCache.get(pageCacheKey);
    }

    const task = (async () => {
        const pdfPath = path.join(PDF_DIR, `${bookClean}.pdf`);
        if (!fs.existsSync(pdfPath)) {
            return { normalizedText: '', items: [], clusters: [], status: 'pdf-not-found', pdfPath };
        }

        if (!caches.pdfDocumentPromiseCache.has(pdfPath)) {
            const pdfBuffer = fs.readFileSync(pdfPath);
            const standardFontDataUrl = getPdfStandardFontDataUrl();
            const loadingTask = pdfjsLib.getDocument({
                data: new Uint8Array(pdfBuffer),
                isEvalSupported: false,
                ...(standardFontDataUrl ? { standardFontDataUrl } : {})
            });
            caches.pdfDocumentPromiseCache.set(pdfPath, loadingTask.promise);
        }

        const pdfDocument = await caches.pdfDocumentPromiseCache.get(pdfPath);
        if (pageNum < 1 || pageNum > pdfDocument.numPages) {
            return { normalizedText: '', items: [], clusters: [], status: 'page-out-of-range', pdfPath };
        }

        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const rawItems = (textContent.items || []).map((item) => {
            const itemText = String(item?.str || '').trim();
            const tx = item?.transform || [];
            return {
                text: itemText,
                normalized: normalizePdfToken(itemText),
                left: Number(tx?.[4] || 0),
                top: Number(tx?.[5] || 0),
                width: Number(item?.width || 0)
            };
        }).filter((item) => item.normalized);

        const lines = [];
        rawItems.forEach((item) => {
            const line = lines.find((candidate) => Math.abs(candidate.top - item.top) <= PDF_LINE_Y_TOLERANCE);
            if (line) {
                line.items.push(item);
                line.top = (line.top + item.top) / 2;
            } else {
                lines.push({ top: item.top, items: [item] });
            }
        });

        lines.sort((a, b) => b.top - a.top);
        lines.forEach((line, index) => {
            line.lineIndex = index;
            line.items.forEach((item) => {
                item.lineIndex = index;
            });
        });

        const clusters = [];
        lines.forEach((line) => {
            const sorted = [...line.items].sort((a, b) => a.left - b.left);
            let currentCluster = null;

            sorted.forEach((item) => {
                if (!currentCluster) {
                    currentCluster = {
                        left: item.left,
                        right: item.left + item.width,
                        parts: [item.text],
                        normalizedParts: [item.normalized]
                    };
                    return;
                }

                const gap = item.left - currentCluster.right;
                if (gap <= PDF_CLUSTER_GAP_MAX) {
                    currentCluster.parts.push(item.text);
                    currentCluster.normalizedParts.push(item.normalized);
                    currentCluster.right = Math.max(currentCluster.right, item.left + item.width);
                    return;
                }

                clusters.push({
                    text: currentCluster.parts.join(' ').replace(/\s+/g, ' ').trim(),
                    normalized: currentCluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),
                    lineIndex: line.lineIndex,
                    left: currentCluster.left,
                    right: currentCluster.right
                });

                currentCluster = {
                    left: item.left,
                    right: item.left + item.width,
                    parts: [item.text],
                    normalizedParts: [item.normalized]
                };
            });

            if (currentCluster) {
                clusters.push({
                    text: currentCluster.parts.join(' ').replace(/\s+/g, ' ').trim(),
                    normalized: currentCluster.normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),
                    lineIndex: line.lineIndex,
                    left: currentCluster.left,
                    right: currentCluster.right
                });
            }
        });

        const joined = rawItems.map((item) => item.text).join(' ');
        return {
            normalizedText: normalizePdfToken(joined),
            items: rawItems,
            clusters,
            status: 'ok',
            pdfPath
        };
    })().catch((error) => ({
        normalizedText: '',
        items: [],
        clusters: [],
        status: 'pdf-read-error',
        error: String(error?.message || error)
    }));

    caches.pageTextCache.set(pageCacheKey, task);
    return task;
}

function resolveOutputPath(options) {
    if (options.output) {
        return path.isAbsolute(options.output)
            ? options.output
            : path.join(ROOT_DIR, options.output);
    }

    const base = String(options.file || 'engine').replace(/\.json$/i, '');
    const stamp = new Date().toISOString().replace(/[\:\.]/g, '-');
    return path.join(ROOT_DIR, `qa_pdf_compare_${base}_${stamp}.json`);
}

async function runComparison(options) {
    if (!options.file) {
        throw new Error('Falta parametro requerido: --file');
    }
    if (!ENGINE_JSON_FILES.includes(options.file)) {
        throw new Error(`Archivo no permitido (${options.file}). Permitidos: ${ENGINE_JSON_FILES.join(', ')}`);
    }

    const filePath = path.join(ROOT_DIR, options.file);
    if (!fs.existsSync(filePath)) {
        throw new Error(`No existe el archivo ${filePath}`);
    }

    const rows = loadJsonArray(filePath);
    const rowsToProcess = options.id
        ? rows.filter((row) => String(row?.ID ?? '').trim() === options.id)
        : rows;

    if (options.id && rowsToProcess.length === 0) {
        throw new Error(`No se encontro ningun registro con ID=${options.id} en ${options.file}`);
    }

    const pdfjsLib = await loadPdfJsLib();
    const caches = {
        pdfDocumentPromiseCache: new Map(),
        pageTextCache: new Map()
    };

    const outputRows = [];
    const missingPages = [];
    let changedPdfFieldsRows = 0;

    for (const row of rowsToProcess) {
        const rowBook = text(row?.engine_model) || inferModelFromEngineFile(options.file);
        const rowPage = text(row?.['Source Page']);
        const pageText = await getPdfPageNormalizedText(pdfjsLib, caches, rowBook, rowPage);
        if (pageText.status !== 'ok') {
            missingPages.push({
                ID: String(row?.ID ?? ''),
                book: rowBook,
                sourcePage: rowPage,
                status: pageText.status,
                detail: pageText.error || pageText.pdfPath || ''
            });
        }

        const entries = buildComparisonRows(row);
        const pnAnchor = findPdfPnAnchor(row, pageText);
        let rowPdfChanged = false;

        const comparisons = entries.map((entry) => {
            const pdfRead = getPdfValueForRow(row, entry, pageText, pnAnchor);
            const resolvedPdfValue = pdfRead.value === '-' ? '' : pdfRead.value;

            const pdfFieldKey = PDF_FIELD_TO_JSON_KEY[entry.field];
            if (options.writePdf && pdfFieldKey) {
                if (assignIfChanged(row, pdfFieldKey, resolvedPdfValue)) {
                    rowPdfChanged = true;
                }
            }

            return {
                field: entry.field,
                raw: text(entry.raw),
                gesa: text(entry.gesa),
                final: text(entry.final),
                pdf: resolvedPdfValue,
                finalVsPdfMatch: entry.field === 'DESIGNATION'
                    ? isDesignationCompareMatch(entry.final, resolvedPdfValue)
                    : isCompareMatch(entry.final, resolvedPdfValue),
                finalVsGesaMatch: entry.field === 'DESIGNATION'
                    ? isDesignationCompareMatch(entry.final, entry.gesa)
                    : isCompareMatch(entry.final, entry.gesa)
            };
        });

        if (rowPdfChanged) changedPdfFieldsRows += 1;

        outputRows.push({
            ID: String(row?.ID ?? ''),
            engine_model: rowBook,
            source_page: rowPage,
            pos: text(row?.POS),
            pn: text(row?.pn_final || row?.['PART NO.']),
            pnAnchorLine: Number.isInteger(pnAnchor?.lineIndex) ? pnAnchor.lineIndex : null,
            comparisons
        });
    }

    let wroteEngineFile = false;
    if (options.writePdf && changedPdfFieldsRows > 0) {
        if (options.backup) {
            fs.copyFileSync(filePath, `${filePath}.backup`);
        }
        fs.writeFileSync(filePath, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
        wroteEngineFile = true;
    }

    let recomputeSummary = null;
    if (options.recomputeErrors) {
        recomputeSummary = recomputeEngineErrors({
            file: options.file,
            id: options.id,
            dryRun: false,
            updateRevision: true,
            backup: options.backup,
            rootDir: ROOT_DIR
        });
    }

    const report = {
        generated_at: new Date().toISOString(),
        file: options.file,
        id: options.id || null,
        scanned_rows: rowsToProcess.length,
        changed_pdf_fields_rows: changedPdfFieldsRows,
        wrote_engine_file: wroteEngineFile,
        write_pdf: options.writePdf,
        recompute_errors: options.recomputeErrors,
        recompute_summary: recomputeSummary,
        missing_pages: missingPages,
        rows: outputRows
    };

    const outputPath = resolveOutputPath(options);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    return { report, outputPath };
}

async function main() {
    const options = parseArgs(process.argv);
    if (!options.file) {
        printUsage();
        process.exit(1);
    }

    try {
        const { report, outputPath } = await runComparison(options);
        console.log(JSON.stringify({
            ok: true,
            file: report.file,
            id: report.id,
            scanned_rows: report.scanned_rows,
            changed_pdf_fields_rows: report.changed_pdf_fields_rows,
            wrote_engine_file: report.wrote_engine_file,
            missing_pages: report.missing_pages.length,
            output: outputPath
        }, null, 2));
    } catch (error) {
        console.error(String(error?.message || error));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    runComparison
};
