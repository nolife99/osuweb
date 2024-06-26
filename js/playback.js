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
    followZoomInTime = 100, ballFadeOut = 100, bgFadeTime = 800, spinnerInTime = 300,
    menu = document.getElementsByClassName('pause-menu')[0], buttons = document.getElementsByClassName('pausebutton'),
    cont = buttons[0], retry = buttons[1], quit = buttons[2],
    clamp01 = num => Math.min(Math.max(num, 0), 1), lerp = (a, b, t) => a + (b - a) * t,
    colorLerp = (rgb1, rgb2, t) => lerp(rgb1 >> 16, rgb2 >> 16, t) << 16 |
        lerp((rgb1 >> 8) & 255, (rgb2 >> 8) & 255, t) << 8 | lerp(rgb1 & 255, rgb2 & 255, t);

const repeatClamp = a => {
    a %= 2;
    return a > 1 ? 2 - a : a;
}, binarySearch = (i, array) => {
    let l = 0, r = array.length;
    while (l < r) {
        const m = Math.floor((l + r) / 2);
        if (array[m].zIndex < i) l = m + 1;
        else r = m;
    }
    return l;
}, getdist = (A, B, useEnd) => {
    let { x, y } = A;
    if (useEnd) {
        const pt = A.curve.pointAt(1);
        x = pt.x;
        y = pt.y;
    }
    return (x - B.x) ** 2 + (y - B.y) ** 2;
}

export default class Playback {
    ready = true;
    newHits = [];
    volumeMenu = new VolumeMenu;
    breakOverlay = new BreakOverlay;
    gfx = {};
    gamefield = new PIXI.Container;
    destroyHit = o => {
        o.destroy({
            children: true
        });
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

        cont.onclick = () => this.resume();
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

        this.loadingMenu = new LoadingMenu(track);
        this.calcSize();

        this.createBackground();
        app.stage.addChild(this.gamefield, this.volumeMenu, this.loadingMenu);

        this.endTime = track.hits.at(-1).endTime + 1500;
        this.wait = Math.max(0, bgFadeTime - track.hits[0].time);
        this.skipTime = track.hits[0].time - 2000;

        osu.onready = async () => {
            for (const a of document.getElementsByTagName('audio')) a.softstop?.();

            this.errorMeter = new ErrorMeterOverlay(this.GreatTime, this.GoodTime, this.MehTime);
            this.progOverlay = new ProgressOverlay(track.hits[0].time, track.hits.at(-1).endTime);
            this.scoreOverlay = new ScoreOverlay(this.HP, scoreMult);

            await loadTask;
            app.stage.addChild(this.scoreOverlay, this.errorMeter, this.progOverlay, this.breakOverlay);

            this.loadingMenu.hidden = true;
            this.osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
            this.osu.audio.speed = this.speed;
            this.osu.audio.play(this.audioTick = bgFadeTime + this.wait);
            this.started = true;
        };
        onresize = () => {
            app.renderer.resize(innerWidth, innerHeight);
            this.calcSize();

            if (this.bg?.texture) {
                this.bg.position.set(innerWidth / 2, innerHeight / 2);
                this.bg.scale.set(Math.max(innerWidth / this.bg.texture.width, innerHeight / this.bg.texture.height));
            }
            SliderMesh.resetTransform(
                2 * this.gfx.width / innerWidth / 512, -2 * this.gfx.height / innerHeight / 384,
                2 * this.gfx.xoffset / innerWidth - 1, 1 - 2 * this.gfx.yoffset / innerHeight);
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

        this.approachTime = this.AR > 5 ? 1950 - 150 * this.AR : 1800 - 120 * this.AR;
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
            if (e.code === 'Space' && !game.paused && !this.skipped && this.started && this.osu.audio.seek(this.skipTime / 1000)) {
                this.skipped = true;
                this.audioTick = this.skipTime;
            }
        };
        if (game.allowMouseScroll) {
            this.volumeEv = e => {
                if (!osu.audio) return;
                game.masterVolume = clamp01(game.masterVolume - e.deltaY * .002);
                osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
                this.volumeMenu.set(game.masterVolume * 100);
            };
            addEventListener('wheel', this.volumeEv);
        }
        addEventListener('blur', this.blurEv);
        addEventListener('keydown', this.skipEv);
        addEventListener('keyup', this.pauseEv);

        const loadTask = Promise.all(track.hits.map(a => {
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
            return new Promise(resolve => requestIdleCallback(() => {
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
            const lazyStack = 9, stackOfs = (1 - .7 * ((this.CS - 5) / 5)) * -3.2;
            for (let i = hits.length - 1; i > 0; --i) {
                let n = i, objI = hits[i];
                if (objI.chain !== 0 || objI.type === 'spinner') continue;

                if (objI.type === 'circle') while (--n >= 0) {
                    const objN = hits[n];
                    if (objN.type === 'spinner') continue;
                    if (objI.time - this.approachTime * track.general.StackLeniency > objN.endTime) break;

                    if (objN.type === 'slider' && getdist(objN, objI, true) < lazyStack) {
                        const offset = objI.chain - objN.chain + 1;
                        for (let j = n + 1; j <= i; ++j) if (getdist(objN, hits[j], true) < lazyStack) hits[j].chain -= offset;
                        break;
                    }
                    if (getdist(objN, objI) < lazyStack) {
                        objN.chain = objI.chain + 1;
                        objI = objN;
                    }
                }
                else if (objI.type === 'slider') while (--n >= 0) {
                    const objN = hits[n];
                    if (objN.type === 'spinner') continue;

                    if (objI.time - (this.approachTime * track.general.StackLeniency) > objN.time) break;
                    if (getdist(objN, objI, objN.type === 'slider') < lazyStack) {
                        objN.chain = objI.chain + 1;
                        objI = objN;
                    }
                }
            }
            this.hits = hits;
            this.hits.counter = 0;

            SliderMesh.initialize(track.colors, this.circleRadius / 2.1, {
                dx: 2 * this.gfx.width / innerWidth / 512, dy: -2 * this.gfx.height / innerHeight / 384,
                ox: 2 * this.gfx.xoffset / innerWidth - 1, oy: 1 - 2 * this.gfx.yoffset / innerHeight
            }, track.colors.SliderTrackOverride, track.colors.SliderBorder);

            let prev;
            return Promise.all(hits.map(hit => new Promise(resolve => requestIdleCallback(() => {
                if (hit.chain !== 0) {
                    const ofs = stackOfs * hit.chain;
                    hit.x += ofs;
                    hit.y += ofs;

                    if (hit.type === 'slider') {
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

                const newHitSprite = (path, zIndex, scale = 1, anchorx = .5) => {
                    const sprite = new PIXI.Sprite(skin[path]);
                    sprite.firstScale = this.hitScale * scale;
                    sprite.scale.set(sprite.firstScale);
                    sprite.anchor.set(anchorx, .5);
                    sprite.position.set(hit.x, hit.y);
                    sprite.zIndex = zIndex;
                    sprite.alpha = 0;
                    hit.objects.push(sprite);
                    return sprite;
                }, createHitCircle = isCircle => {
                    const index = hit.index + 1, basedep = 1 - 1e-9 * hit.hitIndex;
                    hit.base = newHitSprite('disc.png', basedep, .5);
                    hit.base.tint = this.track.colors[hit.combo % this.track.colors.length];
                    hit.circle = newHitSprite('hitcircleoverlay.png', basedep, .5);

                    hit.glow = newHitSprite('ring-glow.png', 2, .46);
                    hit.glow.tint = this.track.colors[hit.combo % this.track.colors.length];
                    hit.glow.blendMode = PIXI.BLEND_MODES.ADD;

                    hit.burst = newHitSprite('hitburst.png', 2);
                    hit.burst.visible = false;

                    hit.approach = hit.enableflash ? newHitSprite('approachcircle.png', 2) : hit.burst;
                    hit.approach.tint = this.track.colors[hit.combo % this.track.colors.length];

                    if (isCircle) hit.judge = this.createJudgement(hit, hit.time + this.MehTime);
                    hit.numbers = [];
                    if (!game.hideNumbers) {
                        if (index < 10) hit.numbers.push(newHitSprite(`score-${index}.png`, basedep, .4));
                        else if (index < 100) {
                            hit.numbers.push(newHitSprite(`score-${index % 10}.png`, basedep, .35, 0));
                            hit.numbers.push(newHitSprite(`score-${(index - index % 10) / 10}.png`, basedep, .35, 1));
                        }
                    }
                }
                switch (hit.type) {
                    case 'circle': createHitCircle(true); break;
                    case 'slider':
                        hit.nextRepeat = 1;
                        hit.nexttick = 0;
                        hit.body = new SliderMesh(hit.curve, hit.combo % this.track.colors.length);
                        hit.body.alpha = 0;
                        hit.body.zIndex = 1 - 1e-9 * hit.hitIndex;
                        hit.objects.push(hit.body);

                        const newSprite = (path, x, y, scale = 1) => {
                            const sprite = new PIXI.Sprite(skin[path]);
                            sprite.scale.set(this.hitScale * scale);
                            sprite.anchor.set(.5);
                            sprite.position.set(x, y);
                            sprite.zIndex = 1 - 1e-9 * hit.hitIndex;
                            sprite.alpha = 0;
                            hit.objects.push(sprite);
                            return sprite;
                        };
                        const tickDuration = hit.timing.beatMs / this.track.difficulty.SliderTickRate, nticks = Math.ceil(hit.sliderTimeTotal / tickDuration);

                        if (!hit.timing.isNaN) for (let i = 0; i < nticks; ++i) {
                            const t = hit.time + i * tickDuration, pos = repeatClamp(i * tickDuration / hit.sliderTime);
                            if (Math.min(pos, 1 - pos) * hit.sliderTime <= 10) continue;
                            const { x, y } = hit.curve.pointAt(pos);

                            const lastTick = hit.ticks[hit.ticks.push(newSprite('sliderscorepoint.png', x, y)) - 1];
                            lastTick.appeartime = hit.time + i * tickDuration / 1.5;
                            lastTick.time = t;
                        }
                        if (hit.repeat > 1) {
                            const { x, y } = hit.curve.pointAt(1), { x: x2, y: y2 } = hit.curve.pointAt(1 - 1e-9);
                            hit.reverse = newSprite('reversearrow.png', x, y, .36);
                            hit.reverse.rotation = Math.atan2(y2 - y, x2 - x);
                        }
                        if (hit.repeat > 2) {
                            const { x, y } = hit.curve.pointAt(1e-9);
                            hit.reverse_b = newSprite('reversearrow.png', hit.x, hit.y, .36);
                            hit.reverse_b.rotation = Math.atan2(y - hit.y, x - hit.x);
                            hit.reverse_b.visible = false;
                        }

                        hit.follow = newSprite('sliderfollowcircle.png', hit.x, hit.y);
                        hit.follow.visible = false;
                        hit.follow.blendMode = PIXI.BLEND_MODES.ADD;
                        hit.followSize = 1;

                        hit.ball = newSprite('sliderb.png', hit.x, hit.y, .5);
                        hit.ball.visible = false;
                        createHitCircle(false);

                        const v = hit.repeat % 2 === 1 ? hit.curve.pointAt(1) : hit;
                        hit.judge = this.createJudgement(v, hit.time + hit.sliderTimeTotal + this.GoodTime);
                        break;

                    case 'spinner':
                        hit.approachTime = this.approachTime + spinnerInTime;
                        hit.x = 256;
                        hit.y = 192;
                        hit.rotation = 0;
                        hit.spinProg = 0;
                        hit.clearSpin = (1.5 * this.OD < 5 ? 3 + .4 * this.OD : 2.5 + .5 * this.OD) / this.speed * Math.PI * (hit.endTime - hit.time) / 1000;
                        hit.spinProg = hit.clearSpin < Math.PI ? Number.MAX_SAFE_INTEGER : 0;

                        const newsprite = path => {
                            const sprite = new PIXI.Sprite(skin[path]);
                            sprite.anchor.set(.5);
                            sprite.position.set(hit.x, hit.y);
                            sprite.zIndex = .5;
                            sprite.alpha = 0;
                            hit.objects.push(sprite);
                            return sprite;
                        };
                        hit.base = newsprite('spinnerbase.png');
                        hit.prog = newsprite('spinnerprogress.png');
                        hit.top = newsprite('spinnertop.png');

                        hit.prog.scale.set(0);
                        if (game.hidden) {
                            hit.prog.visible = false;
                            hit.base.visible = false;
                        }
                        hit.judge = this.createJudgement(hit, hit.endTime + 233);
                        break;
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

                    const container = hit.followPoints = new PIXI.Container;
                    container.x1 = x1;
                    container.y1 = y1;
                    container.t1 = t1;
                    container.dx = hit.x - x1;
                    container.dy = hit.y - y1;
                    container.dt = hit.time - t1;
                    container.hit = hit;
                    hit.objects.push(container);

                    const spacing = 33, rotation = Math.atan2(container.dy, container.dx), distance = Math.hypot(container.dx, container.dy);
                    for (let d = spacing * 1.5; d < distance - spacing; d += spacing) {
                        const frac = d / distance, x = x1 + container.dx * frac, y = y1 + container.dy * frac;
                        if (x < 0 || x > 512 || y < 0 || y > 384) continue;

                        const p = container.addChild(new PIXI.Sprite(skin['followpoint.png']));
                        p.scale.set(this.hitScale * .4, this.hitScale * .3);
                        p.rotation = rotation;
                        p.anchor.set(.5);
                        p.blendMode = PIXI.BLEND_MODES.ADD;
                        p.alpha = 0;
                        p.frac = frac;
                    }
                }
                prev = hit;
                resolve();
            }))));
        });
        this.futuremost = track.hits[0].time;
    }
    calcSize() {
        this.gfx.width = innerWidth;
        this.gfx.height = innerHeight;
        if (this.gfx.width / 512 > this.gfx.height / 384) this.gfx.width = this.gfx.height / 384 * 512;
        else this.gfx.height = this.gfx.width / 512 * 384;
        this.gfx.width *= .85;
        this.gfx.height *= .85;
        this.gfx.xoffset = (innerWidth - this.gfx.width) / 2;
        this.gfx.yoffset = (innerHeight - this.gfx.height) / 2;
        this.gamefield.position.set(this.gfx.xoffset, this.gfx.yoffset);
        this.gamefield.scale.set(this.gfx.height / 384);
    }
    resume() {
        menu.hidden = true;
        this.osu.audio.play();
        game.paused = false;
    }
    pause() {
        if (this.osu.audio.pause()) {
            game.paused = true;
            menu.hidden = false;
        }
    }
    createJudgement(pos, finalTime) {
        const judge = new PIXI.Text(null, {
            fontFamily: 'Venera', fontSize: 20, fill: 0xffffff
        });
        judge.roundPixels = true;
        judge.anchor.set(.5);
        judge.scale.set(this.hitScale);
        judge.visible = false;
        judge.x = pos.x;
        judge.baseY = judge.y = pos.y;
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
                else judge.visible = false;
                break;
        }
        this.updateJudgement(judge, time);
    }
    updateJudgement(judge, time) {
        if (typeof judge.points === 'undefined' && time > judge.finalTime) {
            const points = game.autoplay ? 300 : judge.defaultScore;
            this.scoreOverlay.hit(points, 300, judge.finalTime);
            this.invokeJudgement(judge, points, judge.finalTime);
            return;
        }
        if (!judge.visible) return;

        const t = time - judge.t0;
        if (judge.points === 0) {
            if (t > 800) judge.visible = false;
            else {
                judge.alpha = t < 100 ? t / 100 : t < 600 ? 1 : 1 - (t - 600) / 200;
                judge.width = 16 * this.hitScale * judge.text.length;

                const t5 = (t / 800) ** 5;
                judge.y = judge.baseY + 100 * t5 * this.hitScale;
                judge.rotation = .7 * t5;
            }
        }
        else {
            if (t > 500) judge.visible = false;
            else {
                judge.alpha = t < 100 ? t / 100 : 1 - (t - 100) / 400;
                judge.width = (16 + 8 * ((t / 1800 - 1) ** 5 + 1)) * this.hitScale * judge.text.length;
            }
        }
    }
    createBackground() {
        const loadBg = async (key, uri) => {
            if (!PIXI.Assets.cache.has(key)) PIXI.Assets.add({
                alias: key, src: uri ? await uri() : key
            });
            PIXI.Assets.load(key).then(resource => {
                let sprite = new PIXI.Sprite(resource);
                const { width: w, height: h } = resource;

                if (game.backgroundBlurRate > 0) {
                    sprite.anchor.set(.5);
                    sprite.position.set(w / 2, h / 2);

                    const shortSide = Math.min(w, h), blurPower = game.backgroundBlurRate * shortSide,
                        t = Math.max(shortSide, Math.max(10, blurPower) * 3);

                    sprite.scale.set(t / (t - 2 * Math.max(10, blurPower)));
                    sprite.filters = [new PIXI.BlurFilter(blurPower, 18, 1, 15)];

                    const texture = PIXI.RenderTexture.create({
                        width: w, height: h
                    });
                    app.renderer.render(sprite, {
                        renderTexture: texture, clear: false
                    });
                    sprite.destroy();
                    sprite = new PIXI.Sprite(texture);
                }

                sprite.anchor.set(.5);
                sprite.position.set(innerWidth / 2, innerHeight / 2);
                sprite.scale.set(Math.max(innerWidth / w, innerHeight / h));
                this.bg = app.stage.addChildAt(sprite, 0);
            });
        }
        if (this.track.events.length > 0) {
            const ev = this.track.events, file = ev[0][0] === 'Video' ? ev[1][2] : ev[0][2], entry = this.osu.zip.getChildByName(file.slice(1, file.length - 1));
            if (entry) loadBg((entry.id + entry.uncompressedSize).toString(), () => entry.getData64URI('image/jpeg'));
            else loadBg(defaultBg);
        }
        else loadBg(defaultBg);
    }
    playHitsound(hit, id, time) {
        const timingPts = this.track.timing;
        while (this.timingId + 1 < timingPts.length && timingPts[this.timingId + 1].offset <= time) ++this.timingId;
        while (this.timingId > 0 && timingPts[this.timingId].offset > time) --this.timingId;

        const timing = timingPts[this.timingId], playHit = (bitmask, normalSet, additionSet) => {
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
        }, volume = game.masterVolume * game.effectVolume * timing.volume, defaultSet = timing.sampleSet || game.sampleSet;

        if (hit.type === 'circle' || hit.type === 'spinner') {
            const normal = hit.hitSample.normal || defaultSet, addition = hit.hitSample.addition || normal;
            playHit(hit.hitSound, normal, addition);
        }
        else if (hit.type === 'slider') {
            const edgeSet = hit.edgeSets[id], normal = edgeSet.normal || defaultSet, addition = edgeSet.addition || normal;
            playHit(hit.edgeHitsounds[id], normal, addition);
        }
    }
    hitSuccess(hit, points, time) {
        this.scoreOverlay.hit(points, hit.type === 'slider' ? 30 : 300, time);
        if (points > 0) {
            if (hit.type === 'spinner') this.playHitsound(hit, 0, hit.endTime);
            else {
                this.playHitsound(hit, 0, hit.time);
                this.errorMeter.hit(time - hit.time, time);
                if (hit.type === 'slider') hit.judge.defaultScore = 50;
            }
        }

        hit.score = points;
        hit.clickTime = time;
        if (hit.type !== 'slider') this.invokeJudgement(hit.judge, points, time);
    }
    updateHits(time) {
        while (this.current < this.hits.length && this.futuremost < time + this.approachTime + spinnerInTime) {
            const hit = this.hits[this.current++], children = this.gamefield.children;
            if (!(game.autoplay && game.hideGreat) && !hit.judge.parent) {
                hit.judge.parent = this.gamefield;
                children.splice(binarySearch(hit.judge.zIndex || 0, children), 0, hit.judge);
            }
            for (let i = hit.objects.length - 1; i >= 0; --i) {
                const obj = hit.objects[i];
                if (obj.parent) break;

                obj.parent = this.gamefield;
                children.splice(binarySearch(obj.zIndex || 0, children), 0, obj);
            }
            this.newHits.push(hit);
            if (hit.time > this.futuremost) this.futuremost = hit.time;
        }
        for (let i = this.newHits.length - 1; i >= 0; --i) {
            const hit = this.newHits[i];
            if (time - hit.endTime > this.MehTime + 800) {
                PIXI.utils.removeItems(this.newHits, i--, 1);
                hit.objects.forEach(this.destroyHit);
                this.destroyHit(hit.judge);
                hit.destroyed = true;
            }
            else {
                const updateHitCircle = isCircle => {
                    const f = hit.followPoints;
                    if (f) for (const o of f.children) {
                        const x = f.x1 + (o.frac - .1) * f.dx, y = f.y1 + (o.frac - .1) * f.dy, fadeOutTime = f.t1 + o.frac * f.dt, fadeInTime = fadeOutTime - this.approachTime;
                        let relpos = clamp01((time - fadeInTime) / hit.objFadeIn);

                        relpos *= 2 - relpos;
                        o.position.set(x + ((f.x1 + o.frac * f.dx) - x) * relpos, y + ((f.y1 + o.frac * f.dy) - y) * relpos);
                        o.alpha = (time < fadeOutTime ? (time - fadeInTime) / hit.objFadeIn : 1 - (time - fadeOutTime) / hit.objFadeIn) / 2;
                    }
                    const diff = hit.time - time, opaque = this.approachTime - this.approachFade;

                    if (diff < this.approachTime && diff > 0) hit.approach.scale.set(this.hitScale * (diff / this.approachTime * 3 + 1) / 2);
                    else hit.approach.scale.set(this.hitScale / 2);

                    if (diff < this.approachTime && diff > opaque) hit.approach.alpha = (this.approachTime - diff) / this.approachFade;
                    else if (diff < opaque && !hit.score) hit.approach.alpha = 1;

                    const noteFullAppear = this.approachTime - hit.objFadeIn, setcircleAlpha = alpha => {
                        hit.base.alpha = hit.circle.alpha = alpha;
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
                                hit.base.visible = hit.circle.visible = hit.approach.visible = false;
                                for (const digit of hit.numbers) digit.visible = false;
                            }
                        }
                    }
                    
                    if (isCircle) this.updateJudgement(hit.judge, time);
                    else if (typeof hit.score === 'undefined' && time > hit.time + this.MehTime) {
                        hit.score = game.autoplay ? 30 : 0;
                        this.scoreOverlay.hit(hit.score, 30, hit.time + this.MehTime);
                    }
                }
                switch (hit.type) {
                    case 'circle': updateHitCircle(true); break;
                    case 'slider':
                        updateHitCircle(false);
                        hit.body.startt = 0;
                        hit.body.endt = 1;

                        const setbodyAlpha = a => {
                            hit.body.alpha = a;
                            for (const tick of hit.ticks) tick.alpha = a;
                        }, diff = hit.time - time, dAfter = -diff, noteFullAppear = this.approachTime - hit.objFadeIn;
                        
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
                        if (game.snakeIn) {
                            if (diff > 0) {
                                const t = clamp01((time - hit.time + this.approachTime) / this.approachTime * 3);
                                hit.body.endt = t;
                                if (hit.reverse) {
                                    const { x, y } = hit.curve.pointAt(t);
                                    hit.reverse.position.set(x, y);

                                    if (t < .5) {
                                        const { x: x2, y: y2 } = hit.curve.pointAt(t + 1e-9);
                                        hit.reverse.rotation = Math.atan2(y - y2, x - x2);
                                    }
                                    else {
                                        const { x: x2, y: y2 } = hit.curve.pointAt(t - 1e-9);
                                        hit.reverse.rotation = Math.atan2(y2 - y, x2 - x);
                                    }
                                }
                            }
                        }
                        const resizeFollow = dir => {
                            if (!hit.lastFollow) hit.lastFollow = time;
                            hit.followSize = Math.max(1, Math.min(2.2, hit.followSize + (time - hit.lastFollow) * dir));
                            hit.lastFollow = time;
                        }
                        if (dAfter > 0 && dAfter < hit.fadeOutTime + hit.sliderTimeTotal) {
                            let t = dAfter / hit.sliderTime;
                            const currentRepeat = Math.min(Math.ceil(t), hit.repeat), realT = t;

                            t = repeatClamp(Math.min(t, hit.repeat));
                            const { x: aX, y: aY } = hit.curve.pointAt(t);

                            hit.follow.position.set(aX, aY);
                            hit.ball.position.set(aX, aY);

                            if (!game.autoplay) {
                                const dx = game.mouseX - aX, dy = game.mouseY - aY, followpx = hit.followSize * this.circleRadius / 1.8;
                                var isfollowing = dx * dx + dy * dy < followpx * followpx;

                                if (!isfollowing) {
                                    const predict = this.player.mouse(this.realtime), dx1 = predict.x - aX, dy1 = predict.y - aY, laxRad = followpx + predict.r;
                                    isfollowing = dx1 * dx1 + dy1 * dy1 < laxRad * laxRad;
                                }
                            }
                            const activated = game.autoplay || (game.down && isfollowing);

                            for (; hit.nexttick < hit.ticks.length; ++hit.nexttick) {
                                const tick = hit.ticks[hit.nexttick];
                                if (tick.time > time) break;

                                if (!tick.result) {
                                    if (activated) {
                                        tick.result = true;
                                        hit.judge.defaultScore = 50;
                                        const timingPts = this.track.timing;

                                        while (this.timingId + 1 < timingPts.length && timingPts[this.timingId + 1].offset <= tick.time) ++this.timingId;
                                        while (this.timingId > 0 && timingPts[this.timingId].offset > time) --this.timingId;
                                        const timing = timingPts[this.timingId],
                                            tickSound = game.sample[hit.hitSample.normal || timing.sampleSet || game.sampleSet].slidertick;

                                        tickSound.volume = game.masterVolume * game.effectVolume * timing.volume;
                                        tickSound.play();
                                    }
                                    this.scoreOverlay.hit(activated ? 10 : 0, 10, tick.time);
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
                                            hit.judge.defaultScore = 50;
                                        }
                                    }
                                    this.scoreOverlay.hit(activated ? 30 : 0, 30, curRep.time);
                                }
                            }
                            if (realT > hit.repeat && activated && !hit.scoredSliderEnd) {
                                hit.scoredSliderEnd = hit.time + hit.sliderTimeTotal;
                                this.invokeJudgement(hit.judge, 300, hit.scoredSliderEnd);
                                this.scoreOverlay.hit(300, 300, hit.scoredSliderEnd);
                                this.playHitsound(hit, hit.repeat, hit.scoredSliderEnd);
                            }
                            if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
                                hit.ball.visible = hit.follow.visible = true;
                                hit.ball.alpha = 1;
                                resizeFollow((activated ? 1 : -1) / followZoomInTime);
                                hit.follow.scale.set(hit.followSize * .45 * this.hitScale);
                                hit.follow.alpha = hit.followSize - 1;
                            }

                            const timeAfter = -diff - hit.sliderTimeTotal;
                            if (timeAfter > 0) {
                                resizeFollow(-1 / followZoomInTime);
                                hit.follow.scale.set(hit.followSize * .45 * this.hitScale);
                                hit.follow.alpha = hit.followSize - 1;
                                hit.ball.alpha = 1 - timeAfter / ballFadeOut;
                                hit.ball.scale.set((1 + .15 * timeAfter / ballFadeOut) / 2 * this.hitScale);
                            }
                            if (hit.repeat > 1) {
                                hit.reverse.visible = currentRepeat < hit.repeat - hit.repeat % 2;
                                if (hit.reverse_b) hit.reverse_b.visible = currentRepeat < hit.repeat - 1 + hit.repeat % 2;
                            }
                            if (game.snakeOut && currentRepeat === hit.repeat) {
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
                                tick.alpha *= 1 - dt;
                                tick.scale.set(this.hitScale / 2 * (.5 + (1 - dt) * (1 + dt) / 2));
                            }
                            else tick.scale.set(this.hitScale / 2);

                            if (time > tick.time) {
                                const dt = (time - tick.time) / 150;
                                if (tick.result) {
                                    tick.alpha *= -((dt - 1) ** 5);
                                    tick.scale.set(this.hitScale * (1 + dt / 2 * (2 - dt)) / 2);
                                }
                                else {
                                    tick.alpha *= 1 - dt;
                                    tick.tint = colorLerp(0xffffff, 0xff0000, clamp01(dt * 2));
                                }
                            }
                        }
                        this.updateJudgement(hit.judge, time);
                        break;

                    case 'spinner':
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
                        const alpha = time < hit.time - spinnerInTime - this.approachTime ? 0 : time < hit.endTime ? 1 : 1 - (time - hit.endTime) / 150;
                        hit.top.alpha = hit.prog.alpha = hit.base.alpha = alpha;

                        const prog = hit.spinProg / hit.clearSpin;
                        if (time < hit.time) {
                            hit.top.scale.set(.3 * clamp01((time - hit.time + spinnerInTime + this.approachTime) / spinnerInTime));
                            hit.base.scale.set(.6 * clamp01((time - hit.time + spinnerInTime) / spinnerInTime));

                            const t = (hit.time - time) / (spinnerInTime + this.approachTime);
                            if (t < 1) hit.top.rotation = -t * t * 10;
                        }
                        else {
                            hit.base.rotation = hit.rotation / 2;
                            hit.top.rotation = hit.base.rotation;
                            hit.prog.scale.set(.6 * (.13 + .87 * clamp01(prog)));
                        }

                        if (time > hit.endTime && !hit.score) {
                            if (game.autoplay) this.hitSuccess(hit, 300, hit.endTime);
                            else {
                                let points = 300;
                                if (prog < .25) points = 0;
                                else if (prog < .9) points = 50;
                                else if (prog < 1) points = 100;

                                this.hitSuccess(hit, points, hit.endTime);
                            }
                        }
                        this.updateJudgement(hit.judge, time);
                        break;
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
            if (!game.paused && this.hits.counter++ % 10 > 0) time += frame * this.speed - time + this.audioTick;
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
            this.scoreOverlay.update(time);
            this.progOverlay.update(time);
            this.errorMeter.update(time);
            this.updateBg(time);
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
            this.destroyHit(hit.judge);
        }
        if (game.backgroundBlurRate > 0) this.bg.destroy(true);
        SliderMesh.deallocate();

        if (game.allowMouseScroll) removeEventListener('wheel', this.volumeEv);
        removeEventListener('blur', this.blurEv);
        removeEventListener('keyup', this.pauseEv);
        removeEventListener('keydown', this.skipEv);

        onresize = null;
        if (!game.autoplay) this.player.cleanup();
    }
    retry() {
        if (!game.paused) {
            this.osu.audio.pause();
            game.paused = true;
        }
        const opt = {
            children: true
        };
        this.destroy();
        this.scoreOverlay.destroy(opt);
        this.errorMeter.destroy(opt);
        this.loadingMenu.destroy(opt);
        this.volumeMenu.destroy(opt);
        this.breakOverlay.destroy(opt);
        this.progOverlay.destroy(opt);
        this.gamefield.destroy(opt);
        if (game.backgroundBlurRate === 0) this.bg.destroy(opt);

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