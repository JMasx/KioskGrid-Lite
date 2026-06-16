/* =========================================================
   app.js  —  HA Kiosk
   Target: Kindle HD 2nd gen (1920×1200), Android 4 WebView
   
   Key constraints:
   - No CSS Grid (not in Android 4 WebKit)
   - No classList (buggy on Android 4)
   - No const/let/arrow functions (ES3/5 only)
   - No vh units (broken on Android 4 WebView)
   - Dimensions hard-coded to 1920×1200 with known chrome
     offsets, so layout is pixel-perfect without DOM measuring
========================================================= */

var HA_URL   = "";
var HA_TOKEN = "";
try {
    if (typeof HA_CONFIG !== "undefined") {
        HA_URL   = HA_CONFIG.url   || "";
        HA_TOKEN = HA_CONFIG.token || "";
    }
} catch(e) {}

/* ---- DISPLAY CONSTANTS ---- */
/* Kindle HD 2nd gen: 1920×1200 physical pixels.
   Android status bar ~40px, navigation bar ~48px.
   Browser toolbar (Silk) ~56px top.
   Usable area portrait: 1920 wide, ~1056 tall.
   We use conservative values — better to leave a gap
   than to clip. Adjust SCREEN_H if content is clipped. */
var SCREEN_W  = 1920;
var SCREEN_H  = 1080;   /* conservative: 1200 - status - nav - toolbar */
var HEADER_H  = 60;
var PAD       = 10;     /* padding around grid wrap */
var GAP       = 8;      /* gap between cells (matches cellspacing) */

var COLS = 4;
var ROWS = 4;
var editMode    = false;
var dragSrcSlot = null;
var layout      = [];
var entities    = {};

/* ---- BOOT ---- */
window.onload = function () {
    applyHardDimensions();
    if (HA_URL) {
        loadEntities();
        setInterval(syncStates, 5000);
    } else {
        loadFakeEntities();
    }
};

/* ---- HARD DIMENSION LOCK ----
   Instead of measuring DOM (unreliable on old WebKit),
   we calculate everything from our known screen constants. */
function applyHardDimensions() {
    var body = document.body;
    body.style.width  = SCREEN_W + "px";
    body.style.height = SCREEN_H + "px";

    var hdr = document.getElementById("header");
    if (hdr) {
        hdr.style.width  = SCREEN_W + "px";
        hdr.style.height = HEADER_H + "px";
    }

    var wrap = document.getElementById("gridWrap");
    if (wrap) {
        var wrapH = SCREEN_H - HEADER_H - PAD;
        var wrapW = SCREEN_W;
        wrap.style.width   = wrapW + "px";
        wrap.style.height  = wrapH + "px";
        wrap.style.top     = HEADER_H + "px";
        wrap.style.left    = "0px";
    }
}

function getGridDimensions() {
    /* Available pixel area for the table itself (inside padding) */
    var availW = SCREEN_W - (PAD * 2);
    var availH = SCREEN_H - HEADER_H - PAD - PAD;

    /* Gaps: cellspacing applies between AND around cells in a table,
       so total gap columns = COLS+1, rows = ROWS+1 */
    var cellW = Math.floor((availW - GAP * (COLS + 1)) / COLS);
    var cellH = Math.floor((availH - GAP * (ROWS + 1)) / ROWS);

    if (cellW < 60) cellW = 60;
    if (cellH < 60) cellH = 60;

    return { cellW: cellW, cellH: cellH };
}

/* ---- FAKE ENTITIES FOR OFFLINE TESTING ---- */
function loadFakeEntities() {
    var names = [
        "Living Room","Kitchen","Bedroom","Bathroom",
        "Office","Hallway","Porch","Garden",
        "TV","Fan","Heater","AC",
        "Coffee Maker","Dishwasher","Washer","Dryer"
    ];
    var ordered = [];
    for (var i = 0; i < names.length; i++) {
        var id = "light.entity_" + i;
        entities[id] = { id: id, name: names[i],
                         state: (i % 3 === 0) ? "on" : "off",
                         domain: "light" };
        ordered.push(id);
    }
    var had = loadSavedLayout();
    if (!had) initLayout(ordered);
    render();
}

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
        if (l) { layout = JSON.parse(l); return true; }
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
        var data;
        try { data = JSON.parse(xhr.responseText); } catch(e) { return; }
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
        var data;
        try { data = JSON.parse(xhr.responseText); } catch(e) { return; }
        for (var i = 0; i < data.length; i++) {
            if (entities[data[i].entity_id]) {
                entities[data[i].entity_id].state = data[i].state;
            }
        }
        updateUI();
    };
    xhr.send();
}

/* ---- RENDER ---- */
function render() {
    applyHardDimensions();

    var dims  = getGridDimensions();
    var cellW = dims.cellW;
    var cellH = dims.cellH;

    var tbl = document.getElementById("grid");
    tbl.innerHTML = "";
    /* Set explicit table size so it never overflows */
    tbl.style.width  = (cellW * COLS + GAP * (COLS + 1)) + "px";
    tbl.style.height = (cellH * ROWS + GAP * (ROWS + 1)) + "px";

    var slotIdx = 0;
    for (var r = 0; r < ROWS; r++) {
        var tr = document.createElement("tr");
        for (var c = 0; c < COLS; c++) {
            var td = document.createElement("td");
            td.className = "slot";
            td.setAttribute("data-slot", slotIdx);
            td.style.width   = cellW + "px";
            td.style.height  = cellH + "px";
            td.style.padding = "0";

            var eid = layout[slotIdx];
            if (eid && entities[eid]) {
                td.appendChild(buildCard(eid));
            } else if (editMode) {
                var plus = document.createElement("div");
                plus.className = "empty-plus";
                plus.innerHTML = "+";
                td.appendChild(plus);
            }

            if (editMode) {
                addEvent(td, "dragover",  onDragOver);
                addEvent(td, "dragleave", onDragLeave);
                addEvent(td, "drop",      onDrop);
            }

            tr.appendChild(td);
            slotIdx++;
        }
        tbl.appendChild(tr);
    }
}

function buildCard(eid) {
    var e    = entities[eid];
    var isOn = e.state === "on";

    var card = document.createElement("div");
    card.className = "card" + (isOn ? " card-on" : "") + (editMode ? " card-drag" : "");
    card.setAttribute("data-entity", eid);

    var pip = document.createElement("div");
    pip.className = "card-pip";

    var name = document.createElement("div");
    name.className = "card-name";
    name.innerHTML = e.name;

    var st = document.createElement("div");
    st.className = "card-state";
    st.innerHTML = isOn ? "ON" : "OFF";

    card.appendChild(pip);
    card.appendChild(name);
    card.appendChild(st);

    if (editMode) {
        card.setAttribute("draggable", "true");
        addEvent(card, "dragstart", onDragStart);
        addEvent(card, "dragend",   onDragEnd);
    } else {
        addEvent(card, "click", onCardClick);
    }

    return card;
}

/* ---- CLASS HELPERS (no classList — buggy on Android 4) ---- */
function hasClass(el, cls) {
    return (" " + el.className + " ").indexOf(" " + cls + " ") !== -1;
}
function addClass(el, cls) {
    if (!hasClass(el, cls)) el.className = (el.className ? el.className + " " : "") + cls;
}
function removeClass(el, cls) {
    el.className = (" " + el.className + " ").replace(" " + cls + " ", " ").replace(/^\s+|\s+$/g, "");
}

/* ---- EVENT HELPER ---- */
function addEvent(el, type, fn) {
    if (el.addEventListener) { el.addEventListener(type, fn, false); }
    else if (el.attachEvent) { el.attachEvent("on" + type, fn); }
}

/* ---- PATCH UI WITHOUT FULL REBUILD ---- */
function updateUI() {
    var cards = document.querySelectorAll ? document.querySelectorAll(".card") : [];
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var eid  = card.getAttribute("data-entity");
        if (!entities[eid]) continue;
        var isOn = entities[eid].state === "on";
        if (isOn) { addClass(card, "card-on"); } else { removeClass(card, "card-on"); }
        var st = card.querySelector ? card.querySelector(".card-state") : null;
        if (st) st.innerHTML = isOn ? "ON" : "OFF";
    }
}

/* ---- TOGGLE ENTITY ---- */
function onCardClick(ev) {
    ev = ev || window.event;
    var card = ev.currentTarget || ev.srcElement;
    while (card && !card.getAttribute("data-entity")) card = card.parentNode;
    if (!card) return;
    var eid = card.getAttribute("data-entity");
    if (!entities[eid]) return;

    var isOn = entities[eid].state === "on";
    entities[eid].state = isOn ? "off" : "on";
    if (isOn) { removeClass(card, "card-on"); } else { addClass(card, "card-on"); }
    var st = card.querySelector ? card.querySelector(".card-state") : null;
    if (st) st.innerHTML = isOn ? "OFF" : "ON";

    if (!HA_URL) return;
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
        btn.innerHTML = "Lock Layout";
        addClass(btn, "active");
        sel.className = "grid-selector open";
    } else {
        btn.innerHTML = "Edit Layout";
        removeClass(btn, "active");
        sel.className = "grid-selector";
        saveLayout();
    }
    render();
}

/* ---- DRAG AND DROP ---- */
function getSlotEl(el) {
    while (el && el.getAttribute && !el.getAttribute("data-slot")) el = el.parentNode;
    return el;
}

function onDragStart(ev) {
    ev = ev || window.event;
    var card = ev.currentTarget || ev.srcElement;
    var td   = getSlotEl(card.parentNode || card);
    if (td) dragSrcSlot = parseInt(td.getAttribute("data-slot"));
    addClass(card, "card-dragging");
    if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "" + dragSrcSlot);
    }
}

function onDragEnd(ev) {
    ev = ev || window.event;
    var card = ev.currentTarget || ev.srcElement;
    removeClass(card, "card-dragging");
    var slots = document.querySelectorAll ? document.querySelectorAll(".slot") : [];
    for (var i = 0; i < slots.length; i++) removeClass(slots[i], "drag-over");
}

function onDragOver(ev) {
    ev = ev || window.event;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    addClass(ev.currentTarget || ev.srcElement, "drag-over");
}

function onDragLeave(ev) {
    ev = ev || window.event;
    removeClass(ev.currentTarget || ev.srcElement, "drag-over");
}

function onDrop(ev) {
    ev = ev || window.event;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    var td   = ev.currentTarget || ev.srcElement;
    removeClass(td, "drag-over");
    var dest = parseInt(td.getAttribute("data-slot"));
    if (dragSrcSlot === null || isNaN(dest) || dragSrcSlot === dest) return;
    var tmp             = layout[dest];
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
    if (!had) initLayout(Object.keys(entities));
    render();
}

function updateGridBtns() {
    var target = COLS + "x" + ROWS;
    var btns = document.querySelectorAll ? document.querySelectorAll(".gbtn") : [];
    for (var i = 0; i < btns.length; i++) {
        var txt = btns[i].innerHTML || btns[i].textContent || "";
        btns[i].className = (txt === target) ? "gbtn sel" : "gbtn";
    }
}

window.onresize = function () { render(); };