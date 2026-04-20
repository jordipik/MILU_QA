// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { ENGINE_JSON_FILES } = require('./engine_files');

const app = express();
const PORT = 3000;

function legacyQaPipelineDisabled(res) {
    return res.status(410).json({
        ok: false,
        error: 'El pipeline legado de qa_errors persistidos en engine_*.json esta desactivado.'
    });
}

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

app.post('/recompute-qa-errors', async (_req, res) => {
    return legacyQaPipelineDisabled(res);
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.redirect('/qa_milu.html');
});

app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'milu-save-backend' });
});

// Ruta para guardar cambios en un archivo JSON
app.post('/save-json', async (req, res) => {
    const { file, id, col, value } = req.body;
    if (!file || !id || !col) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }
    // Solo permitir archivos válidos
    const allowedFiles = ENGINE_JSON_FILES;
    if (!allowedFiles.includes(file)) {
        return res.status(400).json({ error: 'Archivo no permitido' });
    }
    const filePath = path.join(__dirname, file);
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        let json;
        try {
            json = JSON.parse(data);
        } catch (_parseError) {
            return res.status(500).json({ error: 'JSON inválido' });
        }
        const row = json.find(r => String(r.ID) === String(id));
        if (!row) {
            return res.status(404).json({ error: 'Registro no encontrado' });
        }
        row[col] = value;
        await fs.promises.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
        return res.json({ ok: true });
    } catch (_error) {
        return res.status(500).json({ error: 'No se pudo guardar el archivo' });
    }
});

app.post('/apply-qa-checks-filter', async (req, res) => {
    return legacyQaPipelineDisabled(res);
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});
