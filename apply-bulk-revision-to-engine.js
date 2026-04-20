#!/usr/bin/env node

/**
 * Script para normalizar revisiones en bulk a un archivo engine.
 * Regla: si un Part Number tiene al menos un registro en estado "revisado",
 * entonces TODOS los registros de ese mismo Part Number, tengan el estado
 * que tengan, pasan a estado "copia".
 *
 * Uso:
 *   node apply-bulk-revision-to-engine.js <engine_file.json>
 *
 * Ejemplo:
 *   node apply-bulk-revision-to-engine.js engine_12V4000M40A.json
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Uso: node apply-bulk-revision-to-engine.js <engine_file.json> [--pn=PARTNUMBER]');
    process.exit(1);
}

const engineFile = args[0];
const filterPnArg = args.find(a => a.startsWith('--pn='));
const filterPn = filterPnArg ? filterPnArg.slice(5).trim() : null;
if (filterPn) console.log(`🔎 Filtrando solo por PN: ${filterPn}`);
const filePath = path.join(__dirname, engineFile);

if (!fs.existsSync(filePath)) {
    console.error(`Error: El archivo ${filePath} no existe.`);
    process.exit(1);
}

console.log(`📂 Cargando: ${engineFile}`);

let data;
try {
    const content = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(content);
} catch (error) {
    console.error('Error al parsear JSON:', error.message);
    process.exit(1);
}

if (!Array.isArray(data)) {
    console.error('Error: El archivo no contiene un array JSON.');
    process.exit(1);
}

console.log(`✓ Cargados ${data.length} registros\n`);

// Función para obtener el part number de un registro
function getPartNumber(record) {
    return String(record?.['PART NO.'] ?? record?.pn ?? record?.pn_final ?? '').trim();
}

// Función para obtener el estado de revisión
function getRevisionEstado(record) {
    return String(record?.qa_revision_estado || '').trim().toLowerCase();
}

// Buscar todos los registros con estado "revisado"
const recordsWithOk = data.filter(record => getRevisionEstado(record) === 'revisado');
console.log(`🔍 Encontrados ${recordsWithOk.length} registros con estado "Ok" (revisado)\n`);

if (recordsWithOk.length === 0) {
    console.log('⚠️  No hay registros con estado "Ok". Nada que hacer.');
    process.exit(0);
}

let totalUpdated = 0;
const updatesByPn = new Map();

function stripLegacyQaFields(value) {
    if (Array.isArray(value)) {
        value.forEach(stripLegacyQaFields);
        return value;
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    delete value.qa_errors;
    delete value.qa_errors_active;

    Object.values(value).forEach(stripLegacyQaFields);
    return value;
}

// Set de PN que tienen al menos un registro en estado "revisado"
const pnWithOk = new Set();
recordsWithOk.forEach((record, idx) => {
    const pn = getPartNumber(record);
    if (!pn) {
        console.log(`  ⚠️  Registro Ok ${idx + 1}: Sin Part Number, se omite.`);
        return;
    }
    if (filterPn && pn !== filterPn) return;
    pnWithOk.add(pn);
});

console.log(`🎯 Part Numbers con al menos un "Ok": ${pnWithOk.size}\n`);

// Para esos PN, marcar como "copia" TODOS los registros sin excepción de estado
const nowIso = new Date().toISOString();
data.forEach(record => {
    const pn = getPartNumber(record);
    if (!pn || !pnWithOk.has(pn)) return;

    const estadoActual = getRevisionEstado(record);

    record.qa_revision_estado = 'copia';
    record.qa_revision_updated_at = nowIso;
    totalUpdated++;

    const current = updatesByPn.get(pn) || { total: 0, fromStates: {} };
    current.total += 1;
    const keyEstado = estadoActual || '(vacío)';
    current.fromStates[keyEstado] = (current.fromStates[keyEstado] || 0) + 1;
    updatesByPn.set(pn, current);
});

if (updatesByPn.size > 0) {
    console.log('🧾 Detalle por Part Number actualizado:');
    for (const [pn, detail] of updatesByPn.entries()) {
        const breakdown = Object.entries(detail.fromStates)
            .map(([estado, count]) => `${estado}: ${count}`)
            .join(', ');
        console.log(`  ✓ PN ${pn} -> ${detail.total} registros a "Copia" (${breakdown})`);
    }
    console.log('');
}

console.log(`\n${'='.repeat(70)}`);
console.log(`📊 RESUMEN:`);
console.log(`${'='.repeat(70)}`);
console.log(`Registros fuente (estado "Ok"):     ${recordsWithOk.length}`);
console.log(`Part Numbers con "Ok":             ${pnWithOk.size}`);
console.log(`Part Numbers actualizados:          ${updatesByPn.size}`);
console.log(`Total de registros actualizados:    ${totalUpdated}`);
console.log(`${'='.repeat(70)}\n`);

if (totalUpdated > 0) {
    // Guardar el archivo actualizado
    try {
        const backupPath = filePath + '.backup';
        fs.copyFileSync(filePath, backupPath);
        console.log(`💾 Copia de seguridad creada: ${path.basename(backupPath)}`);

        stripLegacyQaFields(data);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`✅ Archivo actualizado y guardado: ${engineFile}`);
        console.log(`   ${totalUpdated} registros fueron actualizados a estado "Copia".`);
    } catch (error) {
        console.error('❌ Error al guardar el archivo:', error.message);
        process.exit(1);
    }
} else {
    console.log('⚠️  No se realizaron cambios (no hubo registros no-Ok para convertir a "Copia").');
}

console.log('');
process.exit(0);
