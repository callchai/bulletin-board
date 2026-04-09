/*
for the pop up when hitting post button
*/
let pendingText = null;
let pendingColor = null;

const COLOR_WHEEL = [
    {bg:'#fff9a3',author:'#b8a800'},
    {bg:'#b5f0c0',author:'#2a7a3b'},
    {bg:'#ffd6a5',author:'#a05a00'},
    {bg:'#c5d8ff',author:'#1a4a9e'},
    {bg:'#f9c5d1',author:'#a0253a'},
    {bg:'#e8d5ff',author:'#6a1a9e'},
    {bg:'#d5f5f5',author:'#1a7a7a'},
    {bg:'#ffe0e0',author:'#9e1a1a'},
    {bg:'#f0ffe0',author:'#4a7a1a'},
    {bg:'#fff0d5',author:'#8a5a00'},
    {bg:'#e0e8ff',author:'#1a3a9e'},
    {bg:'#ffe8f5',author:'#9e1a6a'},
];

function buildColorWheel(currentColor, onSelect) {
    const wrap = document.getElementById('color-wheel-wrap');
    wrap.innerHTML = '';
    COLOR_WHEEL.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'color-wheel-swatch';
        btn.style.background = c.bg;
        btn.style.borderColor = (c.bg === currentColor.bg) ? c.author : 'transparent';
        btn.title = c.bg;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-wheel-swatch').forEach(s => s.style.borderColor = 'transparent');
            btn.style.borderColor = c.author;
            onSelect(c);
        });
        wrap.appendChild(btn);
    });
}

function openPostModal(userName, userColor) {
    const modal = document.getElementById('post-modal');
    const input = document.getElementById('post-input');
    const preview = document.getElementById('post-preview');
    const previewAuthor = document.getElementById('preview-author');
    const previewText = document.getElementById('preview-text');
    const charCount = document.getElementById('post-char-count');
    const confirmBtn = document.getElementById('post-confirm');
    document.querySelectorAll('.post-type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-text').classList.add('active');
    document.getElementById('color-wheel-wrap').style.display = '';

    const savedColor = localStorage.getItem('bb_last_note_color');
    const startColor = savedColor ? JSON.parse(savedColor) : { ...userColor };

    preview.style.background = startColor.bg;
    previewAuthor.style.color = startColor.author;
    previewAuthor.textContent = userName;
    previewText.textContent = 'Your note will appear here...';
    previewText.style.fontStyle = 'italic';
    previewText.style.color = '#999';
    input.value = '';
    charCount.textContent = '0 / 300';
    confirmBtn.disabled = true;
    pendingColor = { ...startColor };

    buildColorWheel(startColor, (c) => {
        pendingColor = c;
        preview.style.background = c.bg;
        previewAuthor.style.color = c.author;
        localStorage.setItem('bb_last_note_color', JSON.stringify(c));
    });

    modal.classList.add('show');
    document.body.classList.add('is-posting');
    setTimeout(() => input.focus(), 100);

    input.oninput = () => {
        const val = input.value;
        charCount.textContent = `${val.length} / 300`;
        if (val.trim()) {
            previewText.textContent = val;
            previewText.style.fontStyle = 'normal';
            previewText.style.color = '#333';
            confirmBtn.disabled = false;
        } else {
            previewText.textContent = 'Your note will appear here...';
            previewText.style.fontStyle = 'italic';
            previewText.style.color = '#999';
            confirmBtn.disabled = true;
        }
    };
}

function closePostModal() {
    document.getElementById('post-modal').classList.remove('show');
    document.body.classList.remove('is-posting');
    document.getElementById('post-input').oninput = null;
}

document.getElementById('post-cancel').addEventListener('click', closePostModal);

document.getElementById('post-confirm').addEventListener('click', () => {
    const text = document.getElementById('post-input').value.trim();
    if (!text) return;
    closePostModal();
    startPlacing(text, pendingColor);
});

