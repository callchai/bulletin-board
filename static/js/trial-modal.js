const TRIAL_SCORE_THRESHOLD = -2;
const TRIAL_VOTE_SECONDS = 30;
const EXILE_MINUTES = 5;

const BANISHMENT_QUOTES = [
    `"The Board giveth, and the Board taketh away."`,
    `"You have sown wickedness, and so you shall reap the whirlwind."`,
    `"Depart from me, ye who break the commandments."`,
    `"Even the fallen may yet repent. But not today."`,
    `"If I am to be banished for simply posting, then let death be kinder than man." - Tung Tung Tung Sahur`,
];

const EXILE_QUOTES = [
    `"Go, and sin no more."`,
    `"The Board's grace is not without limit. Remember this."`,
    `"Your penance begins now. Use it wisely."`,
    `"Even the wicked may find redemption, if they truly seek it."`,
];

let _trialState = {
    id: null,
    status: null,
    accused: null,
    postData: null,
    defense: null,
    votes: {},
    startedAt: null,
    timerInterval: null,
    pollInterval: null,
    userVote: null,
    verdict: null,
};

function checkForTrial(postId, score, author) {
    if (score > TRIAL_SCORE_THRESHOLD) return;
    if (author === currentUserName) return;
    fetch('/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId })
    })
    .then(r => r.json())
    .then(res => {
        if (res.id) {
        }
    });
}

function startTrialPolling() {
    setInterval(pollActiveTrial, 4000);
}

async function pollActiveTrial() {
    try {
        const res = await fetch('/api/trials/active');
        const trial = await res.json();
        if (!trial) {
            if (_trialState.id) _clearTrialState();
            hideTrialBanner();
            return;
        }

        if (_trialState.id === trial.id && _trialState.status === 'concluded') return;

        if (_trialState.id !== trial.id) {
            _trialState.id = trial.id;
            _trialState.accused = trial.accused;
            _trialState.postData = trial.postData;
            _trialState.defense = trial.defense;
            _trialState.startedAt = trial.startedAt;
            _trialState.userVote = null;
            document.getElementById('trial-banner')?.style.setProperty('--timer-pct', '100%');
        }

        _trialState.status = trial.status;
        _trialState.votes = trial.votes || {};

        if (trial.status === 'pending') {
            showTrialBanner('pending');
            if (trial.accused === currentUserName) {
                showDefenseModal(trial.id);
            }
        } else if (trial.status === 'active') {
            showTrialBanner('active');
            const isDefendant = trial.accused === currentUserName;
            showTrialModal(trial, isDefendant);
            if (!_trialState.timerInterval && trial.startedAt) {
                startTrialCountdown(trial.id, trial.startedAt);
            }
        } else if (trial.status === 'concluded') {
            _handleConcluded(trial);
        }
    } catch (e) {
        console.warn('Trial poll error:', e);
    }
}


function showTrialBanner(status) {
    const banner = document.getElementById('trial-banner');
    if (!banner) return;
    if (banner.classList.contains('show') && banner.dataset.status === status) return;
    banner.dataset.status = status;
    banner.classList.add('show');
    if (status === 'pending') {
        banner.style.setProperty('--timer-pct', '100%');
        banner.innerHTML = `<strong>A Trial has Begun!</strong> — The accused prepares their defense...`;
    } else {
        banner.innerHTML = `<strong>TRIAL IN PROGRESS</strong> — Cast your judgment upon the transgressor!
            <button onclick="document.getElementById('trial-modal').classList.add('show')" id="trial-banner-watch">Join Trial</button>`;
    }
}

function hideTrialBanner() {
    const banner = document.getElementById('trial-banner');
    if (banner) banner.classList.remove('show');
}


function showDefenseModal(trialId) {
    if (document.getElementById('defense-modal')?.classList.contains('show')) return;
    const modal = document.getElementById('defense-modal');
    if (!modal) return;
    modal.classList.add('show');

    const wordCount = document.getElementById('defense-word-count');
    const textarea  = document.getElementById('defense-input');
    const submitBtn = document.getElementById('defense-submit');
    textarea.value = '';
    wordCount.textContent = '0 / 100 words';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Defense (30)';

    let defenseSecondsLeft = 30;
    /* This prevents hostage taking of the trial */
    const defenseTimer = setInterval(() => {
        defenseSecondsLeft--;
        if (defenseSecondsLeft <= 0) {
            clearInterval(defenseTimer);
            _submitDefense(trialId, textarea.value.trim(), modal, submitBtn);
        } else {
            submitBtn.textContent = `Submit Defense (${defenseSecondsLeft})`;
            if (defenseSecondsLeft <= 10) {
                submitBtn.style.background = 'linear-gradient(to bottom, #ff4444, #cc0000)';
            }
        }
    }, 1000);

    textarea.oninput = () => {
        const words = textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0;
        wordCount.textContent = `${words} / 100 words`;
        submitBtn.disabled = words > 100;
    };

    submitBtn.onclick = () => {
        clearInterval(defenseTimer);
        const defense = textarea.value.trim();
        const words = defense ? defense.split(/\s+/).length : 0;
        if (words > 100) return;
        _submitDefense(trialId, defense, modal, submitBtn);
    };
}

function _submitDefense(trialId, defense, modal, submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
    submitBtn.style.background = '';
    fetch(`/api/trials/${trialId}/defense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defense })
    })
    .then(r => r.json())
    .then(() => {
        modal.classList.remove('show');
        submitBtn.textContent = 'Submit Defense';
    });
}


function showTrialModal(trial, autoShow = false) {
    /* This is the one that all users (the jury) will see*/
    const modal = document.getElementById('trial-modal');
    if (!modal) return;

    const currentlyShowing = modal.dataset.trialId === trial.id;
    if (!currentlyShowing) {
        modal.dataset.trialId = trial.id;

        const postData = trial.postData || _trialState.postData;
        let postHtml = '';
        if (postData) {
            const bg = postData.color?.bg || '#fff9a3';
            const authorColor = postData.color?.author || '#b8a800';
            let contentHtml = '';
            if ((postData.type === 'drawing' || postData.type === 'image') && postData.imageUrl) {
                contentHtml = `<img src="${postData.imageUrl}" style="width:100%;border-radius:2px;display:block;"/>
                    ${postData.caption ? `<div style="font-style:italic;font-size:11px;margin-top:4px;color:#555;">${postData.caption}</div>` : ''}`;
            } else {
                contentHtml = `<div style="font-size:13px;line-height:1.5;word-break:break-word;">${postData.text || ''}</div>`;
            }
            postHtml = `<div class="trial-exhibit" style="background:${bg};">
                <div class="trial-exhibit-author" style="color:${authorColor}">${postData.author}</div>
                ${contentHtml}
            </div>`;
        }

        const defenseHtml = trial.defense
            ? `<div class="trial-defense-box"><strong>Defense:</strong> "${trial.defense}"</div>`
            : `<div class="trial-defense-box pending-defense">The accused is preparing their defense...</div>`;

        const isAccused = currentUserName === trial.accused;

        modal.querySelector('#trial-modal-body').innerHTML = `
            <div class="trial-header-text">
                <span class="trial-gavel">⚖️</span>
                <h2>Ecclesiastical Trial</h2>
                <p class="trial-subtext">A poster has been accused of committing a transgression against the Board.<br><strong style="color:#8b0000;">${_trialState.accused}</strong> is left at the mercy of their fellow posters.</p>
                </div>
            <div class="trial-content-cols">
                <div class="trial-left">
                    <div class="trial-section-label">The Offending Post</div>
                    ${postHtml}
                    ${defenseHtml}
                </div>
                <div class="trial-right">
                    <div class="trial-section-label">Judgment</div>
                    <div id="trial-timer-display" class="trial-timer">30</div>
                    <div class="trial-vote-counts">
                        <div class="trial-forgive-count">Forgiveness: <strong id="trial-forgive-num">0</strong></div>
                        <div class="trial-banish-count">Banishment: <strong id="trial-banish-num">0</strong></div>
                    </div>
                    ${isAccused
                        ? `<div class="trial-accused-notice">You are the accused. You may not vote.</div>`
                        : `<div class="trial-vote-btns">
                            <button class="trial-vote-btn forgive" id="btn-trial-forgive" onclick="castTrialVote('${trial.id}', 'forgive')">Forgive</button>
                            <button class="trial-vote-btn banish" id="btn-trial-banish" onclick="castTrialVote('${trial.id}', 'banish')">Banish</button>
                           </div>`
                    }
                    <div class="trial-abstain-note">Participation is optional.</div>
                </div>
            </div>
        `;
    }

    const votes = _trialState.votes || {};
    const forgive = Object.values(votes).filter(v => v === 'forgive').length;
    const banish  = Object.values(votes).filter(v => v === 'banish').length;
    const fEl = document.getElementById('trial-forgive-num');
    const bEl = document.getElementById('trial-banish-num');
    if (fEl) fEl.textContent = forgive;
    if (bEl) bEl.textContent = banish;

    _updateVoteButtonStyles();
    if (autoShow) modal.classList.add('show');
    // modal.classList.add('show');
}

function _updateVoteButtonStyles() {
    const fBtn = document.getElementById('btn-trial-forgive');
    const bBtn = document.getElementById('btn-trial-banish');
    if (!fBtn || !bBtn) return;
    fBtn.classList.toggle('active', _trialState.userVote === 'forgive');
    bBtn.classList.toggle('active', _trialState.userVote === 'banish');
}

function castTrialVote(trialId, direction) {
    fetch(`/api/trials/${trialId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter: currentUserName, direction })
    })
    .then(r => r.json())
    .then(res => {
        if (res.error) return;
        _trialState.userVote = res.userVote;
        _trialState.votes = _trialState.votes || {};
        const fEl = document.getElementById('trial-forgive-num');
        const bEl = document.getElementById('trial-banish-num');
        if (fEl) fEl.textContent = res.forgive;
        if (bEl) bEl.textContent = res.banish;
        _updateVoteButtonStyles();
    });
}

function startTrialCountdown(trialId, startedAtMs) {
    if (_trialState.timerInterval) clearInterval(_trialState.timerInterval);

    _trialState.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
        const remaining = Math.max(0, TRIAL_VOTE_SECONDS - elapsed);
        const timerEl = document.getElementById('trial-timer-display');
        if (timerEl) {
            timerEl.textContent = remaining;
            timerEl.classList.toggle('trial-timer-urgent', remaining <= 10);
        }
        if (remaining === 0) {
            clearInterval(_trialState.timerInterval);
            _trialState.timerInterval = null;
            _concludeTrial(trialId);
        }
    }, 500);
}

function _concludeTrial(trialId) {
    fetch(`/api/trials/${trialId}/conclude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
    .then(r => r.json())
    .then(res => {
        _handleVerdict(res.verdict, _trialState.accused, res.forgive, res.banish);
    });
}

function _handleConcluded(trial) {
    if (_trialState.status === 'concluded') return;
    _trialState.status = 'concluded';
    clearInterval(_trialState.timerInterval);
    _trialState.timerInterval = null;
    _handleVerdict(trial.verdict, trial.accused, null, null);
}

function _handleVerdict(verdict, accused, forgiveCount, banishCount) {
        if (typeof cleanup === 'function') cleanup();
    document.getElementById('trial-modal')?.classList.remove('show');
    document.getElementById('defense-modal')?.classList.remove('show');
    hideTrialBanner();

    if (verdict === 'banished' || verdict === 'exiled') {
        document.querySelectorAll(`.sticky[data-id]`).forEach(el => {
            const authorEl = el.querySelector('.author');
            if (authorEl && authorEl.textContent === accused) {
                _denounceNoteElement(el, verdict);
            }
        });

        if (currentUserName === accused) {
            showBanishmentScreen(verdict);
        }
    }

    showVerdictToast(verdict, accused, forgiveCount, banishCount);

    setTimeout(_clearTrialState, 3000);
}

function _denounceNoteElement(el, verdict) {
    el.style.background = '#000';
    el.style.setProperty('--note-bg', '#000');
    el.style.cursor = 'default';
    el.style.pointerEvents = 'none';
    el.dataset.denounced = 'true';
    el.innerHTML = `<div class="denounce-full-label">HERETIC HAS BEEN DENOUNCED BY THE BOARD</div>`;
}

/* This is for the banished user screen*/
function showBanishmentScreen(verdict) {
    const screen = document.getElementById('banishment-screen');
    if (!screen) return;
    const msg = document.getElementById('banishment-message');
    const sub = document.getElementById('banishment-sub');
    if (verdict === 'exiled') {
        msg.textContent = 'You have been EXILED.';
        sub.innerHTML = `The Board has cast you out for <span id="exile-countdown">${EXILE_MINUTES}:00</span> minutes.<br><em>Take this time to repent, for you are still worthy of the Board's grace.</em><br><br><span id="exile-refresh" style="opacity:0;transition:opacity 1.5s ease;font-size:0.95rem;color:#ffcc88;">Your penance is complete. Refresh the page to return to the Board.</span>`;
        const storageKey = `exile_until_${currentUserName}`;
        let exileUntil = parseInt(localStorage.getItem(storageKey));
        if (!exileUntil || exileUntil < Date.now()) {
            exileUntil = Date.now() + EXILE_MINUTES * 60 * 1000;
            localStorage.setItem(storageKey, exileUntil);
        }
        let totalSeconds = Math.max(0, Math.floor((exileUntil - Date.now()) / 1000));
        const countdownEl = () => document.getElementById('exile-countdown');
        const refreshEl = () => document.getElementById('exile-refresh');
        const exileTimer = setInterval(() => {
            totalSeconds--;
            const m = Math.floor(totalSeconds / 60);
            const s = String(totalSeconds % 60).padStart(2, '0');
            if (countdownEl()) countdownEl().textContent = `${m}:${s}`;
            if (totalSeconds <= 0) {
                clearInterval(exileTimer);
                localStorage.removeItem(storageKey);
                if (refreshEl()) refreshEl().style.opacity = '1';
            }
        }, 1000);
    } else {
        msg.textContent = 'You have been BANISHED.';
        sub.textContent = `Hear now the decree of the Board: your wickedness is known, your judgment rendered. You are cast out, and your place among us is no more. Pray that mercy may yet find your soul.`;    }
    if (!document.getElementById('banishment-quote')) {
        const quotes = verdict === 'exiled' ? EXILE_QUOTES : BANISHMENT_QUOTES;
        const quote = quotes[Math.floor(Math.random() * quotes.length)];
        const quoteEl = document.createElement('p');
        quoteEl.id = 'banishment-quote';
        quoteEl.style.cssText = 'margin-top:24px;font-style:italic;font-size:1rem;color:#ff9999;opacity:0.7;line-height:1.7;';
        quoteEl.innerHTML = quote;
        document.getElementById('banishment-content').appendChild(quoteEl);
    }

    screen.classList.add('show');
    const crossEl = document.getElementById('banishment-cross-icon');
    if (crossEl) crossEl.style.transform = verdict === 'exiled' ? '' : 'rotate(180deg)';
}

function showVerdictToast(verdict, accused, forgiveCount, banishCount) {
    const toast = document.getElementById('verdict-toast');
    if (!toast) return;

    let text;
    if (verdict === 'forgiven') {
        text = `<strong>${accused}</strong> has been forgiven.`;
    } else if (verdict === 'banished') {
        text = `<strong>${accused}</strong> has been BANISHED from the Board!`;
    } else if (verdict === 'exiled') {
        text = `<strong>${accused}</strong> has been exiled for ${EXILE_MINUTES} minutes.`;
    }

    toast.innerHTML = `<span class="verdict-toast-icon"></span> ${text}
        <button onclick="document.getElementById('verdict-toast').classList.remove('show')">✕</button>`;
    toast.className = `verdict-toast show verdict-${verdict}`;
    setTimeout(() => toast.classList.remove('show'), 10000);
}

function _clearTrialState() {
    clearInterval(_trialState.timerInterval);
    _trialState = {
        id: null, status: null, accused: null, postData: null,
        defense: null, votes: {}, startedAt: null,
        timerInterval: null, pollInterval: null,
        userVote: null, verdict: null,
    };
    const modal = document.getElementById('trial-modal');
    if (modal) modal.dataset.trialId = '';
}

function checkBanOnLoad() {
    fetch(`/api/banned/${encodeURIComponent(currentUserName)}`)
        .then(r => r.json())
        .then(res => {
            if (res.banned) {
                showBanishmentScreen(res.reason);
            }
        });
}

let _bannerTimerInterval = null;

function showTrialBanner(status) {
    const banner = document.getElementById('trial-banner');
    if (!banner) return;
    if (banner.classList.contains('show') && banner.dataset.status === status) return;
    banner.dataset.status = status;
    banner.classList.add('show');
    if (status === 'pending') {
        banner.innerHTML = `<strong>A Trial has Begun!</strong> — The accused prepares their defense...`;
        if (_bannerTimerInterval) { clearInterval(_bannerTimerInterval); _bannerTimerInterval = null; }
    } else {
        banner.innerHTML = `<strong>TRIAL IN PROGRESS</strong>— Cast your judgment upon the transgressor!
            <button onclick="document.getElementById('trial-modal').classList.add('show')" id="trial-banner-watch">Join Trial</button>`;
    }
}

