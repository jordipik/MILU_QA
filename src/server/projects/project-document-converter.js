'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 120000;

function findLibreOfficeBinary() {
    const configured = String(
        process.env.LIBREOFFICE_BIN || ''
    ).trim();

    if (configured) {
        return configured;
    }

    if (process.platform === 'win32') {
        const candidates = [
            'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
        ];

        const existing = candidates.find((candidate) =>
            fs.existsSync(candidate)
        );

        if (existing) return existing;

        return 'soffice.exe';
    }

    return 'libreoffice';
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;

            settled = true;
            child.kill('SIGKILL');

            const error = new Error(
                'LibreOffice ha superado el tiempo máximo de conversión.'
            );
            error.status = 504;
            reject(error);
        }, Number(
            process.env.LIBREOFFICE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
        ));

        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString('utf8');
        });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (error) => {
            if (settled) return;

            settled = true;
            clearTimeout(timer);

            error.message =
                `No se pudo ejecutar LibreOffice: ${error.message}`;
            error.status = 502;

            reject(error);
        });

        child.on('close', (code) => {
            if (settled) return;

            settled = true;
            clearTimeout(timer);

            if (code !== 0) {
                const error = new Error(
                    stderr.trim()
                    || stdout.trim()
                    || `LibreOffice terminó con código ${code}`
                );

                error.status = 502;
                reject(error);
                return;
            }

            resolve({
                stdout,
                stderr
            });
        });
    });
}

async function convertDocumentToPdf(sourcePath) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        const error = new Error(
            'No se encuentra el documento original para convertir.'
        );
        error.status = 404;
        throw error;
    }

    if (path.extname(sourcePath).toLowerCase() === '.pdf') {
        return sourcePath;
    }

    const outputDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'alentio-libreoffice-')
    );

    /*
     * LibreOffice necesita un perfil independiente.
     * Esto evita bloqueos si ya existe otra instancia abierta.
     */
    const profileDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'alentio-lo-profile-')
    );

    const profileUrl =
        `file:///${profileDir.replace(/\\/g, '/')}`;

    try {
        const libreOffice = findLibreOfficeBinary();

        await runCommand(
            libreOffice,
            [
                `-env:UserInstallation=${profileUrl}`,
                '--headless',
                '--convert-to',
                'pdf',
                '--outdir',
                outputDir,
                sourcePath
            ],
            {
                cwd: path.dirname(sourcePath)
            }
        );

        const expectedName =
            `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`;

        const expectedPath = path.join(outputDir, expectedName);

        if (fs.existsSync(expectedPath)) {
            return expectedPath;
        }

        /*
         * Algunos documentos producen un nombre ligeramente diferente.
         */
        const generatedPdf = fs
            .readdirSync(outputDir)
            .find((name) => name.toLowerCase().endsWith('.pdf'));

        if (!generatedPdf) {
            const error = new Error(
                'LibreOffice terminó sin generar ningún PDF.'
            );
            error.status = 502;
            throw error;
        }

        return path.join(outputDir, generatedPdf);
    } catch (error) {
        try {
            fs.rmSync(outputDir, {
                recursive: true,
                force: true
            });

            fs.rmSync(profileDir, {
                recursive: true,
                force: true
            });
        } catch (_) {
            // No sustituimos el error original.
        }

        throw error;
    }
}

module.exports = {
    convertDocumentToPdf
};