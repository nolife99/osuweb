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
};
const progresses = document.getElementsByClassName('progress'),
    pDragbox = document.getElementsByClassName('dragbox')[0],
    pDragboxInner = document.getElementsByClassName('dragbox-inner')[0],
    pDragboxHint = document.getElementsByClassName('dragbox-hint')[0],
    pBeatmapList = document.getElementsByClassName('beatmap-list')[0],
    mapList = localStorage.getItem('‌')?.split('‌') || [];

if (mapList.length > 0) {
    const counter = progresses[3].childNodes;
    counter[3].innerText = mapList.length;

    const tempbox = Array(mapList.length), loadingCounter = counter[1];
    for (let i = 0; i < mapList.length; ++i) (tempbox[i] = pBeatmapList.insertBefore(document.createElement('div'), pDragbox)).className = 'beatmapbox';

    let loadedCount = 0;
    for (let i = 0; i < mapList.length; ++i) localforage.getItem(mapList[i]).then(buf => {
        const zipFs = new fs.FS;
        zipFs.importUint8Array(buf).then(() => {
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
PIXI.utils.skipHello();

export let app, stopGame;
let showingDifficultyBox;

function previewMap(box, blob, time) {
    const volume = (settings.mastervolume / 100) * (settings.musicvolume / 100);
    for (const a of document.getElementsByTagName('audio')) if (a.softstop) a.softstop();

    const a = box.appendChild(new Audio(URL.createObjectURL(blob)));
    a.volume = 0;
    a.currentTime = time;

    a.play().then(() => {
        const fadeIn = setInterval(() => {
            if (a.volume < volume) a.volume = Math.min(volume, a.volume + .05 * volume);
            else clearInterval(fadeIn);
        }, 30), fadeOut = setInterval(() => {
            if (a.currentTime > time + 10) a.volume = Math.max(0, a.volume - .05 * volume);
            if (a.volume === 0) {
                clearInterval(fadeOut);
                URL.revokeObjectURL(a.src);
                a.remove();
            }
        }, 30);
    });
    a.softstop = () => {
        const fadeOut = setInterval(() => {
            a.volume = Math.max(0, a.volume - .05 * volume);
            if (a.volume === 0) {
                clearInterval(fadeOut);
                URL.revokeObjectURL(a.src);
                a.remove();
            }
        }, 15);
    }
}
class BeatmapController {
    constructor(osz) {
        this.osu = new Osu(osz.root);
        this.filename = osz.name;
    }
    startGame(track) {
        if (app) return;
        app = new PIXI.Application({
            width: innerWidth, height: innerHeight, resolution: devicePixelRatio, autoDensity: true
        });
        app.renderer.autoDensity = true;
        app.renderer.backgroundColor = 0x111111;

        const scrollTop = document.body.scrollTop, canvas = app.view;
        settings.loadToGame(game);
        this.osu.loadAudio(track);

        if (!game.showhwmouse || game.autoplay) {
            var cursor = new PIXI.Sprite(skin['cursor.png']);
            cursor.anchor.set(.5);
            cursor.scale.set(.3 * game.cursorSize);
        }
        const pMainPage = document.getElementsByClassName('main-page')[0];
        document.body.insertBefore(canvas, document.body.firstChild);

        if (!cursor) canvas.classList.add('hwmouse');
        pMainPage.hidden = true;

        let playback = new Playback(this.osu, track);
        app.ticker.add(() => {
            playback.render(app.ticker.elapsedMS, app.ticker.lastTime);
            if (cursor) app.stage.addChild(cursor).position.set(
                game.mouseX / 512 * playback.gfx.width + playback.gfx.xoffset,
                game.mouseY / 384 * playback.gfx.height + playback.gfx.yoffset);
            app.renderer.render(app.stage);
        }).start();

        stopGame = restart => {
            if (!restart) {
                pMainPage.hidden = false;
                document.body.scrollTop = scrollTop;

                app.ticker.stop();
                app.destroy(true, {
                    children: true
                });
                app = null;
                return;
            }

            app.ticker.stop();
            playback = new Playback(this.osu, track);
            app.ticker.start();
            this.osu.onready();
        };
    }
    createBeatmapBox() {
        const box = document.createElement('div'), boxCover = box.appendChild(document.createElement('img')),
            mapTitle = box.appendChild(document.createElement('div')), mapper = box.appendChild(document.createElement('div')),
            track = this.osu.tracks[0];

        box.className = 'beatmapbox';
        boxCover.className = 'beatmapcover';
        mapTitle.className = 'beatmaptitle';
        mapper.className = 'beatmapauthor';
        this.osu.getCoverSrc(boxCover);

        mapTitle.innerText = track.metadata.Title;
        mapper.innerText = `${track.metadata.Artist}/${track.metadata.Creator}`;

        const first = track.length;
        if (first) {
            const mapLength = box.appendChild(document.createElement('div'));
            mapLength.className = 'beatmaplength';

            let mins = Math.floor(first / 60), text = '';
            if (mins >= 60) {
                text = Math.floor(mins / 60) + ':';
                mins %= 60;
            }
            mapLength.innerText = `${text}${mins}:${first % 60 < 10 ? '0' : ''}${(first % 60).toFixed(0)}`;
        }
        box.onclick = e => {
            if (!showingDifficultyBox) {
                this.osu.zip.getChildByName(track.general.AudioFilename).getBlob().then(data => previewMap(box, data, track.general.PreviewTime / 1000));
                e.stopPropagation();

                const difficultyBox = box.appendChild(document.createElement('div')), closeDifficultyMenu = () => {
                    box.removeChild(difficultyBox);
                    showingDifficultyBox = false;
                    removeEventListener('click', closeDifficultyMenu);
                }
                difficultyBox.className = 'difficulty-box';

                const rect = box.getBoundingClientRect();
                difficultyBox.style.left = e.clientX - rect.left + 'px';
                difficultyBox.style.top = e.clientY - rect.top + 'px';

                for (const track of this.osu.tracks) {
                    const difficultyItem = difficultyBox.appendChild(document.createElement('div')),
                        difficultyRing = difficultyItem.appendChild(document.createElement('div')),
                        difficultyText = difficultyItem.appendChild(document.createElement('span'));
                    difficultyItem.className = 'difficulty-item';
                    difficultyRing.className = 'difficulty-ring';

                    const star = track.difficulty.star;
                    if (star) {
                        if (star < 2) difficultyRing.classList.add('easy');
                        else if (star < 2.7) difficultyRing.classList.add('normal');
                        else if (star < 4) difficultyRing.classList.add('hard');
                        else if (star < 5.3) difficultyRing.classList.add('insane');
                        else if (star < 6.5) difficultyRing.classList.add('expert');
                        else difficultyRing.classList.add('expert-plus');
                    }

                    difficultyText.innerText = track.metadata.Version;
                    difficultyItem.onclick = e => {
                        e.stopPropagation();
                        closeDifficultyMenu();
                        this.startGame(track);
                    };
                }
                showingDifficultyBox = true;
                addEventListener('click', closeDifficultyMenu);
            }
        };
        return box;
    }
}

const defaultHint = 'Drag and drop a beatmap (.osz) file here',
    modeErrHint = 'Only supports osu! (std) mode beatmaps. Drop another file.',
    nonValidHint = 'Not a valid osz file. Drop another file.',
    loadingHint = 'Loading...';

function addbeatmap(osz, f) {
    const map = new BeatmapController(osz), osu = map.osu;
    osu.load(() => {
        if (!osu.tracks.some(t => t.general.Mode !== 3)) {
            pDragboxHint.innerText = modeErrHint;
            return;
        }
        f(map.createBeatmapBox());
    });
}
pDragbox.ondrop = e => {
    e.stopPropagation();
    e.preventDefault();

    pDragboxHint.innerText = loadingHint;
    for (const blob of e.dataTransfer.files) blob.arrayBuffer().then(buf => {
        const bytes = new Uint8Array(buf), id = blob.lastModified.toString(), zipFs = new fs.FS;
        localforage.setItem(id, bytes);
        if (!mapList.includes(id)) {
            mapList.push(id);
            localStorage.setItem('‌', mapList.join('‌'));
        }
        zipFs.importUint8Array(bytes).then(() => addbeatmap(zipFs, box => {
            pBeatmapList.insertBefore(box, pDragbox);
            pDragboxHint.innerText = defaultHint;
        })).catch(ex => {
            console.warn('Error during file transfer:', blob.name, ex);
            pDragboxHint.innerText = nonValidHint;
        });
    });
};
addEventListener('dragover', e => e.preventDefault());

pDragboxHint.innerText = defaultHint;
pDragboxInner.hidden = false;
progresses[0].classList.add('finished');