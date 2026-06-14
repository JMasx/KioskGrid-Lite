var HA_URL   = (typeof HA_CONFIG !== "undefined") ? HA_CONFIG.url   : "";
var HA_TOKEN = (typeof HA_CONFIG !== "undefined") ? HA_CONFIG.token : "";

var COLS = 4;
var ROWS = 4;
var editMode = false;
var dragSrcSlot = null;
var layout = [];
var entities = {};

/* ---- BOOT ---- */
window.onload = function () {
    loadEntities();
    setInterval(syncStates, 5000);
};

/* ---- LAYOUT PERSISTENCE ---- */
function initLayout(ids) {
    var total = COLS * ROWS;
    layout = [];
    for (var i = 0; i < total; i++) {
        layout.push(i < ids.length ? ids[i] : null);
    }
}

function saveLayout() {
    try {
        localStorage.setItem("ha_layout_" + COLS + "x" + ROWS, JSON.stringify(layout));
        localStorage.setItem("ha_grid", JSON.stringify({ cols: COLS, rows: ROWS }));
    } catch (e) {}
}

function loadSavedLayout() {
    try {
        var g = localStorage.getItem("ha_grid");
        if (g) {
            var p = JSON.parse(g);
            COLS = p.cols || 4;
            ROWS = p.rows || 4;
            updateGridBtns();
        }
        var l = localStorage.getItem("ha_layout_" + COLS + "x" + ROWS);
        if (l) {
            layout = JSON.parse(l);
            return true;
        }
    } catch (e) {}
    return false;
}

/* ---- LOAD ENTITIES FROM HA ---- */
function loadEntities() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", HA_URL + "/api/states", true);
    xhr.setRequestHeader("Authorization", "Bearer " + HA_TOKEN);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || xhr.status !== 200) return;
        var data = JSON.parse(xhr.responseText);
        var ordered = [];
        for (var i = 0; i < data.length; i++) {
            var e = data[i];
            var domain = e.entity_id.split(".")[0];
            if (domain === "light" || domain === "switch" || domain === "input_boolean") {
                entities[e.entity_id] = {
                    id:     e.entity_id,
                    name:   e.attributes.friendly_name || e.entity_id,
                    state:  e.state,
                    domain: domain
                };
                ordered.push(e.entity_id);
            }
        }
        var had = loadSavedLayout();
        if (!had) {
            initLayout(ordered);
        } else {
            /* slot in any new entities not yet in the saved layout */
            var inLayout = {};
            for (var j = 0; j < layout.length; j++) {
                if (layout[j]) inLayout[layout[j]] = true;
            }
            for (var k = 0; k < ordered.length; k++) {
                if (!inLayout[ordered[k]]) {
                    for (var s = 0; s < layout.length; s++) {
                        if (!layout[s]) { layout[s] = ordered[k]; break; }
                    }
                }
            }
        }
        render();
    };
    xhr.send();
}

/* ---- PERIODIC STATE SYNC ---- */
function syncStates() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", HA_URL + "/api/states", true);
    xhr.setRequestHeader("Authorization", "Bearer " + HA_TOKEN);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || xhr.status !== 200) return;
        var data = JSON.parse(xhr.responseText);
        for (var i = 0; i < data.length; i++) {
            if (entities[data[i].entity_id]) {
                entities[data[i].entity_id].state = data[i].state;
            }
        }
        updateUI();
    };
    xhr.send();
}

/* ---- FULL RENDER ---- */
function render() {
    var gridEl = document.getElementById("grid");
    gridEl.style.gridTemplateColumns = "repeat(" + COLS + ", 1fr)";

    var headerH  = 36 + 10 + 10;
    var gapTotal = (ROWS - 1) * 8;
    var slotH    = Math.floor((window.innerHeight - headerH - gapTotal) / ROWS);
    if (slotH < 60) slotH = 60;

    gridEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    var total = COLS * ROWS;

    for (var i = 0; i < total; i++) {
        var slotEl = document.createElement("div");
        slotEl.className = "slot";
        slotEl.style.height = slotH + "px";
        slotEl.setAttribute("data-slot", i);

        var eid = layout[i];

        if (eid && entities[eid]) {
            slotEl.appendChild(buildCard(eid));
        } else if (editMode) {
            var plus = document.createElement("div");
            plus.className = "empty-plus";
            plus.textContent = "+";
            slotEl.appendChild(plus);
        }

        if (editMode) {
            slotEl.addEventListener("dragover",  onDragOver);
            slotEl.addEventListener("dragleave", onDragLeave);
            slotEl.addEventListener("drop",      onDrop);
        }

        frag.appendChild(slotEl);
    }

    gridEl.appendChild(frag);
}

function buildCard(eid) {
    var e    = entities[eid];
    var isOn = e.state === "on";

    var card = document.createElement("div");
    card.className = "card" + (isOn ? " on" : "") + (editMode ? " draggable" : "");
    card.setAttribute("data-entity", eid);

    var pip = document.createElement("div");
    pip.className = "card-pip";

    var name = document.createElement("div");
    name.className = "card-name";
    name.textContent = e.name;

    var state = document.createElement("div");
    state.className = "card-state";
    state.textContent = isOn ? "ON" : "OFF";

    card.appendChild(pip);
    card.appendChild(name);
    card.appendChild(state);

    if (editMode) {
        card.setAttribute("draggable", "true");
        card.addEventListener("dragstart", onDragStart);
        card.addEventListener("dragend",   onDragEnd);
    } else {
        card.addEventListener("click", onCardClick);
    }

    return card;
}

/* ---- PATCH UI WITHOUT FULL REBUILD ---- */
function updateUI() {
    var cards = document.querySelectorAll(".card");
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var eid  = card.getAttribute("data-entity");
        if (!entities[eid]) continue;
        var isOn = entities[eid].state === "on";
        if (isOn) { card.classList.add("on"); } else { card.classList.remove("on"); }
        var st = card.querySelector(".card-state");
        if (st) st.textContent = isOn ? "ON" : "OFF";
    }
}

/* ---- TOGGLE ENTITY ---- */
function onCardClick(ev) {
    var card = ev.currentTarget;
    var eid  = card.getAttribute("data-entity");
    if (!entities[eid]) return;

    var isOn = entities[eid].state === "on";
    entities[eid].state = isOn ? "off" : "on";

    if (isOn) { card.classList.remove("on"); } else { card.classList.add("on"); }

    var st = card.querySelector(".card-state");
    if (st) st.textContent = isOn ? "OFF" : "ON";

    var xhr = new XMLHttpRequest();
    xhr.open("POST", HA_URL + "/api/services/" + entities[eid].domain + "/toggle", true);
    xhr.setRequestHeader("Authorization", "Bearer " + HA_TOKEN);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ entity_id: eid }));
}

/* ---- EDIT MODE ---- */
function toggleEdit() {
    editMode = !editMode;
    var btn = document.getElementById("editBtn");
    var sel = document.getElementById("gridSelector");
    if (editMode) {
        btn.textContent = "Lock Layout";
        btn.classList.add("active");
        sel.classList.add("open");
    } else {
        btn.textContent = "Edit Layout";
        btn.classList.remove("active");
        sel.classList.remove("open");
        saveLayout();
    }
    render();
}

/* ---- DRAG AND DROP ---- */
function onDragStart(ev) {
    dragSrcSlot = parseInt(ev.currentTarget.closest(".slot").getAttribute("data-slot"));
    ev.currentTarget.classList.add("dragging");
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", dragSrcSlot);
}

function onDragEnd(ev) {
    ev.currentTarget.classList.remove("dragging");
    var all = document.querySelectorAll(".slot.drag-over");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("drag-over");
}

function onDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    this.classList.add("drag-over");
}

function onDragLeave() {
    this.classList.remove("drag-over");
}

function onDrop(ev) {
    ev.preventDefault();
    this.classList.remove("drag-over");
    var dest = parseInt(this.getAttribute("data-slot"));
    if (dragSrcSlot === null || dragSrcSlot === dest) return;
    var tmp = layout[dest];
    layout[dest]        = layout[dragSrcSlot];
    layout[dragSrcSlot] = tmp;
    dragSrcSlot = null;
    saveLayout();
    render();
}

/* ---- GRID PRESET ---- */
function setGrid(cols, rows) {
    COLS = cols;
    ROWS = rows;
    updateGridBtns();
    var had = false;
    try {
        var l = localStorage.getItem("ha_layout_" + COLS + "x" + ROWS);
        if (l) { layout = JSON.parse(l); had = true; }
    } catch (e) {}
    if (!had) { initLayout(Object.keys(entities)); }
    render();
}

function updateGridBtns() {
    var target = COLS + "x" + ROWS;
    var btns = document.querySelectorAll(".gbtn");
    for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent === target) {
            btns[i].classList.add("sel");
        } else {
            btns[i].classList.remove("sel");
        }
    }
}

window.addEventListener("resize", function () { render(); });