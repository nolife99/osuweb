window.addEventListener('DOMContentLoaded', () => {
    function loadFromLocal() {
        const str = window.localStorage.getItem('osugamesettings');
        if (str) {
            const s = JSON.parse(str);
            if (s) Object.assign(gamesettings, s);
        }
    }
    function saveToLocal() {
        window.localStorage.setItem('osugamesettings', JSON.stringify(window.gamesettings));
    }

    const defaultsettings = {
        dim: 80, blur: 0,
        cursorsize: 1, showhwmouse: false,
        snakein: true, snakeout: false,

        disableWheel: false, disableButton: false,
        K1name: 'Z', K2name: 'X', K1keycode: 90, K2keycode: 88,

        mastervolume: 100, effectvolume: 100, musicvolume: 100, audiooffset: 0, beatmapHitsound: false,
        easy: false, daycore: false, hardrock: false, nightcore: false, hidden: false, autoplay: false,
        hideNumbers: false, hideGreat: true, hideFollow: false
    };
    window.gamesettings = {};

    Object.assign(gamesettings, defaultsettings);
    loadFromLocal();

    window.gamesettings.loadToGame = function() {
        if (window.game) {
            window.game.backgroundDimRate = this.dim / 100;
            window.game.backgroundBlurRate = this.blur / 100;
            window.game.cursorSize = this.cursorsize;
            window.game.showhwmouse = this.showhwmouse;
            window.game.snakein = this.snakein;
            window.game.snakeout = this.snakeout;

            window.game.allowMouseScroll = !this.disableWheel;
            window.game.allowMouseButton = !this.disableButton;
            window.game.K1keycode = this.K1keycode;
            window.game.K2keycode = this.K2keycode;

            window.game.masterVolume = this.mastervolume / 100;
            window.game.effectVolume = this.effectvolume / 100;
            window.game.musicVolume = this.musicvolume / 100;
	        window.game.globalOffset = parseFloat(this.audiooffset);

            window.game.easy = this.easy;
            window.game.daycore = this.daycore;
            window.game.hardrock = this.hardrock;
            window.game.nightcore = this.nightcore;
            window.game.hidden = this.hidden;
            window.game.autoplay = this.autoplay;

            window.game.hideNumbers = this.hideNumbers;
            window.game.hideGreat = this.hideGreat;
            window.game.hideFollow = this.hideFollow;
        }
    }
    gamesettings.restoreCallbacks = [];

    function bindcheck(id, item) {
        const c = document.getElementById(id);
        c.checked = gamesettings[item];
        gamesettings.restoreCallbacks.push(() => c.checked = gamesettings[item]);
        c.onclick = () => {
            gamesettings[item] = c.checked;
            saveToLocal();
        }
    }
    function bindExclusiveCheck(id1, item1, id2, item2) {
        const c1 = document.getElementById(id1), c2 = document.getElementById(id2);
        c1.checked = gamesettings[item1];
        c2.checked = gamesettings[item2];

        gamesettings.restoreCallbacks.push(() => c1.checked = gamesettings[item1]);
        gamesettings.restoreCallbacks.push(() => c2.checked = gamesettings[item2]);
        c1.onclick = () => {
            gamesettings[item1] = c1.checked;
            gamesettings[item2] = false;
            c2.checked = false;
            saveToLocal();
        }
        c2.onclick = () => {
            gamesettings[item2] = c2.checked;
            gamesettings[item1] = false;
            c1.checked = false;
            saveToLocal();
        }
    }
    function bindrange(id, item, feedback) {
        const range = document.getElementById(id), indicator = document.getElementById(id + '-indicator');
        range.onmousedown = function() {
            indicator.hidden = false;
        }
        range.onmouseup = function() {
            indicator.hidden = true;
        };
        range.oninput = function() {
            let min = parseFloat(range.min), max = parseFloat(range.max),val = parseFloat(range.value);
            let pos = (val - min) / (max - min);
            let length = range.clientWidth - 20;
            indicator.style.left = (pos * length + 13) + 'px';
            indicator.innerText = feedback(val);
        }
        range.value = gamesettings[item];
        gamesettings.restoreCallbacks.push(function() { 
            range.value = gamesettings[item]; 
        });
        range.oninput();
        range.onchange = function() {
            gamesettings[item] = range.value;
            saveToLocal();
        }
    }
    function bindkeyselector(id, keynameitem, keycodeitem) {
        const btn = document.getElementById(id);
        function activate() {
            function deactivate() {
                btn.onclick = activate;
                btn.classList.remove('using');
                document.removeEventListener('keydown', listenkey);
            }
            function listenkey(e) {
                gamesettings[keycodeitem] = e.keyCode;
                gamesettings[keynameitem] = e.key.toUpperCase();
                btn.value = gamesettings[keynameitem];
                saveToLocal();
                deactivate();
            }
            btn.classList.add('using');
            document.addEventListener('keydown', listenkey);
            btn.onclick = deactivate;
        }
        btn.onclick = activate;
        btn.value = gamesettings[keynameitem];
        gamesettings.restoreCallbacks.push(() => btn.value = gamesettings[keynameitem]);
    }

    bindrange('dim-range', 'dim', v => v + '%');
    bindrange('blur-range', 'blur', v => v + '%');
    bindrange('cursorsize-range', 'cursorsize', v => v.toFixed(2) + 'x');
    bindcheck('showhwmouse-check', 'showhwmouse');
    bindcheck('snakein-check', 'snakein');
    bindcheck('snakeout-check', 'snakeout');
    bindcheck('disable-wheel-check', 'disableWheel');
    bindcheck('disable-button-check', 'disableButton');
    bindkeyselector('lbutton1select', 'K1name', 'K1keycode');
    bindkeyselector('rbutton1select', 'K2name', 'K2keycode');
    bindrange('mastervolume-range', 'mastervolume', v => v + '%');
    bindrange('effectvolume-range', 'effectvolume', v => v + '%');
    bindrange('musicvolume-range', 'musicvolume', v => v + '%');
	bindrange("audiooffset-range", "audiooffset", v => v + 'ms');
    bindExclusiveCheck('easy-check', 'easy', 'hardrock-check', 'hardrock');
    bindExclusiveCheck('daycore-check', 'daycore', 'nightcore-check', 'nightcore');
    bindcheck('hidden-check', 'hidden');
    bindcheck('autoplay-check', 'autoplay');
    bindcheck('hidenumbers-check', 'hideNumbers');
    bindcheck('hidegreat-check', 'hideGreat');
    bindcheck('hidefollowpoints-check', 'hideFollow');

    document.getElementById('restoredefault-btn').onclick = () => {
        Object.assign(gamesettings, defaultsettings);
        for (const c of gamesettings.restoreCallbacks) c();
        saveToLocal();
    }
    document.getElementById('deletemaps-btn').onclick = () => localforage.removeItem('beatmapfilelist').then(() => location.reload());
});