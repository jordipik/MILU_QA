const COLS = [
  { key: "sel", label: "Sel", sortable: false },
  { key: "part_number", label: "Part Number", sortable: true },
  { key: "engine_model", label: "engine_model", sortable: true },
  { key: "export_type", label: "Estado", sortable: true },
  { key: "badges", label: "Badges", sortable: false },
  { key: "final_photo_source", label: "Origen foto", sortable: true },
  { key: "final_pos_source", label: "Origen esquema_pos", sortable: true },
  { key: "final_photo_url", label: "Ruta usada foto", sortable: true },
  { key: "final_pos_url", label: "Ruta usada esquema_pos", sortable: true },
  { key: "exp_imagenes", label: "exp_imagenes", sortable: true },
  { key: "validation_status", label: "Validacion", sortable: true },
  { key: "preview", label: "Preview", sortable: false }
];

function compareValue(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { sensitivity: "base" });
}

function statusBadge(status) {
  if (status === "URL_ERROR") return ["err", status];
  if (status === "OK") return ["ok", status];
  if (status === "SIN_IMAGEN") return ["warn", status];
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

function clip(v, max = 64) {
  const txt = String(v || "");
  if (txt.length <= max) return txt;
  return `${txt.slice(0, max - 1)}...`;
}

function renderAuditBadges(row) {
  const badges = [];
  if (row.hasPhotoReal) badges.push(`<span class="badge ok">FOTO OK</span>`);
  else badges.push(`<span class="badge err">SIN FOTO</span>`);

  if (row.onlyPlaceholder) badges.push(`<span class="badge warn">PLACEHOLDER</span>`);

  if (row.hasSchemaPos && row.pos_load_status !== "error") badges.push(`<span class="badge ok">POS OK</span>`);
  else badges.push(`<span class="badge err">POS MISS</span>`);

  if (row.hasSchemas) badges.push(`<span class="badge info">ESQUEMA OK</span>`);

  if (row.hasBrokenRoute) badges.push(`<span class="badge err">URL ERROR</span>`);

  return badges.join(" ");
}

function renderThumb(url, alt) {
  if (!url) return `<span class="badge neu">-</span>`;
  return `<img class="table-thumb" loading="lazy" src="${esc(url)}" alt="${esc(alt)}"/>`;
}

export function createVirtualTable({ headEl, viewportEl, innerEl, onSelectRow, onSortChange, onToggleSelect }) {
  const state = {
    rows: [],
    sortedRows: [],
    sortKey: "part_number",
    sortDir: "asc",
    selectedKeys: new Set(),
    rowHeight: 56,
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

    if (col.key === "validation_status") {
      const [kind, label] = statusBadge(row.validation_status);
      return `<span class="badge ${kind}">${esc(label)}</span>`;
    }

    if (col.key === "badges") {
      return `<div class="table-badges">${renderAuditBadges(row)}</div>`;
    }

    if (col.key === "preview") {
      const url = row.final_photo_url || row.final_pos_url || row.final_schema_url;
      return renderThumb(url, row.part_number || "preview");
    }

    if (col.key === "export_type") {
      const tone = row.export_type === "new" ? "info" : "neu";
      return `<span class="badge ${tone}">${esc(row.export_type || "-")}</span>`;
    }

    if (col.key === "final_photo_url" || col.key === "final_pos_url") {
      const value = row[col.key] || "";
      if (!value) return "<span class='badge neu'>-</span>";
      return `<span title="${esc(value)}">${esc(clip(value, 78))}</span>`;
    }

    if (col.key === "exp_imagenes") {
      const value = row.exp_imagenes || "";
      if (!value) return "<span class='badge neu'>-</span>";
      return `<span title="${esc(value)}">${esc(clip(value, 78))}</span>`;
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
