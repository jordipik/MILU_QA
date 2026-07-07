const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function isMeaningful(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function firstMeaningful(...values) {
  for (const value of values) {
    if (isMeaningful(value)) return value;
  }
  return undefined;
}

function setIfMeaningful(target, key, value) {
  if (isMeaningful(value)) {
    target[key] = value;
    return true;
  }
  return false;
}

function getEngineFiles() {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^engine_.*\.json$/i.test(name))
    .filter((name) => !name.includes('còpia') && !name.includes('.backup'))
    .sort((a, b) => a.localeCompare(b));
}

function applyCanonicalFields(row) {
  const next = { ...row };

  delete next.qa_errors;
  delete next.qa_errors_active;

  const canonical = {
    pos_raw: firstMeaningful(row.POS),
    pos_pdf: firstMeaningful(row.POS),
    pos_final: firstMeaningful(row.POS),

    pn_raw: firstMeaningful(row.pn_raw, row['PART NO.']),
    pn_gesa: firstMeaningful(row.pn_new),
    pn_sust: firstMeaningful(row.sust_new_part_number),
    pn_final: firstMeaningful(row.pn_final),
    pn_pdf: firstMeaningful(row.pn_recomendado),

    designation_raw: firstMeaningful(row.DESIGNATION),
    designation_gesa: firstMeaningful(row.designation_gesa),
    designation_sust: firstMeaningful(row['Denomination (New Part Number)']),
    designation_final: firstMeaningful(row.designation_final),

    model_raw: firstMeaningful(row['MODEL/TYPE']),
    model_pdf: firstMeaningful(row.model),
    model_final: firstMeaningful(row.model),

    qty_raw: firstMeaningful(row.QTY),
    qty_final: firstMeaningful(row.QTY),

    qty_units_raw: firstMeaningful(row.UNITS),
    qty_units_gesa: firstMeaningful(row.units),
    qty_units_final: firstMeaningful(row.units, row.UNITS),

    weight_raw: firstMeaningful(row.WEIGHT),
    weight_gesa: firstMeaningful(row.weight_gesa),
    weight_final: firstMeaningful(row.weight_final),

    fn_raw: firstMeaningful(row.FN),
    fn_final: firstMeaningful(row.FN),

    measure_raw: firstMeaningful(row['MEASUREMENT / STANDARD']),
    measure_gesa: firstMeaningful(row.dimensions_gesa),
    measure_final: firstMeaningful(row.measure_final, row.measurement_final),

    norma_raw: firstMeaningful(row.norma),
    norma_final: firstMeaningful(row.norma)
  };

  for (const [key, value] of Object.entries(canonical)) {
    setIfMeaningful(next, key, value);
  }

  return next;
}

function reorderKeys(row) {
  const identityOrder = [
    'ID',
    'engine_model',
    'Source Page',
    'source_file',
    'source_sheet',
    'POS'
  ];

  const canonicalOrder = [
    'pos_raw', 'pos_gesa', 'pos_sust', 'pos_final', 'pos_pdf',
    'pn_raw', 'pn_gesa', 'pn_sust', 'pn_final', 'pn_pdf',
    'designation_raw', 'designation_gesa', 'designation_sust', 'designation_final', 'designation_pdf',
    'model_raw', 'model_gesa', 'model_sust', 'model_final', 'model_pdf',
    'qty_raw', 'qty_gesa', 'qty_sust', 'qty_final', 'qty_pdf',
    'qty_units_raw', 'qty_units_gesa', 'qty_units_sust', 'qty_units_final', 'qty_units_pdf',
    'weight_raw', 'weight_gesa', 'weight_sust', 'weight_final', 'weight_pdf',
    'fn_raw', 'fn_gesa', 'fn_sust', 'fn_final', 'fn_pdf',
    'measure_raw', 'measure_gesa', 'measure_sust', 'measure_final', 'measure_pdf',
    'norma_raw', 'norma_gesa', 'norma_sust', 'norma_final', 'norma_pdf'
  ];

  const qaOrder = [
    'qa_revision_estado',
    'qa_revision_accion',
    'qa_revision_updated_at'
  ];

  const ordered = {};
  const used = new Set();

  for (const key of identityOrder) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      ordered[key] = row[key];
      used.add(key);
    }
  }

  for (const key of canonicalOrder) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      ordered[key] = row[key];
      used.add(key);
    }
  }

  for (const key of qaOrder) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      ordered[key] = row[key];
      used.add(key);
    }
  }

  const rest = Object.keys(row)
    .filter((key) => !used.has(key))
    .sort((a, b) => a.localeCompare(b));

  for (const key of rest) {
    ordered[key] = row[key];
  }

  return ordered;
}

function processFile(fileName) {
  const filePath = path.join(rootDir, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error(`${fileName} is not an array`);
  }

  let touchedRows = 0;

  const transformed = data.map((row) => {
    const withCanonical = applyCanonicalFields(row);
    const ordered = reorderKeys(withCanonical);
    const before = JSON.stringify(row);
    const after = JSON.stringify(ordered);
    if (before !== after) touchedRows += 1;
    return ordered;
  });

  if (!dryRun) {
    fs.writeFileSync(filePath, `${JSON.stringify(transformed, null, 2)}\n`, 'utf8');
  }

  return { fileName, rows: data.length, touchedRows };
}

function main() {
  const files = getEngineFiles();
  if (!files.length) {
    throw new Error('No engine files found in root');
  }

  const report = files.map(processFile);
  const totalRows = report.reduce((sum, item) => sum + item.rows, 0);
  const totalTouched = report.reduce((sum, item) => sum + item.touchedRows, 0);

  console.log(`Mode: ${dryRun ? 'dry-run' : 'write'}`);
  console.log(`Files: ${files.length}`);
  console.log(`Rows: ${totalRows}`);
  console.log(`Touched rows: ${totalTouched}`);
  report.forEach((item) => {
    console.log(`${item.fileName}: ${item.touchedRows}/${item.rows}`);
  });
}

main();
