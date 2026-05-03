/**
 * Estado global compartido de la aplicación qa_milu.
 * Todos los módulos importan este objeto y lo modifican directamente.
 */
import { getQaCheckDefinitions } from './qa-checks.js';

export const state = {
    allData: [],
    filteredData: [],
    tableMode: 'qa',
    currentPage: 1,
    pageSize: 50,
    paginationEnabled: true,
    MIN_PAGE_SIZE: 5,
    sortKey: 'book_page_pos',
    sortAsc: true,
    filters: {},
    groupedVisible: false,
    selectedRevisionRowKey: '',
    recentRevisionKeys: [],
    leftTableReviewedOnly: true,
    displayRowCount: 0,
    columnView: 'pdf',
    newPnSet: new Set(),
    miluNewData: [],
    supersededPnSet: new Set(),
    miluSupersededData: [],
    publishedMap: new Map(),
    productExportPnSet: new Set(),
    mainDataSourceLabel: 'engine_*.json',
    // AR-1: catalogo de motores y carga incremental.
    engineCatalog: [],
    loadedEngineFiles: new Set(),
    incrementalLoadingEnabled: false,
    currentPdfDocument: null,
    currentPdfSource: '',
    currentPdfPageNumber: 0,
    currentPdfRenderTask: null,
    currentPdfRequestToken: 0,
    currentPdfSelection: null,
    currentPdfSelectionRects: [],
    currentPdfReadTokens: [],
    currentPdfZoom: 'fit',
    rightPanelTab: 'pdf',
    qaErrorCheckDefinitions: getQaCheckDefinitions(),
    activeQaErrorChecks: new Set(),
    qaChecksScopedRows: null,
    backendWritable: null,
    backendStatusMessage: 'Backend: comprobando...'
};
