const ALIAS = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
  'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa',
  'Quebec','Romeo','Sierra','Tango','Uniform','Victor','Whiskey','Xray','Yankee','Zulu'];
  // TODO: Add more aliases...?
const COLORS = [
  {bg:'#fff9a3',author:'#b8a800'},{bg:'#b5f0c0',author:'#2a7a3b'},
  {bg:'#ffd6a5',author:'#a05a00'},{bg:'#c5d8ff',author:'#1a4a9e'},
  {bg:'#f9c5d1',author:'#a0253a'},
];

const name = ALIAS[Math.floor(Math.random()*ALIAS.length)] + '-' + (100+Math.floor(Math.random()*900));
const userColor = COLORS[Math.floor(Math.random()*COLORS.length)];
// Remove unique color from pool later...? Or allow user to select color?
document.getElementById('codename').textContent = name;

const boardStart = Date.now();
setInterval(() => {
  const s = Math.floor((Date.now() - boardStart) / 1000);
  const h = String(Math.floor(s/3600)).padStart(2,'0');
  const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
  const sc = String(s%60).padStart(2,'0');
  document.getElementById('clock').textContent = `${h}:${m}:${sc}`;
}, 1000);

const board = document.getElementById('board');
let placing = false, activeEl = null, activeColor = null;

document.getElementById('add-btn').addEventListener('click', () => {
  if (placing) return;
  placing = true;
  activeColor = userColor;
  const ghost = document.createElement('div');
  ghost.className = 'sticky';
  ghost.style.background = activeColor.bg;
  ghost.style.opacity = '0.85';
  ghost.style.left = '-9999px'; ghost.style.top = '-9999px';
  ghost.innerHTML = `<div class="author" style="color:${activeColor.author}">${name}</div><textarea id="note-input" placeholder="Type your note..." rows="4" style="width:100%;border:none;background:transparent;font-size:13px;resize:none;outline:none;font-family:sans-serif;"></textarea>`;
  board.appendChild(ghost);
  activeEl = ghost;
  setTimeout(() => document.getElementById('note-input').focus(), 50);
  board.addEventListener('mousemove', moveGhost);
  board.addEventListener('click', dropNote);
});

// This that tuff transparent affect
function moveGhost(e) {
  if (!activeEl) return;
  const r = board.getBoundingClientRect();
  activeEl.style.left = (e.clientX - r.left - 80) + 'px';
  activeEl.style.top  = (e.clientY - r.top  - 20) + 'px';
}

function dropNote(e) {
  if (!placing || !activeEl) return;
  if (e.target.tagName === 'TEXTAREA') return;
  const text = document.getElementById('note-input').value.trim();
  if (!text) { activeEl.remove(); cleanup(); return; }
  const r = board.getBoundingClientRect();
  const x = e.clientX - r.left - 80;
  const y = e.clientY - r.top  - 20;
  activeEl.remove();
  const note = document.createElement('div');
  note.className = 'sticky';
  note.style.cssText = `left:${x}px;top:${y}px;background:${activeColor.bg};`;
  note.innerHTML = `<div class="author" style="color:${activeColor.author}">${name}</div>${text}`;
  board.appendChild(note);
  cleanup();
}

function cleanup() {
  placing = false; activeEl = null;
  board.removeEventListener('mousemove', moveGhost);
  board.removeEventListener('click', dropNote);
}