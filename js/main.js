import { sounds } from './osu-audio.js';
import { settings } from './settings.js';
import Playback from './playback.js';
import Osu from './osu.js';
import { fs } from "https://unpkg.com/@zip.js/zip.js/index.js";

export const game = {
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
    mouse: null,
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
}, progresses = document.getElementsByClassName('progress'), pDragbox = document.getElementsByClassName('dragbox')[0],
    pDragboxInner = document.getElementsByClassName('dragbox-inner')[0],
    pDragboxHint = document.getElementsByClassName('dragbox-hint')[0],
    pBeatmapList = document.getElementsByClassName('beatmap-list')[0];

const beatmapFileList = JSON.parse(localStorage.getItem('beatmapfilelist')) ?? [];
if (beatmapFileList.length > 0) {
    console.log('Local beatmaps:', beatmapFileList);
    const counter = progresses[3].childNodes;
    counter[3].innerText = beatmapFileList.length;

    const tempbox = new Array(beatmapFileList.length);
    for (let i = 0; i < beatmapFileList.length; ++i) {
        const box = document.createElement('div');
        box.className = 'beatmapbox';
        pBeatmapList.insertBefore(box, pDragbox);
        tempbox[i] = box;
    }
    const loadingCounter = counter[1];

    let loadedCount = 0;
    for (let i = 0; i < beatmapFileList.length; ++i) localforage.getItem(beatmapFileList[i]).then(blob => {
        const zipFs = new fs.FS;
        zipFs.name = beatmapFileList[i];
        zipFs.importUint8Array(blob).then(() => {
            addbeatmap(zipFs, box => {
                pBeatmapList.replaceChild(box, tempbox[i]);
                pDragboxHint.innerText = defaultHint;
            });
            loadingCounter.innerText = ++loadedCount;
        }).catch(e => {
            console.warn('Error importing beatmap:', beatmapFileList[i], e);
            pDragboxHint.innerText = nonValidHint;
        });
    }).catch(err => console.warn('Error getting beatmap:', beatmapFileList[i], err));
}

export let skin;
const sheetUrl = 'asset/skin/sprites.json';

PIXI.Loader.shared.add(sheetUrl).load((_, resources) => {
    skin = resources[sheetUrl].textures;
    progresses[1].classList.add('finished');
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
sounds.load(sample, () => {
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
});

export let app, stopGame;
let showingDifficultyBox;

class BeatmapController {
    constructor(osz) {
        this.osu = new Osu(osz.root);
        this.filename = osz.name;
    }
    startGame(trackid) {
        if (app) return;
        app = new PIXI.Application({
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

        settings.loadToGame(game);
        if (!game.showhwmouse || game.autoplay) {
            var cursor = new PIXI.Sprite(skin['cursor.png']);
            cursor.anchor.x = cursor.anchor.y = .5;
            cursor.scale.x = cursor.scale.y = .3 * game.cursorSize;
        }
        this.osu.load_mp3(trackid);

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

        let playback = new Playback(this.osu, this.osu.tracks[trackid]);
        stopGame = restart => {
            if (!restart) {
                pGameArea.hidden = true;
                pMainPage.hidden = false;
                document.body.classList.remove('gaming');
                document.body.scrollTop = scrollTop;
                window.alert = defaultAlert;

                app.ticker.stop();
                app.destroy(true, {
                    children: true
                });
                app = null;
                return;
            }

            app.ticker.stop();
            playback = new Playback(this.osu, this.osu.tracks[trackid]);
            app.ticker.start();
            this.osu.onready();
        };
        app.ticker.add(t => {
            playback.render(t, app.ticker.lastTime);
            if (cursor) {
                cursor.x = game.mouseX / 512 * playback.gfx.width + playback.gfx.xoffset;
                cursor.y = game.mouseY / 384 * playback.gfx.height + playback.gfx.yoffset;
                app.stage.addChild(cursor);
            }
            app.renderer.render(app.stage);
        }).start();
    }
    createBeatmapBox() {
        const pBeatmapBox = document.createElement('div'), pBeatmapCover = document.createElement('img'),
            pBeatmapTitle = document.createElement('div'), pBeatmapAuthor = document.createElement('div');

        pBeatmapBox.className = 'beatmapbox';
        pBeatmapCover.className = 'beatmapcover';
        pBeatmapTitle.className = 'beatmaptitle';
        pBeatmapAuthor.className = 'beatmapauthor';
        pBeatmapBox.appendChild(pBeatmapCover);
        pBeatmapBox.appendChild(pBeatmapTitle);
        pBeatmapBox.appendChild(pBeatmapAuthor);

        pBeatmapTitle.innerText = this.osu.tracks[0].metadata.Title;
        pBeatmapAuthor.innerText = this.osu.tracks[0].metadata.Artist.concat('/', this.osu.tracks[0].metadata.Creator);
        this.osu.getCoverSrc(pBeatmapCover);

        const first = this.osu.tracks[0].length;
        if (first) {
            const pBeatmapLength = document.createElement('div');
            pBeatmapLength.className = 'beatmaplength';
            pBeatmapBox.appendChild(pBeatmapLength);

            let mins = Math.floor(first / 60), text = '';
            if (mins >= 60) {
                text = Math.floor(mins / 60) + ':';
                mins %= 60;
            }
            pBeatmapLength.innerText = text.concat(mins, ':', first % 60 < 10 ? '0' : '', (first % 60).toFixed(0));
        }
        pBeatmapBox.onclick = e => {
            if (!showingDifficultyBox) {
                e.stopPropagation();
                const difficultyBox = document.createElement('div'), closeDifficultyMenu = () => {
                    pBeatmapBox.removeChild(difficultyBox);
                    showingDifficultyBox = false;
                    window.removeEventListener('click', closeDifficultyMenu, false);
                }
                difficultyBox.className = 'difficulty-box';

                const rect = pBeatmapBox.getBoundingClientRect();
                difficultyBox.style.left = e.clientX - rect.left + 'px';
                difficultyBox.style.top = e.clientY - rect.top + 'px';

                for (let i = 0; i < this.osu.tracks.length; ++i) {
                    const difficultyItem = document.createElement('div'),
                        difficultyRing = document.createElement('div'),
                        difficultyText = document.createElement('span');
                    difficultyItem.className = 'difficulty-item';
                    difficultyRing.className = 'difficulty-ring';

                    const star = this.osu.tracks[i].difficulty.star;
                    if (star) {
                        if (star < 2) difficultyRing.classList.add('easy');
                        else if (star < 2.7) difficultyRing.classList.add('normal');
                        else if (star < 4) difficultyRing.classList.add('hard');
                        else if (star < 5.3) difficultyRing.classList.add('insane');
                        else if (star < 6.5) difficultyRing.classList.add('expert');
                        else difficultyRing.classList.add('expert-plus');
                    }

                    difficultyText.innerText = this.osu.tracks[i].metadata.Version;
                    difficultyItem.appendChild(difficultyRing);
                    difficultyItem.appendChild(difficultyText);
                    difficultyBox.appendChild(difficultyItem);
                    difficultyItem.onclick = e => {
                        e.stopPropagation();
                        closeDifficultyMenu();
                        this.startGame(i);
                    };
                }
                pBeatmapBox.appendChild(difficultyBox);

                showingDifficultyBox = true;
                window.addEventListener('click', closeDifficultyMenu, false);
            }
        };
        return pBeatmapBox;
    }
}

const defaultHint = 'Drag and drop a beatmap (.osz) file here',
    modeErrHint = 'Only supports osu! (std) mode beatmaps. Drop another file.',
    nonValidHint = 'Not a valid osz file. Drop another file.',
    noTransferHint = 'Not receiving any file. Please retry.',
    nonOszHint = 'Not an osz file. Drop another file.',
    loadingHint = 'Loading...';

function addbeatmap(osz, f) {
    const map = new BeatmapController(osz), osu = map.osu;
    osu.ondecoded = () => {
        osu.sortTracks();
        if (!osu.tracks.some(t => t.general.Mode !== 3)) {
            pDragboxHint.innerText = modeErrHint;
            return;
        }
        f(map.createBeatmapBox());

        if (!beatmapFileList.includes(map.filename)) {
            beatmapFileList.push(map.filename);
            localStorage.setItem('beatmapfilelist', JSON.stringify(beatmapFileList));
        }
    };
    osu.onerror = e => console.warn('Error loading .osu:', e);
    osu.load();
}
function handleDragDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    pDragboxHint.innerText = loadingHint;
    for (const blob of e.dataTransfer.files) {
        if (!blob) {
            pDragboxHint.innerText = noTransferHint;
            return;
        }
        if (blob.name.indexOf('.osz') === blob.name.length - 4) {
            const zipFs = new fs.FS;
            zipFs.name = blob.name;

            zipFs.importBlob(blob).then(() => {
                addbeatmap(zipFs, box => {
                    pBeatmapList.insertBefore(box, pDragbox);
                    pDragboxHint.innerText = defaultHint;
                });
                localforage.setItem(blob.name, zipFs.exportUint8Array()).catch(err => console.warn('Error saving beatmap:', zipFs.name, err));
            }).catch(ex => {
                console.warn('Error during file transfer:', zipFs.name, ex);
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