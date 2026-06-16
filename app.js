/*
   Target: Kindle HD 2nd gen (1920×1200), Android 4 WebView
   
   stuff had to work around:
   1) No CSS Grid (not in Android 4 WebKit)
   2) No classList (i mean exists but new tech at the tim so, VERY buggy on Android 4, might as well not exist)
   3) No const/let/arrow functions (we're unfortunately running ES3 to ES5 only)
   4) No vh units (very broken on Android 4 WebView)

   The bad:
   1) Dimensions are hard-coded to 1920×1200 with known chrome offsets, so layout is pixel-perfect without any DOM measuring, grid anchored in place as well, we hate responsive design anyway, but this means you will have to adjust the dimensions in the code if you want to use it on a different device or orientation. also, no responsive design at all, so yeah, dont use on different screen sizes/orientations and then blame me.
 */

var HA_URL   = "";
var HA_TOKEN = "";
try {
    if (typeof HA_CONFIG !== "undefined") {
        HA_URL   = HA_CONFIG.url   || "";
        HA_TOKEN = HA_CONFIG.token || "";
    }
} catch(e) {}


var SCREEN_W  = 1920;
var SCREEN_H  = 1080;   /* conservative off 1200
var HEADER_H  = 60;
var PAD       = 10;     /* padding*/
var GAP       = 8;      /* gap between grid's cells*/

var COLS = 4;
var ROWS = 4;
var editMode    = false;
var dragSrcSlot = null;
var layout      = [];
var entities    = {};


window.onload = function () {
    applyHardDimensions();
    if (HA_URL) {
        loadEntities();
        setInterval(syncStates, 5000); //default be 5 seconds, adjust as needed. no websockets for u :P
    }
};

/* DIMENSION LOCK */
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
    /* Max avail px area for the table itself (within padding) */
    var availW = SCREEN_W - (PAD * 2);
    var availH = SCREEN_H - HEADER_H - PAD - PAD;

    /* var GAP: cellspacing applies between AND also 'round them cells in da table */
    var cellW = Math.floor((availW - GAP * (COLS + 1)) / COLS);
    var cellH = Math.floor((availH - GAP * (ROWS + 1)) / ROWS);

    if (cellW < 60) cellW = 60;
    if (cellH < 60) cellH = 60;

    return { cellW: cellW, cellH: cellH };
}

/* dummies for test 
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
*/


/* layout */
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



/* pull curr entities from Home Assistant with xhr */
function loadEntities() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", HA_URL + "/api/states", true);
    xhr.setRequestHeader("Authorization", "Bearer " + HA_TOKEN);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4 || xhr.status !== 200) return;
        var data;
        try { 
            data = JSON.parse(xhr.responseText); 
        } 
        catch(e) { 
            return; 
        }
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

/* state sync, default 5 seconds, kindly navigate to the comment "default be 5 seconds" using ctrl+f to change value if you want*/
    //WARNING: MAY BREAK STUFF IF SET TOO LOW, ANDROID 4 WEBVIEW IS SLOW AF, SO BE CAREFUL. im already using optimistic UI updates so your reactiveness will get cooked up if you set it too low and the xhr requests start piling up. also important note, no websockets for u :P
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

/* welcome to my render engine*/
function render() {
    applyHardDimensions();

    var dims  = getGridDimensions();
    var cellW = dims.cellW;
    var cellH = dims.cellH;

    var tbl = document.getElementById("grid");
    tbl.innerHTML = "";
    /* explicit setting of size so it never (stack)overflows */
    tbl.style.width  = (cellW * COLS + GAP * (COLS + 1)) + "px";
    tbl.style.height = (cellH * ROWS + GAP * (ROWS + 1)) + "px";

    var slotIdx = 0;
    for (var r = 0; r < ROWS; r++) {
        var tr = document.createElement("tr"); //tr = row in da table
        for (var c = 0; c < COLS; c++) {
            var td = document.createElement("td"); //td = cell in da table
            td.className = "slot";
            td.setAttribute("data-slot", slotIdx);
            td.style.width   = cellW + "px";
            td.style.height  = cellH + "px";
            td.style.padding = "0";

            var eid = layout[slotIdx];
            if (eid && entities[eid]) {
                td.appendChild(buildCard(eid));
            } 
            
            else if (editMode) {
                var plus = document.createElement("div");
                plus.className = "empty-plus";
                plus.innerHTML = "+";
                td.appendChild(plus);
            }

            tr.appendChild(td); //this is the slow part, DOM reflow happens here, but Android 4 WebView is so slow that it dont matter anyway
            slotIdx++; // next slot
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
        /* Touch drag EVENTS, Android 4 WebView DOES NOT DO HTML5 drag events. WHYYYYYYYYYYYYY*/
        addEvent(card, "touchstart", onTouchStart);
        addEvent(card, "touchmove",  onTouchMove);
        addEvent(card, "touchend",   onTouchEnd);
    } 
    
    else {
        addEvent(card, "click", onCardClick);
    }

    return card;
}

/* so classlist doesnt exist on android 4, thes 3 are a workaround */
function hasClass(el, cls) {
    return (" " + el.className + " ").indexOf(" " + cls + " ") !== -1;
}
function addClass(el, cls) {
    if (!hasClass(el, cls)) el.className = (el.className ? el.className + " " : "") + cls;
}
function removeClass(el, cls) {
    el.className = (" " + el.className + " ").replace(" " + cls + " ", " ").replace(/^\s+|\s+$/g, "");
}

/*event listener func, found myself using this often so made a func */
function addEvent(el, type, fn) {
    if (el.addEventListener) {
        el.addEventListener(type, fn, false); 
    }
    else if (el.attachEvent) {
        el.attachEvent("on" + type, fn);
    }
}

/* UI updater, pretty self-explanatory */
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

/* toggler for actual event buttons, sends xhr post request to homey */
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

/* EDIT MODE (yes i am a toggle enjoyer)  */
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

/*  TOUCH, DRAG AND DROP (me off a cliff)
   This was the least fun part to implement, so basically Android 4 WebView does not support the HTML5 Drag and Drop API (draggable / dragstart / dragover / drop events NEVER fire)
        (also took forever to figure out that was problem).

   SO NOW i have to be a pioneer and use 'touch events', and a lot of manual work to make a false implementation of drag and drop using touchmove + elementFromPoint. very riveting indeed

   Here is how it works:
   1) touchstart    - will record the source slot on grid, clone the card as a floating ghost, remove the original (no dupes allowed), and begin track of finger offset within the card for 'smooth' dragging
   2) touchmove     - move the ghost under the finger; highlight target slot
   3) touchend      - swap layout entries, remove ghost, re-render. simple right? no. i am dead. even ai couldnt help me
*/

var touchGhost    = null;   /*floating clone element*/
var touchOffsetX  = 0;      /*finger offset inside the card*/
var touchOffsetY  = 0;      /*finger offset inside the card (but now in all new y-axis flavor*/
var touchDestSlot = null;   /*slot index currently below ur finger*/
var lastHighlight = null;   /*highlighted as drop target  */

function getSlotEl(el) {
    while (el && el.getAttribute && !el.getAttribute("data-slot")) el = el.parentNode;
    return el;
}

/* touch start func, self-explnatory, begin drag  */
function onTouchStart(ev) {
    ev = ev || window.event;
    var card = ev.currentTarget || ev.srcElement;
    var td   = getSlotEl(card.parentNode || card);
    if (!td) return;

    dragSrcSlot   = parseInt(td.getAttribute("data-slot"));
    touchDestSlot = dragSrcSlot;

    /* finger pos is relative to first element (1,1) in top left */
    var touch = ev.touches[0];
    var rect  = card.getBoundingClientRect
                ? card.getBoundingClientRect()
                : { left: 0, top: 0 };
    touchOffsetX = touch.clientX - rect.left;
    touchOffsetY = touch.clientY - rect.top;

    /* build a clone of ghost that floats under the finger */
    touchGhost = card.cloneNode(true);
    touchGhost.style.position   = "fixed";
    touchGhost.style.zIndex     = "9999"; //bigger num = more on top
    touchGhost.style.opacity    = "0.7";  //someone once told me more opacity = more better for higher contrast, so here we are
    touchGhost.style.width      = (rect.right  - rect.left) + "px";
    touchGhost.style.height     = (rect.bottom - rect.top)  + "px";
    touchGhost.style.left       = (touch.clientX - touchOffsetX) + "px";
    touchGhost.style.top        = (touch.clientY - touchOffsetY) + "px";
    touchGhost.style.pointerEvents = "none";
    touchGhost.style.margin     = "0";
    document.body.appendChild(touchGhost);

    addClass(card, "card-dragging");

    if (ev.preventDefault) ev.preventDefault();  /* block scroll */
}

/*  touch move: track finger, highlight target slot */
function onTouchMove(ev) {
    ev = ev || window.event;
    if (!touchGhost) return;
    if (ev.preventDefault) ev.preventDefault();

    var touch = ev.touches[0];
    var cx = touch.clientX;
    var cy = touch.clientY;

    /* Move fx of ghost */
    touchGhost.style.left = (cx - touchOffsetX) + "px";
    touchGhost.style.top  = (cy - touchOffsetY) + "px";

    /* find element under finger (hide ghost so it doesn't block hit test) */
    touchGhost.style.display = "none";
    var el = document.elementFromPoint(cx, cy);
    touchGhost.style.display = "";

    /* walk up to the nearest slot TD */
    var td = getSlotEl(el);

    /* clear prev highlight */
    if (lastHighlight && lastHighlight !== td) {
        removeClass(lastHighlight, "drag-over");
    }

    if (td && td.getAttribute("data-slot") !== null) {
        touchDestSlot = parseInt(td.getAttribute("data-slot"));
        if (touchDestSlot !== dragSrcSlot) {
            addClass(td, "drag-over");
            lastHighlight = td;
        }
    } else {
        touchDestSlot = null;
        lastHighlight = null;
    }
}

/* touch ends, commits swap */
function onTouchEnd(ev) {
    ev = ev || window.event;

    /* remove ghost fx */
    if (touchGhost && touchGhost.parentNode) {
        touchGhost.parentNode.removeChild(touchGhost);
    }
    touchGhost = null;

    /* clear highlights fx */
    var slots = document.querySelectorAll ? document.querySelectorAll(".slot") : [];
    for (var i = 0; i < slots.length; i++) removeClass(slots[i], "drag-over");

    /* perform the swap IF and only IF we have a valid final locati */
    if (dragSrcSlot !== null && touchDestSlot !== null && touchDestSlot !== dragSrcSlot) {
        var tmp              = layout[touchDestSlot];
        layout[touchDestSlot] = layout[dragSrcSlot];
        layout[dragSrcSlot]  = tmp;
        saveLayout();
    }

    dragSrcSlot   = null;
    touchDestSlot = null;
    lastHighlight = null;
    render();
}

/* GRID MADE HERE */
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