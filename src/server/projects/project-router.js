'use strict';

const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PDFDocument } = require('pdf-lib');
const { requireAuth } = require('../auth/auth-router');
const {
    assignProjectToUser,
    listUsers,
    removeProjectFromUsers
} = require('../auth/auth-store');
const {
    canAccessProject,
    createProject,
    deleteProject,
    getProjectById,
    listProjects
} = require('./project-store');
const {
    readProjectWorkspace,
    saveProjectWorkspace
} = require('./project-workspace-store');
const {
    deleteSavedWorkspace,
    listSavedWorkspaces,
    readSavedWorkspace,
    readSavedInvoiceWorkspacePdf,
    readSavedWorkspacePdf,
    restoreSavedWorkspace,
    saveCurrentWorkspaceSnapshot
} = require('./project-saved-workspace-store');
const {
    getContentType,
    getDocumentKind,
    readProjectPdf,
    readProjectPdfPath,
    readProjectSourcePath,
    readProjectPdfMeta,
    saveProjectPdf
} = require('./project-pdf-store');
const {
    extractProjectInvoicePdf,
    extractProjectInvoiceLinesRegion,
    extractProjectPdf
} = require('./project-pdf-extractor');
const {
    extractProjectDocument
} = require('./project-document-extractor');
const {
    exportInvoiceExcel
} = require('./project-invoice-excel-exporter');
const {
    refineInvoiceExtractionWithAi
} = require('./project-invoice-ai-refiner');
const {
    checkWordPressPartNumbers,
    connectWordPress,
    createWordPressOAuthStart,
    finishWordPressOAuth,
    getWordPressAnalysisSummary,
    getWordPressConnection,
    getWordPressSeoAudit,
    updateWordPressSeoItem,
    listWordPressCustomers,
    publicOAuthSites,
    selectWordPressSite
} = require('./project-wordpress-store');

const router = express.Router();

function sendProjectError(res, error) {
    const status = Number(error?.status || 500);
    return res.status(status).json({
        ok: false,
        error: String(error?.message || 'Error de proyectos')
    });
}

function safeDownloadName(value, fallback = 'factura') {
    return String(value || fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || fallback;
}

router.get('/', requireAuth, (req, res) => {
    try {
        return res.json({
            ok: true,
            projects: listProjects(req.auth.user)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/', requireAuth, (req, res) => {
    try {
        const project = createProject(req.auth.user, {
            name: req.body?.name,
            key: req.body?.key,
            description: req.body?.description,
            icon: req.body?.icon
        });

        return res.status(201).json({ ok: true, project });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.delete('/:projectId', requireAuth, (req, res) => {
    try {
        const project = deleteProject(req.auth.user, req.params.projectId);
        removeProjectFromUsers(project.id);

        return res.json({ ok: true, project });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/workspace', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            workspace: readProjectWorkspace(project.id)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.put('/:projectId/workspace', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            workspace: saveProjectWorkspace(project.id, req.body)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/pdf/meta', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            pdf: readProjectPdfMeta(project.id)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/pdf', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const pdf = readProjectPdf(project.id);
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Content-Type', pdf.meta?.contentType || getContentType(pdf.meta?.fileName));
        res.setHeader('Content-Length', String(pdf.buffer.length));
        res.setHeader('X-File-Name', encodeURIComponent(pdf.meta?.fileName || 'documento.pdf'));
        res.setHeader('X-Document-Kind', pdf.meta?.kind || getDocumentKind(pdf.meta?.fileName || 'documento.pdf'));
        return res.end(pdf.buffer);
    } catch (error) {
        const status = Number(error?.status || 500);
        return res.status(status).json({ ok: false, error: String(error?.message || 'Error leyendo PDF') });
    }
});

router.put('/:projectId/pdf', requireAuth, express.raw({
    type: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/csv',
        'application/csv',
        'application/octet-stream'
    ],
    limit: '120mb'
}), (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'documento.pdf'));
        const pdf = saveProjectPdf(project.id, req.body, fileName);

        return res.json({ ok: true, project, pdf });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/pdf/extract', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const pdfMeta = readProjectPdfMeta(project.id);
        if (!pdfMeta) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado.' });
        }

        const kind = pdfMeta.kind || getDocumentKind(pdfMeta.fileName);
        let result = kind === 'pdf'
            ? await extractProjectPdf({
                projectId: project.id,
                pdfPath: readProjectPdfPath(project.id),
                fileName: pdfMeta.fileName
            })
            : await extractProjectDocument({
                projectId: project.id,
                documentPath: readProjectPdfPath(project.id),
                fileName: pdfMeta.fileName,
                documentType: 'product'
            });

        if (result?.convertedDocument?.buffer) {
            saveProjectPdf(
                project.id,
                result.convertedDocument.buffer,
                result.convertedDocument.fileName || 'documento.pdf'
            );
            result = {
                ...result,
                convertedDocument: {
                    fileName: result.convertedDocument.fileName || 'documento.pdf',
                    documentKind: 'pdf',
                    originalFileName: result.convertedDocument.originalFileName || pdfMeta.fileName
                }
            };
        }

        return res.json({
            ok: true,
            project,
            ...result
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/pdf/extract-invoice', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const pdfMeta = readProjectPdfMeta(project.id);
        if (!pdfMeta) {
            return res.status(404).json({ ok: false, error: 'Documento no encontrado.' });
        }

        const kind = pdfMeta.kind || getDocumentKind(pdfMeta.fileName);
        let result = kind === 'pdf'
            ? await extractProjectInvoicePdf({
                projectId: project.id,
                pdfPath: readProjectPdfPath(project.id),
                fileName: pdfMeta.fileName
            })
            : await extractProjectDocument({
                projectId: project.id,
                documentPath: readProjectSourcePath(project.id),
                fileName: pdfMeta.fileName,
                documentType: 'invoice'
            });

        const isAdmin = Array.isArray(req.auth.user.roles)
            && req.auth.user.roles.includes('admin');
        const applyAi = req.body?.useAi === true && isAdmin;
        if (applyAi) {
            const analysisPdfBuffer = result?.convertedDocument?.buffer
                || readProjectPdf(project.id).buffer;
            result = await refineInvoiceExtractionWithAi({
                result,
                pdfBuffer: analysisPdfBuffer,
                fileName: result?.convertedDocument?.fileName || pdfMeta.fileName
            });
        }

        if (result?.convertedDocument?.buffer) {
            const convertedBuffer = result.convertedDocument.buffer;
            const convertedFileName =
                result.convertedDocument.fileName || 'factura.pdf';

            saveProjectPdf(
                project.id,
                convertedBuffer,
                convertedFileName
            );

            result = {
                ...result,
                convertedDocument: {
                    fileName: convertedFileName,
                    documentKind: 'pdf',
                    originalFileName:
                        result.convertedDocument.originalFileName
                        || pdfMeta.fileName,

                    // Enviamos el mismo PDF que se acaba de analizar.
                    data: convertedBuffer.toString('base64')
                }
            };
        }

        return res.json({
            ok: true,
            project,
            ...result
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/pdf/extract-invoice-lines-region', requireAuth, async (req, res) => {
    let temporaryPdfPath = '';
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }
        const pdfMeta = readProjectPdfMeta(project.id);
        let pdfPath = readProjectPdfPath(project.id);
        if (!pdfMeta || !pdfPath) {
            return res.status(404).json({ ok: false, error: 'Documento PDF no encontrado.' });
        }
        const input = req.body?.region || {};
        const region = {
            page: Math.max(1, Number.parseInt(input.page, 10) || 1),
            x1: Number(input.x1),
            y1: Number(input.y1),
            x2: Number(input.x2),
            y2: Number(input.y2)
        };
        const coordinates = [region.x1, region.y1, region.x2, region.y2];
        if (coordinates.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
            || region.x2 - region.x1 < 0.01 || region.y2 - region.y1 < 0.01) {
            return res.status(400).json({ ok: false, error: 'La zona seleccionada no es valida.' });
        }
        const imageMatch = String(req.body?.imageData || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
        if (imageMatch) {
            const imageBuffer = Buffer.from(imageMatch[1], 'base64');
            if (!imageBuffer.length || imageBuffer.length > 25 * 1024 * 1024) {
                return res.status(400).json({ ok: false, error: 'La captura seleccionada no es valida.' });
            }
            const document = await PDFDocument.create();
            const image = await document.embedPng(imageBuffer);
            // La captura del escáner se genera a alta resolución. Conservamos
            // sus píxeles a 500 DPI para evitar que el PDF temporal la amplíe
            // artificialmente y RapidOCR pierda nitidez o consuma memoria.
            const regionDpi = 500;
            const pageWidth = Math.max(1, image.width * 72 / regionDpi);
            const pageHeight = Math.max(1, image.height * 72 / regionDpi);
            const page = document.addPage([pageWidth, pageHeight]);
            page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
            temporaryPdfPath = path.join(os.tmpdir(), `invoice-region-${randomUUID()}.pdf`);
            await fs.writeFile(temporaryPdfPath, await document.save());
            pdfPath = temporaryPdfPath;
            region.page = 1;
            region.x1 = 0;
            region.y1 = 0;
            region.x2 = 1;
            region.y2 = 1;
        }
        const result = await extractProjectInvoiceLinesRegion({
            projectId: project.id,
            pdfPath,
            fileName: pdfMeta.fileName,
            region
        });
        return res.json(result);
    } catch (error) {
        return sendProjectError(res, error);
    } finally {
        if (temporaryPdfPath) {
            fs.unlink(temporaryPdfPath).catch(() => {});
        }
    }
});

router.post('/:projectId/invoice/export-xlsx', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const invoice = req.body?.invoice;
        const invoices = Array.isArray(req.body?.invoices) ? req.body.invoices : [];
        const hasSingleInvoice = invoice && typeof invoice === 'object';
        const hasInvoiceBatch = invoices.length > 0;
        if (!hasSingleInvoice && !hasInvoiceBatch) {
            return res.status(400).json({ ok: false, error: 'No hay facturas para exportar.' });
        }

        const buffer = await exportInvoiceExcel({
            project,
            invoice: hasSingleInvoice ? invoice : null,
            invoices: hasInvoiceBatch ? invoices : [],
            fileName: req.body?.fileName || '',
            extractionReport: req.body?.extractionReport || null
        });
        const invoiceNumber = hasSingleInvoice
            ? invoice.invoiceNumber || invoice.number || 'factura'
            : 'facturas';
        const filename = `${safeDownloadName(project.name || 'proyecto')}-${safeDownloadName(invoiceNumber)}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', String(buffer.length));
        return res.end(buffer);
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/saved-workspaces', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            files: listSavedWorkspaces(project.id, req.query?.type)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/saved-workspaces', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const file = saveCurrentWorkspaceSnapshot(project.id, {
            name: req.body?.name,
            workspace: req.body?.workspace,
            invoicePdfs: req.body?.invoicePdfs
        });

        return res.status(201).json({ ok: true, project, file });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/saved-workspaces/:fileId', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            ...readSavedWorkspace(project.id, req.params.fileId)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/saved-workspaces/:fileId/pdf', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const pdf = readSavedWorkspacePdf(project.id, req.params.fileId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(pdf.buffer.length));
        res.setHeader('X-File-Name', encodeURIComponent(pdf.meta?.fileName || 'documento.pdf'));
        return res.end(pdf.buffer);
    } catch (error) {
        const status = Number(error?.status || 500);
        return res.status(status).json({ ok: false, error: String(error?.message || 'Error leyendo PDF guardado') });
    }
});

router.get('/:projectId/saved-workspaces/:fileId/invoices/:invoiceId/pdf', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const pdf = readSavedInvoiceWorkspacePdf(project.id, req.params.fileId, req.params.invoiceId);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(pdf.buffer.length));
        res.setHeader('X-File-Name', encodeURIComponent(pdf.meta?.fileName || 'factura.pdf'));
        return res.end(pdf.buffer);
    } catch (error) {
        const status = Number(error?.status || 500);
        return res.status(status).json({ ok: false, error: String(error?.message || 'Error leyendo PDF de factura guardada') });
    }
});

router.post('/:projectId/saved-workspaces/:fileId/load', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            ...restoreSavedWorkspace(project.id, req.params.fileId)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.delete('/:projectId/saved-workspaces/:fileId', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }
        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const file = deleteSavedWorkspace(project.id, req.params.fileId);
        return res.json({ ok: true, project, file });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/wordpress', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        return res.json({
            ok: true,
            project,
            connection: getWordPressConnection(project.id),
            sites: publicOAuthSites(project.id)
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/wordpress/oauth/start', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const authUrl = createWordPressOAuthStart(project.id, {
            returnUrl: req.body?.returnUrl
        }, req);

        return res.json({ ok: true, project, authUrl });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/wordpress/oauth/callback', async (req, res) => {
    try {
        if (req.query?.error) {
            return res.status(400).send(`WordPress no autorizo la conexion: ${String(req.query.error)}`);
        }

        const result = await finishWordPressOAuth({
            state: req.query?.state,
            code: req.query?.code
        });
        const url = new URL(result.returnUrl);
        url.searchParams.set('wordpress', 'connected');

        return res.redirect(url.href);
    } catch (error) {
        return res.status(error.status || 500).send(`No se pudo conectar WordPress: ${String(error.message || error)}`);
    }
});

router.post('/:projectId/wordpress/select-site', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const connection = selectWordPressSite(project.id, req.body?.siteId);

        return res.json({ ok: true, project, connection, sites: publicOAuthSites(project.id) });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/wordpress/connect', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const connection = await connectWordPress(project.id, {
            siteUrl: req.body?.siteUrl,
            username: req.body?.username,
            applicationPassword: req.body?.applicationPassword
        });

        return res.status(201).json({ ok: true, project, connection });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/wordpress/check', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const result = await checkWordPressPartNumbers(project.id, req.body?.partNumbers);

        return res.json({ ok: true, project, ...result });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/wordpress/customers', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const result = await listWordPressCustomers(project.id);

        return res.json({ ok: true, project, ...result });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/wordpress/analysis/summary', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const result = await getWordPressAnalysisSummary(project.id, {
            start: req.query?.start,
            end: req.query?.end
        });

        return res.json({ ok: true, project, ...result });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/wordpress/seo-audit', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const result = await getWordPressSeoAudit(project.id);

        return res.json({ ok: true, project, ...result });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.patch('/:projectId/wordpress/seo-audit/:itemId', requireAuth, async (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const result = await updateWordPressSeoItem(project.id, req.params.itemId, req.body);

        return res.json({ ok: true, project, ...result });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.get('/:projectId/members', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!canAccessProject(req.auth.user, project)) {
            return res.status(403).json({ ok: false, error: 'No tienes acceso a este proyecto.' });
        }

        const users = listUsers();
        const members = users.filter((user) => canAccessProject(user, project));
        const isAdmin = Array.isArray(req.auth.user.roles) && req.auth.user.roles.includes('admin');
        const assignableUsers = isAdmin
            ? users.filter((user) => !members.some((member) => member.id === user.id))
            : [];

        return res.json({
            ok: true,
            project,
            members,
            assignableUsers
        });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

router.post('/:projectId/members', requireAuth, (req, res) => {
    try {
        const project = getProjectById(req.params.projectId);
        if (!project) {
            return res.status(404).json({ ok: false, error: 'Proyecto no encontrado.' });
        }

        if (!Array.isArray(req.auth.user.roles) || !req.auth.user.roles.includes('admin')) {
            return res.status(403).json({ ok: false, error: 'Solo un administrador puede asignar miembros.' });
        }

        const user = assignProjectToUser({
            userId: req.body?.userId,
            projectId: project.id
        });

        return res.status(201).json({ ok: true, user });
    } catch (error) {
        return sendProjectError(res, error);
    }
});

module.exports = {
    projectRouter: router
};
