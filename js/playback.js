import PlayerActions from './playerActions.js';
import SliderMesh from './SliderMesh.js';
import { game, skin, app, stopGame } from './main.js';
import ScoreOverlay from './ui/score.js';
import VolumeMenu from './ui/volume.js';
import LoadingMenu from './ui/loading.js';
import BreakOverlay from './ui/break.js';
import ProgressOverlay from './ui/progress.js';
import ErrorMeterOverlay from './ui/hiterrormeter.js';
import ArcPath from './curve/ArcPath.js';
import LinearBezier from './curve/LinearBezier.js';

const clamp01 = num => Math.min(Math.max(num, 0), 1), defaultBg = 'asset/skin/defaultbg.jpg';
function colorLerp(rgb1, rgb2, t) {
    const ease = 1 - t;
    return (ease * (rgb1 >> 16) + t * (rgb2 >> 16)) << 16 |
        (ease * ((rgb1 >> 8) & 255) + t * ((rgb2 >> 8) & 255)) << 8 |
        (ease * (rgb1 & 255) + t * (rgb2 & 255));
}
function getdist(A, B, useEnd) {
    let x = A.x, y = A.y;
    if (useEnd) {
        const pt = A.curve.pointAt(1);
        x = pt.x;
        y = pt.y;
    }
    return Math.hypot(x - B.x, y - B.y);
}
function repeatclamp(a) {
    a %= 2;
    return a > 1 ? 2 - a : a;
}
function fadeOutEasing(t) {
    if (t <= 0) return 1;
    if (t > 1) return 0;
    return 1 - Math.sin(t * Math.PI / 2);
}

export default class Playback {
    ready = true;
    started = false;
    newHits = [];
    approachScale = 3;
    audioReady = false;
    skipped = false;
    ended = false;
    volumeMenu = new VolumeMenu({
        width: window.innerWidth,
        height: window.innerHeight
    });
    gfx = {};
    gamefield = new PIXI.Container;
    destroyHit = o => {
        const opt = {
            children: true
        }
        this.gamefield.removeChild(o);
        o.destroy(opt);
    };
    glowFadeOutTime = 350;
    glowMaxOpacity = .5;
    flashFadeInTime = 40;
    followZoomInTime = 100;
    ballFadeOutTime = 100;
    backgroundFadeTime = 800;
    spinnerZoomInTime = 300;
    curtimingid = 0;
    current = 0;
    waitinghitid = 0;
    breakIndex = 0;

    constructor(osu, track) {
        this.osu = osu;
        this.track = track;
        this.speed = game.nightcore ? 1.5 : game.daycore ? .75 : 1;

        game.mouseX = 256;
        game.mouseY = 192;

        this.loadingMenu = new LoadingMenu({
            width: window.innerWidth,
            height: window.innerHeight
        }, track);
        this.calcSize();

        this.createBackground();
        app.stage.addChild(this.gamefield);
        app.stage.addChild(this.loadingMenu);
        app.stage.addChild(this.volumeMenu);

        this.endTime = track.hitObjects.at(-1).endTime + 1500;
        this.wait = Math.max(0, 1500 - track.hitObjects[0].time);
        this.skipTime = track.hitObjects[0].time - 3000;

        osu.onready = () => {
            this.errorMeter = new ErrorMeterOverlay({
                width: window.innerWidth,
                height: window.innerHeight
            }, this.GreatTime, this.GoodTime, this.MehTime);
            this.progressOverlay = new ProgressOverlay({
                width: window.innerWidth,
                height: window.innerHeight
            }, track.hitObjects[0].time, track.hitObjects.at(-1).endTime);
            this.breakOverlay = new BreakOverlay({
                width: window.innerWidth,
                height: window.innerHeight
            });
            this.scoreOverlay = new ScoreOverlay({
                width: window.innerWidth,
                height: window.innerHeight
            }, this.HP, scoreMult);
            loadTask.then(() => {
                app.stage.addChild(this.scoreOverlay);
                app.stage.addChild(this.errorMeter);
                app.stage.addChild(this.progressOverlay);
                app.stage.addChild(this.breakOverlay);

                this.loadingMenu.hide();
                this.audioReady = true;
                this.start();
            });
        };
        window.onresize = () => {
            app.renderer.resize(window.innerWidth, window.innerHeight);
            this.calcSize();

            this.loadingMenu.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            this.volumeMenu.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            if (this.audioReady) {
                this.scoreOverlay.resize({
                    width: window.innerWidth,
                    height: window.innerHeight
                });
                this.errorMeter.resize({
                    width: window.innerWidth,
                    height: window.innerHeight
                });
                this.breakOverlay.resize({
                    width: window.innerWidth,
                    height: window.innerHeight
                });
                this.progressOverlay.resize({
                    width: window.innerWidth,
                    height: window.innerHeight
                });
            }
            if (this.background && this.background.texture) {
                this.background.x = window.innerWidth / 2;
                this.background.y = window.innerHeight / 2;
                this.background.scale.set(Math.max(window.innerWidth / this.background.texture.width, window.innerHeight / this.background.texture.height));
            }
            SliderMesh.prototype.resetTransform({
                dx: 2 * this.gfx.width / window.innerWidth / 512,
                ox: -1 + 2 * this.gfx.xoffset / window.innerWidth,
                dy: -2 * this.gfx.height / window.innerHeight / 384,
                oy: 1 - 2 * this.gfx.yoffset / window.innerHeight,
            });
        };

        this.OD = track.difficulty.OverallDifficulty;
        this.CS = track.difficulty.CircleSize;
        this.AR = track.difficulty.ApproachRate;
        this.HP = track.difficulty.HPDrainRate;
        let scoreMult = track.oldStar;

        if (game.hardrock) {
            this.OD = Math.min(this.OD * 1.4, 10);
            this.CS = Math.min(this.CS * 1.3, 10);
            this.AR = Math.min(this.AR * 1.4, 10);
            this.HP = Math.min(this.HP * 1.4, 10);
        }
        else if (game.easy) {
            this.OD /= 2;
            this.CS /= 2;
            this.AR /= 2;
            this.HP /= 2;
        }

        if (game.easy) scoreMult *= .5;
        if (game.daycore) scoreMult *= .3;
        if (game.hardrock) scoreMult *= 1.06;
        if (game.nightcore) scoreMult *= 1.12;
        if (game.hidden) scoreMult *= 1.06;

        this.circleRadius = 64 * (1 - .7 * ((this.CS - 5) / 5));
        this.hitSpriteScale = this.circleRadius / 128;

        this.MehTime = 200 - 10 * this.OD;
        this.GoodTime = 140 - 8 * this.OD;
        this.GreatTime = 80 - 6 * this.OD;

        this.approachTime = this.AR <= 5 ? 1800 - 120 * this.AR : 1950 - 150 * this.AR;
        this.approachFadeInTime = Math.min(800, this.approachTime);
        this.spinnerAppearTime = this.approachTime;

        this.player = new PlayerActions(this);
        game.paused = false;

        this.pauseCallback = e => {
            if (e.code === 'Space') {
                if (!game.paused) this.pause();
                else this.resume();
            }
        };
        this.blurCallback = () => {
            if (this.audioReady) this.pause();
        };
        this.skipCallback = e => {
            if (e.ctrlKey && !game.paused && !this.skipped) this.skip();
        };
        if (game.allowMouseScroll) {
            this.volumeCallback = e => {
                if (!osu.audio) return;
                game.masterVolume = clamp01(game.masterVolume - e.deltaY * .002);
                osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
                this.volumeMenu.setVolume(game.masterVolume * 100);
            };
            window.addEventListener('wheel', this.volumeCallback);
        }
        window.addEventListener('blur', this.blurCallback);
        window.addEventListener('keydown', this.skipCallback);
        window.addEventListener('keyup', this.pauseCallback);

        const loadTask = Promise.all(track.hitObjects.map(a => {
            const hit = structuredClone(a);
            if (game.hidden && hit.hitIndex > 0) {
                hit.objectFadeInTime = .4 * this.approachTime;
                hit.objectFadeOutOffset = -.6 * this.approachTime;
                hit.circleFadeOutTime = .3 * this.approachTime;

                if (hit.type === 'slider') {
                    hit.fadeOutOffset = -.6 * this.approachTime;
                    hit.fadeOutDuration = hit.sliderTimeTotal - hit.fadeOutOffset;
                }
            }
            else {
                hit.enableflash = true;
                hit.objectFadeInTime = Math.min(400, this.approachTime);
                hit.circleFadeOutTime = 100;
                hit.objectFadeOutOffset = this.MehTime;

                if (hit.type === 'slider') {
                    hit.fadeOutOffset = hit.sliderTimeTotal;
                    hit.fadeOutDuration = 300;
                }
            }
            return new Promise(resolve => window.setTimeout(() => {
                if (game.hardrock) {
                    hit.y = -(hit.y - 192) + 192;
                    if (hit.type === 'slider') for (const k of hit.keyframes) k.y = -(k.y - 192) + 192;
                }
                if (hit.type === 'slider') {
                    if (hit.sliderType === 'P') {
                        hit.curve = ArcPath(hit);
                        if (!hit.curve) {
                            a.sliderType === 'L';
                            hit.sliderType === 'L';
                            hit.curve = new LinearBezier(hit, true);
                        }
                    }
                    else hit.curve = new LinearBezier(hit, hit.sliderType === 'L');
                }
                resolve(hit);
            }));
        })).then(hits => {
            const lazyStack = 3, stackOfs = (1 - .7 * ((this.CS - 5) / 5)) * -3.2;
            for (let i = hits.length - 1; i > 0; --i) {
                let n = i, objectI = hits[i];
                if (objectI.chain != 0 || objectI.type === 'spinner') continue;

                if (objectI.type === 'circle') while (--n >= 0) {
                    const objectN = hits[n];
                    if (objectN.type === 'spinner') continue;
                    if (objectI.time - this.approachTime * track.general.StackLeniency > objectN.endTime) break;

                    if (objectN.type === 'slider' && getdist(objectN, objectI, true) < lazyStack) {
                        const offset = objectI.chain - objectN.chain + 1;
                        for (let j = n + 1; j <= i; ++j) if (getdist(objectN, hits[j], true) < lazyStack) hits[j].chain -= offset;
                        break;
                    }
                    if (getdist(objectN, objectI) < lazyStack) {
                        objectN.chain = objectI.chain + 1;
                        objectI = objectN;
                    }
                }
                else if (objectI.type === 'slider') while (--n >= 0) {
                    const objectN = hits[n];
                    if (objectN.type === 'spinner') continue;

                    if (objectI.time - (this.approachTime * track.general.StackLeniency) > objectN.time) break;
                    if (getdist(objectN, objectI, objectN.type === 'slider') < lazyStack) {
                        objectN.chain = objectI.chain + 1;
                        objectI = objectN;
                    }
                }
            }
            this.hits = hits;

            SliderMesh.prototype.initialize(track.colors, this.circleRadius / 2.1, {
                dx: 2 * this.gfx.width / window.innerWidth / 512,
                ox: -1 + 2 * this.gfx.xoffset / window.innerWidth,
                dy: -2 * this.gfx.height / window.innerHeight / 384,
                oy: 1 - 2 * this.gfx.yoffset / window.innerHeight
            }, track.colors.SliderTrackOverride, track.colors.SliderBorder);

            let prev;
            return Promise.all(hits.map(hit => new Promise(resolve => window.setTimeout(() => {
                if (hit.chain !== 0) {
                    const ofs = stackOfs * hit.chain;
                    hit.x += ofs;
                    hit.y += ofs;

                    if (hit.type == "slider") {
                        for (const k of hit.keyframes) {
                            k.x += ofs;
                            k.y += ofs;
                        }
                        if (hit.sliderType === 'P') hit.curve = ArcPath(hit);
                        else hit.curve = new LinearBezier(hit, hit.sliderType === 'L');
                    }
                }
                hit.ticks = [];
                hit.objects = [];
                hit.judgements = [];
                hit.score = -1;

                switch (hit.type) {
                    case 'circle': this.createHitCircle(hit); break;
                    case 'slider': this.createSlider(hit); break;
                    case 'spinner': this.createSpinner(hit); break;
                }
                if (!game.hideFollow && prev && hit.type !== 'spinner' && hit.combo === prev.combo) this.createFollowPoint(prev, hit);
                prev = hit;

                resolve();
            }))));
        });
        this.futuremost = track.hitObjects[0].time;
    }
    calcSize() {
        this.gfx.width = window.innerWidth;
        this.gfx.height = window.innerHeight;
        if (this.gfx.width / 512 > this.gfx.height / 384) this.gfx.width = this.gfx.height / 384 * 512;
        else this.gfx.height = this.gfx.width / 512 * 384;
        this.gfx.width *= .8;
        this.gfx.height *= .8;
        this.gfx.xoffset = (window.innerWidth - this.gfx.width) / 2;
        this.gfx.yoffset = (window.innerHeight - this.gfx.height) / 2;
        this.gamefield.x = this.gfx.xoffset;
        this.gamefield.y = this.gfx.yoffset;
        this.gamefield.scale.set(this.gfx.width / 512);
    }
    resume() {
        game.paused = false;
        document.getElementsByClassName('pause-menu')[0].hidden = true;
        this.osu.audio.play();
    }
    pause() {
        if (this.osu.audio.pause()) {
            game.paused = true;
            const menu = document.getElementsByClassName('pause-menu')[0], buttons = document.getElementsByClassName('pausebutton'),
                cont = buttons[0], retry = buttons[1], quit = buttons[2];

            menu.hidden = false;
            cont.onclick = () => {
                this.resume();
                cont.onclick = null;
                retry.onclick = null;
                quit.onclick = null;
            };
            retry.onclick = () => {
                game.paused = false;
                menu.hidden = true;
                this.retry();
            };
            quit.onclick = () => {
                game.paused = false;
                menu.hidden = true;
                this.quit();
            };
        }
    }
    createJudgement(x, y, depth, finalTime) {
        const judge = new PIXI.Text(null, {
            fontFamily: 'Venera', fontSize: 20, fill: 0xffffff
        });
        judge.roundPixels = true;
        judge.anchor.set(.5);
        judge.scale.set(this.hitSpriteScale);
        judge.visible = false;
        judge.x = x;
        judge.y = y;
        judge.depth = depth;
        judge.points = -1;
        judge.finalTime = finalTime;
        judge.defaultScore = 0;
        return judge;
    }
    invokeJudgement(judge, points, time) {
        judge.visible = true;
        judge.points = points;
        judge.t0 = time;

        switch (judge.points) {
            case 0: judge.text = 'miss'; judge.tint = 0xed1121; break;
            case 50: judge.text = 'meh'; judge.tint = 0xffcc22; break;
            case 100: judge.text = 'good'; judge.tint = 0x88b300; break;
            case 300:
                if (!game.hideGreat) {
                    judge.text = 'great';
                    judge.tint = 0x66ccff;
                }
                break;
        }
        this.updateJudgement(judge, time);
    }
    updateJudgement(judge, time) {
        if (judge.points < 0 && time >= judge.finalTime) {
            const points = game.autoplay ? 300 : judge.defaultScore;

            this.scoreOverlay.hit(points, 300, judge.finalTime);
            this.invokeJudgement(judge, points, judge.finalTime);
            return;
        }
        if (!judge.visible) return;

        const t = time - judge.t0;
        if (judge.points === 0) {
            if (t > 800) {
                judge.visible = false;
                return;
            }
            judge.alpha = t < 100 ? t / 100 : t < 600 ? 1 : 1 - (t - 600) / 200;
            judge.width = 16 * this.hitSpriteScale * judge.text.length;
            const t5 = (t / 800) ** 5;
            judge.y = judge.basey + 100 * t5 * this.hitSpriteScale;
            judge.rotation = .7 * t5;
        }
        else {
            if (t > 500) {
                judge.visible = false;
                return;
            }
            judge.alpha = t < 100 ? t / 100 : 1 - (t - 100) / 400;
            judge.width = (16 + 8 * ((t / 1800 - 1) ** 5 + 1)) * this.hitSpriteScale * judge.text.length;
        }
    }
    createHitCircle(hit) {
        const newHitSprite = (spritename, depth, scalemul = 1, anchorx = .5, anchory = .5) => {
            const sprite = new PIXI.Sprite(skin[spritename]);
            sprite.initialscale = this.hitSpriteScale * scalemul;
            sprite.scale.x = sprite.scale.y = sprite.initialscale;
            sprite.anchor.x = anchorx;
            sprite.anchor.y = anchory;
            sprite.x = hit.x;
            sprite.y = hit.y;
            sprite.depth = depth;
            sprite.alpha = 0;
            hit.objects.push(sprite);
            return sprite;
        };
        const index = hit.index + 1, basedep = 5 - .000001 * hit.hitIndex;

        hit.base = newHitSprite('disc.png', basedep, .5);
        hit.base.tint = this.track.colors[hit.combo % this.track.colors.length];
        hit.circle = newHitSprite('hitcircleoverlay.png', basedep, .5);

        hit.glow = newHitSprite('ring-glow.png', basedep + 2, .46);
        hit.glow.tint = this.track.colors[hit.combo % this.track.colors.length];
        hit.glow.blendMode = PIXI.BLEND_MODES.ADD;

        hit.burst = newHitSprite('hitburst.png', 8.1 + .000001 * hit.hitIndex);
        hit.burst.visible = false;

        hit.approach = newHitSprite('approachcircle.png', 8 + .000001 * hit.hitIndex);
        hit.approach.tint = this.track.colors[hit.combo % this.track.colors.length];
        if (!hit.enableflash) hit.approach.visible = false;

        hit.judgements.push(this.createJudgement(hit.x, hit.y, 4, hit.time + this.MehTime));
        hit.numbers = [];
        if (!game.hideNumbers) {
            if (index < 10) hit.numbers.push(newHitSprite('score-'.concat(index, '.png'), basedep, .4, .5, .47));
            else if (index < 100) {
                hit.numbers.push(newHitSprite('score-'.concat(index % 10, '.png'), basedep, .35, 0, .47));
                hit.numbers.push(newHitSprite('score-'.concat((index - index % 10) / 10, '.png'), basedep, .35, 1, .47));
            }
        }
    }
    createBackground() {
        const loadBackground = async (key, uri) => {
            const consumeImage = txt => {
                const sprite = new PIXI.Sprite(txt);
                if (game.backgroundBlurRate > .0001) {
                    sprite.anchor.set(.5);
                    sprite.x = txt.width / 2;
                    sprite.y = txt.height / 2;

                    const blurstrength = game.backgroundBlurRate * Math.min(txt.width, txt.height);
                    t = Math.max(Math.min(txt.width, txt.height), Math.max(10, blurstrength) * 3);
                    sprite.scale.set(t / (t - 2 * Math.max(10, blurstrength)));

                    const blurFilter = new PIXI.filters.BlurFilter(blurstrength, 14);
                    blurFilter.autoFit = false;
                    sprite.filters = [blurFilter];
                }
                const texture = PIXI.RenderTexture.create(txt.width, txt.height);
                app.renderer.render(sprite, {
                    renderTexture: texture
                });
                sprite.destroy();

                this.background = new PIXI.Sprite(texture);
                this.background.anchor.set(.5);
                this.background.x = window.innerWidth / 2;
                this.background.y = window.innerHeight / 2;
                this.background.scale.set(Math.max(window.innerWidth / txt.width, window.innerHeight / txt.height));
                app.stage.addChildAt(this.background, 0);
            }, txt = PIXI.Loader.shared.resources[key];
            if (txt) consumeImage(txt.texture);
            else PIXI.Loader.shared.add({
                key: key.toString(), url: uri ? await uri() : defaultBg, loadType: PIXI.LoaderResource.LOAD_TYPE.IMAGE
            }).load((_, resources) => consumeImage(resources[key].texture));
        }
        if (this.track.events.length > 0) {
            this.ready = false;
            const file = this.track.events[0][0] === 'Video' ? this.track.events[1][2] : this.track.events[0][2], entry = this.osu.zip.getChildByName(file.slice(1, file.length - 1));

            if (entry) {
                loadBackground(entry.id + entry.uncompressedSize, () => entry.getData64URI());
                this.ready = true;
            }
            else {
                loadBackground(defaultBg);
                this.ready = true;
            }
        }
        else loadBackground(defaultBg);
    }
    createSlider(hit) {
        hit.nextRepeat = 1;
        hit.nexttick = 0;
        hit.body = new SliderMesh(hit.curve, hit.combo % this.track.colors.length);
        hit.body.alpha = 0;
        hit.body.depth = 5 - .000001 * hit.hitIndex;
        hit.objects.push(hit.body);

        const newSprite = (spritename, x, y, scalemul = 1, isReverse) => {
            const sprite = new PIXI.Sprite(skin[spritename]);
            sprite.scale.set(this.hitSpriteScale * scalemul);
            sprite.anchor.set(.5);
            sprite.x = x;
            sprite.y = y;
            sprite.depth = (isReverse ? 7 : 5) - .000001 * hit.hitIndex;
            sprite.alpha = 0;
            hit.objects.push(sprite);
            return sprite;
        };
        const tickDuration = hit.timing.beatMs / this.track.difficulty.SliderTickRate, nticks = Math.ceil(hit.sliderTimeTotal / tickDuration);

        if (!hit.timing.isNaN) for (let i = 0; i < nticks; ++i) {
            const t = hit.time + i * tickDuration, pos = repeatclamp(i * tickDuration / hit.sliderTime);
            if (Math.min(pos, 1 - pos) * hit.sliderTime <= 10) continue;
            const at = hit.curve.pointAt(pos);

            const lastTick = hit.ticks[hit.ticks.push(newSprite('sliderscorepoint.png', at.x, at.y)) - 1];
            lastTick.appeartime = t - 2 * tickDuration;
            lastTick.time = t;
            lastTick.result = false;
        }
        if (hit.repeat > 1) {
            const p = hit.curve.pointAt(1), p2 = hit.curve.pointAt(.999999);
            hit.reverse = newSprite('reversearrow.png', p.x, p.y, .36, true);
            hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
        }
        if (hit.repeat > 2) {
            const p2 = hit.curve.pointAt(.000001);
            hit.reverse_b = newSprite('reversearrow.png', hit.x, hit.y, .36, true);
            hit.reverse_b.rotation = Math.atan2(p2.y - hit.y, p2.x - hit.x);
            hit.reverse_b.visible = false;
        }

        hit.follow = newSprite('sliderfollowcircle.png', hit.x, hit.y);
        hit.follow.visible = false;
        hit.follow.blendMode = PIXI.BLEND_MODES.ADD;
        hit.followSize = 1;

        hit.ball = newSprite('sliderb.png', hit.x, hit.y, .5);
        hit.ball.visible = false;
        this.createHitCircle(hit);

        const v = hit.repeat % 2 === 1 ? hit.curve.pointAt(1) : hit;
        hit.judgements.push(this.createJudgement(v.x, v.y, 4, hit.time + hit.sliderTimeTotal + this.GoodTime));
    }
    createSpinner(hit) {
        hit.approachTime = this.spinnerAppearTime + this.spinnerZoomInTime;
        hit.x = 256;
        hit.y = 192;
        hit.rotation = 0;
        hit.rotationProgress = 0;
        hit.clicked = false;
        hit.clearRotations = (1.5 * this.OD < 5 ? 3 + .4 * this.OD : 2.5 + .5 * this.OD) / this.speed * Math.PI * (hit.endTime - hit.time) / 1000;
        hit.rotationProgress = hit.clearRotations < Math.PI * 2 ? Number.MAX_SAFE_INTEGER : 0;

        function newsprite(spritename) {
            const sprite = new PIXI.Sprite(skin[spritename]);
            sprite.anchor.set(.5);
            sprite.x = hit.x;
            sprite.y = hit.y;
            sprite.depth = 5 - .000001 * (hit.hitIndex || 1);
            sprite.alpha = 0;
            hit.objects.push(sprite);
            return sprite;
        }
        hit.base = newsprite('spinnerbase.png');
        hit.progress = newsprite('spinnerprogress.png');
        hit.top = newsprite('spinnertop.png');
        if (game.hidden) {
            hit.progress.visible = false;
            hit.base.visible = false;
        }
        hit.judgements.push(this.createJudgement(hit.x, hit.y, 4, hit.endTime + 233));
    }
    createFollowPoint(prevHit, hit) {
        let x1 = prevHit.x, y1 = prevHit.y, t1 = prevHit.time;
        if (prevHit.type === 'slider') {
            t1 += prevHit.sliderTimeTotal;
            if (prevHit.repeat % 2 === 1) {
                const pt = prevHit.curve.pointAt(1);
                x1 = pt.x;
                y1 = pt.y;
            }
        }

        const container = new PIXI.Container;
        container.depth = 3;
        container.x1 = x1;
        container.y1 = y1;
        container.t1 = t1;
        container.dx = hit.x - x1;
        container.dy = hit.y - y1;
        container.dt = hit.time - t1;
        container.preempt = this.approachTime;
        container.hit = hit;
        hit.objects.push(container);
        if (!game.hideFollow) hit.followPoints = container;

        const spacing = 34, rotation = Math.atan2(container.dy, container.dx), distance = Math.floor(Math.hypot(container.dx, container.dy));

        for (let d = spacing * 1.5; d < distance - spacing; d += spacing) {
            const frac = d / distance, p = new PIXI.Sprite(skin['followpoint.png']);
            p.scale.set(this.hitSpriteScale * .4, this.hitSpriteScale * .3);
            p.x = x1 + container.dx * frac;
            p.y = y1 + container.dy * frac;
            p.blendMode = PIXI.BLEND_MODES.ADD;
            p.rotation = rotation;
            p.anchor.set(.5);
            p.alpha = 0;
            p.fraction = frac;
            container.addChild(p);
        }
    }
    playTicksound(hit, time) {
        while (this.curtimingid + 1 < this.track.timing.length && this.track.timing[this.curtimingid + 1].offset <= time) ++this.curtimingid;
        while (this.curtimingid > 0 && this.track.timing[this.curtimingid].offset > time) --this.curtimingid;
        const timing = this.track.timing[this.curtimingid], defaultSet = hit.hitSample.normalSet || timing.sampleSet || game.sampleSet;
        game.sample[defaultSet].slidertick.volume = game.masterVolume * game.effectVolume * timing.volume / 100;
        game.sample[defaultSet].slidertick.play();
    }
    playHitsound(hit, id, time) {
        while (this.curtimingid + 1 < this.track.timing.length && this.track.timing[this.curtimingid + 1].offset <= time) ++this.curtimingid;
        while (this.curtimingid > 0 && this.track.timing[this.curtimingid].offset > time) --this.curtimingid;
        const timing = this.track.timing[this.curtimingid],
            volume = game.masterVolume * game.effectVolume * timing.volume / 100,
            defaultSet = timing.sampleSet || game.sampleSet;

        function playHit(bitmask, normalSet, additionSet) {
            const normal = game.sample[normalSet].hitnormal;
            normal.volume = volume;
            normal.play();

            const addition = game.sample[additionSet];
            if (bitmask & 2) {
                const whistle = addition.hitwhistle;
                whistle.volume = volume;
                whistle.play();
            }
            if (bitmask & 4) {
                const finish = addition.hitfinish;
                finish.volume = volume;
                finish.play();
            }
            if (bitmask & 8) {
                const clap = addition.hitclap;
                clap.volume = volume;
                clap.play();
            }
        }
        if (hit.type === 'circle' || hit.type === 'spinner') {
            const normalSet = hit.hitSample.normalSet || defaultSet, additionSet = hit.hitSample.additionSet || normalSet;
            playHit(hit.hitSound, normalSet, additionSet);
        }
        else if (hit.type === 'slider') {
            const edgeSet = hit.edgeSets[id], normalSet = edgeSet.normalSet || defaultSet, additionSet = edgeSet.additionSet || normalSet;
            playHit(hit.edgeHitsounds[id], normalSet, additionSet);
        }
    }
    hitSuccess(hit, points, time) {
        this.scoreOverlay.hit(points, 300, time);
        if (points > 0) {
            if (hit.type === 'spinner') this.playHitsound(hit, 0, hit.endTime);
            else {
                this.playHitsound(hit, 0, hit.time);
                this.errorMeter.hit(time - hit.time, time);
            }
            if (hit.type === 'slider') hit.judgements.at(-1).defaultScore = 50;
        }

        hit.score = points;
        hit.clickTime = time;
        this.invokeJudgement(hit.judgements[0], points, time);
    }
    updateUpcoming(time) {
        while (this.waitinghitid < this.hits.length && this.hits[this.waitinghitid].endTime < time) ++this.waitinghitid;
        const findindex = i => {
            let l = 0, r = this.gamefield.children.length;
            while (l + 1 < r) {
                const m = Math.floor((l + r) / 2) - 1;
                if ((this.gamefield.children[m].depth || 0) < i) l = m + 1;
                else r = m + 1;
            }
            return l;
        };
        while (this.current < this.hits.length && this.futuremost < time + 3000) {
            const hit = this.hits[this.current++];
            for (let i = hit.judgements.length - 1; i >= 0; --i) {
                const judge = hit.judgements[i];
                this.gamefield.addChildAt(judge, findindex(judge.depth || 0));
            }
            for (let i = hit.objects.length - 1; i >= 0; --i) {
                const obj = hit.objects[i];
                this.gamefield.addChildAt(obj, findindex(obj.depth || 0));
            }
            this.newHits.push(hit);
            if (hit.time > this.futuremost) this.futuremost = hit.time;
        }
        for (let i = 0; i < this.newHits.length; ++i) {
            const hit = this.newHits[i];
            let despawn = -1500;
            if (hit.type === 'slider') despawn -= hit.sliderTimeTotal;
            else if (hit.type === 'spinner') despawn -= hit.endTime - hit.time;

            if (hit.time - time < despawn) {
                PIXI.utils.removeItems(this.newHits, i--, 1);
                hit.objects.forEach(this.destroyHit);
                hit.judgements.forEach(this.destroyHit);
                hit.destroyed = true;
            }
        }
    }
    updateFollowPoints(f, time) {
        for (const o of f.children) {
            const startx = f.x1 + (o.fraction - .1) * f.dx, starty = f.y1 + (o.fraction - .1) * f.dy, fadeOutTime = f.t1 + o.fraction * f.dt, fadeInTime = fadeOutTime - f.preempt, hitFadeIn = f.hit.objectFadeInTime;
            let relpos = clamp01((time - fadeInTime) / hitFadeIn);

            relpos *= 2 - relpos;
            o.x = startx + ((f.x1 + o.fraction * f.dx) - startx) * relpos;
            o.y = starty + ((f.y1 + o.fraction * f.dy) - starty) * relpos;
            o.alpha = .5 * (time < fadeOutTime ? clamp01((time - fadeInTime) / hitFadeIn) : 1 - clamp01((time - fadeOutTime) / hitFadeIn));
        }
    }
    updateHitCircle(hit, time) {
        if (hit.followPoints) this.updateFollowPoints(hit.followPoints, time);
        const diff = hit.time - time, opaque = this.approachTime - this.approachFadeInTime;

        if (diff <= this.approachTime && diff > 0) hit.approach.scale.set(.5 * this.hitSpriteScale * (diff / this.approachTime * this.approachScale + 1));
        else hit.approach.scale.set(.5 * this.hitSpriteScale);

        if (diff <= this.approachTime && diff > opaque) hit.approach.alpha = (this.approachTime - diff) / this.approachFadeInTime;
        else if (diff <= opaque && hit.score < 0) hit.approach.alpha = 1;
        const noteFullAppear = this.approachTime - hit.objectFadeInTime;

        const setcircleAlpha = alpha => {
            hit.base.alpha = alpha;
            hit.circle.alpha = alpha;
            for (const digit of hit.numbers) digit.alpha = alpha;
            hit.glow.alpha = alpha * this.glowMaxOpacity;
        };

        if (diff <= this.approachTime && diff > noteFullAppear) setcircleAlpha((this.approachTime - diff) / hit.objectFadeInTime);
        else if (diff <= noteFullAppear) {
            if (-diff > hit.objectFadeOutOffset) {
                const timeAfter = -diff - hit.objectFadeOutOffset;
                setcircleAlpha(clamp01(1 - timeAfter / hit.circleFadeOutTime));
                hit.approach.alpha = clamp01(1 - timeAfter / 50);
            }
            else setcircleAlpha(1);
        }
        if (hit.score > 0 && hit.enableflash) {
            hit.burst.visible = true;
            const timeAfter = time - hit.clickTime, t = timeAfter / this.glowFadeOutTime, newscale = 1 + .5 * t * (2 - t);

            hit.burst.scale.set(newscale * hit.burst.initialscale);
            hit.glow.scale.set(newscale * hit.glow.initialscale);
            hit.burst.alpha = .8 * clamp01(timeAfter < this.flashFadeInTime ? timeAfter / this.flashFadeInTime : 1 - (timeAfter - this.flashFadeInTime) / 120);
            hit.glow.alpha = clamp01(1 - timeAfter / this.glowFadeOutTime) * this.glowMaxOpacity;

            if (hit.base.visible) {
                if (timeAfter < this.flashFadeInTime) {
                    hit.base.scale.set(newscale * hit.base.initialscale);
                    hit.circle.scale.set(newscale * hit.circle.initialscale);
                    for (const digit of hit.numbers) digit.scale.set(newscale * digit.initialscale);
                }
                else {
                    hit.base.visible = false;
                    hit.circle.visible = false;
                    for (const digit of hit.numbers) digit.visible = false;
                    hit.approach.visible = false;
                }
            }
        }
        this.updateJudgement(hit.judgements[0], time);
    }
    updateSlider(hit, time) {
        this.updateHitCircle(hit, time);
        const noteFullAppear = this.approachTime - hit.objectFadeInTime;
        hit.body.startt = 0;
        hit.body.endt = 1;

        function setbodyAlpha(alpha) {
            hit.body.alpha = alpha;
            for (const tick of hit.ticks) tick.alpha = alpha;
        }
        const diff = hit.time - time;
        if (diff <= this.approachTime && diff > noteFullAppear) {
            setbodyAlpha((this.approachTime - diff) / hit.objectFadeInTime);
            if (hit.reverse) hit.reverse.alpha = hit.body.alpha;
            if (hit.reverse_b) hit.reverse_b.alpha = hit.body.alpha;
        }
        else if (diff <= noteFullAppear) {
            if (-diff > hit.fadeOutOffset) {
                const t = clamp01((-diff - hit.fadeOutOffset) / hit.fadeOutDuration);
                setbodyAlpha(1 - t * (2 - t));
            }
            else {
                setbodyAlpha(1);
                if (hit.reverse) hit.reverse.alpha = 1;
                if (hit.reverse_b) hit.reverse_b.alpha = 1;
            }
        }
        if (game.snakein) {
            if (diff > 0) {
                const t = clamp01((time - hit.time + this.approachTime) / this.approachTime * 3);
                hit.body.endt = t;
                if (hit.reverse) {
                    const p = hit.curve.pointAt(t);
                    hit.reverse.x = p.x;
                    hit.reverse.y = p.y;

                    if (t < .5) {
                        const p2 = hit.curve.pointAt(t + .000001);
                        hit.reverse.rotation = Math.atan2(p.y - p2.y, p.x - p2.x);
                    }
                    else {
                        const p2 = hit.curve.pointAt(t - .000001);
                        hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                    }
                }
            }
        }
        function resizeFollow(hit, time, dir) {
            if (!hit.followLasttime) hit.followLasttime = time;
            if (!hit.followLinearSize) hit.followLinearSize = 1;
            hit.followLinearSize = Math.max(1, Math.min(2.2, hit.followLinearSize + (time - hit.followLasttime) * dir));
            hit.followSize = hit.followLinearSize;
            hit.followLasttime = time;
        }
        if (-diff >= 0 && -diff <= hit.fadeOutDuration + hit.sliderTimeTotal) {
            let t = -diff / hit.sliderTime;
            const curRep = Math.floor(t);
            hit.currentRepeat = Math.min(Math.ceil(t), hit.repeat);

            t = repeatclamp(Math.min(t, hit.repeat));
            const at = hit.curve.pointAt(t);

            hit.follow.x = at.x;
            hit.follow.y = at.y;
            hit.ball.x = at.x;
            hit.ball.y = at.y;

            if (!game.autoplay) {
                const dx = game.mouseX - at.x, dy = game.mouseY - at.y, followpx = hit.followSize * this.circleRadius / 1.8;
                var isfollowing = dx * dx + dy * dy <= followpx * followpx;

                if (!isfollowing) {
                    const predict = this.player.mouse(this.realtime), dx1 = predict.x - at.x, dy1 = predict.y - at.y, laxRad = followpx + predict.r;
                    isfollowing = dx1 * dx1 + dy1 * dy1 <= laxRad * laxRad;
                }
            }
            const activated = game.autoplay || (game.down && isfollowing);

            for (; hit.nexttick < hit.ticks.length; ++hit.nexttick) {
                const currentTick = hit.ticks[hit.nexttick];
                if (currentTick.time > time) break;

                if (!currentTick.result) {
                    if (activated) {
                        currentTick.result = true;
                        this.playTicksound(hit, currentTick.time);
                        hit.judgements.at(-1).defaultScore = 50;
                    }
                    this.scoreOverlay.hit(activated ? 10 : 0, 10, currentTick.time);
                }
            }
            for (let hsPlayed = 0; hit.nextRepeat < hit.repeat; ++hit.nextRepeat) {
                const currentRep = hit.repeats[hit.nextRepeat - 1];
                if (currentRep.time > time) break;

                if (!currentRep.result) {
                    if (activated) {
                        currentRep.result = true;
                        if (++hsPlayed < 20) {
                            this.playHitsound(hit, hit.nextRepeat, currentRep.time);
                            hit.judgements.at(-1).defaultScore = 50;
                        }
                    }
                    this.scoreOverlay.hit(activated ? 30 : 0, 30, currentRep.time);
                }
            }
            if (curRep === hit.repeat && activated && !hit.scoredSliderEnd) {
                hit.scoredSliderEnd = hit.time + hit.sliderTimeTotal;
                this.invokeJudgement(hit.judgements.at(-1), 300, hit.scoredSliderEnd);
                this.scoreOverlay.hit(300, 300, hit.scoredSliderEnd);
                this.playHitsound(hit, hit.repeat, hit.scoredSliderEnd);
            }
            if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
                hit.ball.visible = true;
                hit.ball.alpha = 1;
                hit.follow.visible = true;
                resizeFollow(hit, time, (activated ? 1 : -1) / this.followZoomInTime);
                hit.follow.scale.x = hit.follow.scale.y = hit.followSize * .45 * this.hitSpriteScale;
                hit.follow.alpha = hit.followSize - 1;
            }

            const timeAfter = -diff - hit.sliderTimeTotal;
            if (timeAfter > 0) {
                resizeFollow(hit, time, -1 / this.followZoomInTime);
                hit.follow.scale.x = hit.follow.scale.y = hit.followSize * .45 * this.hitSpriteScale;
                hit.follow.alpha = hit.followSize - 1;
                hit.ball.alpha = fadeOutEasing(timeAfter / this.ballFadeOutTime);
                hit.ball.scale.x = hit.ball.scale.y = (1 + .15 * timeAfter / this.ballFadeOutTime) * .5 * this.hitSpriteScale;
            }
            if (hit.repeat > 1) {
                hit.reverse.visible = hit.currentRepeat < hit.repeat - hit.repeat % 2;
                if (hit.reverse_b) hit.reverse_b.visible = hit.currentRepeat < hit.repeat - 1 + hit.repeat % 2;
            }
            if (game.snakeout && hit.currentRepeat === hit.repeat) {
                if (hit.repeat % 2 === 1) {
                    hit.body.startt = t;
                    hit.body.endt = 1;
                }
                else {
                    hit.body.startt = 0;
                    hit.body.endt = t;
                }
            }
        };
        for (const tick of hit.ticks) {
            if (time < tick.appeartime) {
                const dt = (tick.appeartime - time) / 500;
                tick.alpha *= clamp01(1 - dt);
                tick.scale.set(this.hitSpriteScale / 2 * (.5 + clamp01((1 - dt) * (1 + dt)) / 2));
            }
            else tick.scale.set(this.hitSpriteScale / 2);

            if (time >= tick.time) {
                const dt = (time - tick.time) / 150;
                if (tick.result) {
                    tick.alpha *= clamp01(-((dt - 1) ** 5));
                    tick.scale.set(.5 * this.hitSpriteScale * (1 + dt / 2 * (2 - dt)));
                }
                else {
                    tick.alpha *= clamp01(1 - dt);
                    tick.tint = colorLerp(0xffffff, 0xff0000, clamp01(dt * 2));
                }
            }
        }
        for (const judge of hit.judgements) this.updateJudgement(judge, time);
    }
    updateSpinner(hit, time) {
        if (time >= hit.time && time <= hit.endTime) {
            if (game.down && !game.paused) {
                const mouseAngle = Math.atan2(game.mouseY - hit.y, game.mouseX - hit.x);
                if (!hit.clicked) hit.clicked = true;
                else {
                    let delta = mouseAngle - hit.lastAngle;
                    if (delta > Math.PI) delta -= Math.PI * 2;
                    if (delta < -Math.PI) delta += Math.PI * 2;
                    hit.rotation += delta;
                    hit.rotationProgress += Math.abs(delta);
                }
                hit.lastAngle = mouseAngle;
            }
            else hit.clicked = false;
        }
        let alpha = 0;
        if (time >= hit.time - this.spinnerZoomInTime - this.spinnerAppearTime) {
            if (time <= hit.endTime) alpha = 1;
            else alpha = clamp01(1 - (time - hit.endTime) / 150);
        }
        hit.top.alpha = alpha;
        hit.progress.alpha = alpha;
        hit.base.alpha = alpha;

        if (time < hit.endTime) {
            hit.top.scale.set(.3 * clamp01((time - (hit.time - this.spinnerZoomInTime - this.spinnerAppearTime)) / this.spinnerZoomInTime));
            hit.base.scale.set(.6 * clamp01((time - (hit.time - this.spinnerZoomInTime)) / this.spinnerZoomInTime));
        }
        if (time < hit.time) {
            const t = (hit.time - time) / (this.spinnerZoomInTime + this.spinnerAppearTime);
            if (t <= 1) hit.top.rotation = -t * t * 10;
        }

        const progress = hit.rotationProgress / hit.clearRotations;
        if (time > hit.time) {
            hit.base.rotation = hit.rotation / 2;
            hit.top.rotation = hit.rotation / 2;
            hit.progress.scale.set(.6 * (.13 + .87 * clamp01(progress)));
        }
        else hit.progress.scale.set(0);

        if (time >= hit.endTime) {
            if (hit.score < 0) {
                if (game.autoplay) this.hitSuccess(hit, 300, hit.endTime);
                else {
                    let points = 0;
                    if (progress >= 1) points = 300;
                    else if (progress >= .9) points = 100;
                    else if (progress >= .25) points = 50;

                    this.hitSuccess(hit, points, hit.endTime);
                }
            }
        }
        this.updateJudgement(hit.judgements[0], time);
    }
    updateHitObjects(time) {
        this.updateUpcoming(time);
        for (let i = this.newHits.length - 1; i >= 0; --i) {
            const hit = this.newHits[i];
            switch (hit.type) {
                case 'circle': this.updateHitCircle(hit, time); break;
                case 'slider': this.updateSlider(hit, time); break;
                case 'spinner': this.updateSpinner(hit, time); break;
            }
        }
    }
    updateBackground(time) {
        if (!this.background) return;
        let fade = game.backgroundDimRate;
        if (time < -this.wait) fade *= Math.max(0, 1 - (-this.wait - time) / this.backgroundFadeTime);
        this.background.tint = colorLerp(0xffffff, 0, fade);
    }
    render(frame, timestamp) {
        if (this.audioReady) {
            this.realtime = timestamp;
            this.activeTime = frame;
            var time = this.osu.audio.pos * 1000 + game.globalOffset;

            for (let i = this.breakIndex; i < this.track.breaks.length; ++i) {
                const b = this.track.breaks[i];
                if (time >= b.startTime && time <= b.endTime) {
                    var breakEnd = b.endTime;
                    this.breakIndex = i;
                    break;
                }
            }

            if (breakEnd) this.breakOverlay.countdown(breakEnd, time);
            else if (time < this.skipTime) this.breakOverlay.countdown(this.skipTime, time);
            else this.breakOverlay.visible = false;

            this.updateHitObjects(time);
            if (game.autoplay) this.player.update(time);
            this.updateBackground(time);
            this.scoreOverlay.update(time);
            this.progressOverlay.update(time);
            this.errorMeter.update(time);
        }
        else this.updateBackground(-100000);

        this.volumeMenu.update(timestamp);
        this.loadingMenu.update(timestamp);
        if (time > this.endTime) {
            if (!this.ended) {
                this.ended = true;
                this.pause = () => { };
                this.scoreOverlay.visible = false;
                this.scoreOverlay.showSummary(this.track.metadata, this.errorMeter.record, this);
            }
            this.background.tint = 0xffffff;
        }
    }
    destroy() {
        for (const hit of this.hits) if (!hit.destroyed) {
            hit.objects.forEach(this.destroyHit);
            hit.judgements.forEach(this.destroyHit);
            hit.destroyed = true;
        }

        const opt = {
            children: true
        };
        this.scoreOverlay.destroy(opt);
        this.errorMeter.destroy(opt);
        this.loadingMenu.destroy(opt);
        this.volumeMenu.destroy(opt);
        this.breakOverlay.destroy(opt);
        this.progressOverlay.destroy(opt);
        this.gamefield.destroy(opt);
        this.background.destroy({
            children: true, texture: true, baseTexture: true
        });
        SliderMesh.prototype.deallocate();

        window.onresize = null;
        window.removeEventListener('blur', this.blurCallback);
        window.removeEventListener('wheel', this.volumeCallback);
        window.removeEventListener('keyup', this.pauseCallback);
        window.removeEventListener('keydown', this.skipCallback);

        if (!game.autoplay) this.player.cleanup();
    }
    start() {
        this.started = true;
        this.skipped = false;
        this.osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
        this.osu.audio.speed = this.speed;
        this.osu.audio.play(this.backgroundFadeTime + this.wait);
    }
    retry() {
        if (!game.paused) {
            this.osu.audio.pause();
            game.paused = true;
        }
        this.destroy();
        stopGame(true);
    }
    quit() {
        if (!game.paused) {
            this.osu.audio.pause();
            game.paused = true;
        }
        this.destroy();
        stopGame();
    }
    skip() {
        if (this.started && this.osu.audio.seek(this.skipTime / 1000)) this.skipped = true;
    }
}