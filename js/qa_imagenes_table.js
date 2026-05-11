const COLS = [
  { key: "sel", label: "Sel", sortable: false },
  { key: "part_number", label: "PN", sortable: true },
  { key: "engine_model", label: "engine_model", sortable: true },
  { key: "libro", label: "libro", sortable: true },
  { key: "source_page", label: "source_page", sortable: true },
  { key: "export_type", label: "export", sortable: true },
  { key: "image_status", label: "image_status", sortable: true },
  { key: "schema_status", label: "schema_status", sortable: true },
  { key: "ruta_foto", label: "ruta_foto", sortable: true },
  { key: "ruta_esquemas_pos", label: "ruta_esquemas_pos", sortable: true },
  { key: "total_img_urls", label: "img", sortable: true },
  { key: "total_schema_urls", label: "schema", sortable: true },
  { key: "issues", label: "issues", sortable: false }
];

function compareValue(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { sensitivity: "base" });
}

function statusBadge(status) {
  if (status === "REAL_IMAGE" || status === "HAS_SCHEMA") return ["ok", status];
  if (status === "ONLY_PLACEHOLDER") return ["warn", status];
  if (status === "NO_IMAGE" || status === "NO_SCHEMA") return ["err", status];
  return ["neu", status || "-"];
}

function stateBadge(state) {
  if (state === "OK") return "ok";
  if (state === "WARNING") return "warn";
  if (state === "ERROR") return "err";
  return "neu";
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createVirtualTable({ headEl, viewportEl, innerEl, onSelectRow, onSortChange, onToggleSelect }) {
  const state = {
    rows: [],
    sortedRows: [],
    sortKey: "part_number",
    sortDir: "asc",
    selectedKeys: new Set(),
    rowHeight: 42,
    overscan: 12,
    selectedRowKey: ""
  };

  function sortRows() {
    const list = [...state.rows];
    if (!state.sortKey) {
      state.sortedRows = list;
      return;
    }

    list.sort((a, b) => {
      const diff = compareValue(a[state.sortKey], b[state.sortKey]);
      return state.sortDir === "asc" ? diff : -diff;
    });

    state.sortedRows = list;
  }

  function renderHead() {
    headEl.innerHTML = "";
    for (const c of COLS) {
      const cell = document.createElement("div");
      cell.className = "hcell";
      const dir = state.sortKey === c.key ? (state.sortDir === "asc" ? " ↑" : " ↓") : "";
      cell.textContent = `${c.label}${dir}`;
      if (c.sortable) {
        cell.addEventListener("click", () => {
          if (state.sortKey === c.key) {
            state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
          } else {
            state.sortKey = c.key;
            state.sortDir = "asc";
          }
          sortRows();
          renderHead();
          renderBody();
          onSortChange?.({ key: state.sortKey, dir: state.sortDir });
        });
      }
      headEl.appendChild(cell);
    }
  }

  function buildCell(col, row) {
    if (col.key === "sel") {
      const checked = state.selectedKeys.has(row.record_key) ? "checked" : "";
      return `<input type="checkbox" class="row-select" data-row-key="${esc(row.record_key)}" ${checked} />`;
    }

    if (col.key === "issues") {
      const count = (row.issues || []).length;
      return `<span class="badge ${stateBadge(row.state_status)}" title="${esc((row.issues || []).join(" | "))}">${count}</span>`;
    }

    if (col.key === "image_status" || col.key === "schema_status") {
      const [kind, label] = statusBadge(row[col.key]);
      return `<span class="badge ${kind}">${esc(label)}</span>`;
    }

    if (col.key === "export_type") {
      const tone = row.export_type === "new" ? "info" : "neu";
      return `<span class="badge ${tone}">${esc(row.export_type || "-")}</span>`;
    }

    if (col.key === "ruta_foto" || col.key === "ruta_esquemas_pos") {
      const value = row[col.key] || "";
      if (!value) return "<span class='badge neu'>-</span>";
      return `<span title="${esc(value)}">${esc(value)}</span>`;
    }

    return esc(row[col.key]);
  }

  function renderBody() {
    const total = state.sortedRows.length;
    const viewportH = viewportEl.clientHeight || 500;
    const scrollTop = viewportEl.scrollTop || 0;

    const start = Math.max(0, Math.floor(scrollTop / state.rowHeight) - state.overscan);
    const end = Math.min(total, Math.ceil((scrollTop + viewportH) / state.rowHeight) + state.overscan);

    innerEl.style.height = `${total * state.rowHeight}px`;

    const frag = document.createDocumentFragment();

    for (let i = start; i < end; i += 1) {
      const row = state.sortedRows[i];
      const rowEl = document.createElement("div");
      rowEl.className = `vrow ${row.record_key === state.selectedRowKey ? "selected" : ""}`;
      rowEl.style.top = `${i * state.rowHeight}px`;
      rowEl.dataset.rowKey = row.record_key;

      const html = COLS.map((c) => `<div class="cell">${buildCell(c, row)}</div>`).join("");
      rowEl.innerHTML = html;

      rowEl.addEventListener("click", (evt) => {
        const target = evt.target;
        if (target && target.classList && target.classList.contains("row-select")) {
          return;
        }
        state.selectedRowKey = row.record_key;
        onSelectRow?.(row);
        renderBody();
      });

      const cb = rowEl.querySelector(".row-select");
      if (cb) {
        cb.addEventListener("click", (evt) => {
          evt.stopPropagation();
          if (state.selectedKeys.has(row.record_key)) state.selectedKeys.delete(row.record_key);
          else state.selectedKeys.add(row.record_key);
          onToggleSelect?.(state.selectedKeys);
        });
      }

      frag.appendChild(rowEl);
    }

    innerEl.innerHTML = "";
    innerEl.appendChild(frag);
  }

  viewportEl.addEventListener("scroll", () => renderBody());
  renderHead();

  return {
    setRows(rows) {
      state.rows = Array.isArray(rows) ? rows : [];
      sortRows();
      viewportEl.scrollTop = 0;
      renderBody();
    },
    setSelectedRow(recordKey) {
      state.selectedRowKey = recordKey || "";
      renderBody();
    },
    clearSelection() {
      state.selectedKeys.clear();
      onToggleSelect?.(state.selectedKeys);
      renderBody();
    },
    selectCurrentView() {
      for (const r of state.sortedRows) state.selectedKeys.add(r.record_key);
      onToggleSelect?.(state.selectedKeys);
      renderBody();
    },
    getSelection() {
      return new Set(state.selectedKeys);
    },
    getRows() {
      return [...state.sortedRows];
    }
  };
}
