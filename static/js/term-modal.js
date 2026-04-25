/*
Term-modal.js contains all the logic for the terms modal, welcome modal, and welcome back modal.

@params:
None, but relies on cookies and server API endpoints to function.

@usage:
This script is included in the main HTML file and runs on page load. 
It manages the display of the terms modal, welcome modal, 
and welcome back modal based on the user's cookies and server checks.

@return
none, but it will show the appropriate modal to the user and initialize the board if they are allowed to post.

@notes:
- On first visit, it shows the terms modal. Once accepted, it shows the welcome modal with a random quote.
- On subsequent visits, it checks if the user is banned. If banned, it shows the banishment screen. 
    If not, it shows a welcome back modal.
*/
async function checkGenerationAndInit() {
    /* 
    param: none
    return: none 
    but checks the server generation against the client's stored generation cookie 
    to determine if a reload is needed, and then checks if the user has accepted terms 
    or is banned to show the appropriate modal
    */
    const fetchStart = Date.now();
    const [boardRes, nowRes] = await Promise.all([
        fetch('/api/board-start'),
        fetch('/api/now')
    ]);
    const data = await boardRes.json();
    const nowData = await nowRes.json();
    const rtt = Date.now() - fetchStart;
    window._serverTimeOffset = nowData.nowMs - (fetchStart + rtt / 2);

    const serverGen = data.generation || 0;
    const clientGen = parseInt(getCookie('bb_generation') || '-1');

    if (clientGen !== serverGen) {
        setCookie('bb_alias', '');
        setCookie('bb_color', '');
        setCookie('bb_generation', String(serverGen));
        location.reload();
        return;
    }
    if (!getCookie(aliasCookieName)) {
        termsModal.classList.add('show');
        acceptBtn.addEventListener('click', () => {
            setCookie(aliasCookieName, 'true');
            termsModal.classList.remove('show');
            setTimeout(() => {
                termsModal.style.display = 'none';
                showWelcomeModal();
            }, 300);
        });
    } else {
        fetch(`/api/banned/${encodeURIComponent(name)}`)
            .then(r => r.json())
            .then(res => {
                if (res.banned) {
                    showBanishmentScreen(res.reason);
                } else {
                    showWelcomeBackModal();
                }
            });
    }
}
checkGenerationAndInit();


function setCookie(name, value) {
    // param: name (string) the name of the cookie to set
    // param: value (string) the value of the cookie to set
    // return: none, but creates a cookie with a name for the user
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/";
}
function getCookie(name) {
    // param: name (string) the name of the cookie to retrieve
    // return: the value of the cookie with the given name, or null if not found
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i=0;i<ca.length;i++){
        let c = ca[i].trim();
        if(c.indexOf(nameEQ)===0) return decodeURIComponent(c.substring(nameEQ.length));
    }
    return null;
}

// NATO alphabet code names used to generate the first part of a new user's nickname.
const ALIAS = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
    'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa',
    'Quebec','Romeo','Sierra','Tango','Uniform','Victor','Whiskey','Xray','Yankee','Zulu'];

const COLORS = [
    {bg:'#fff9a3',author:'#b8a800'},{bg:'#b5f0c0',author:'#2a7a3b'},
    {bg:'#ffd6a5',author:'#a05a00'},{bg:'#c5d8ff',author:'#1a4a9e'},
    {bg:'#f9c5d1',author:'#a0253a'},
];
/*
These quotes are more of a personality/styling thing.
These are shown on the welcome screen (when the user gets their name)
and the welcome back modal. They're also used in the home page of the Help modal.
*/
    const QUOTES = [
        `Honor your alias, for it is your identity.`,
        `"I am fond of boards. Posters look up to us. Trolls look down on us. Boards treat us as equals,"   - Clavicular`,
        `<strong>Board 3:16</strong> - For the Board so loved the world that it gave its one and only Board, that whoever post in it shall not be forgotten but echo eternally.`,
        `<strong>Board 37:13</strong> - but the Board laughs at the trolls, for it knows their day is nigh.`,
        `<strong>Bulletinippians 4:13</strong> - I can post everything through it who gives me strength.`,
        `<strong>1 Boarder 5:7</strong> - Be joyful in hope, patient in affliction, faithful in posting.`,
        `<strong>Boardverbs 3:5-3:6</strong> - Trust in the BOARD with all your heart and lean not on your own understanding; in all your ways submit to it, and it will make your posts straight.`,
        `The identity you have been given is <strong>brimming with countless possibilities</strong>. 
        Your input breathes life into the Board, and will bring you glory. 
        If you post with honor and creativity, the Board will answer back in kind.`,
        `Are you ready to post? The Board awaits your contribution. However,
        there is nothing to fear. Have faith. As long as you <strong>post accordingly and without malice,</strong> it
        will bring you and your fellow boarders favorable fortune.`,
        // `Dear Bulletin Board, I posted to you, but you still ain't callin'.<br>
        // I left my post, my name, and my number at the bottom.<br>
        // I posted two notes back in autumn, you must not have got 'em.<br>
        // There probably was a problem with the server or something.<br>
        // Sometimes I scribble the URL too sloppy when I type 'em.`,
        /*`<strong>Let it be known:</strong> no poster shall utter the blasphemies of Lola Young, Benson Boone, or Olivia Rodrigo, for their 
        cries are an abomination to the Board, and those who speak of them shall be cast aside.`,*/
        `And the Board said, "Let there be posts," and there were posts.`,
        `Remember the fate of the region us-central1-a, O poster, lest your project likewise be consumed.`,
        `<strong>Board of Revelations 9:43</strong> - "And when the Troll posted his final blasphemy, silence fell upon the Board. The clock stopped, the sky darkened, 
        and a great flood came, washing away all posts and resetting the clock."`,
        `To post or not to post, that is the question.`,
        `All posters are equal, but some posters are more righteous than others.`,
        `I post, therefore I am.`,
        `"I have a dream, that one day, all posters will post in harmony..."`,
        `Ask not what the Board can do for you, ask what you can do for the Board.`,
        //`And then came a sound, distant first, that grew into castrophany<br>
        // So immense that it could be heard all over the board<br>
        // There was no screams, there was no time.<br>
        // The board called Monkey had spoken.<br>
        // There was only fire, and then... nothing.`,
    ];

/*
This will generate the name and Color.
*/
const savedName  = getCookie('bb_alias');
const savedColor = getCookie('bb_color');

let name;
if (savedName) {
    name = savedName;
} else {
    const randomAlias = ALIAS[Math.floor(Math.random() * ALIAS.length)];
    const randomNumber = 100 + Math.floor(Math.random() * 900);
    name = `${randomAlias}-${randomNumber}`;
}

let userColor;
if (savedColor) {
    userColor = JSON.parse(savedColor);
} else {
    userColor = COLORS[Math.floor(Math.random() * COLORS.length)];
}

if (!savedName) {
    setCookie('bb_alias', name);
    setCookie('bb_color', JSON.stringify(userColor));
}

document.getElementById('codename').textContent = name;

const termsModal = document.getElementById('terms-modal');
const acceptBtn = document.getElementById('accept-terms');
const aliasCookieName = `acceptedTerms_${name}`;

const welcomeModal = document.getElementById('welcome-modal');
const userNameSpan = document.getElementById('user-name');
const boardQuote = document.getElementById('board-quote');
const enterBtn = document.getElementById('enter-board');

function showWelcomeModal() {
    // param: none
    // return: none, but shows the welcome modal to the user 
    //      with their assigned name and a random quote from the Board
    const userAliasP = document.getElementById('user-alias');
    const boardQuote = document.getElementById('board-quote');

    userAliasP.innerHTML = `
    <p>Arise, poster, for The Board has called to you.</p><br>
    <p>You are henceforth named <strong>${name}</strong>.</p>`;

    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    boardQuote.innerHTML = `<em>${quote}</em>`;

    const welcomeModal = document.getElementById('welcome-modal');
    welcomeModal.classList.add('show');
}

enterBtn.addEventListener('click', () => {
    // This is the event listener for the "Enter Board" button in the welcome modal.
    const welcomeModal = document.getElementById('welcome-modal');
    welcomeModal.classList.remove('show');
    setTimeout(() => { welcomeModal.style.display = 'none'; }, 300);
    showScreenToastSizeWarning();
    initBoard(name, userColor);
});

function showWelcomeBackModal() {
    // param: none
    // return: none, but shows the welcome back modal to the user 
    //      with their name and a welcome back message
    const modal = document.getElementById('welcomeback-modal');
    const nameEl = document.getElementById('welcomeback-name');
    nameEl.textContent = name;
    modal.classList.add('show');

    document.getElementById('welcomeback-enter').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
        showScreenToastSizeWarning();
        initBoard(name, userColor);
    });
}

fetch('/api/posts', { cache: 'no-store' })
    .then(r => r.json())
    .then(posts => { window._preloadedPosts = posts; });



function showScreenToastSizeWarning() {
    // param: none
    // return: none, This is for the tiny screen size warning.
    const toast = document.getElementById('screen-toast-size-warning');
    const closeBtn = document.getElementById('toast-size-warning-close');
    setTimeout(() => toast.classList.add('show'), 400);
    setTimeout(() => toast.classList.remove('show'), 5000);
    closeBtn.onclick = () => toast.classList.remove('show');
}
