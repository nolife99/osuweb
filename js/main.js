'use strict';

import { sounds } from './osuAudio.js';
import { settings } from './settings.js';
import Playback from './playback.js';
import Osu from './osu.js';
import { fs } from "https://unpkg.com/@zip.js/zip.js/index.min.js";

export const game = {
    mouse: null, mouseX: 0, mouseY: 0,
    K1down: false, K2down: false, M1down: false, M2down: false, down: false,
    finished: false,
    sample: [{}, {}, {}, {}], sampleSet: 1
}, progresses = document.getElementsByClassName('progress'),
    pDragbox = document.getElementsByClassName('dragbox')[0],
    pDragboxInner = document.getElementsByClassName('dragbox-inner')[0],
    pDragboxHint = document.getElementsByClassName('dragbox-hint')[0],
    pBeatmapList = document.getElementsByClassName('beatmap-list')[0];

const mapList = JSON.parse(localStorage.getItem('beatmapfilelist')) || [];
if (mapList.length > 0) {
    const counter = progresses[3].childNodes;
    counter[3].innerText = mapList.length;

    const tempbox = Array(mapList.length);
    for (let i = 0; i < mapList.length; ++i) {
        const box = document.createElement('div');
        box.className = 'beatmapbox';
        pBeatmapList.insertBefore(box, pDragbox);
        tempbox[i] = box;
    }
    const loadingCounter = counter[1];

    let loadedCount = 0;
    for (let i = 0; i < mapList.length; ++i) localforage.getItem(mapList[i]).then(blob => {
        const zipFs = new fs.FS;
        zipFs.name = mapList[i];
        zipFs.importUint8Array(blob).then(() => {
            addbeatmap(zipFs, box => {
                pBeatmapList.replaceChild(box, tempbox[i]);
                pDragboxHint.innerText = defaultHint;
            });
            loadingCounter.innerText = ++loadedCount;
        }).catch(e => {
            console.warn('Error importing beatmap:', mapList[i], e);
            pDragboxHint.innerText = nonValidHint;
        });
    }).catch(err => console.warn('Error getting beatmap:', mapList[i], err));
}

export let skin;
const sheetUrl = 'asset/skin/sprites.json';

PIXI.Loader.shared.add(sheetUrl, resource => {
    skin = resource.textures;
    progresses[1].classList.add('finished');
}).load();

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
            width: window.innerWidth, height: window.innerHeight,
            resolution: window.devicePixelRatio || 1, autoDensity: true
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
        this.osu.loadAudio(trackid);

        if (!game.showhwmouse || game.autoplay) {
            var cursor = new PIXI.Sprite(skin['cursor.png']);
            cursor.anchor.x = cursor.anchor.y = .5;
            cursor.scale.x = cursor.scale.y = .3 * game.cursorSize;
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

        let playback = new Playback(this.osu, this.osu.tracks[trackid]);
        app.ticker.add(() => {
            playback.render(app.ticker.elapsedMS, app.ticker.lastTime);
            if (cursor) {
                cursor.x = game.mouseX / 512 * playback.gfx.width + playback.gfx.xoffset;
                cursor.y = game.mouseY / 384 * playback.gfx.height + playback.gfx.yoffset;
                app.stage.addChild(cursor);
            }
            app.renderer.render(app.stage);
        }).start();

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
            playback = new Playback(this.osu, playback.track);
            app.ticker.start();
            this.osu.onready();
        };
    }
    createBeatmapBox() {
        const box = document.createElement('div'), boxCover = document.createElement('img'),
            mapTitle = document.createElement('div'), mapper = document.createElement('div');

        box.className = 'beatmapbox';
        boxCover.className = 'beatmapcover';
        mapTitle.className = 'beatmaptitle';
        mapper.className = 'beatmapauthor';
        box.appendChild(boxCover);
        box.appendChild(mapTitle);
        box.appendChild(mapper);

        mapTitle.innerText = this.osu.tracks[0].metadata.Title;
        mapper.innerText = `${this.osu.tracks[0].metadata.Artist}/${this.osu.tracks[0].metadata.Creator}`;
        this.osu.getCoverSrc(boxCover);

        const first = this.osu.tracks[0].length;
        if (first) {
            const mapLength = document.createElement('div');
            mapLength.className = 'beatmaplength';
            box.appendChild(mapLength);

            let mins = Math.floor(first / 60), text = '';
            if (mins >= 60) {
                text = Math.floor(mins / 60) + ':';
                mins %= 60;
            }
            mapLength.innerText = `${text}${mins}:${first % 60 < 10 ? '0' : ''}${(first % 60).toFixed(0)}`;
        }
        box.onclick = e => {
            if (!showingDifficultyBox) {
                e.stopPropagation();
                const difficultyBox = document.createElement('div'), closeDifficultyMenu = () => {
                    box.removeChild(difficultyBox);
                    showingDifficultyBox = false;
                    window.removeEventListener('click', closeDifficultyMenu, false);
                }
                difficultyBox.className = 'difficulty-box';

                const rect = box.getBoundingClientRect();
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
                box.appendChild(difficultyBox);

                showingDifficultyBox = true;
                window.addEventListener('click', closeDifficultyMenu, false);
            }
        };
        return box;
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
    osu.onerror = e => console.warn('Error loading .osu:', e);
    osu.load(() => {
        if (!osu.tracks.some(t => t.general.Mode !== 3)) {
            pDragboxHint.innerText = modeErrHint;
            return;
        }
        f(map.createBeatmapBox());
    });
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
                if (!mapList.includes(zipFs.name)) {
                    mapList.push(zipFs.name);
                    localStorage.setItem('beatmapfilelist', JSON.stringify(mapList));
                }
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