/*
Image-modal handles the UI for when a user wants to post an image. 
It includes the file input, preview, caption, and warnings about size. 
It also handles the upload process and then calls startPlacingImage() 
with the URL of the uploaded image when ready.

@param:
none directly

@usage:
When a user clicks the "image/gif" button in the post editor, openImageMode() 
is called to show the image posting UI. The user can select an attachment,
see a preview, add a caption, and then click "Post Attachment". The script will
handle the file validation, show warnings if necessary, upload the image to the server,
and then call startPlacingImage() with the URL of the uploaded image and the caption.

@return:
none directly, but it will eventually call startPlacingImage() with the image URL and caption when the user posts.

@notes:
- The script checks for file size limits and shows warnings for large files or dimensions.
- Files above 5MB are downright rejected.
- It supports JPEG, PNG, GIF, and WebP images.
- The image preview is shown in the modal before posting.
*/

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_WARN_PIXELS = 800;
const IMAGE_WARN_GIF_BYTES = 3 * 1024 * 1024;
let _imageFile = null;
let _imageExt = null;
let _imagePreviewUrl = null;

function openImageMode(userColor) {
    // param: userColor (string) the color to use for the image post, passed to startPlacingImage later
    // return: none, but sets up the image posting UI and resets any previous state
    document.getElementById('image-panel').style.display = 'flex';
    document.getElementById('post-editor').style.display = 'none';
    document.getElementById('color-wheel-wrap').style.display = 'none';

    _imageFile = null;
    _imageExt = null;
    _imagePreviewUrl = null;
    document.getElementById('image-file-input').value = '';
    document.getElementById('image-preview-area').innerHTML = '';
    document.getElementById('image-caption-input').value = '';
    document.getElementById('image-caption-count').textContent = '0/80';
    document.getElementById('image-post-btn').disabled = true;
    document.getElementById('image-warning').textContent = '';
    document.getElementById('image-warning').style.display = 'none';
}

function closeImageMode() {
    // param: none
    // return: none, but hides the image posting UI and resets state
    document.getElementById('image-panel').style.display = 'none';
    document.getElementById('post-editor').style.display = 'flex';
    document.getElementById('color-wheel-wrap').style.display = '';
    document.getElementById('image-warning').style.display = 'none';
    document.getElementById('image-preview-area').innerHTML = '';
    document.getElementById('image-post-btn').disabled = true;
    document.getElementById('image-post-btn').textContent = 'Post Attachment';
    _imageFile = null;
    _imageExt = null;
    _imagePreviewUrl = null;
}

function _getExt(file) {
    // param: file (File object) the file to get the extension for
    // return: string extension like 'jpg' or 'png' based on the file's MIME type, defaults to 'jpg' if unknown
    const mime = file.type;
    const map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
    };
    return map[mime] || 'jpg';
}

function _showImageWarning(msg, isError = false) {
    // param: msg (string) the warning message to display
    // param: isError (boolean) whether the warning is an error
    // return: none, but displays the warning message in the UI
    const el = document.getElementById('image-warning');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
    el.style.color = isError ? '#cc0000' : '#a05a00';
    el.style.background = isError ? '#fff0f0' : '#fffbee';
    el.style.borderColor = isError ? '#cc0000' : '#d4af37';
}

document.addEventListener('DOMContentLoaded', () => {
    // Set up event listeners for the image posting UI
    document.getElementById('btn-image').addEventListener('click', () => {
        if (typeof hasDrawingContent === 'function' && hasDrawingContent()) {
            if (!confirm('Switch to Image mode? Your drawing will be lost.')) return;
        }
        const textInput = document.getElementById('post-input');
        if (textInput && textInput.value.trim()) {
            if (!confirm('Switch to Image mode? Your text will be lost.')) return;
        }
        document.querySelectorAll('.post-type-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-image').classList.add('active');
        if (typeof closeDrawMode === 'function') closeDrawMode();
        document.getElementById('post-editor').style.display = 'none';
        document.getElementById('color-wheel-wrap').style.display = 'none';
        openImageMode(pendingColor);
    });

    // document.getElementById('btn-text').addEventListener('click', () => {
    //     if (_imageFile) {
    //         if (!confirm('Switch to Text mode? Your image selection will be lost.')) return;
    //     }
    //     closeImageMode();
    // });
    // This might be causing a bug--delete later if fixed.

    const origDrawBtn = document.getElementById('btn-draw');
    origDrawBtn.addEventListener('click', () => {
        if (document.getElementById('image-panel').style.display === 'flex') closeImageMode();
    });

    document.getElementById('image-file-input').addEventListener('change', (e) => {
        // param: e (Event) the change event from the file input
        // return: none, but processes the selected file, 
        //      shows a preview, and enables the post button if valid
        const file = e.target.files[0];
        if (!file) return;

        _imageFile = null;
        _imageExt = null;
        _imagePreviewUrl = null;
        document.getElementById('image-preview-area').innerHTML = '';
        document.getElementById('image-post-btn').disabled = true;
        _showImageWarning('');

        const ext = _getExt(file);
        const warnings = [];

        // This is a size check.
        if (file.size > IMAGE_MAX_BYTES) {
            _showImageWarning(`File is ${(file.size / 1024 / 1024).toFixed(1)}MB — exceeds the 5MB limit. Please choose a smaller file.`, true);
            document.getElementById('image-file-input').value = '';
            return;
        }

        if (ext === 'gif' && file.size > IMAGE_WARN_GIF_BYTES) {
            warnings.push(`Large GIF (${(file.size / 1024 / 1024).toFixed(1)}MB). It may load slowly.`);
        }

        const url = URL.createObjectURL(file);

        // GIF size checker
        const img = new Image();
        img.onload = () => {
            if (img.naturalWidth > IMAGE_WARN_PIXELS || img.naturalHeight > IMAGE_WARN_PIXELS) {
                warnings.push(`Image is ${img.naturalWidth}×${img.naturalHeight}px, which is larger than ${IMAGE_WARN_PIXELS}px on a side. It will appear truncated on the board, but you can see it in full by clicking the note. It may require a viewer to scroll to see the whole attachment in its glory.`);
            }

            if (warnings.length > 0) {
                _showImageWarning('⚠ ' + warnings.join(' '), false);
            }

            const previewArea = document.getElementById('image-preview-area');
            if (ext === 'gif') {
                const gifImg = document.createElement('img');
                gifImg.src = url;
                gifImg.style.cssText = 'max-width:100%;max-height:200px;border-radius:4px;object-fit:contain;';
                previewArea.appendChild(gifImg);
                const gifLabel = document.createElement('div');
                gifLabel.textContent = 'GIF will animate on the board and when viewed in full.';
                gifLabel.style.cssText = 'font-size:11px;color:#888;margin-top:4px;text-align:center;';
                previewArea.appendChild(gifLabel);
            } else {
                const staticImg = document.createElement('img');
                staticImg.src = url;
                staticImg.style.cssText = 'max-width:100%;max-height:200px;border-radius:4px;object-fit:contain;';
                previewArea.appendChild(staticImg);
            }

            _imageFile = file;
            _imageExt = ext;
            _imagePreviewUrl = url;
            document.getElementById('image-post-btn').disabled = false;
        };
        img.src = url;
    });

    document.getElementById('image-caption-input').addEventListener('input', () => {
        const len = document.getElementById('image-caption-input').value.length;
        document.getElementById('image-caption-count').textContent = `${len}/80`;
    });

    document.getElementById('image-cancel-btn').addEventListener('click', () => {
        closeImageMode();
        closePostModal();
    });

    document.getElementById('image-post-btn').addEventListener('click', async () => {
        if (!_imageFile) return;
        const btn = document.getElementById('image-post-btn');
        btn.disabled = true;
        btn.textContent = 'Uploading...';

        try {
            const arrayBuffer = await _imageFile.arrayBuffer();
            const res = await fetch('/api/image-upload', {
                method: 'POST',
                headers: { 'Content-Type': _imageFile.type },
                body: arrayBuffer
            });
            if (!res.ok) {
                const err = await res.json();
                _showImageWarning(err.error || 'Upload failed.', true);
                btn.disabled = false;
                btn.textContent = 'Post Attachment';
                return;
            }
            const { publicUrl, ext } = await res.json();
            const caption = document.getElementById('image-caption-input').value.trim();

            closeImageMode();
            closePostModal();

            startPlacingImage(publicUrl, ext, pendingColor, caption);
        } catch (err) {
            console.error('Image upload error:', err);
            _showImageWarning('Upload failed. Please try again.', true);
            btn.disabled = false;
            btn.textContent = 'Post Attachment';
        }
    });
});