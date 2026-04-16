const board = document.getElementById('board');
let placing = false, activeEl = null, activeColor = null;
let currentUserName = null;



function initBoard(userName, userColor) {
    currentUserName = userName;
    checkBanOnLoad();
    startTrialPolling();
    fetch('/api/board-start')
        .then(r => r.json())
        .then(data => {
            const boardStart = data.startMs;
            window._boardStartMs = boardStart;
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

    const renderAll = (posts) => posts.forEach(p => renderNote(p));
    if (window._preloadedPosts) {
        renderAll(window._preloadedPosts);
        delete window._preloadedPosts;
    } else {
        fetch('/api/posts').then(r => r.json()).then(renderAll);
    }


    document.getElementById('add-btn').addEventListener('click', () => {
        openPostModal(userName, userColor);
    });
}

function moveGhost(e) {
    const ghost = document.getElementById('ghost-note');
    if (!ghost) return;
    const r = board.getBoundingClientRect();

    // --- !!! --- TEST THIS FOR SCALING ISSUE FIX --- !!! ---
    const scale = r.width / 1600;
    ghost.style.left = ((e.clientX - r.left) / scale - 80) + 'px';
    ghost.style.top  = ((e.clientY - r.top)  / scale - 20) + 'px';
}

function dropNote(e) {
    if (!placing) return;
    const ghost = document.getElementById('ghost-note');
    const r = board.getBoundingClientRect();
    const scale = r.width / 1600;
    const x = (e.clientX - r.left) / scale - 80;
    const y = (e.clientY - r.top)  / scale - 20;
    const text = board.dataset.pendingText || '';
    const imageUrl = board.dataset.pendingImageUrl || null;
    const type = board.dataset.pendingType || 'text';
    const caption = board.dataset.pendingCaption || '';
    const colorSnapshot = { ...activeColor };
    const fileExt = board.dataset.pendingFileExt || null;


    if (ghost) ghost.remove();
    board.removeEventListener('mousemove', moveGhost);
    board.removeEventListener('click', dropNote);
    board.style.cursor = '';
    placing = false;
    document.body.classList.remove('is-placing');
    document.querySelectorAll('.sticky').forEach(n => n.style.pointerEvents = '');
    delete board.dataset.pendingImageUrl;
    delete board.dataset.pendingType;
    delete board.dataset.pendingCaption;

    const postData = { text, x, y, author: currentUserName, color: colorSnapshot, type, imageUrl, caption, fileExt, postedAt: Date.now() };
    fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
    })
    .then(r => r.json())
    .then(res => renderNote({ ...postData, id: res.id, zIndex: 9999 }));
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
    ghost.style.zIndex = '9999';
    ghost.innerHTML = `<div class="author" style="color:${color.author}">${currentUserName}</div>${text}`;
    board.appendChild(ghost);
    board.dataset.pendingText = text;
    document.querySelectorAll('.sticky').forEach(n => n.style.pointerEvents = 'none');
    board.addEventListener('mousemove', moveGhost);
    board.addEventListener('click', dropNote);
    board.style.cursor = 'crosshair';
    document.body.classList.add('is-placing');
}

function renderNote(p) {
    const note = document.createElement('div');
    note.className = 'sticky';
    note.dataset.id = p.id;
    note.style.cssText = `left:${p.x}px;top:${p.y}px;background:${p.color.bg};z-index:${p.zIndex || 1};`;
    note.style.setProperty('--note-bg', p.color.bg);

    const badgeHtml = p.fileExt ? `<span class="note-filetype-badge">.${p.fileExt}</span>` : '';
    const metaHtml = `<div class="note-meta-row">${badgeHtml}<span class="note-score">${scoreLabel(p.score)}</span></div>`;

    if ((p.type === 'drawing' || p.type === 'image') && p.imageUrl) {
        note.classList.add('is-media');
        note.innerHTML = `<div class="author" style="color:${p.color.author}">${p.author}</div>
            ${metaHtml}
            <img src="${p.imageUrl}" style="width:100%;border-radius:2px;display:block;" />`;
    } else {
        note.innerHTML = `<div class="author" style="color:${p.color.author}">${p.author}</div>${p.text}${metaHtml}`;
    }

    board.appendChild(note);
    if (p.score >= 5) note.classList.add('righteous');
    if (p.score < 0) note.classList.add('sinful');
    if (p.denounced) {
        _denounceNoteElement(note, 'banished');
    } else {
        note.addEventListener('click', () => openViewModal(p));
    }
}

function openViewModal(p) {
    if (placing) return;

    const modal = document.getElementById('view-modal');
    const note = document.getElementById('view-note');

    document.getElementById('view-author').style.display = '';
    document.getElementById('vote-bar').style.display = '';
    note.style.cssText = '';
    note.className = '';

    const noteEl = document.querySelector(`.sticky[data-id="${p.id}"]`);
    if (noteEl && noteEl.dataset.denounced === 'true') {
        note.style.cssText = 'background:#000; min-width:220px; max-width:400px; min-height:160px; display:flex; align-items:center; justify-content:center; padding:20px; border-radius:3px; box-shadow:4px 6px 20px rgba(0,0,0,0.25);';
        note.innerHTML = `<div style="color:#ff3333; font-weight:bold; font-size:13px; text-align:center; text-transform:uppercase; letter-spacing:0.5px; line-height:1.6;">HERETIC HAS BEEN DENOUNCED BY THE BOARD</div>`;
        document.getElementById('view-author').textContent = '';
        document.getElementById('view-author').style.display = 'none';
        document.getElementById('view-timestamps').innerHTML = '';
        document.getElementById('vote-bar').style.display = 'none';
        modal.classList.add('show');
        return;
    }

    document.getElementById('view-author').style.display = '';
    document.getElementById('vote-bar').style.display = '';
    note.style.cssText = '';
    note.className = '';

    document.getElementById('view-author').style.color = p.color.author;
    document.getElementById('view-author').textContent = p.author;
    const viewText = document.getElementById('view-text');
    if ((p.type === 'drawing' || p.type === 'image') && p.imageUrl) {
        viewText.innerHTML = `<img src="${p.imageUrl}" style="width:100%;border-radius:2px;display:block;" />${p.caption ? `<div style="margin-top:8px;font-style:italic;font-size:12px;color:#555;text-align:center;">${p.caption}</div>` : ''}`;
    } else {
        viewText.textContent = p.text || '';
    }
    note.classList.toggle('is-drawing', p.type === 'drawing' || p.type === 'image');
    note.style.background = p.color.bg;

    const tsEl = document.getElementById('view-timestamps');
    if (p.postedAt && window._boardStartMs) {
        const estStr = new Date(p.postedAt).toLocaleString('en-US', {
            timeZone: 'America/New_York',
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
        const elapsedMs = p.postedAt - window._boardStartMs;
        const s = Math.max(0, Math.floor(elapsedMs / 1000));
        const bh = String(Math.floor(s / 3600)).padStart(2,'0');
        const bm = String(Math.floor((s % 3600) / 60)).padStart(2,'0');
        const bs = String(s % 60).padStart(2,'0');
        tsEl.innerHTML = `Posted ${estStr} EST<br> [Board time: ${bh}:${bm}:${bs}]`;
    } else {
        tsEl.innerHTML = '';
    }

    modal.classList.add('show');
    const postId = p.id;
    const voter = currentUserName;
    let userVote = localStorage.getItem(`vote_${postId}_${voter}`) || null;

    fetch(`/api/posts/${postId}/score`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (data && typeof data.score === 'number') {
                p.score = data.score;
                renderVoteButtons();
            }
        }).catch(() => {});

    function renderVoteButtons() {
        document.getElementById('vote-up').style.fontWeight = userVote === 'up' ? 'bold' : 'normal';
        document.getElementById('vote-down').style.fontWeight = userVote === 'down' ? 'bold' : 'normal';
        document.getElementById('view-score').textContent = `Score: ${p.score || 0}`;
    }

    document.getElementById('vote-up').onclick = () => {
        fetch(`/api/posts/${postId}/vote`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({direction: 'up', voter})
        }).then(r => r.json()).then(res => {
            p.score = res.score;
            userVote = res.userVote;
            localStorage.setItem(`vote_${postId}_${voter}`, userVote || '');
            renderVoteButtons();
            const noteEl = document.querySelector(`.sticky[data-id="${postId}"] .note-score`);
            if (noteEl) noteEl.textContent = scoreLabel(res.score);
            checkForTrial(postId, res.score, p.author);
        });
    };

    document.getElementById('vote-down').onclick = () => {
        fetch(`/api/posts/${postId}/vote`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({direction: 'down', voter})
        }).then(r => r.json()).then(res => {
            p.score = res.score;
            userVote = res.userVote;
            localStorage.setItem(`vote_${postId}_${voter}`, userVote || '');
            renderVoteButtons();
            const noteEl = document.querySelector(`.sticky[data-id="${postId}"] .note-score`);
            if (noteEl) noteEl.textContent = scoreLabel(res.score);
            checkForTrial(postId, res.score, p.author);
        });
    };

    renderVoteButtons();
}

document.getElementById('view-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('view-modal'))
        document.getElementById('view-modal').classList.remove('show');
});

function cleanup() {
    placing = false; activeEl = null;
    document.body.classList.remove('is-placing', 'is-posting');
    board.removeEventListener('mousemove', moveGhost);
    board.removeEventListener('click', dropNote);
    delete board.dataset.pendingFileExt;
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

/*
checkScreenSize is a band aid fix for small screens.
Too lazy to make board react to smaller screens
*/
function checkScreenSize() {
    if (window.innerWidth < 700 || window.innerHeight < 500) {
        document.getElementById('small-screen-warning').classList.add('show');
    }
}

document.getElementById('small-screen-dismiss').addEventListener('click', () => {
    document.getElementById('small-screen-warning').classList.remove('show');
});

checkScreenSize();
window.addEventListener('resize', checkScreenSize);


// This should get new posts every second, set refresh lower for real demo
// Now should refresh
setInterval(() => {
    fetch('/api/board-start', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            if (window._boardStartMs && data.startMs !== window._boardStartMs) {
                location.reload();
                return;
            }
        });

    fetch('/api/posts', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
        .then(r => r.json())
        .then(posts => {
            posts.forEach(p => {
                if (!document.querySelector(`.sticky[data-id="${p.id}"]`)) {
                    renderNote(p);
                } else {
                    const scoreEl = document.querySelector(`.sticky[data-id="${p.id}"] .note-score`);
                    if (scoreEl) scoreEl.textContent = scoreLabel(p.score);
                    const noteEl = document.querySelector(`.sticky[data-id="${p.id}"]`);
                    if (noteEl) noteEl.classList.toggle('righteous', p.score >= 5);
                    if (noteEl) noteEl.classList.toggle('sinful', p.score < 0);
                    if (noteEl && noteEl.dataset.denounced !== 'true') noteEl.onclick = () => openViewModal(p);
                }
            });
        });
}, 8000);

/*
scaleBaord is another band aid fix to make board size 
consistent across different resolutions.
*/
function scaleBoard() {
    const wrapper = document.getElementById('board-wrapper');
    const availW = wrapper.clientWidth;
    const availH = wrapper.clientHeight;
    const scaleX = availW / 1600;
    const scaleY = availH / 900;
    const scale = Math.max(scaleX, scaleY);

    board.style.transform = `scale(${scale})`;
    board.style.transformOrigin = 'top left';
    board.style.left = '0px';
    board.style.top = '0px';
}

scaleBoard();
window.addEventListener('resize', scaleBoard);

/*
The following is for the search bar.
Only filters by post author name cause searching by
content is too hard for my lazy brain and I dont want to do it
*/
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

function applySearch(query) {
    const notes = document.querySelectorAll('.sticky[data-id]');
    if (!query) {
        notes.forEach(n => {
            n.classList.remove('search-dim', 'search-highlight');
            n.style.pointerEvents = '';
        });
        return;
    }
    notes.forEach(n => {
        const author = n.querySelector('.author')?.textContent?.toLowerCase() || '';
        if (author.includes(query.toLowerCase())) {
            n.classList.add('search-highlight');
            n.classList.remove('search-dim');
            n.style.pointerEvents = '';
        } else {
            n.classList.add('search-dim');
            n.classList.remove('search-highlight');
        }
    });
}

searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.classList.toggle('visible', q.length > 0);
    applySearch(q);
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    applySearch('');
});

function startPlacingDrawing(imageUrl, color, caption) {
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
    ghost.style.zIndex = '9999';
    ghost.innerHTML = `<div class="author" style="color:${color.author}">${currentUserName}</div>
        <img src="${imageUrl}" style="width:100%;border-radius:2px;display:block;" />`;
    board.appendChild(ghost);
    board.dataset.pendingImageUrl = imageUrl;
    board.dataset.pendingType = 'drawing';
    board.dataset.pendingCaption = caption || '';
    document.querySelectorAll('.sticky').forEach(n => n.style.pointerEvents = 'none');
    board.addEventListener('mousemove', moveGhost);
    board.addEventListener('click', dropNote);
    board.style.cursor = 'crosshair';
    document.body.classList.add('is-placing');
}

function startPlacingImage(imageUrl, fileExt, color, caption) {
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
    ghost.style.zIndex = '9999';
    ghost.innerHTML = `<div class="author" style="color:${color.author}">${currentUserName}</div>
        <div class="note-filetype-badge">.${fileExt}</div>
        <img src="${imageUrl}" style="width:100%;border-radius:2px;display:block;" />`;
    board.appendChild(ghost);
    board.dataset.pendingImageUrl = imageUrl;
    board.dataset.pendingType = 'image';
    board.dataset.pendingCaption = caption || '';
    board.dataset.pendingFileExt = fileExt;
    document.querySelectorAll('.sticky').forEach(n => n.style.pointerEvents = 'none');
    board.addEventListener('mousemove', moveGhost);
    board.addEventListener('click', dropNote);
    board.style.cursor = 'crosshair';
    document.body.classList.add('is-placing');
}

function scoreLabel(score) {
    score = score || 0;
    if (score > 0) return `+${score} ✦`;
    if (score < 0) return `${score} ✦`;
    return '';
}
