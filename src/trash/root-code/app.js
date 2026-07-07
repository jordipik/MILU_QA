const ROW_H = 34;
const PATH_LIGHT = "./qa_index_light.json";
const PATH_FULL  = "./qa_index.json";

let rows = [];
let filtered = [];
let selected = -1;

const scroller = document.getElementById("vscroller");
const spacer = document.getElementById("vspacer");
const vrows = document.getElementById("vrows");
const stats = document.getElementById("stats");

const q = document.getElementById("q");
const fImg = document.getElementById("f_img");
const fSup = document.getElementById("f_sup");
const reset = document.getElementById("reset");

function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function render(){
  const top = scroller.scrollTop;
  const h = scroller.clientHeight;
  const start = Math.floor(top / ROW_H);
  const end = Math.min(filtered.length, start + Math.ceil(h / ROW_H) + 5);

  vrows.style.transform = `translateY(${start * ROW_H}px)`;

  let html = "";
  for(let i=start;i<end;i++){
    const r = filtered[i];
    html += `
      <div class="row ${i===selected?"sel":""}" data-i="${i}">
        <div class="cell">${esc(r.pos)}</div>
        <div class="cell">${esc(r.pn)}</div>
        <div class="cell">${esc(r.designation)}</div>
        <div class="cell">${esc(r.book)}</div>
        <div class="cell">${esc(r.page)}</div>
        <div class="cell">${r.img_count||0}</div>
        <div class="cell">
          ${r.has_img?'<span class="badge img">IMG</span>':''}
          ${r.is_superseded?'<span class="badge sup">SUP</span>':''}
          ${r.is_placeholder?'<span class="badge ph">PH</span>':''}
        </div>
      </div>`;
  }
  vrows.innerHTML = html;

  vrows.querySelectorAll(".row").forEach(e=>{
    e.onclick=()=>{
      selected=+e.dataset.i;
      render();
      renderDetail();
    };
  });
}

function renderDetail(){
  const el = document.getElementById("detail");
  const meta = document.getElementById("detailMeta");
  if(selected<0){ el.innerHTML=""; meta.textContent=""; return; }

  const r = filtered[selected];
  meta.textContent = `Fila ${selected+1} / ${filtered.length}`;

  el.innerHTML = `
    <div class="kv"><div class="k">PN</div><div class="v">${esc(r.pn)}</div></div>
    <div class="kv"><div class="k">POS</div><div class="v">${esc(r.pos)}</div></div>
    <div class="kv"><div class="k">Designation</div><div class="v">${esc(r.designation)}</div></div>
    <div class="kv"><div class="k">Book</div><div class="v">${esc(r.book)}</div></div>
    <div class="kv"><div class="k">Page</div><div class="v">${esc(r.page)}</div></div>
    <pre>${esc(JSON.stringify(r,null,2))}</pre>
  `;
}

function apply(){
  const t = q.value.toLowerCase();
  filtered = rows.filter(r=>{
    if(fImg.value==="has" && !r.has_img) return false;
    if(fImg.value==="no" && r.has_img) return false;
    if(fSup.value==="yes" && !r.is_superseded) return false;
    if(fSup.value==="no" && r.is_superseded) return false;
    if(!t) return true;
    return `${r.pn} ${r.pos} ${r.designation} ${r.book} ${r.page}`.toLowerCase().includes(t);
  });
  spacer.style.height = filtered.length * ROW_H + "px";
  selected = filtered.length?0:-1;
  scroller.scrollTop = 0;
  stats.textContent = `Filas: ${filtered.length}`;
  render();
  renderDetail();
}

async function init(){
  rows = await fetch(PATH_LIGHT).then(r=>r.json());
  spacer.style.height = rows.length * ROW_H + "px";
  filtered = rows;
  stats.textContent = `Filas: ${rows.length}`;
  render();
}

scroller.onscroll = render;
[q,fImg,fSup].forEach(e=>e.oninput=apply);
reset.onclick=()=>{q.value="";fImg.value="all";fSup.value="all";apply();};

init();
