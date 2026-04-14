// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { applyRevisionPayload } = require('./apply_revision_to_engines');

const app = express();
const PORT = 3000;
const REVISION_DATA_FILE = path.join(__dirname, 'qa_revision_server_data.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

function buildEmptyRevisionPayload() {
    return {
        meta: {
            source: 'server.js',
            version: 2,
            rows: 0
        },
        revisions: {
            v: 2,
            r: [],
            k: {}
        }
    };
}

function readRevisionPayloadFromDisk() {
    if (!fs.existsSync(REVISION_DATA_FILE)) return buildEmptyRevisionPayload();
    const raw = fs.readFileSync(REVISION_DATA_FILE, 'utf8').trim();
    if (!raw) return buildEmptyRevisionPayload();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return buildEmptyRevisionPayload();
    return parsed;
}

function sanitizeIncomingRevisions(revisions) {
    const version = Number.isFinite(Number(revisions?.v)) ? Number(revisions.v) : 2;
    const rows = [];
    const legacy = {};

    if (Array.isArray(revisions?.r)) {
        revisions.r.forEach(entry => {
            if (!Array.isArray(entry) || entry.length < 3) return;
            const idx = Number(entry[0]);
            if (!Number.isFinite(idx) || idx <= 0) return;
            const estado = String(entry[1] ?? '').trim();
            const accion = String(entry[2] ?? '').trim();
            if (!estado && !accion) return;
            rows.push([idx, estado, accion]);
        });
    }

    if (revisions?.k && typeof revisions.k === 'object' && !Array.isArray(revisions.k)) {
        Object.entries(revisions.k).forEach(([key, value]) => {
            if (!value || typeof value !== 'object') return;
            const estado = String(value.estado ?? '').trim();
            const accion = String(value.accion ?? '').trim();
            if (!estado && !accion) return;
            legacy[String(key)] = { estado, accion, updated_at: '' };
        });
    }

    rows.sort((a, b) => a[0] - b[0]);
    return { version, rows, legacy };
}

function writeRevisionPayloadToDisk(payload) {
    const tmp = `${REVISION_DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, REVISION_DATA_FILE);
}

app.options('/qa_revision_sync.php', (_req, res) => {
    res.sendStatus(204);
});

app.get('/qa_revision_sync.php', (_req, res) => {
    try {
        const payload = readRevisionPayloadFromDisk();
        res.json(payload);
    } catch (error) {
        res.status(500).json({ ok: false, error: `No se pudo leer revisiones: ${error.message}` });
    }
});

app.post('/qa_revision_sync.php', (req, res) => {
    try {
        const revisions = req.body?.revisions;
        if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)) {
            return res.status(400).json({ ok: false, error: 'Falta objeto revisions.' });
        }

        const { version, rows, legacy } = sanitizeIncomingRevisions(revisions);
        const payload = {
            meta: {
                updated_at: new Date().toISOString(),
                source: 'server.js',
                version: 2,
                rows: rows.length + Object.keys(legacy).length
            },
            revisions: {
                v: version,
                r: rows,
                k: legacy
            }
        };

        writeRevisionPayloadToDisk(payload);
        return res.json({ ok: true, saved_rows: payload.meta.rows });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo guardar revisiones: ${error.message}` });
    }
});

app.post('/apply-revision-to-engines', (req, res) => {
    try {
        const payload = req.body;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return res.status(400).json({ ok: false, error: 'Payload de revisión no válido.' });
        }

        const result = applyRevisionPayload(payload, {
            repoRoot: __dirname,
            sourceName: 'import_from_ui'
        });

        return res.json({ ok: true, ...result });
    } catch (error) {
        return res.status(500).json({ ok: false, error: `No se pudo aplicar revisión a libros: ${error.message}` });
    }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.redirect('/qa_milu.html');
});

app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'milu-save-backend' });
});

// Ruta para guardar cambios en un archivo JSON
app.post('/save-json', (req, res) => {
    const { file, id, col, value } = req.body;
    if (!file || !id || !col) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }
    // Solo permitir archivos válidos
    const allowedFiles = [
        'engine_12V4000M40A.json',
        'engine_12V4000M53.json',
        'engine_16V4000M61.json',
        'engine_16V4000M73.json',
        'engine_16V4000M73L.json',
        'engine_16V4000M90.json',
        'engine_20V4000M93.json',
        'engine_20V4000M93L.json'
    ];
    if (!allowedFiles.includes(file)) {
        return res.status(400).json({ error: 'Archivo no permitido' });
    }
    const filePath = path.join(__dirname, file);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'No se pudo leer el archivo' });
        let json;
        try {
            json = JSON.parse(data);
        } catch (e) {
            return res.status(500).json({ error: 'JSON inválido' });
        }
        // Buscar el registro por ID
        const row = json.find(r => String(r.ID) === String(id));
        if (!row) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        row[col] = value;
        fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8', err2 => {
            if (err2) return res.status(500).json({ error: 'No se pudo guardar el archivo' });
            res.json({ ok: true });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
