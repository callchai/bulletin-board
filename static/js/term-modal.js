/*
THIS IS A TEMPORARY TEST
*/

// if this is not at top, everything breaks
function setCookie(name, value) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; path=/";
}
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i=0;i<ca.length;i++){
        let c = ca[i].trim();
        if(c.indexOf(nameEQ)===0) return decodeURIComponent(c.substring(nameEQ.length));
    }
    return null;
}

const ALIAS = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel',
    'India','Juliet','Kilo','Lima','Mike','November','Oscar','Papa',
    'Quebec','Romeo','Sierra','Tango','Uniform','Victor','Whiskey','Xray','Yankee','Zulu'];

const COLORS = [
    {bg:'#fff9a3',author:'#b8a800'},{bg:'#b5f0c0',author:'#2a7a3b'},
    {bg:'#ffd6a5',author:'#a05a00'},{bg:'#c5d8ff',author:'#1a4a9e'},
    {bg:'#f9c5d1',author:'#a0253a'},
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

// give color choice later?
document.getElementById('codename').textContent = name;



const termsModal = document.getElementById('terms-modal');
const acceptBtn = document.getElementById('accept-terms');
const aliasCookieName = `acceptedTerms_${name}`;

const welcomeModal = document.getElementById('welcome-modal');
const userNameSpan = document.getElementById('user-name');
const boardQuote = document.getElementById('board-quote');
const enterBtn = document.getElementById('enter-board');

function showWelcomeModal() {
    const userAliasP = document.getElementById('user-alias');
    const boardQuote = document.getElementById('board-quote');

    userAliasP.innerHTML = `
    <p>Arise, poster! The Board has called to you.</p><br>
    <p>You are henceforth named <strong>${name}</strong>.</p>
    `;

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
        `Dear Bulletin Board, I posted to you, but you still ain't callin'.
        I left my post, my name, and my number at the bottom. I posted two notes back in autumn, you must not have got 'em. 
        There probably was a problem with the server or something. 
        Sometimes I scribble IP addresses too sloppy when I jot 'em.`,
        `<strong>Let it be known:</strong> no poster shall utter the blasphemies of Lola Young, Benson Boone, or Olivia Rodrigo, for their 
        cries are an abomination to the Board, and those who speak of them shall be cast aside.`,
    ];

    const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    boardQuote.innerHTML = `<em>${quote}</em>`;

    const welcomeModal = document.getElementById('welcome-modal');
    welcomeModal.classList.add('show');
}

enterBtn.addEventListener('click', () => {
    const welcomeModal = document.getElementById('welcome-modal');
    welcomeModal.classList.remove('show');
    setTimeout(() => {
        welcomeModal.style.display = 'none';
        initBoard(name, userColor);
    }, 300);
});

function showWelcomeBackModal() {
    const modal = document.getElementById('welcomeback-modal');
    const nameEl = document.getElementById('welcomeback-name');
    nameEl.textContent = name;
    modal.classList.add('show');

    document.getElementById('welcomeback-enter').addEventListener('click', () => {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            initBoard(name, userColor);
        }, 300);
    });
}

if (!getCookie(aliasCookieName)) {
    termsModal.classList.add('show');
    acceptBtn.addEventListener('click', () => {
        setCookie(aliasCookieName, 'true');
        termsModal.classList.remove('show');
        setTimeout(() => {
            termsModal.style.display = 'none';
            showWelcomeModal(); // show welcome next
        }, 300);
        });
} else {
    showWelcomeBackModal();
}