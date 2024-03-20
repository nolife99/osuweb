import Osu from './osu.js';
import { sounds } from './lib/sound.js';
import Playback from './playback.js';

const game = {
    window: window,
    backgroundDimRate: .7,
    backgroundBlurRate: 0,
    cursorSize: 1,
    showhwmouse: false,
    snakein: true,
    snakeout: true,
    masterVolume: .7,
    effectVolume: 1,
    musicVolume: 1,
    globalOffset: 0,
    allowMouseButton: false,
    allowMouseScroll: true,
    K1keycode: 90,
    K2keycode: 88,
    autoplay: false,
    nightcore: false,
    daycore: false,
    hardrock: false,
    easy: false,
    hidden: false,
    hideNumbers: false,
    hideGreat: false,
    hideFollow: false,
    mouseX: 0,
    mouseY: 0,
    K1down: false,
    K2down: false,
    M1down: false,
    M2down: false,
    down: false,
    finished: false,
    sample: [{}, {}, {}, {}],
    sampleSet: 1
}, progresses = document.getElementsByClassName('progress');
window.game = game;

PIXI.Loader.shared.add('asset/skin/sprites.json').load((_loader, resources) => {
    progresses[1].classList.add('finished');
    window.skin = resources['asset/skin/sprites.json'].textures;
});

const sample = [
    'asset/hitsound/normal-hitnormal.ogg',
    'asset/hitsound/normal-hitwhistle.ogg',
    'asset/hitsound/normal-hitfinish.ogg',
    'asset/hitsound/normal-hitclap.ogg',
    'asset/hitsound/normal-slidertick.ogg',
    'asset/hitsound/soft-hitnormal.ogg',
    'asset/hitsound/soft-hitwhistle.ogg',
    'asset/hitsound/soft-hitfinish.ogg',
    'asset/hitsound/soft-hitclap.ogg',
    'asset/hitsound/soft-slidertick.ogg',
    'asset/hitsound/drum-hitnormal.ogg',
    'asset/hitsound/drum-hitwhistle.ogg',
    'asset/hitsound/drum-hitfinish.ogg',
    'asset/hitsound/drum-hitclap.ogg',
    'asset/hitsound/drum-slidertick.ogg',
    'asset/hitsound/combobreak.ogg'
];
sounds.whenLoaded = () => {
    game.sample[1].hitnormal = sounds[sample[0]];
    game.sample[1].hitwhistle = sounds[sample[1]];
    game.sample[1].hitfinish = sounds[sample[2]];
    game.sample[1].hitclap = sounds[sample[3]];
    game.sample[1].slidertick = sounds[sample[4]];
    game.sample[2].hitnormal = sounds[sample[5]];
    game.sample[2].hitwhistle = sounds[sample[6]];
    game.sample[2].hitfinish = sounds[sample[7]];
    game.sample[2].hitclap = sounds[sample[8]];
    game.sample[2].slidertick = sounds[sample[9]];
    game.sample[3].hitnormal = sounds[sample[10]];
    game.sample[3].hitwhistle = sounds[sample[11]];
    game.sample[3].hitfinish = sounds[sample[12]];
    game.sample[3].hitclap = sounds[sample[13]];
    game.sample[3].slidertick = sounds[sample[14]];
    game.sampleComboBreak = sounds[sample[15]];
    progresses[2].classList.add('finished');
};
sounds.load(sample);

class BeatmapController {
    constructor(osz) {
        this.osu = new Osu(osz.root);
        this.filename = osz.filename;
    }
    startGame(trackid) {
        if (window.app) return;
        const app = window.app = new PIXI.Application({
            width: window.innerWidth,
            height: window.innerHeight,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        });
        app.renderer.autoDensity = true;
        app.renderer.backgroundColor = 0x111111;

        const scrollTop = document.body.scrollTop, defaultAlert = window.alert;
        document.addEventListener('contextmenu', e => {
            e.preventDefault();
            return false;
        });
        document.body.classList.add('gaming');

        window.gamesettings.loadToGame();
        if (!game.showhwmouse || game.autoplay) {
            game.cursor = new PIXI.Sprite(window.skin['cursor.png']);
            game.cursor.anchor.x = game.cursor.anchor.y = .5;
            game.cursor.scale.x = game.cursor.scale.y = .3 * game.cursorSize;
        }

        const pGameArea = document.getElementsByClassName('game-area')[0], pMainPage = document.getElementsByClassName('main-page')[0];
        pGameArea.appendChild(app.view);

        if (game.autoplay) {
            pGameArea.classList.remove('shownomouse');
            pGameArea.classList.remove('showhwmouse');
        }
        else if (game.showhwmouse) {
            pGameArea.classList.remove('shownomouse');
            pGameArea.classList.add('showhwmouse');
        }
        else {
            pGameArea.classList.remove('showhwmouse');
            pGameArea.classList.add('shownomouse');
        }
        pMainPage.hidden = true;
        pGameArea.hidden = false;

        window.quitGame = () => {
            pGameArea.hidden = true;
            pMainPage.hidden = false;
            document.body.classList.remove('gaming');
            document.body.scrollTop = scrollTop;
            window.alert = defaultAlert;

            if (game.cursor) {
                app.stage.removeChild(game.cursor);
                game.cursor.destroy();
                game.cursor = null;
            }
            app.destroy(true, {
                children: true, texture: false
            });

            window.app = null;
            window.cancelAnimationFrame(window.frameID);
        };

        this.osu.load_mp3(trackid);
        let playback = new Playback(this.osu, this.osu.tracks[trackid]);

        window.restartGame = () => {
            window.cancelAnimationFrame(window.frameID);
            playback = new Playback(this.osu, this.osu.tracks[trackid]);
            this.osu.onready();
            window.requestAnimationFrame(gameLoop);
        };

        function gameLoop(t) {
            if (game.cursor) {
                game.cursor.x = game.mouseX / 512 * gfx.width + gfx.xoffset;
                game.cursor.y = game.mouseY / 384 * gfx.height + gfx.yoffset;
                app.stage.addChild(game.cursor);
            }
            playback.render(t);
            app.renderer.render(app.stage);
            window.frameID = window.requestAnimationFrame(gameLoop);
        }
        window.requestAnimationFrame(gameLoop);
    }
    createBeatmapBox() {
        const map = this,
            pBeatmapBox = document.createElement('div'), pBeatmapCover = document.createElement('img'),
            pBeatmapTitle = document.createElement('div'), pBeatmapAuthor = document.createElement('div');

        pBeatmapBox.className = 'beatmapbox';
        pBeatmapCover.className = 'beatmapcover';
        pBeatmapTitle.className = 'beatmaptitle';
        pBeatmapAuthor.className = 'beatmapauthor';
        pBeatmapBox.appendChild(pBeatmapCover);
        pBeatmapBox.appendChild(pBeatmapTitle);
        pBeatmapBox.appendChild(pBeatmapAuthor);

        pBeatmapTitle.innerText = map.osu.tracks[0].metadata.Title;
        pBeatmapAuthor.innerText = map.osu.tracks[0].metadata.Artist + '/' + map.osu.tracks[0].metadata.Creator;
        map.osu.getCoverSrc(pBeatmapCover);

        if (map.osu.tracks[0].length) {
            const pBeatmapLength = document.createElement('div');
            pBeatmapLength.className = 'beatmaplength';
            pBeatmapBox.appendChild(pBeatmapLength);
            const length = map.osu.tracks[0].length;
            pBeatmapLength.innerText = Math.floor(length / 60) + ':' + (length % 60 < 10 ? '0' : '') + Math.round(length % 60);
        }
        pBeatmapBox.onclick = function (e) {
            if (!window.showingDifficultyBox) {
                e.stopPropagation();
                const difficultyBox = document.createElement('div');
                function closeDifficultyMenu() {
                    pBeatmapBox.removeChild(difficultyBox);
                    window.showingDifficultyBox = false;
                    window.removeEventListener('click', closeDifficultyMenu, false);
                }
                difficultyBox.className = 'difficulty-box';

                const rect = this.getBoundingClientRect();
                difficultyBox.style.left = e.clientX - rect.left + 'px';
                difficultyBox.style.top = e.clientY - rect.top + 'px';

                for (let i = 0; i < map.osu.tracks.length; ++i) {
                    const difficultyItem = document.createElement('div'),
                        difficultyRing = document.createElement('div'),
                        difficultyText = document.createElement('span');
                    difficultyItem.className = 'difficulty-item';
                    difficultyRing.className = 'difficulty-ring';

                    const star = map.osu.tracks[i].difficulty.star;
                    if (star) {
                        if (star < 2) difficultyRing.classList.add('easy');
                        else if (star < 2.7) difficultyRing.classList.add('normal');
                        else if (star < 4) difficultyRing.classList.add('hard');
                        else if (star < 5.3) difficultyRing.classList.add('insane');
                        else if (star < 6.5) difficultyRing.classList.add('expert');
                        else difficultyRing.classList.add('expert-plus');
                    }

                    difficultyText.innerText = map.osu.tracks[i].metadata.Version;
                    difficultyItem.appendChild(difficultyRing);
                    difficultyItem.appendChild(difficultyText);
                    difficultyBox.appendChild(difficultyItem);
                    difficultyItem.onclick = e => {
                        e.stopPropagation();
                        closeDifficultyMenu();
                        map.startGame(i);
                    };
                }
                pBeatmapBox.appendChild(difficultyBox);

                window.showingDifficultyBox = true;
                window.addEventListener('click', closeDifficultyMenu, false);
            }
        };
        return pBeatmapBox;
    }
}

const pDragbox = document.getElementsByClassName('dragbox')[0],
    pDragboxInner = document.getElementsByClassName('dragbox-inner')[0],
    pDragboxHint = document.getElementsByClassName('dragbox-hint')[0],
    pBeatmapList = document.getElementsByClassName('beatmap-list')[0];

const defaultHint = 'Drag and drop a beatmap (.osz) file here',
    modeErrHint = 'Only supports osu! (std) mode beatmaps. Drop another file.',
    nonValidHint = 'Not a valid osz file. Drop another file.',
    noTransferHint = 'Not receiving any file. Please retry.',
    nonOszHint = 'Not an osz file. Drop another file.',
    loadingHint = 'Loading...';

let beatmapFileList = [];
localforage.getItem('beatmapfilelist').then(names => {
    console.log('Local beatmaps:', names);
    const counter = progresses[3].childNodes;
    counter[3].innerText = names.length;

    const tempbox = new Array(names.length);
    for (let i = 0; i < names.length; ++i) {
        const box = document.createElement('div');
        box.className = 'beatmapbox';
        pBeatmapList.insertBefore(box, pDragbox);
        tempbox[i] = box;
    }
    const loadingCounter = counter[1];

    beatmapFileList = names;
    let loadedCount = 0;
    for (let i = 0; i < names.length; ++i) localforage.getItem(names[i]).then(blob => {
        const fs = new zip.fs.FS;
        fs.filename = names[i];
        fs.importBlob(blob).then(() => {
            addbeatmap(fs, box => {
                pBeatmapList.replaceChild(box, tempbox[i]);
                pDragboxHint.innerText = defaultHint;
            });
            loadingCounter.innerText = ++loadedCount;
        }).catch(e => {
            console.warn('Error importing beatmap:', names[i], e);
            pDragboxHint.innerText = nonValidHint;
        });
    }).catch(err => console.warn('Error getting beatmap:', names[i], err));
}).catch(err => console.warn('Error searching beatmaps:', err));

function addbeatmap(osz, f) {
    const map = new BeatmapController(osz);
    map.osu.ondecoded = () => {
        map.osu.requestStar();
        map.osu.filterTracks();
        map.osu.sortTracks();

        if (!map.osu.tracks.some(t => t.general.Mode !== 3)) {
            pDragboxHint.innerText = modeErrHint;
            return;
        }
        f(map.createBeatmapBox());

        if (!beatmapFileList.includes(map.filename)) {
            beatmapFileList.push(map.filename);
            localforage.setItem('beatmapfilelist', beatmapFileList).catch(e => console.warn('Error saving beatmaps:', e));
        }
    };
    map.osu.onerror = e => console.warn('Error loading .osu:', e);
    map.osu.load();
}
function handleDragDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    pDragboxHint.innerText = loadingHint;
    for (const raw_file of e.dataTransfer.files) {
        if (!raw_file) {
            pDragboxHint.innerText = noTransferHint;
            return;
        }
        if (raw_file.name.indexOf('.osz') === raw_file.name.length - 4) {
            const fs = new zip.fs.FS;
            fs.filename = raw_file.name;
            localforage.setItem(raw_file.name, raw_file).catch(err => console.warn('Error saving beatmap:', fs.filename, err));

            fs.importBlob(raw_file).then(() => addbeatmap(fs, box => {
                pBeatmapList.insertBefore(box, pDragbox);
                pDragboxHint.innerText = defaultHint;
            })).catch(ex => {
                console.warn('Error during file transfer:', fs.filename, ex);
                pDragboxHint.innerText = nonValidHint;
            });
        }
        else pDragboxHint.innerText = nonOszHint;
    }
}
pDragbox.ondrop = handleDragDrop;

window.addEventListener('dragover', e => e.preventDefault(), false);
window.addEventListener('drop', e => e.preventDefault(), false);

pDragboxHint.innerText = defaultHint;
pDragboxInner.hidden = false;
progresses[0].classList.add('finished');