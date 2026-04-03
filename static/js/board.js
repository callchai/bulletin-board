const board = document.getElementById('board');
let placing = false, activeEl = null, activeColor = null;
let currentUserName = null;

function initBoard(userName, userColor) {
    currentUserName = userName;
    fetch('/api/board-start')
        .then(r => r.json())
        .then(data => {
            const boardStart = data.startMs;
            setInterval(() => {
                const s = Math.floor((Date.now() - boardStart) / 1000);
                const totalHours = Math.floor(s / 3600);
                const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
                const sc = String(s % 60).padStart(2, '0');

                // DONT RESET BOARD, MAKE SURE THIS WORKs as intended
                if (totalHours >= 24) {
                    const days = Math.floor(totalHours / 24);
                    const h = String(totalHours % 24).padStart(2, '0');
                    document.getElementById('clock').textContent = `${days}d ${h}:${m}:${sc}`;
                } else {
                    const h = String(totalHours).padStart(2, '0');
                    document.getElementById('clock').textContent = `${h}:${m}:${sc}`;
                }
            }, 1000);
        });

    fetch('/api/posts')
        .then(r => r.json())
        .then(posts => posts.forEach(p => renderNote(p)));


    document.getElementById('add-btn').addEventListener('click', () => {
        openPostModal(userName, userColor);
    });
}

function moveGhost(e) {
    const ghost = document.getElementById('ghost-note');
    if (!ghost) return;
    const r = board.getBoundingClientRect();
    ghost.style.left = (e.clientX - r.left - 80) + 'px';
    ghost.style.top  = (e.clientY - r.top  - 20) + 'px';
}

function dropNote(e) {
    if (!placing) return;
    // if (e.target.classList.contains('sticky')) return; -> Check if allow posting on top of other
    const ghost = document.getElementById('ghost-note');
    const r = board.getBoundingClientRect();
    const x = e.clientX - r.left - 80;
    const y = e.clientY - r.top - 20;
    const text = board.dataset.pendingText;
    const colorSnapshot = { ...activeColor };

    if (ghost) ghost.remove();
    board.removeEventListener('mousemove', moveGhost);
    board.removeEventListener('click', dropNote);
    board.style.cursor = '';
    placing = false;

    const postData = { text, x, y, author: currentUserName, color: colorSnapshot };
    fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
    })
    .then(r => r.json())
    .then(res => renderNote({ ...postData, id: res.id }));
}

function startPlacing(text, color) {
    placing = true;
    activeColor = color;
    const ghost = document.createElement('div');
    ghost.className = 'sticky';
    ghost.id = 'ghost-note';
    ghost.style.background = color.bg;
    ghost.style.opacity = '0.85';
    ghost.style.left = '-9999px';
    ghost.style.top = '-9999px';
    ghost.style.pointerEvents = 'none';
    ghost.innerHTML = `<div class="author" style="color:${color.author}">${currentUserName}</div>${text}`;
    board.appendChild(ghost);
    board.dataset.pendingText = text;
    board.addEventListener('mousemove', moveGhost);
    board.addEventListener('click', dropNote);
    board.style.cursor = 'crosshair';
}

function renderNote(p) {
    const note = document.createElement('div');
    note.className = 'sticky';
    note.dataset.id = p.id;
    note.style.cssText = `left:${p.x}px;top:${p.y}px;background:${p.color.bg};`;
    note.innerHTML = `<div class="author" style="color:${p.color.author}">${p.author}</div>${p.text}`;
    note.addEventListener('click', () => openViewModal(p));
    board.appendChild(note);
}

function openViewModal(p) {
    if (placing) return; // TODO: check if this disables from viewing while in place mode

    const modal = document.getElementById('view-modal');
    const note = document.getElementById('view-note');
    document.getElementById('view-author').style.color = p.color.author;
    document.getElementById('view-author').textContent = p.author;
    document.getElementById('view-text').textContent = p.text;
    note.style.background = p.color.bg;
    modal.classList.add('show');
}

document.getElementById('view-close').addEventListener('click', () => {
    document.getElementById('view-modal').classList.remove('show');
});

document.getElementById('view-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('view-modal'))
        document.getElementById('view-modal').classList.remove('show');
});

function cleanup() {
    placing = false; activeEl = null;
    board.removeEventListener('mousemove', moveGhost);
    board.removeEventListener('click', dropNote);
}

if (typeof name !== 'undefined' && typeof userColor !== 'undefined') {
    initBoard(name, userColor);
}

document.getElementById('help-btn').addEventListener('click', () => {
    const modal = document.getElementById('help-modal');
    modal.classList.add('show');

    document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.help-section').forEach(s => s.classList.remove('active'));
    document.querySelector('.help-tab[data-target="help-home"]').classList.add('active');
    document.getElementById('help-home').classList.add('active');
    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    document.getElementById('help-quote').innerHTML = quote;
});

document.getElementById('help-close').addEventListener('click', () => {
    document.getElementById('help-modal').classList.remove('show');
});

document.querySelectorAll('.help-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.help-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.help-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

// This should get new posts every second
setInterval(() => {
    fetch('/api/posts')
        .then(r => r.json())
        .then(posts => {
            posts.forEach(p => {
                if (!document.querySelector(`.sticky[data-id="${p.id}"]`)) {
                    renderNote(p);
                }
            });
        });
}, 8000);
