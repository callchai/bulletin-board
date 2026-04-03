/*
for the pop up when hitting post button
*/
let pendingText = null;
let pendingColor = null;


function openPostModal(userName, userColor) {
    const modal = document.getElementById('post-modal');
    const input = document.getElementById('post-input');
    const preview = document.getElementById('post-preview');
    const previewAuthor = document.getElementById('preview-author');
    const previewText = document.getElementById('preview-text');
    const charCount = document.getElementById('post-char-count');
    const confirmBtn = document.getElementById('post-confirm');

    preview.style.background = userColor.bg;
    previewAuthor.style.color = userColor.author;
    previewAuthor.textContent = userName;
    previewText.textContent = 'Your note will appear here...';
    previewText.style.fontStyle = 'italic';
    previewText.style.color = '#999';
    input.value = '';
    charCount.textContent = '0 / 300';
    confirmBtn.disabled = true;
    pendingColor = userColor;

    modal.classList.add('show');
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
    document.getElementById('post-input').oninput = null;
}

document.getElementById('post-cancel').addEventListener('click', closePostModal);

document.getElementById('post-confirm').addEventListener('click', () => {
    const text = document.getElementById('post-input').value.trim();
    if (!text) return;
    closePostModal();
    startPlacing(text, pendingColor);
});

document.getElementById('btn-draw').addEventListener('click', () => {});
document.getElementById('btn-image').addEventListener('click', () => {});
