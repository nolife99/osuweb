require(["osu", "underscore", "sound", "playback"], (Osu, _, _sound, Playback) => {
    let game = {
        window: window,
        stage: null,
        updatePlayerActions: null,
        backgroundDimRate: .7,
        backgroundBlurRate: 0,
        cursorSize: 1,
        showhwmouse: false,
        snakein: true,
        snakeout: true,
        masterVolume: .7,
        effectVolume: 1,
        musicVolume: 1,
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
        hideFollowPoints: false,
        mouseX: 0,
        mouseY: 0,
        mouse: null,
        K1down: false,
        K2down: false,
        M1down: false,
        M2down: false,
        down: false,
        finished: false,
        sample: [{}, {}, {}, {}],
        sampleSet: 1
    };
    window.game = game;

    if (window.gamesettings) window.gamesettings.loadToGame();
    window.skinReady = false;
    window.soundReady = false;
    window.scriptReady = false;
    game.stage = new PIXI.Container();
    game.cursor = null;

    PIXI.Loader.shared.add('asset/fonts/venera.fnt').add("asset/skin/sprites.json").load(() => {
        window.skinReady = true;
        document.getElementById("skin-progress").classList.add("finished");
        Skin = PIXI.Loader.shared.resources["asset/skin/sprites.json"].textures;
    });

    let sample = [
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
        window.soundReady = true;
        document.getElementById("sound-progress").classList.add("finished");
    };
    sounds.load(sample);

    class BeatmapController {
        constructor() {
            this.osuReady = false;
        }
        startGame(trackid) {
            if (window.app) return;
            let app = window.app = new PIXI.Application({
                width: window.innerWidth,
                height: window.innerHeight,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true
            });
            app.renderer.autoDensity = true;
            app.renderer.backgroundColor = 0x111111;

            let scrollTop = document.body.scrollTop, defaultAlert = window.alert;

            document.addEventListener("contextmenu", e => {
                e.preventDefault();
                return false;
            });
            document.body.classList.add("gaming");

            if (!game.showhwmouse || game.autoplay) {
                game.cursor = new PIXI.Sprite(Skin["cursor.png"]);
                game.cursor.anchor.x = game.cursor.anchor.y = .5;
                game.cursor.scale.x = game.cursor.scale.y = .3 * game.cursorSize;
                game.stage.addChild(game.cursor);
            }

            let pGameArea = document.getElementById("game-area"), pMainPage = document.getElementById("main-page");
            pGameArea.appendChild(app.view);

            if (game.autoplay) {
                pGameArea.classList.remove("shownomouse");
                pGameArea.classList.remove("showhwmouse");
            }
            else if (game.showhwmouse) {
                pGameArea.classList.remove("shownomouse");
                pGameArea.classList.add("showhwmouse");
            }
            else {
                pGameArea.classList.remove("showhwmouse");
                pGameArea.classList.add("shownomouse");
            }
            pMainPage.hidden = true;
            pGameArea.hidden = false;

            let gameLoop;
            window.quitGame = function () {
                pGameArea.hidden = true;
                pMainPage.hidden = false;
                document.body.classList.remove("gaming");
                document.body.scrollTop = scrollTop;
                window.alert = defaultAlert;

                if (game.cursor) {
                    game.stage.removeChild(game.cursor);
                    game.cursor.destroy();
                    game.cursor = null;
                }
                window.app.destroy(true, {
                    children: true, texture: false
                });

                window.cancelAnimationFrame(window.animationRequestID);
                window.app = null;
                gameLoop = null;
            };

            let playback = new Playback(window.game, this.osu, this.osu.tracks[trackid]);
            playback.load();

            gameLoop = time => {
                playback.render(time);
                if (game.cursor) {
                    game.cursor.x = game.mouseX / 512 * gfx.width + gfx.xoffset;
                    game.cursor.y = game.mouseY / 384 * gfx.height + gfx.yoffset;
                    game.cursor.bringToFront();
                }
                if (!app.renderer) return;

                app.renderer.render(game.stage);
                window.requestAnimationFrame(gameLoop);
            };
            window.requestAnimationFrame(gameLoop);
        }
        createBeatmapBox() {
            let map = this, 
                pBeatmapBox = document.createElement("div"), pBeatmapCover = document.createElement("img"),
                pBeatmapTitle = document.createElement("div"), pBeatmapAuthor = document.createElement("div");

            pBeatmapBox.className = "beatmapbox";
            pBeatmapCover.className = "beatmapcover";
            pBeatmapTitle.className = "beatmaptitle";
            pBeatmapAuthor.className = "beatmapauthor";
            pBeatmapBox.appendChild(pBeatmapCover);
            pBeatmapBox.appendChild(pBeatmapTitle);
            pBeatmapBox.appendChild(pBeatmapAuthor);

            pBeatmapTitle.innerText = map.osu.tracks[0].metadata.Title;
            pBeatmapAuthor.innerText = map.osu.tracks[0].metadata.Artist + "/" + map.osu.tracks[0].metadata.Creator;
            map.osu.getCoverSrc(pBeatmapCover);

            if (map.osu.tracks[0].length) {
                let pBeatmapLength = document.createElement("div");
                pBeatmapLength.className = "beatmaplength";
                pBeatmapBox.appendChild(pBeatmapLength);
                let length = map.osu.tracks[0].length;
                pBeatmapLength.innerText = Math.floor(length / 60) + ":" + (length % 60 < 10 ? "0" : "") + Math.round(length % 60);
            }
            pBeatmapBox.onclick = function(e) {
                if (!window.showingDifficultyBox) {
                    e.stopPropagation();
                    let difficultyBox = document.createElement("div");
                    difficultyBox.className = "difficulty-box";

                    let rect = this.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
                    difficultyBox.style.left = x + "px";
                    difficultyBox.style.top = y + "px";

                    function closeDifficultyMenu() {
                        pBeatmapBox.removeChild(difficultyBox);
                        window.showingDifficultyBox = false;
                        window.removeEventListener('click', closeDifficultyMenu, false);
                    };

                    for (let i = 0; i < map.osu.tracks.length; ++i) {
                        let difficultyItem = document.createElement("div");
                        let difficultyRing = document.createElement("div");
                        let difficultyText = document.createElement("span");
                        difficultyItem.className = "difficulty-item";
                        difficultyRing.className = "difficulty-ring";

                        let star = map.osu.tracks[i].difficulty.star;
                        if (star) {
                            if (star < 2) difficultyRing.classList.add("easy");
                            else if (star < 2.7) difficultyRing.classList.add("normal");
                            else if (star < 4) difficultyRing.classList.add("hard");
                            else if (star < 5.3) difficultyRing.classList.add("insane");
                            else if (star < 6.5) difficultyRing.classList.add("expert");
                            else difficultyRing.classList.add("expert-plus");
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
                    window.addEventListener("click", closeDifficultyMenu, false);
                }
            };
            return pBeatmapBox;
        }
    }

    let pDragbox = document.getElementById("beatmap-dragbox"), 
        pDragboxInner = document.getElementById("beatmap-dragbox-inner"),
        pDragboxHint = document.getElementById("beatmap-dragbox-hint"),
        pBeatmapList = document.getElementById("beatmap-list");

    pDragboxHint.defaultHint = "Drag and drop a beatmap (.osz) file here";
    pDragboxHint.modeErrHint = "Only supports osu! (std) mode beatmaps. Drop another file.";
    pDragboxHint.nonValidHint = "Not a valid osz file. Drop another file.";
    pDragboxHint.noTransferHint = "Not receiving any file. Please retry.";
    pDragboxHint.nonOszHint = "Not an osz file. Drop another file.";
    pDragboxHint.loadingHint = "loading...";

    let beatmapFileList = [];
    localforage.getItem("beatmapfilelist", (err, names) => {
        if (!err && names && names.length) {
            console.log("local beatmap list:", names);
            document.getElementById('bm-total-counter').innerText = names.length;

            let tempbox = [];
            for (let i = 0; i < names.length; ++i) {
                let box = document.createElement("div");
                box.className = "beatmapbox";
                pBeatmapList.insertBefore(box, pDragbox);
                tempbox.push(box);
            }

            let loadingCounter = document.getElementById('bm-loaded-counter');
            let loadingn = 0;

            beatmapFileList = beatmapFileList.concat(names);
            for (let i = 0; i < names.length; ++i) localforage.getItem(names[i], (err, blob) => {
                if (!err && blob) {
                    let fs = new zip.fs.FS();
                    fs.filename = names[i];
                    fs.root.importBlob(blob, () => {
                        addbeatmap(fs, box => {
                            pBeatmapList.replaceChild(box, tempbox[i]);
                            pDragboxHint.innerText = pDragboxHint.defaultHint;
                        });
                        loadingCounter.innerText = ++loadingn;
                    }, _e => pDragboxHint.innerText = pDragboxHint.nonValidHint);
                }
                else console.error("error while loading beatmap:", names[i], err);
            });
        }
        else if (names) console.error("error while loading beatmap list:", err, names);
    });
    function addbeatmap(osz, f) {
        let map = new BeatmapController();
        map.osu = new Osu(osz.root);
        map.filename = osz.filename;
        console.log("adding beatmap filename:", osz.filename);

        map.osu.ondecoded = () => {
            map.osu.filterTracks();
            map.osu.sortTracks();
            map.osu.requestStar();
            map.osuReady = true;

            if (!_.some(map.osu.tracks, t => t.general.Mode !== 3)) {
                pDragboxHint.innerText = pDragboxHint.modeErrHint;
                return;
            }
            f(map.createBeatmapBox());

            if (!beatmapFileList.includes(map.filename)) {
                beatmapFileList.push(map.filename);
                localforage.setItem("beatmapfilelist", beatmapFileList, (err, _val) => {
                    if (err) console.error("Error while saving beatmap list");
                });
            }
        };
        map.osu.onerror = _e => console.error("osu load error");
        map.osu.load();
    }
    function handleDragDrop(e) {
        e.stopPropagation();
        e.preventDefault();

        pDragboxHint.innerText = pDragboxHint.loadingHint;
        for (let i = 0; i < e.dataTransfer.files.length; ++i) {
            let raw_file = e.dataTransfer.files[i];
            if (!raw_file) {
                pDragboxHint.innerText = pDragboxHint.noTransferHint;
                return;
            }
            if (raw_file.name.indexOf(".osz") === raw_file.name.length - 4) {
                let fs = new zip.fs.FS();
                fs.filename = raw_file.name;
                localforage.setItem(raw_file.name, raw_file, (err, _val) => {
                    if (err) console.error("Error while saving beatmap", fs.filename);
                })
                fs.root.importBlob(raw_file, () => addbeatmap(fs, box => {
                    pBeatmapList.insertBefore(box, pDragbox);
                    pDragboxHint.innerText = pDragboxHint.defaultHint;
                }), _e => pDragboxHint.innerText = pDragboxHint.nonValidHint);
            }
            else pDragboxHint.innerText = pDragboxHint.nonOszHint;
        }
    }
    pDragbox.ondrop = handleDragDrop;

    window.addEventListener('dragover', e => (e || event).preventDefault(), false);
    window.addEventListener('drop', e => (e || event).preventDefault(), false);

    pDragboxHint.innerText = pDragboxHint.defaultHint;
    pDragboxInner.hidden = false;
    window.scriptReady = true;
    document.getElementById("script-progress").classList.add("finished");

    PIXI.Sprite.prototype.bringToFront = function () {
        let parent = this.parent;
        if (parent) {
            parent.removeChild(this);
            parent.addChild(this);
        }
    }
});