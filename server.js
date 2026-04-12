// Simple Express backend para guardar cambios en archivos JSON
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
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
