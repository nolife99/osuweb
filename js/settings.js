const saveToLocal = () => localStorage.setItem('settings', JSON.stringify(settings)), defaultSettings = {
    dim: 80, blur: 0,
    cursorsize: 1, showhwmouse: false,
    snakein: true, snakeout: false,

    disableWheel: false, disableButton: false,
    K1name: 'Z', K2name: 'X', K1keycode: 'KeyZ', K2keycode: 'KeyX',

    mastervolume: 100, effectvolume: 100, musicvolume: 50, audiooffset: 0, beatmapHitsound: false,
    easy: false, daycore: false, hardrock: false, nightcore: false, hidden: false, autoplay: false,
    hideNumbers: false, hideGreat: true, hideFollow: false
};

export const settings = JSON.parse(localStorage.getItem('settings')) || defaultSettings;
settings.loadToGame = game => {
    if (!game) return;

    game.backgroundDimRate = settings.dim / 100;
    game.backgroundBlurRate = settings.blur / 1000;
    game.cursorSize = settings.cursorsize;
    game.hwMouse = settings.showhwmouse;
    game.snakeIn = settings.snakein;
    game.snakeOut = settings.snakeout;

    game.allowMouseScroll = !settings.disableWheel;
    game.allowMouseButton = !settings.disableButton;
    game.K1keycode = settings.K1keycode;
    game.K2keycode = settings.K2keycode;

    game.masterVolume = settings.mastervolume / 100;
    game.effectVolume = settings.effectvolume / 100;
    game.musicVolume = settings.musicvolume / 100;
    game.globalOffset = +settings.audiooffset;

    game.easy = settings.easy;
    game.daycore = settings.daycore;
    game.hardrock = settings.hardrock;
    game.nightcore = settings.nightcore;
    game.hidden = settings.hidden;
    game.autoplay = settings.autoplay;

    game.hideNumbers = settings.hideNumbers;
    game.hideGreat = settings.hideGreat;
    game.hideFollow = settings.hideFollow;
};
const restorers = [], bindcheck = (id, item) => {
    const c = document.getElementById(id);
    c.checked = settings[item];
    restorers.push(() => c.checked = settings[item]);
    c.onclick = () => {
        settings[item] = c.checked;
        saveToLocal();
    }
}, bindExclusiveCheck = (id1, item1, id2, item2) => {
    const c1 = document.getElementById(id1), c2 = document.getElementById(id2);
    c1.checked = settings[item1];
    c2.checked = settings[item2];

    restorers.push(() => c1.checked = settings[item1]);
    restorers.push(() => c2.checked = settings[item2]);
    c1.onclick = () => {
        settings[item1] = c1.checked;
        settings[item2] = false;
        c2.checked = false;
        saveToLocal();
    }
    c2.onclick = () => {
        settings[item2] = c2.checked;
        settings[item1] = false;
        c1.checked = false;
        saveToLocal();
    }
}, bindrange = (id, item, feedback) => {
    const range = document.getElementById(id), indicator = document.getElementById(id + '-indicator');
    range.onmousedown = () => {
        indicator.hidden = false;
    }
    range.onmouseup = () => {
        indicator.hidden = true;
    };
    range.oninput = () => {
        const min = +range.min, val = +range.value;
        indicator.style.left = ((val - min) / (+range.max - min) * (range.clientWidth - 20) + 13) + 'px';
        indicator.innerText = feedback(val);
    }
    range.value = settings[item];
    restorers.push(() => range.value = settings[item]);
    range.oninput();
    range.onchange = () => {
        settings[item] = range.value;
        saveToLocal();
    }
}, bindkeyselector = (id, keynameitem, keycodeitem) => {
    const btn = document.getElementById(id), activate = () => {
        const deactivate = () => {
            btn.onclick = activate;
            btn.classList.remove('using');
            removeEventListener('keydown', listenkey);
        }, listenkey = e => {
            settings[keycodeitem] = e.code;
            settings[keynameitem] = e.key.toUpperCase();
            btn.value = settings[keynameitem];
            saveToLocal();
            deactivate();
        };

        btn.classList.add('using');
        addEventListener('keydown', listenkey);
        btn.onclick = deactivate;
    };
    btn.onclick = activate;
    btn.value = settings[keynameitem];
    restorers.push(() => btn.value = settings[keynameitem]);
};

bindrange('dim-range', 'dim', v => v + '%');
bindrange('blur-range', 'blur', v => v + '%');
bindrange('cursorsize-range', 'cursorsize', v => v.toFixed(2) + 'x');
bindcheck('showhwmouse-check', 'showhwmouse');
bindcheck('snakein-check', 'snakein');
bindcheck('snakeout-check', 'snakeout');
bindcheck('disable-wheel-check', 'disableWheel');
bindcheck('disable-button-check', 'disableButton');
bindkeyselector('leftButton', 'K1name', 'K1keycode');
bindkeyselector('rightButton', 'K2name', 'K2keycode');
bindrange('mastervolume-range', 'mastervolume', v => v + '%');
bindrange('effectvolume-range', 'effectvolume', v => v + '%');
bindrange('musicvolume-range', 'musicvolume', v => v + '%');
bindrange('audiooffset-range', 'audiooffset', v => v + 'ms');
bindExclusiveCheck('easy-check', 'easy', 'hardrock-check', 'hardrock');
bindExclusiveCheck('daycore-check', 'daycore', 'nightcore-check', 'nightcore');
bindcheck('hidden-check', 'hidden');
bindcheck('autoplay-check', 'autoplay');
bindcheck('hidenumbers-check', 'hideNumbers');
bindcheck('hidegreat-check', 'hideGreat');
bindcheck('hidefollowpoints-check', 'hideFollow');

const warns = document.getElementsByClassName('warnbtn');
warns[0].onclick = () => {
    Object.assign(settings, defaultSettings);
    for (const c of restorers) c();
    saveToLocal();
}
warns[1].onclick = () => {
    localStorage.removeItem('‌');
    localforage.clear(() => location.reload());
}