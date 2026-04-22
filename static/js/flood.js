/*
This flood.js script is a fail safe for censorship due to
the potential of APIs being unresponsive or unreliable in grading
content.

This is triggered when TWO people have been banished, and
a third trial is underway.

The third trial is instead replaced by a flood that resets the board
in the span of 80 seconds.
 */
const FLOOD_QUOTES = [
    `"And the waters prevailed exceedingly upon the Board; and all the posts were covered."`,
    `"The Board saw that the wickedness of posters was many, and every intention of posts was only continuos evil."`,
    `"I will blot out posters whom I have created from the face of the Board, for I am sorry that I made them." - The BOARD`,
    `"The fountains of the great deep burst forth, and the windows of the heavens were opened."`,
    `"And all flesh died that moved on the Board; every post, every note, every attachment of every file type."`,
    `"The waters prevailed on the Board for one hundred and fifty seconds."`,
    `"I establish my covenant with you: never again shall the Board be wiped by flood... until next time."`,
    `"Every new generation deserves a clean Board."`,
];

let _floodState = {
    polling: false,
    phase: 'idle',
    warningTimer: null,
    riseInterval: null,
    quoteInterval: null,
    floodTriggeredAt: null,
};

function startFloodPolling() {
    if (_floodState.polling) return;
    _floodState.polling = true;
    setInterval(_pollFlood, 5000);
}

async function _pollFlood() {
    if (_floodState.phase !== 'idle') return;
    try {
        const res  = await fetch('/api/flood/status', { cache: 'no-store' });
        const data = await res.json();
        if (data.status === 'triggered' && _floodState.phase === 'idle') {
            if (data.triggeredAt) {
                const age = (Date.now() + (window._serverTimeOffset || 0)) - data.triggeredAt;
                if (age > 3 * 60 * 1000) {
                    fetch('/api/flood/reset', { method: 'POST' }).catch(() => {});
                    return;
                }
            }
            _beginFloodWarning(data.triggeredAt, data.reason, data.offendingPost || null);
        }
    } catch (e) {
        console.warn('Flood poll error:', e);
    }
}

function _beginFloodWarning(triggeredAtMs, reason, offendingPost) {
    _floodState.phase = 'warning';
    _softCloseModals();

    const overlay  = document.getElementById('flood-warning-overlay');
    const warningBox = document.getElementById('flood-warning-box');
    const countdown = document.getElementById('flood-warning-countdown');

    // The following code forces a window to show the offending post, if there
    // is one. This is to provide context for the flood, and also to 
    // humiliate the offender a little bit. It's also just interesting to see what
    // the API AI deems inappropriate enough to trigger a flood.
    const existingReveal = document.getElementById('flood-offending-reveal');
    if (existingReveal) existingReveal.remove();

    if (reason === 'moderation' && offendingPost) {
        const bg          = offendingPost.color?.bg     || '#fff9a3';
        const authorColor = offendingPost.color?.author || '#b8a800';

        let contentHtml = '';
        if ((offendingPost.type === 'drawing' || offendingPost.type === 'image') && offendingPost.imageUrl) {
            contentHtml = `<img src="${offendingPost.imageUrl}"
                style="width:100%;border-radius:2px;display:block;max-height:160px;object-fit:contain;" />
                ${offendingPost.caption
                    ? `<div style="font-style:italic;font-size:11px;margin-top:4px;color:#555;">${offendingPost.caption}</div>`
                    : ''}`;
        } else {
            contentHtml = `<div style="font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;">${offendingPost.text || ''}</div>`;
        }

        const revealHtml = `
        <div id="flood-offending-reveal" style="margin-top:18px;">
            <button id="flood-reveal-btn"
                onclick="document.getElementById('flood-offending-post').style.display =
                    document.getElementById('flood-offending-post').style.display === 'none' ? 'block' : 'none';
                    this.textContent = this.textContent.includes('View') ? '▲ Hide offending post' : '▼ View offending post';"
                style="background:rgba(74,144,217,0.15);border:1.5px solid #4a90d9;border-radius:8px;
                       color:#7ab8f5;padding:7px 16px;cursor:pointer;font-size:13px;width:100%;margin-bottom:10px;">
                ▼ View offending post
            </button>
            <div id="flood-offending-post" style="display:none;">
                <div style="background:${bg};border-radius:3px;padding:12px;
                            box-shadow:2px 3px 10px rgba(0,0,0,0.3);
                            max-height:200px;overflow-y:auto;word-break:break-word;text-align:left;">
                    <div style="font-size:11px;font-weight:bold;opacity:0.65;
                                margin-bottom:6px;color:${authorColor};">${offendingPost.author}</div>
                    ${contentHtml}
                </div>
                <div style="font-size:11px;color:#4a90d9;margin-top:6px;opacity:0.75;">
                    Flagged for: ${offendingPost.category}
                </div>
            </div>
        </div>`;

        warningBox.insertAdjacentHTML('beforeend', revealHtml);
    }

    overlay.classList.add('show');

    let secondsLeft = 20;
    if (triggeredAtMs) {
        const elapsed = Math.floor((Date.now() + (window._serverTimeOffset || 0) - triggeredAtMs) / 1000);
        secondsLeft = Math.max(1, 20 - elapsed);
    }
    countdown.textContent = secondsLeft;

    _floodState.warningTimer = setInterval(() => {
        secondsLeft--;
        countdown.textContent = secondsLeft;
        if (secondsLeft <= 0) {
            clearInterval(_floodState.warningTimer);
            overlay.classList.remove('show');
            const reveal = document.getElementById('flood-offending-reveal');
            if (reveal) reveal.remove();
            _beginFloodRise();
        }
    }, 1000);
}

function _softCloseModals() {
    document.getElementById('view-modal')?.classList.remove('show');
    document.getElementById('help-modal')?.classList.remove('show');
    document.getElementById('trial-modal')?.classList.remove('show');
    document.getElementById('defense-modal')?.classList.remove('show');
    document.getElementById('welcomeback-modal')?.classList.remove('show');
}

function _beginFloodRise() {
    _floodState.phase = 'rising';

    const floodEl = document.getElementById('flood-water');
    const board = document.getElementById('board');
    const toolbar = document.getElementById('toolbar');
    const wrapper = document.getElementById('board-wrapper');
    floodEl.style.display = 'block';

    // note to self--flood is 60 seconds
    // animate from 0% to 100% of (board-wrapper + toolbar) height
    const totalHeight = wrapper.clientHeight + toolbar.clientHeight;
    const DURATION_MS = 60000;
    const TICK_MS = 200;
    const steps = DURATION_MS / TICK_MS;
    let step = 0;
    let postingDisabled = false;

    _floodState.riseInterval = setInterval(() => {
        step++;
        const progress = step / steps; // 0 → 1
        const currentPx = Math.floor(progress * totalHeight);

        floodEl.style.height = currentPx + 'px';

        //This should ATTEMPT to disable posting when water rises around 3/4th of the way up.
        const boardCoverage = currentPx / wrapper.clientHeight;
        if (boardCoverage >= 0.75 && !postingDisabled) {
            postingDisabled = true;
            _disablePosting();
        }
        if (currentPx >= wrapper.clientHeight && _floodState.phase === 'rising') {
            _floodState.phase = 'submerged';
            _beginSubmerged();
        }
        if (step >= steps) {
            clearInterval(_floodState.riseInterval);
            _triggerReset();
        }
    }, TICK_MS);
}

function _disablePosting() {
    const addBtn = document.getElementById('add-btn');
    if (addBtn) { addBtn.disabled = true; addBtn.style.opacity = '0.4'; }
    if (typeof closePostModal === 'function') closePostModal();
    if (typeof placing !== 'undefined' && placing) {
        if (typeof cleanup === 'function') cleanup();
    }
}

function _beginSubmerged() {
    const screen = document.getElementById('flood-submerged-screen');
    screen.classList.add('show');
    _cycleFloodQuote();
    _floodState.quoteInterval = setInterval(_cycleFloodQuote, 4000);
}

function _cycleFloodQuote() {
    const el = document.getElementById('flood-submerged-quote');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
        el.textContent = FLOOD_QUOTES[Math.floor(Math.random() * FLOOD_QUOTES.length)];
        el.style.opacity = '1';
    }, 600);
}

//* This should attempt too reset the board.
async function _triggerReset() {
    clearInterval(_floodState.quoteInterval);
    try {
        await fetch('/api/flood/reset', { method: 'POST' });
    } catch (e) {
        console.warn('Flood reset call failed, reloading anyway:', e);
    }
    setTimeout(() => location.reload(), 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    startFloodPolling();
});