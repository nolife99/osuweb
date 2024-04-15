'use strict';

import { game, skin, app, stopGame } from './main.js';
import Player from './player.js';
import ScoreOverlay from './ui/score.js';
import VolumeMenu from './ui/volume.js';
import LoadingMenu from './ui/loading.js';
import BreakOverlay from './ui/break.js';
import ProgressOverlay from './ui/progress.js';
import ErrorMeterOverlay from './ui/errorMeter.js';
import SliderMesh from './ui/sliderMesh.js';
import CircleApproximator from './math/CircleApproximator.js';
import BezierApproximator from './math/BezierApproximator.js';

const glowFadeOut = 350, flashFadeIn = 40, defaultBg = 'asset/skin/defaultbg.jpg',
    followZoomInTime = 100, ballFadeOutTime = 100, bgFadeTime = 800, spinnerInTime = 300,
    clamp01 = num => Math.min(Math.max(num, 0), 1), lerp = (a, b, t) => a + (b - a) * t,
    colorLerp = (rgb1, rgb2, t) => lerp(rgb1 >> 16, rgb2 >> 16, t) << 16 |
        lerp((rgb1 >> 8) & 255, (rgb2 >> 8) & 255, t) << 8 | lerp(rgb1 & 255, rgb2 & 255, t);

function repeatclamp(a) {
    a %= 2;
    return a > 1 ? 2 - a : a;
}
function findindex(i, children) {
    let l = 0, r = children.length;
    while (l + 1 < r) {
        let m = Math.floor((l + r) / 2) - 1;
        if ((children[m++].zIndex || 0) < i) l = m;
        else r = m;
    }
    return l;
}

export default class Playback {
    ready = true;
    newHits = [];
    volumeMenu = new VolumeMenu({
        width: window.innerWidth, height: window.innerHeight
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
    timingId = 0;
    current = 0;
    breakIndex = 0;

    constructor(osu, track) {
        this.osu = osu;
        this.track = track;
        this.speed = game.nightcore ? 1.5 : game.daycore ? .75 : 1;

        game.mouseX = 256;
        game.mouseY = 192;

        this.loadingMenu = new LoadingMenu({
            width: window.innerWidth, height: window.innerHeight
        }, track);
        this.calcSize();

        this.createBackground();
        app.stage.addChild(this.gamefield);
        app.stage.addChild(this.volumeMenu);
        app.stage.addChild(this.loadingMenu);

        this.endTime = track.hitObjects.at(-1).endTime + 1500;
        this.wait = Math.max(0, bgFadeTime - track.hitObjects[0].time);
        this.skipTime = track.hitObjects[0].time - 2000;

        osu.onready = () => {
            this.errorMeter = new ErrorMeterOverlay({
                width: window.innerWidth, height: window.innerHeight
            }, this.GreatTime, this.GoodTime, this.MehTime);
            this.progOverlay = new ProgressOverlay({
                width: window.innerWidth, height: window.innerHeight
            }, track.hitObjects[0].time, track.hitObjects.at(-1).endTime);
            this.breakOverlay = new BreakOverlay({
                width: window.innerWidth, height: window.innerHeight
            });
            this.scoreOverlay = new ScoreOverlay({
                width: window.innerWidth, height: window.innerHeight
            }, this.HP, scoreMult);
            loadTask.then(() => {
                app.stage.addChild(this.scoreOverlay);
                app.stage.addChild(this.errorMeter);
                app.stage.addChild(this.progOverlay);
                app.stage.addChild(this.breakOverlay);

                this.loadingMenu.hide();
                this.osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
                this.osu.audio.speed = this.speed;
                this.osu.audio.play(bgFadeTime + this.wait);
                this.started = true;
            });
        };
        window.onresize = () => {
            app.renderer.resize(window.innerWidth, window.innerHeight);
            this.calcSize();

            this.loadingMenu.resize({
                width: window.innerWidth, height: window.innerHeight
            });
            this.volumeMenu.resize({
                width: window.innerWidth, height: window.innerHeight
            });
            if (this.started) {
                this.scoreOverlay.resize({
                    width: window.innerWidth, height: window.innerHeight
                });
                this.errorMeter.resize({
                    width: window.innerWidth, height: window.innerHeight
                });
                this.breakOverlay.resize({
                    width: window.innerWidth, height: window.innerHeight
                });
                this.progOverlay.resize({
                    width: window.innerWidth, height: window.innerHeight
                });
            }
            if (this.bg && this.bg.texture) {
                this.bg.x = window.innerWidth / 2;
                this.bg.y = window.innerHeight / 2;
                this.bg.scale.set(Math.max(window.innerWidth / this.bg.texture.width, window.innerHeight / this.bg.texture.height));
            }
            SliderMesh.resetTransform(
                2 * this.gfx.width / window.innerWidth / 512, -2 * this.gfx.height / window.innerHeight / 384,
                2 * this.gfx.xoffset / window.innerWidth - 1, 1 - 2 * this.gfx.yoffset / window.innerHeight);
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
        this.hitScale = this.circleRadius / 128;

        this.MehTime = 200 - 10 * this.OD;
        this.GoodTime = 140 - 8 * this.OD;
        this.GreatTime = 80 - 6 * this.OD;

        this.approachTime = this.AR <= 5 ? 1800 - 120 * this.AR : 1950 - 150 * this.AR;
        this.approachFade = Math.min(800, this.approachTime);

        this.player = new Player(this);
        game.paused = false;

        this.pauseEv = e => {
            if (e.code === 'Escape') {
                if (!game.paused) this.pause();
                else this.resume();
            }
        };
        this.blurEv = () => {
            if (this.started) this.pause();
        };
        this.skipEv = e => {
            if (e.code === 'Space' && !game.paused && !this.skipped && this.started && this.osu.audio.seek(this.skipTime / 1000)) this.skipped = true;
        };
        if (game.allowMouseScroll) {
            this.volumeEv = e => {
                if (!osu.audio) return;
                game.masterVolume = clamp01(game.masterVolume - e.deltaY * .002);
                osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
                this.volumeMenu.set(game.masterVolume * 100);
            };
            window.addEventListener('wheel', this.volumeEv);
        }
        window.addEventListener('blur', this.blurEv);
        window.addEventListener('keydown', this.skipEv);
        window.addEventListener('keyup', this.pauseEv);

        const loadTask = Promise.all(track.hitObjects.map(a => {
            const hit = structuredClone(a);
            if (game.hidden && hit.hitIndex > 0) {
                hit.objFadeIn = .4 * this.approachTime;
                hit.objFadeOut = -.6 * this.approachTime;
                hit.circFadeOut = .3 * this.approachTime;

                if (hit.type === 'slider') {
                    hit.fadeOutOffset = -.6 * this.approachTime;
                    hit.fadeOutTime = hit.sliderTimeTotal - hit.fadeOutOffset;
                }
            }
            else {
                hit.enableflash = true;
                hit.objFadeIn = Math.min(400, this.approachTime);
                hit.circFadeOut = 100;
                hit.objFadeOut = this.MehTime;

                if (hit.type === 'slider') {
                    hit.fadeOutOffset = hit.sliderTimeTotal;
                    hit.fadeOutTime = 300;
                }
            }
            return new Promise(resolve => window.setTimeout(() => {
                if (game.hardrock) {
                    hit.y = 384 - hit.y;
                    if (hit.type === 'slider') for (const k of hit.keyframes) k.y = 384 - k.y;
                }
                if (hit.type === 'slider') {
                    if (hit.sliderType === 'P') {
                        hit.curve = CircleApproximator(hit);
                        if (!hit.curve) {
                            a.sliderType === 'L';
                            hit.sliderType === 'L';
                            hit.curve = new BezierApproximator(hit, true);
                        }
                    }
                    else hit.curve = new BezierApproximator(hit, hit.sliderType === 'L');
                }
                resolve(hit);
            }));
        })).then(hits => {
            function getdist(A, B, useEnd) {
                let x = A.x, y = A.y;
                if (useEnd) {
                    const pt = A.curve.pointAt(1);
                    x = pt.x;
                    y = pt.y;
                }
                return (x - B.x) ** 2 + (y - B.y) ** 2;
            }
            const lazyStack = 9, stackOfs = (1 - .7 * ((this.CS - 5) / 5)) * -3.2;

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
            this.hits.counter = 0;

            SliderMesh.initialize(track.colors, this.circleRadius / 2.1, {
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

                    if (hit.type === "slider") {
                        for (const k of hit.keyframes) {
                            k.x += ofs;
                            k.y += ofs;
                        }
                        if (hit.sliderType === 'P') hit.curve = CircleApproximator(hit);
                        else hit.curve = new BezierApproximator(hit, hit.sliderType === 'L');
                    }
                }
                hit.ticks = [];
                hit.objects = [];
                hit.judges = [];
                hit.score = -1;

                const newHitSprite = (path, zIndex, scale = 1, anchorx = .5, anchory = .5) => {
                    const sprite = new PIXI.Sprite(skin[path]);
                    sprite.firstScale = this.hitScale * scale;
                    sprite.scale.x = sprite.scale.y = sprite.firstScale;
                    sprite.anchor.x = anchorx;
                    sprite.anchor.y = anchory;
                    sprite.x = hit.x;
                    sprite.y = hit.y;
                    sprite.zIndex = zIndex;
                    sprite.alpha = 0;
                    hit.objects.push(sprite);
                    return sprite;
                }, createHitCircle = () => {
                    const index = hit.index + 1, basedep = 1 - .000001 * hit.hitIndex;
                    hit.base = newHitSprite('disc.png', basedep, .5);
                    hit.base.tint = this.track.colors[hit.combo % this.track.colors.length];
                    hit.circle = newHitSprite('hitcircleoverlay.png', basedep, .5);

                    hit.glow = newHitSprite('ring-glow.png', 2, .46);
                    hit.glow.tint = this.track.colors[hit.combo % this.track.colors.length];
                    hit.glow.blendMode = PIXI.BLEND_MODES.ADD;

                    hit.burst = newHitSprite('hitburst.png', 2);
                    hit.burst.visible = false;

                    hit.approach = newHitSprite('approachcircle.png', 2);
                    hit.approach.tint = this.track.colors[hit.combo % this.track.colors.length];
                    if (!hit.enableflash) hit.approach.visible = false;

                    hit.judges.push(this.createJudgement(hit.x, hit.y, hit.time + this.MehTime));
                    hit.numbers = [];
                    if (!game.hideNumbers) {
                        if (index < 10) hit.numbers.push(newHitSprite(`score-${index}.png`, basedep, .4, .5, .47));
                        else if (index < 100) {
                            hit.numbers.push(newHitSprite(`score-${index % 10}.png`, basedep, .35, 0, .47));
                            hit.numbers.push(newHitSprite(`score-${(index - index % 10) / 10}.png`, basedep, .35, 1, .47));
                        }
                    }
                }
                switch (hit.type) {
                    case 'circle': createHitCircle(); break;
                    case 'slider': {
                        hit.nextRepeat = 1;
                        hit.nexttick = 0;
                        hit.body = new SliderMesh(hit.curve, hit.combo % this.track.colors.length);
                        hit.body.alpha = 0;
                        hit.body.zIndex = 1 - .000001 * hit.hitIndex;
                        hit.objects.push(hit.body);

                        const newSprite = (path, x, y, scale = 1) => {
                            const sprite = new PIXI.Sprite(skin[path]);
                            sprite.scale.set(this.hitScale * scale);
                            sprite.anchor.set(.5);
                            sprite.x = x;
                            sprite.y = y;
                            sprite.zIndex = 1 - .000001 * hit.hitIndex;
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
                            lastTick.appeartime = hit.time + i * tickDuration / 1.5;
                            lastTick.time = t;
                        }
                        if (hit.repeat > 1) {
                            const p = hit.curve.pointAt(1), p2 = hit.curve.pointAt(.999999);
                            hit.reverse = newSprite('reversearrow.png', p.x, p.y, .36);
                            hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                        }
                        if (hit.repeat > 2) {
                            const p2 = hit.curve.pointAt(.000001);
                            hit.reverse_b = newSprite('reversearrow.png', hit.x, hit.y, .36);
                            hit.reverse_b.rotation = Math.atan2(p2.y - hit.y, p2.x - hit.x);
                            hit.reverse_b.visible = false;
                        }

                        hit.follow = newSprite('sliderfollowcircle.png', hit.x, hit.y);
                        hit.follow.visible = false;
                        hit.follow.blendMode = PIXI.BLEND_MODES.ADD;
                        hit.followSize = 1;

                        hit.ball = newSprite('sliderb.png', hit.x, hit.y, .5);
                        hit.ball.visible = false;
                        createHitCircle();

                        const v = hit.repeat % 2 === 1 ? hit.curve.pointAt(1) : hit;
                        hit.judges.push(this.createJudgement(v.x, v.y, hit.time + hit.sliderTimeTotal + this.GoodTime));
                        break;
                    }
                    case 'spinner': {
                        hit.approachTime = this.approachTime + spinnerInTime;
                        hit.x = 256;
                        hit.y = 192;
                        hit.rotation = 0;
                        hit.spinProg = 0;
                        hit.clicked = false;
                        hit.clearSpin = (1.5 * this.OD < 5 ? 3 + .4 * this.OD : 2.5 + .5 * this.OD) / this.speed * Math.PI * (hit.endTime - hit.time) / 1000;
                        hit.spinProg = hit.clearSpin < Math.PI ? Number.MAX_SAFE_INTEGER : 0;

                        function newsprite(path) {
                            const sprite = new PIXI.Sprite(skin[path]);
                            sprite.anchor.set(.5);
                            sprite.x = hit.x;
                            sprite.y = hit.y;
                            sprite.zIndex = .5;
                            sprite.alpha = 0;
                            hit.objects.push(sprite);
                            return sprite;
                        }
                        hit.base = newsprite('spinnerbase.png');
                        hit.prog = newsprite('spinnerprogress.png');
                        hit.top = newsprite('spinnertop.png');
                        if (game.hidden) {
                            hit.prog.visible = false;
                            hit.base.visible = false;
                        }
                        hit.judges.push(this.createJudgement(hit.x, hit.y, hit.endTime + 233));
                        break;
                    }
                }
                if (!game.hideFollow && prev && hit.type !== 'spinner' && hit.combo === prev.combo) {
                    let x1 = prev.x, y1 = prev.y, t1 = prev.time;
                    if (prev.type === 'slider') {
                        t1 += prev.sliderTimeTotal;
                        if (prev.repeat % 2 === 1) {
                            const pt = prev.curve.pointAt(1);
                            x1 = pt.x;
                            y1 = pt.y;
                        }
                    }

                    const container = new PIXI.Container;
                    container.x1 = x1;
                    container.y1 = y1;
                    container.t1 = t1;
                    container.dx = hit.x - x1;
                    container.dy = hit.y - y1;
                    container.dt = hit.time - t1;
                    container.preempt = this.approachTime;
                    container.hit = hit;
                    hit.objects.push(container);
                    hit.followPoints = container;

                    const spacing = 33, rotation = Math.atan2(container.dy, container.dx), distance = Math.hypot(container.dx, container.dy);
                    for (let d = spacing * 1.5; d < distance - spacing; d += spacing) {
                        const frac = d / distance, p = new PIXI.Sprite(skin['followpoint.png']);
                        p.scale.set(this.hitScale * .4, this.hitScale * .3);
                        p.x = x1 + container.dx * frac;
                        p.y = y1 + container.dy * frac;
                        p.rotation = rotation;
                        p.anchor.set(.5);
                        p.blendMode = PIXI.BLEND_MODES.ADD;
                        p.alpha = 0;
                        p.frac = frac;
                        container.addChild(p);
                    }
                }
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
        document.getElementsByClassName('pause-menu')[0].hidden = true;
        this.osu.audio.play();
        game.paused = false;
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
                menu.hidden = true;
                this.retry();
                game.paused = false;
            };
            quit.onclick = () => {
                menu.hidden = true;
                this.quit();
                game.paused = false;
            };
        }
    }
    createJudgement(x, y, finalTime) {
        const judge = new PIXI.Text(null, {
            fontFamily: 'Venera', fontSize: 20, fill: 0xffffff
        });
        judge.roundPixels = true;
        judge.anchor.set(.5);
        judge.scale.set(this.hitScale);
        judge.visible = false;
        judge.x = x;
        judge.baseY = judge.y = y;
        judge.points = -1;
        judge.finalTime = finalTime;
        judge.defaultScore = 0;
        return judge;
    }
    invokeJudgement(judge, points, time) {
        judge.visible = true;
        judge.points = points;
        judge.t0 = time;

        switch (points) {
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
            judge.width = 16 * this.hitScale * judge.text.length;
            const t5 = (t / 800) ** 5;
            judge.y = judge.baseY + 100 * t5 * this.hitScale;
            judge.rotation = .7 * t5;
        }
        else {
            if (t > 500) {
                judge.visible = false;
                return;
            }
            judge.alpha = t < 100 ? t / 100 : 1 - (t - 100) / 400;
            judge.width = (16 + 8 * ((t / 1800 - 1) ** 5 + 1)) * this.hitScale * judge.text.length;
        }
    }
    createBackground() {
        const loadBg = async (key, uri) => {
            const consumeImage = txt => {
                if (game.backgroundBlurRate > .0001) {
                    const sprite = new PIXI.Sprite(txt);
                    sprite.anchor.set(.5);
                    sprite.x = txt.width / 2;
                    sprite.y = txt.height / 2;

                    const blurstrength = game.backgroundBlurRate * Math.min(txt.width, txt.height);
                    t = Math.max(Math.min(txt.width, txt.height), Math.max(10, blurstrength) * 3);
                    sprite.scale.set(t / (t - 2 * Math.max(10, blurstrength)));

                    const blurFilter = new PIXI.filters.BlurFilter(blurstrength, 14);
                    blurFilter.autoFit = false;
                    sprite.filters = [blurFilter];

                    const texture = PIXI.RenderTexture.create(txt.width, txt.height);
                    app.renderer.render(sprite, {
                        renderTexture: texture
                    });
                    sprite.destroy();
                    this.bg = new PIXI.Sprite(texture);
                    this.bg.renderTexture = texture;
                }
                else this.bg = new PIXI.Sprite(txt);

                this.bg.anchor.set(.5);
                this.bg.x = window.innerWidth / 2;
                this.bg.y = window.innerHeight / 2;
                this.bg.scale.set(Math.max(window.innerWidth / txt.width, window.innerHeight / txt.height));
                app.stage.addChildAt(this.bg, 0);
            }, txt = PIXI.Loader.shared.resources[key];
            
            if (txt.texture) consumeImage(txt.texture);
            else PIXI.Loader.shared.add({
                key: key.toString(), url: uri ? await uri() : defaultBg, loadType: PIXI.LoaderResource.LOAD_TYPE.IMAGE
            }, resource => consumeImage(resource.texture)).load();
        }
        if (this.track.events.length > 0) {
            const ev = this.track.events, file = ev[0][0] === 'Video' ? ev[1][2] : ev[0][2], entry = this.osu.zip.getChildByName(file.slice(1, file.length - 1));
            if (entry) loadBg(entry.id + entry.uncompressedSize, () => entry.getData64URI());
            else loadBg(defaultBg);
        }
        else loadBg(defaultBg);
    }
    playHitsound(hit, id, time) {
        while (this.timingId + 1 < this.track.timing.length && this.track.timing[this.timingId + 1].offset <= time) ++this.timingId;
        while (this.timingId > 0 && this.track.timing[this.timingId].offset > time) --this.timingId;
        const timing = this.track.timing[this.timingId],
            volume = game.masterVolume * game.effectVolume * timing.volume,
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
                if (hit.type === 'slider') hit.judges.at(-1).defaultScore = 50;
            }
        }

        hit.score = points;
        hit.clickTime = time;
        this.invokeJudgement(hit.judges[0], points, time);
    }
    updateHits(time) {
        while (this.current < this.hits.length && this.futuremost < time + this.approachTime) {
            const hit = this.hits[this.current++];
            for (let i = hit.judges.length - 1; i >= 0; --i) {
                const judge = hit.judges[i];
                if (judge.parent) break;

                const children = this.gamefield.children;
                judge.parent = this.gamefield;
                children.splice(findindex(judge.zIndex || 0, children), 0, judge);
            }
            for (let i = hit.objects.length - 1; i >= 0; --i) {
                const obj = hit.objects[i];
                if (obj.parent) break;

                const children = this.gamefield.children;
                obj.parent = this.gamefield;
                children.splice(findindex(obj.zIndex || 0, children), 0, obj);
            }

            this.newHits.push(hit);
            if (hit.time > this.futuremost) this.futuremost = hit.time;
        }
        for (let i = this.newHits.length - 1; i >= 0; --i) {
            const hit = this.newHits[i];
            if (time - hit.endTime > this.MehTime + 800) {
                PIXI.utils.removeItems(this.newHits, i, 1);
                hit.objects.forEach(this.destroyHit);
                hit.judges.forEach(this.destroyHit);
                hit.destroyed = true;
            }
            else {
                const updateHitCircle = isCircle => {
                    const f = hit.followPoints;
                    if (f) for (const o of f.children) {
                        const x = f.x1 + (o.frac - .1) * f.dx, y = f.y1 + (o.frac - .1) * f.dy, fadeOutTime = f.t1 + o.frac * f.dt, fadeInTime = fadeOutTime - f.preempt, hitFadeIn = f.hit.objFadeIn;
                        let relpos = clamp01((time - fadeInTime) / hitFadeIn);

                        relpos *= 2 - relpos;
                        o.x = x + ((f.x1 + o.frac * f.dx) - x) * relpos;
                        o.y = y + ((f.y1 + o.frac * f.dy) - y) * relpos;
                        o.alpha = (time < fadeOutTime ? (time - fadeInTime) / hitFadeIn : 1 - (time - fadeOutTime) / hitFadeIn) / 2;
                    }
                    const diff = hit.time - time, opaque = this.approachTime - this.approachFade;

                    if (diff < this.approachTime && diff > 0) hit.approach.scale.set(this.hitScale * (diff / this.approachTime * 3 + 1) / 2);
                    else hit.approach.scale.set(this.hitScale / 2);

                    if (diff < this.approachTime && diff > opaque) hit.approach.alpha = (this.approachTime - diff) / this.approachFade;
                    else if (diff < opaque && hit.score < 0) hit.approach.alpha = 1;
                    const noteFullAppear = this.approachTime - hit.objFadeIn, setcircleAlpha = alpha => {
                        hit.base.alpha = alpha;
                        hit.circle.alpha = alpha;
                        for (const digit of hit.numbers) digit.alpha = alpha;
                        hit.glow.alpha = alpha / 2;
                    };

                    if (diff < this.approachTime && diff > noteFullAppear) setcircleAlpha((this.approachTime - diff) / hit.objFadeIn);
                    else if (diff < noteFullAppear) {
                        if (-diff > hit.objFadeOut) {
                            const timeAfter = -diff - hit.objFadeOut;
                            setcircleAlpha(1 - timeAfter / hit.circFadeOut);
                            hit.approach.alpha = 1 - timeAfter / 50;
                        }
                        else setcircleAlpha(1);
                    }
                    if (hit.score > 0 && hit.enableflash) {
                        hit.burst.visible = true;
                        const timeAfter = time - hit.clickTime, t = timeAfter / glowFadeOut, size = 1 + t / 2 * (2 - t);

                        hit.burst.scale.set(size * hit.burst.firstScale);
                        hit.glow.scale.set(size * hit.glow.firstScale);
                        hit.burst.alpha = .8 * clamp01(timeAfter < flashFadeIn ? timeAfter / flashFadeIn : 1 - (timeAfter - flashFadeIn) / 120);
                        hit.glow.alpha = clamp01(1 - timeAfter / glowFadeOut) / 2;

                        if (hit.base.visible) {
                            if (timeAfter < flashFadeIn) {
                                hit.base.scale.set(size * hit.base.firstScale);
                                hit.circle.scale.set(size * hit.circle.firstScale);
                                for (const digit of hit.numbers) digit.scale.set(size * digit.firstScale);
                            }
                            else {
                                hit.base.visible = false;
                                hit.circle.visible = false;
                                for (const digit of hit.numbers) digit.visible = false;
                                hit.approach.visible = false;
                            }
                        }
                    }
                    if (isCircle) this.updateJudgement(hit.judges[0], time);
                }
                switch (hit.type) {
                    case 'circle': updateHitCircle(true); break;
                    case 'slider': {
                        updateHitCircle(false);
                        const noteFullAppear = this.approachTime - hit.objFadeIn;
                        hit.body.startt = 0;
                        hit.body.endt = 1;

                        function setbodyAlpha(alpha) {
                            hit.body.alpha = alpha;
                            for (const tick of hit.ticks) tick.alpha = alpha;
                        }
                        const diff = hit.time - time, dAfter = -diff;
                        if (diff < this.approachTime && diff > noteFullAppear) {
                            setbodyAlpha((this.approachTime - diff) / hit.objFadeIn);
                            if (hit.reverse) hit.reverse.alpha = hit.body.alpha;
                            if (hit.reverse_b) hit.reverse_b.alpha = hit.body.alpha;
                        }
                        else if (diff < noteFullAppear) {
                            if (dAfter > hit.fadeOutOffset) {
                                const t = clamp01((dAfter - hit.fadeOutOffset) / hit.fadeOutTime);
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
                        const resizeFollow = dir => {
                            if (!hit.lastFollow) hit.lastFollow = time;
                            if (!hit.followSize) hit.followSize = 1;
                            hit.followSize = Math.max(1, Math.min(2.2, hit.followSize + (time - hit.lastFollow) * dir));
                            hit.lastFollow = time;
                        }
                        if (dAfter >= 0 && dAfter <= hit.fadeOutTime + hit.sliderTimeTotal) {
                            let t = dAfter / hit.sliderTime;
                            hit.currentRepeat = Math.min(Math.ceil(t), hit.repeat);

                            const realT = t;
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
                                        hit.judges.at(-1).defaultScore = 50;

                                        while (this.timingId + 1 < this.track.timing.length && this.track.timing[this.timingId + 1].offset <= currentTick.time) ++this.timingId;
                                        while (this.timingId > 0 && this.track.timing[this.timingId].offset > time) --this.timingId;
                                        const timing = this.track.timing[this.timingId], tickSound = game.sample[hit.hitSample.normalSet || timing.sampleSet || game.sampleSet].slidertick;
                                        tickSound.volume = game.masterVolume * game.effectVolume * timing.volume;
                                        tickSound.play();
                                    }
                                    this.scoreOverlay.hit(activated ? 10 : 0, 10, currentTick.time);
                                }
                            }
                            for (let hsPlayed = 0; hit.nextRepeat < hit.repeat; ++hit.nextRepeat) {
                                const curRep = hit.repeats[hit.nextRepeat - 1];
                                if (curRep.time > time) break;

                                if (!curRep.result) {
                                    if (activated) {
                                        curRep.result = true;
                                        if (++hsPlayed < 20) {
                                            this.playHitsound(hit, hit.nextRepeat, curRep.time);
                                            hit.judges.at(-1).defaultScore = 50;
                                        }
                                    }
                                    this.scoreOverlay.hit(activated ? 30 : 0, 30, curRep.time);
                                }
                            }
                            if (realT > hit.repeat && activated && !hit.scoredSliderEnd) {
                                hit.scoredSliderEnd = hit.time + hit.sliderTimeTotal;
                                this.invokeJudgement(hit.judges.at(-1), 300, hit.scoredSliderEnd);
                                this.scoreOverlay.hit(300, 300, hit.scoredSliderEnd);
                                this.playHitsound(hit, hit.repeat, hit.scoredSliderEnd);
                            }
                            if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
                                hit.ball.visible = true;
                                hit.ball.alpha = 1;
                                hit.follow.visible = true;
                                resizeFollow((activated ? 1 : -1) / followZoomInTime);
                                hit.follow.scale.x = hit.follow.scale.y = hit.followSize * .45 * this.hitScale;
                                hit.follow.alpha = hit.followSize - 1;
                            }

                            const timeAfter = -diff - hit.sliderTimeTotal;
                            if (timeAfter > 0) {
                                resizeFollow(-1 / followZoomInTime);
                                hit.follow.scale.x = hit.follow.scale.y = hit.followSize * .45 * this.hitScale;
                                hit.follow.alpha = hit.followSize - 1;
                                hit.ball.alpha = 1 - timeAfter / ballFadeOutTime;
                                hit.ball.scale.x = hit.ball.scale.y = (1 + .15 * timeAfter / ballFadeOutTime) / 2 * this.hitScale;
                            }
                            if (hit.repeat > 1) {
                                const normal = hit.repeat - hit.repeat % 2;
                                hit.reverse.visible = hit.currentRepeat < normal;
                                if (hit.reverse_b) hit.reverse_b.visible = hit.currentRepeat < normal - 1;
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
                                tick.scale.set(this.hitScale / 2 * (.5 + clamp01((1 - dt) * (1 + dt)) / 2));
                            }
                            else tick.scale.set(this.hitScale / 2);

                            if (time >= tick.time) {
                                const dt = (time - tick.time) / 150;
                                if (tick.result) {
                                    tick.alpha *= clamp01(-((dt - 1) ** 5));
                                    tick.scale.set(.5 * this.hitScale * (1 + dt / 2 * (2 - dt)));
                                }
                                else {
                                    tick.alpha *= clamp01(1 - dt);
                                    tick.tint = colorLerp(0xffffff, 0xff0000, clamp01(dt * 2));
                                }
                            }
                        }
                        for (const judge of hit.judges) this.updateJudgement(judge, time);
                        break;
                    }
                    case 'spinner': {
                        if (time > hit.time && time < hit.endTime) {
                            if (game.down && !game.paused) {
                                const mouseAngle = Math.atan2(game.mouseY - hit.y, game.mouseX - hit.x);
                                if (!hit.clicked) hit.clicked = true;
                                else {
                                    let delta = mouseAngle - hit.lastAngle;
                                    if (delta > Math.PI) delta -= Math.PI * 2;
                                    if (delta < -Math.PI) delta += Math.PI * 2;
                                    hit.rotation += delta;
                                    hit.spinProg += Math.abs(delta);
                                }
                                hit.lastAngle = mouseAngle;
                            }
                            else hit.clicked = false;
                        }
                        let alpha = 0;
                        if (time > hit.time - spinnerInTime - this.approachTime) {
                            if (time < hit.endTime) alpha = 1;
                            else alpha = 1 - (time - hit.endTime) / 150;
                        }
                        hit.top.alpha = alpha;
                        hit.prog.alpha = alpha;
                        hit.base.alpha = alpha;

                        if (time < hit.endTime) {
                            hit.top.scale.set(.3 * clamp01((time - (hit.time - spinnerInTime - this.approachTime)) / spinnerInTime));
                            hit.base.scale.set(.6 * clamp01((time - (hit.time - spinnerInTime)) / spinnerInTime));
                        }
                        if (time < hit.time) {
                            const t = (hit.time - time) / (spinnerInTime + this.approachTime);
                            if (t < 1) hit.top.rotation = -t * t * 10;
                        }

                        const prog = hit.spinProg / hit.clearSpin;
                        if (time > hit.time) {
                            hit.base.rotation = hit.rotation / 2;
                            hit.top.rotation = hit.base.rotation;
                            hit.prog.scale.set(.6 * (.13 + .87 * clamp01(prog)));
                        }
                        else hit.prog.scale.set(0);

                        if (time > hit.endTime) {
                            if (hit.score < 0) {
                                if (game.autoplay) this.hitSuccess(hit, 300, hit.endTime);
                                else {
                                    let points = 0;
                                    if (prog >= 1) points = 300;
                                    else if (prog >= .9) points = 100;
                                    else if (prog >= .25) points = 50;

                                    this.hitSuccess(hit, points, hit.endTime);
                                }
                            }
                        }
                        this.updateJudgement(hit.judges[0], time);
                        break;
                    }
                }
            }
        }
    }
    updateBg(time) {
        if (!this.bg) return;
        let fade = game.backgroundDimRate;
        if (time < -this.wait) fade *= Math.max(0, 1 - (-this.wait - time) / bgFadeTime);
        this.bg.tint = colorLerp(0xffffff, 0, fade);
    }
    render(frame, t) {
        if (this.started && !this.ended) {
            this.realtime = t;
            this.activeTime = frame;

            var time = this.osu.audio.pos * 1000 + game.globalOffset;
            if (!game.paused && this.hits.counter++ % 10 !== 0 && this.audioTick) time += frame - (time - this.audioTick) / this.speed;
            this.audioTick = time;

            for (; this.breakIndex < this.track.breaks.length; ++this.breakIndex) {
                const b = this.track.breaks[this.breakIndex];
                if (time < b.startTime) break;
                else if (time < b.endTime) {
                    var breakEnd = b.endTime;
                    break;
                }
            }

            if (breakEnd) this.breakOverlay.countdown(breakEnd, time);
            else if (time < this.skipTime) this.breakOverlay.countdown(this.skipTime, time);
            else this.breakOverlay.visible = false;

            this.updateHits(time);
            if (game.autoplay) this.player.update(time);
            this.updateBg(time);
            this.scoreOverlay.update(time);
            this.progOverlay.update(time);
            this.errorMeter.update(time);
        }
        else this.updateBg(Number.MIN_SAFE_INTEGER);

        this.volumeMenu.update(t);
        this.loadingMenu.update(t);
        if (time > this.endTime) {
            if (!this.ended) {
                this.ended = true;
                this.pause = () => { };
                this.scoreOverlay.visible = false;
                this.scoreOverlay.showSummary(this.track.metadata, this.errorMeter.record, this);
            }
            this.bg.tint = 0xffffff;
        }
    }
    destroy() {
        for (const hit of this.hits) if (!hit.destroyed) {
            hit.objects.forEach(this.destroyHit);
            hit.judges.forEach(this.destroyHit);
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
        this.progOverlay.destroy(opt);
        this.gamefield.destroy(opt);
        this.bg.destroy(opt);
        this.bg.renderTexture?.destroy?.(true);
        SliderMesh.deallocate();

        if (game.allowMouseScroll) window.removeEventListener('wheel', this.volumeEv);
        window.removeEventListener('blur', this.blurEv);
        window.removeEventListener('keyup', this.pauseEv);
        window.removeEventListener('keydown', this.skipEv);

        window.onresize = null;
        if (!game.autoplay) this.player.cleanup();
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
        this.osu.audio.ctx.suspend();
        this.destroy();
        stopGame();
    }
}