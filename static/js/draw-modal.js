let drawHistory = [];
let isDrawing = false;
let drawCtx = null;
let drawCanvas = null;
let canvasInitialized = false;

function initDrawCanvas() {
    drawCanvas = document.getElementById('draw-canvas');
    drawCtx = drawCanvas.getContext('2d');
    drawCtx.fillStyle = '#fff9a3';
    drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    saveDrawState();

    if (canvasInitialized) return;
    canvasInitialized = true;

    let painting = false;

    drawCanvas.addEventListener('mousedown', (e) => {
        painting = true;
        drawCtx.beginPath();
        const pos = getCanvasPos(e);
        drawCtx.moveTo(pos.x, pos.y);
    });

    drawCanvas.addEventListener('mousemove', (e) => {
        if (!painting) return;
        const pos = getCanvasPos(e);
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.strokeStyle = document.getElementById('draw-color').value;
        drawCtx.lineWidth = document.getElementById('draw-size').value;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.stroke();
    });

    drawCanvas.addEventListener('mouseup', () => {
        if (painting) { painting = false; saveDrawState(); }
    });

    drawCanvas.addEventListener('mouseleave', () => {
        if (painting) { painting = false; saveDrawState(); }
    });
}

function getCanvasPos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function saveDrawState() {
    if (drawHistory.length > 30) drawHistory.shift();
    drawHistory.push(drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
}

function undoDraw() {
    if (drawHistory.length <= 1) return;
    drawHistory.pop();
    drawCtx.putImageData(drawHistory[drawHistory.length - 1], 0, 0);
}

function clearDrawCanvas(bgColor) {
    drawHistory = [];
    drawCtx.fillStyle = bgColor || '#fff9a3';
    drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
    saveDrawState();
}

function openDrawMode(userColor) {
    clearDrawCanvas(userColor.bg);
    document.getElementById('draw-panel').style.display = 'flex';
    document.getElementById('post-editor').style.display = 'none';
    initDrawCanvas();
    updateSizePreview();
}

function closeDrawMode() {
    document.getElementById('draw-panel').style.display = 'none';
    document.getElementById('post-editor').style.display = 'flex';
    drawHistory = [];
    canvasInitialized = false;
}

function updateSizePreview() {
    const size = document.getElementById('draw-size').value;
    const dot = document.getElementById('size-preview-dot');
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
}

async function submitDrawing(userColor) {
    /* 
    This function helps convert the drawing into a blob to store it in
    the bucket. Returns a URL to the uploaded image on success, or null on failure.
    */
    return new Promise((resolve) => {
        drawCanvas.toBlob(async (blob) => {
            try {
                const res = await fetch('/api/drawing-upload-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: `drawing-${Date.now()}.png` })
                });
                const { uploadUrl, publicUrl } = await res.json();

                await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'image/png' },
                    body: blob
                });

                resolve(publicUrl);
            } catch (err) {
                console.error('Drawing upload failed:', err);
                resolve(null);
            }
        }, 'image/png');
    });
}

const PALETTE_COLORS = [
    '#222222', '#e63946', '#f4a261', '#e9c46a',
    '#2a9d8f', '#264653', '#8338ec', '#ffffff'
];

function buildPalette() {
    const palette = document.getElementById('draw-palette');
    PALETTE_COLORS.forEach(c => {
        const swatch = document.createElement('button');
        swatch.className = 'palette-swatch';
        swatch.style.background = c;
        swatch.title = c;
        if (c === '#222222') swatch.classList.add('active');
        swatch.addEventListener('click', () => {
            document.getElementById('draw-color').value = c;
            document.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });
        palette.appendChild(swatch);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    buildPalette();

    document.getElementById('draw-undo').addEventListener('click', undoDraw);

    document.getElementById('draw-clear').addEventListener('click', () => {
        const bg = pendingColor ? pendingColor.bg : '#fff9a3';
        clearDrawCanvas(bg);
    });

    document.getElementById('draw-size').addEventListener('input', updateSizePreview);

    document.getElementById('draw-color').addEventListener('input', () => {
        document.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('active'));
    });

    document.getElementById('draw-cancel').addEventListener('click', () => {
        closeDrawMode();
        closePostModal();
    });

    document.getElementById('draw-post').addEventListener('click', async () => {
        const btn = document.getElementById('draw-post');
        btn.disabled = true;
        btn.textContent = 'Uploading...';

        const publicUrl = await submitDrawing(pendingColor || { bg: '#fff9a3' });
        closeDrawMode();
        closePostModal();

        if (publicUrl) {
            startPlacingDrawing(publicUrl, pendingColor);
        } else {
            alert('Upload failed. Please try again.');
        }
        btn.disabled = false;
        btn.textContent = 'Post Drawing';
    });

    document.getElementById('btn-draw').addEventListener('click', () => {
        if (!pendingColor) return;
        document.querySelectorAll('.post-type-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-draw').classList.add('active');
        openDrawMode(pendingColor);
    });

    document.getElementById('btn-text').addEventListener('click', () => {
        document.querySelectorAll('.post-type-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-text').classList.add('active');
        closeDrawMode();
    });
});