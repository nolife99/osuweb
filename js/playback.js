define(["playerActions", "SliderMesh", "ui/score", "ui/volume", "ui/loading", "ui/break", "ui/progress", "ui/hiterrormeter"], (setPlayerActions, SliderMesh, ScoreOverlay, VolumeMenu, LoadingMenu, BreakOverlay, ProgressOverlay, ErrorMeterOverlay) => {
    const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
    const clamp01 = num => Math.min(Math.max(num, 0), 1);
    const colorLerp = (rgb1, rgb2, t) => {
        var ease = 1 - t;
        let r = ease * (rgb1 >> 16) + t * (rgb2 >> 16);
        let g = ease * ((rgb1 >> 8) & 255) + t * ((rgb2 >> 8) & 255);
        let b = ease * (rgb1 & 255) + t * (rgb2 & 255);
        return Math.round(r) << 16 | Math.round(g) << 8 | Math.round(b);
    };
    const repeatclamp = a => {
        a %= 2;
        return a > 1 ? 2 - a : a;
    };

    function Playback(game, osu, track) {
        let self = this;
        window.playback = this;
        self.game = game;
        self.osu = osu;
        self.track = track;
        self.background = null;
        self.ready = true;
        self.started = false;
        self.upcomingHits = [];
        self.hits = track.hitObjects.slice(0);
        self.offset = 0;
        self.currentHitIndex = 0;
        self.autoplay = game.autoplay;
        self.modhidden = game.hidden;
        self.playbackRate = game.nightcore ? 1.5 : game.daycore ? .75 : 1;
        self.hideNumbers = game.hideNumbers;
        self.hideGreat = game.hideGreat;
        self.hideFollowPoints = game.hideFollowPoints;
        self.approachScale = 3;
        self.audioReady = false;
        self.endTime = self.hits[self.hits.length - 1].endTime + 1500;
        this.wait = Math.max(0, 1500 - this.hits[0].time);
        self.skipTime = this.hits[0].time - 3000;
        self.skipped = false;
        self.ended = false;

        osu.onready = () => {
            self.loadingMenu.hide();
            self.audioReady = true;
            self.start();
        }
        self.load = () => osu.load_mp3();

        let gfx = window.gfx = {};
        self.gamefield = new PIXI.Container();
        self.calcSize = () => {
            gfx.width = game.window.innerWidth;
            gfx.height = game.window.innerHeight;
            if (gfx.width / 512 > gfx.height / 384) gfx.width = gfx.height / 384 * 512;
            else gfx.height = gfx.width / 512 * 384;
            gfx.width *= .8;
            gfx.height *= .8;
            gfx.xoffset = (game.window.innerWidth - gfx.width) / 2;
            gfx.yoffset = (game.window.innerHeight - gfx.height) / 2;
            self.gamefield.x = gfx.xoffset;
            self.gamefield.y = gfx.yoffset;
            self.gamefield.scale.set(gfx.width / 512);
        };
        self.calcSize();

        game.mouseX = 256;
        game.mouseY = 192;
        self.loadingMenu = new LoadingMenu({
            width: game.window.innerWidth,
            height: game.window.innerHeight
        }, track);
        self.volumeMenu = new VolumeMenu({
            width: game.window.innerWidth,
            height: game.window.innerHeight
        });
        self.breakOverlay = new BreakOverlay({
            width: game.window.innerWidth,
            height: game.window.innerHeight
        });
        self.progressOverlay = new ProgressOverlay({
            width: game.window.innerWidth,
            height: game.window.innerHeight
        }, this.hits[0].time, this.hits[this.hits.length - 1].endTime);

        game.window.onresize = () => {
            window.app.renderer.resize(window.innerWidth, window.innerHeight);
            self.calcSize();

            self.scoreOverlay.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            self.errorMeter.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            self.loadingMenu.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            self.volumeMenu.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            self.breakOverlay.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            self.progressOverlay.resize({
                width: window.innerWidth,
                height: window.innerHeight
            });
            if (self.background && self.background.texture) {
                self.background.x = window.innerWidth / 2;
                self.background.y = window.innerHeight / 2;
                self.background.scale.set(Math.max(window.innerWidth / self.background.texture.width, window.innerHeight / self.background.texture.height));
            }
            SliderMesh.prototype.resetTransform({
                dx: 2 * gfx.width / window.innerWidth / 512,
                ox: -1 + 2 * gfx.xoffset / window.innerWidth,
                dy: -2 * gfx.height / window.innerHeight / 384,
                oy: 1 - 2 * gfx.yoffset / window.innerHeight,
            });
        }

        this.OD = track.difficulty.OverallDifficulty;
        this.CS = track.difficulty.CircleSize;
        this.AR = track.difficulty.ApproachRate;
        this.HP = track.difficulty.HPDrainRate;
        let scoreMult = (this.HP + this.CS + this.OD + clamp(track.hitObjects.length / track.length * 8, 0, 16)) / 38 * 5;

        if (game.hardrock) {
            this.OD = Math.min(this.OD * 1.4, 10);
            this.CS = Math.min(this.CS * 1.3, 10);
            this.AR = Math.min(this.AR * 1.4, 10);
            this.HP = Math.min(this.HP * 1.4, 10);
        }
        if (game.easy) {
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
        self.scoreOverlay = new ScoreOverlay({
            width: game.window.innerWidth,
            height: game.window.innerHeight
        }, this.HP, scoreMult);

        self.circleRadius = (109 - 9 * this.CS) / 2;
        self.hitSpriteScale = self.circleRadius / 60;

        self.MehTime = 200 - 10 * this.OD;
        self.GoodTime = 140 - 8 * this.OD;
        self.GreatTime = 80 - 6 * this.OD;
        self.errorMeter = new ErrorMeterOverlay({
            width: game.window.innerWidth,
            height: game.window.innerHeight
        }, this.GreatTime, this.GoodTime, this.MehTime);

        self.approachTime = this.AR < 5 ? 1800 - 120 * this.AR : 1950 - 150 * this.AR;
        self.approachFadeInTime = Math.min(800, self.approachTime);

        for (let i = 0; i < self.hits.length; ++i) {
            let hit = self.hits[i];
            if (self.modhidden && i > 0) {
                hit.objectFadeInTime = .4 * self.approachTime;
                hit.objectFadeOutOffset = -.6 * self.approachTime;
                hit.circleFadeOutTime = .3 * self.approachTime;

                if (hit.type == "slider") {
                    hit.fadeOutOffset = -.6 * self.approachTime;
                    hit.fadeOutDuration = hit.sliderTimeTotal - hit.fadeOutOffset;
                }
            }
            else {
                hit.enableflash = true;
                hit.objectFadeInTime = Math.min(400, self.approachTime);
                hit.circleFadeOutTime = 100;
                hit.objectFadeOutOffset = self.MehTime;

                if (hit.type == "slider") {
                    hit.fadeOutOffset = hit.sliderTimeTotal;
                    hit.fadeOutDuration = 300;
                }
            }
        }

        self.glowFadeOutTime = 350;
        self.glowMaxOpacity = .5;
        self.flashFadeInTime = 40;
        self.flashFadeOutTime = 120;
        self.flashMaxOpacity = .8;
        self.scoreFadeOutTime = 500;
        self.followZoomInTime = 100;
        self.followFadeOutTime = 100;
        self.ballFadeOutTime = 100;
        self.objectDespawnTime = 1500;
        self.backgroundFadeTime = 800;
        self.spinnerAppearTime = self.approachTime;
        self.spinnerZoomInTime = 300;
        self.spinnerFadeOutTime = 150;

        setPlayerActions(self);
        game.paused = false;
        this.pause = function() {
            if (osu.audio.pause()) {
                game.paused = true;
                let menu = document.getElementById("pause-menu");
                menu.hidden = false;
                btn_continue = document.getElementById("pausebtn-continue");
                btn_retry = document.getElementById("pausebtn-retry");
                btn_quit = document.getElementById("pausebtn-quit");

                btn_continue.onclick = () => {
                    self.resume();
                    btn_continue.onclick = null;
                    btn_retry.onclick = null;
                    btn_quit.onclick = null;
                }
                btn_retry.onclick = () => {
                    game.paused = false;
                    menu.hidden = true;
                    self.retry();
                }
                btn_quit.onclick = () => {
                    game.paused = false;
                    menu.hidden = true;
                    self.quit();
                }
            }
        };
        this.resume = () => {
            game.paused = false;
            document.getElementById("pause-menu").hidden = true;
            osu.audio.play();
        };

        let volumeCallback;
        let pauseCallback = e => {
            if (e.keyCode === 32) {
                if (!game.paused) self.pause();
                else self.resume();
            }
        };
        let blurCallback = e => {
            if (self.audioReady) self.pause();
        };
        let skipCallback = e => {
            if (e.keyCode === 17 && !game.paused && !self.skipped) self.skip();
        };
        if (game.allowMouseScroll) {
            volumeCallback = e => {
                game.masterVolume = clamp01(game.masterVolume - e.deltaY * .002);
                if (osu.audio) osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
                self.volumeMenu.setVolume(game.masterVolume * 100);
            };
            window.addEventListener('wheel', volumeCallback);
        }
        window.addEventListener("blur", blurCallback);
        window.addEventListener("keydown", skipCallback);
        window.addEventListener("keyup", pauseCallback);

        this.fadeOutEasing = t => {
            if (t <= 0) return 1;
            if (t > 1) return 0;
            return 1 - Math.sin(t * Math.PI / 2);
        }
        const judgementText = points => {
            switch (points) {
                case 0: return "miss";
                case 50: return "meh";
                case 100: return "good";
                case 300: return "great";
                default: throw "no such judgement";
            }
        }
        const judgementColor = points => {
            switch (points) {
                case 0: return 0xed1121;
                case 50: return 0xffcc22;
                case 100: return 0x88b300;
                case 300: return 0x66ccff;
                default: throw "no such judgement";
            }
        }
        this.createJudgement = function(x, y, depth, finalTime) {
            let judge = new PIXI.BitmapText('', {
                font: {
                    name: 'Venera', size: 20
                }
            });
            judge.anchor.set(.5);
            judge.scale.set(.85 * this.hitSpriteScale, 1 * this.hitSpriteScale);
            judge.visible = false;
            judge.basex = judge.x = x;
            judge.basey = judge.y = y;
            judge.depth = depth;
            judge.points = -1;
            judge.finalTime = finalTime;
            judge.defaultScore = 0;
            return judge;
        }
        this.invokeJudgement = function(judge, points, time) {
            judge.visible = true;
            judge.points = points;
            judge.t0 = time;
            if (!this.hideGreat || points != 300) judge.text = judgementText(points);
            judge.tint = judgementColor(points);
            this.updateJudgement(judge, time);
        }
        this.updateJudgement = function(judge, time) {
            if (judge.points < 0 && time >= judge.finalTime) {
                let points = this.auto ? 300 : judge.defaultScore;

                this.scoreOverlay.hit(points, 300, judge.finalTime);
                this.invokeJudgement(judge, points, judge.finalTime);
                return;
            }
            if (!judge.visible) return;

            let t = time - judge.t0;
            if (judge.points == 0) {
                if (t > 800) {
                    judge.visible = false;
                    return;
                }
                judge.alpha = t < 100 ? t / 100 : t < 600 ? 1 : 1 - (t - 600) / 200;

                let tQ = t / 800;
                let t5 = tQ * tQ * tQ * tQ * tQ;

                judge.y = judge.basey + 100 * t5 * this.hitSpriteScale;
                judge.rotation = .7 * t5;
            }
            else {
                if (t > 500) {
                    judge.visible = false;
                    return;
                }
                judge.alpha = t < 100 ? t / 100 : 1 - (t - 100) / 400;

                let tQ = t / 1800 - 1;
                judge.letterSpacing = 70 * (tQ * tQ * tQ * tQ * tQ + 1);
            }
        }
        this.createBackground = () => {
            const loadBackground = uri => {
                let loader = new PIXI.Loader();
                loader.add("bg", uri, {
                    loadType: PIXI.LoaderResource.LOAD_TYPE.IMAGE
                }).load((loader, resources) => {
                    let sprite = new PIXI.Sprite(resources.bg.texture);
                    if (game.backgroundBlurRate > .0001) {
                        let width = resources.bg.texture.width;
                        let height = resources.bg.texture.height;
                        sprite.anchor.set(.5);
                        sprite.x = width / 2;
                        sprite.y = height / 2;

                        let blurstrength = game.backgroundBlurRate * Math.min(width, height);
                        t = Math.max(Math.min(width, height), Math.max(10, blurstrength) * 3);
                        sprite.scale.set(t / (t - 2 * Math.max(10, blurstrength)));

                        let blurFilter = new PIXI.filters.BlurFilter(blurstrength, 14);
                        blurFilter.autoFit = false;
                        sprite.filters = [blurFilter];
                    }
                    let texture = PIXI.RenderTexture.create(resources.bg.texture.width, resources.bg.texture.height);
                    window.app.renderer.render(sprite, texture);

                    self.background = new PIXI.Sprite(texture);
                    self.background.anchor.set(.5);
                    self.background.x = window.innerWidth / 2;
                    self.background.y = window.innerHeight / 2;
                    self.background.scale.set(Math.max(window.innerWidth / self.background.texture.width, window.innerHeight / self.background.texture.height));
                    game.stage.addChildAt(self.background, 0);
                });
            }
            if (track.events.length != 0) {
                self.ready = false;
                let file = track.events[0][2];
                if (track.events[0][0] === "Video") file = track.events[1][2];
                file = file.substr(1, file.length - 2);

                entry = osu.zip.getChildByName(file);
                if (entry) entry.getBlob("image/jpeg", function(blob) {
                    let uri = URL.createObjectURL(blob);
                    loadBackground(uri);
                    self.ready = true;
                });
                else {
                    loadBackground("asset/skin/defaultbg.jpg");
                    self.ready = true;
                }
            }
            else loadBackground("asset/skin/defaultbg.jpg");
        };
        self.createBackground();

        const convertcolor = color => (+color[0] << 16) | (+color[1] << 8) | (+color[2] << 0);
        let combos = [];
        for (let i = 0; i < track.colors.length; ++i) combos.push(convertcolor(track.colors[i]));

        let SliderTrackOverride;
        let SliderBorder;
        if (track.colors.SliderTrackOverride) SliderTrackOverride = convertcolor(track.colors.SliderTrackOverride);
        if (track.colors.SliderBorder) SliderBorder = convertcolor(track.colors.SliderBorder);

        game.stage.addChild(this.gamefield);
        game.stage.addChild(this.scoreOverlay);
        game.stage.addChild(this.errorMeter);
        game.stage.addChild(this.progressOverlay);
        game.stage.addChild(this.breakOverlay);
        game.stage.addChild(this.volumeMenu);
        game.stage.addChild(this.loadingMenu);

        this.createHitCircle = function(hit) {
            const newHitSprite = (spritename, depth, scalemul = 1, anchorx = .5, anchory = .5) => {
                let sprite = new PIXI.Sprite(Skin[spritename]);
                sprite.initialscale = self.hitSpriteScale * scalemul;
                sprite.scale.x = sprite.scale.y = sprite.initialscale;
                sprite.anchor.x = anchorx;
                sprite.anchor.y = anchory;
                sprite.x = hit.x;
                sprite.y = hit.y;
                sprite.depth = depth;
                sprite.alpha = 0;
                hit.objects.push(sprite);
                return sprite;
            }

            let index = hit.index + 1;
            let basedep = 4.9999 - .0001 * hit.hitIndex;

            hit.base = newHitSprite("disc.png", basedep, .5);
            hit.base.tint = combos[hit.combo % combos.length];
            hit.circle = newHitSprite("hitcircleoverlay.png", basedep, .5);
            hit.glow = newHitSprite("ring-glow.png", basedep + 2, .46);
            hit.glow.tint = combos[hit.combo % combos.length];
            hit.glow.blendMode = PIXI.BLEND_MODES.ADD;
            hit.burst = newHitSprite("hitburst.png", 8.00005 + .0001 * hit.hitIndex);
            hit.burst.visible = false;
            hit.approach = newHitSprite("approachcircle.png", 8 + .0001 * hit.hitIndex);
            hit.approach.tint = combos[hit.combo % combos.length];
            hit.judgements.push(this.createJudgement(hit.x, hit.y, 4, hit.time + this.MehTime));

            hit.numbers = [];
            if (index < 10) hit.numbers.push(newHitSprite("score-" + index + ".png", basedep, .4, .5, .47));
            else if (index < 100) {
                hit.numbers.push(newHitSprite("score-" + index % 10 + ".png", basedep, .35, 0, .47));
                hit.numbers.push(newHitSprite("score-" + ((index - index % 10) / 10) + ".png", basedep, .35, 1, .47));
            }
        }
        this.createSlider = function(hit) {
            hit.lastrep = 0;
            hit.nexttick = 0;

            hit.body = new SliderMesh(hit.curve, this.circleRadius, hit.combo % combos.length);
            hit.body.alpha = 0;
            hit.body.depth = 4.9999 - .0001 * hit.hitIndex;
            hit.objects.push(hit.body);

            const newSprite = (spritename, x, y, scalemul = 1) => {
                let sprite = new PIXI.Sprite(Skin[spritename]);
                sprite.scale.set(self.hitSpriteScale * scalemul);
                sprite.anchor.set(.5);
                sprite.x = x;
                sprite.y = y;
                sprite.depth = 4.9999 - .0001 * hit.hitIndex;
                sprite.alpha = 0;
                hit.objects.push(sprite);
                return sprite;
            }

            hit.ticks = [];
            let tickDuration = hit.timing.trueMillisecondsPerBeat / this.track.difficulty.SliderTickRate;
            let nticks = Math.floor(hit.sliderTimeTotal / tickDuration) + 1;

            for (let i = 0; i < nticks; ++i) {
                let t = hit.time + i * tickDuration;
                let pos = repeatclamp(i * tickDuration / hit.sliderTime);
                if (Math.min(pos, 1 - pos) * hit.sliderTime <= 10) continue;
                let at = hit.curve.pointAt(pos);

                hit.ticks.push(newSprite("sliderscorepoint.png", at.x, at.y));
                let lastTick = hit.ticks[hit.ticks.length - 1];
                lastTick.appeartime = t - 2 * tickDuration;
                lastTick.time = t;
                lastTick.result = false;
            }
            if (hit.repeat > 1) {
                let p = hit.curve.curve[hit.curve.curve.length - 1];
                let p2 = hit.curve.curve[hit.curve.curve.length - 2];
                hit.reverse = newSprite("reversearrow.png", p.x, p.y, .36);
                hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
            }
            if (hit.repeat > 2) {
                let p = hit.curve.curve[0];
                let p2 = hit.curve.curve[1];
                hit.reverse_b = newSprite("reversearrow.png", p.x, p.y, .36);
                hit.reverse_b.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                hit.reverse_b.visible = false;
            }

            hit.follow = newSprite("sliderfollowcircle.png", hit.x, hit.y);
            hit.follow.visible = false;
            hit.follow.blendMode = PIXI.BLEND_MODES.ADD;
            hit.followSize = 1;

            hit.ball = newSprite("sliderb.png", hit.x, hit.y, .5);
            hit.ball.visible = false;
            self.createHitCircle(hit);

            let endPoint = hit.curve.curve[hit.curve.curve.length - 1];
            for (let i = 1; i <= hit.repeat; ++i) {
                let x = i % 2 == 1 ? endPoint.x : hit.x;
                let y = i % 2 == 1 ? endPoint.y : hit.y;
                hit.judgements.push(this.createJudgement(x, y, 4, hit.time + i * hit.sliderTime));
            }
        }
        this.createSpinner = function(hit) {
            hit.approachTime = self.spinnerAppearTime + self.spinnerZoomInTime;
            hit.x = 256;
            hit.y = 192;
            hit.rotation = 0;
            hit.rotationProgress = 0;
            hit.clicked = false;

            let spinRequiredPerSec = this.OD < 5 ? 3 + .4 * this.OD : 2.5 + .5 * this.OD;
            hit.rotationRequired = Math.PI * Math.floor(1.5 / this.playbackRate * spinRequiredPerSec * (hit.endTime - hit.time) / 1000);

            const newsprite = spritename => {
                let sprite = new PIXI.Sprite(Skin[spritename]);
                sprite.anchor.set(.5);
                sprite.x = hit.x;
                sprite.y = hit.y;
                sprite.depth = 4.9999 - .0001 * (hit.hitIndex || 1);
                sprite.alpha = 0;
                hit.objects.push(sprite);
                return sprite;
            }
            hit.base = newsprite("spinnerbase.png");
            hit.progress = newsprite("spinnerprogress.png");
            hit.top = newsprite("spinnertop.png");
            if (this.modhidden) {
                hit.progress.visible = false;
                hit.base.visible = false;
            }
            hit.judgements.push(this.createJudgement(hit.x, hit.y, 4, hit.endTime + 233));
        }
        this.createFollowPoint = function(prevHit, hit) {
            let x1 = prevHit.x, y1 = prevHit.y, t1 = prevHit.time;
            if (prevHit.type == "slider") {
                t1 += prevHit.sliderTimeTotal;
                if (prevHit.repeat % 2 == 1) {
                    x1 = prevHit.curve.curve[prevHit.curve.curve.length - 1].x;
                    y1 = prevHit.curve.curve[prevHit.curve.curve.length - 1].y;
                }
            }

            let container = new PIXI.Container();
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
            hit.followPoints = container;

            const spacing = 34;
            let rotation = Math.atan2(container.dy, container.dx);
            let distance = Math.floor(Math.hypot(container.dx, container.dy));

            for (let d = spacing * 1.5; d < distance - spacing; d += spacing) {
                let frac = d / distance;

                let p = new PIXI.Sprite(Skin["followpoint.png"]);
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
        this.populateHit = function(hit) {
            this.currentHitIndex += 1;
            hit.hitIndex = this.currentHitIndex;
            hit.objects = [];
            hit.judgements = [];
            hit.score = -1;

            switch (hit.type) {
                case "circle": self.createHitCircle(hit); break;
                case "slider": self.createSlider(hit); break;
                case "spinner": self.createSpinner(hit); break;
            }
        }
        SliderMesh.prototype.initialize(combos, this.circleRadius, {
            dx: 2 * gfx.width / window.innerWidth / 512,
            ox: -1 + 2 * gfx.xoffset / window.innerWidth,
            dy: -2 * gfx.height / window.innerHeight / 384,
            oy: 1 - 2 * gfx.yoffset / window.innerHeight
        }, SliderTrackOverride, SliderBorder);

        for (let i = 0; i < this.hits.length; ++i) {
            this.populateHit(this.hits[i]);
            if (this.modhidden && i > 0 && this.hits[i].approach) this.hits[i].approach.visible = false;
            if (this.hideFollowPoints && this.hits[i].followPoints) this.hits[i].followPoints.visible = false;
            if (this.hideNumbers && this.hits[i].numbers) for (let j = 0; j < this.hits[i].numbers.length; ++j) this.hits[i].numbers[j].visible = false;
        }
        if (!this.hideFollowPoints) for (let i = 0; i < this.hits.length - 1; ++i) if (this.hits[i].type != "spinner" && this.hits[i + 1].type != "spinner" && this.hits[i + 1].combo == this.hits[i].combo) this.createFollowPoint(this.hits[i], this.hits[i + 1]);

        this.curtimingid = 0;
        this.playTicksound = function(hit, time) {
            while (this.curtimingid + 1 < this.track.timingPoints.length && this.track.timingPoints[this.curtimingid + 1].offset <= time) ++this.curtimingid;
            while (this.curtimingid > 0 && this.track.timingPoints[this.curtimingid].offset > time) --this.curtimingid;
            let timing = this.track.timingPoints[this.curtimingid];
            let volume = game.masterVolume * game.effectVolume * (hit.hitSample.volume || timing.volume) / 100;
            let defaultSet = timing.sampleSet || game.sampleSet;
            game.sample[defaultSet].slidertick.volume = volume;
            game.sample[defaultSet].slidertick.play();
        };
        this.playHitsound = function(hit, id, time) {
            while (this.curtimingid + 1 < this.track.timingPoints.length && this.track.timingPoints[this.curtimingid + 1].offset <= time) ++this.curtimingid;
            while (this.curtimingid > 0 && this.track.timingPoints[this.curtimingid].offset > time) --this.curtimingid;

            let timing = this.track.timingPoints[this.curtimingid];
            let volume = game.masterVolume * game.effectVolume * (hit.hitSample.volume || timing.volume) / 100;
            let defaultSet = timing.sampleSet || game.sampleSet;

            function playHit(bitmask, normalSet, additionSet) {
                game.sample[normalSet].hitnormal.volume = volume;
                game.sample[normalSet].hitnormal.play();

                if (bitmask & 2) {
                    game.sample[additionSet].hitwhistle.volume = volume;
                    game.sample[additionSet].hitwhistle.play();
                }
                if (bitmask & 4) {
                    game.sample[additionSet].hitfinish.volume = volume;
                    game.sample[additionSet].hitfinish.play();
                }
                if (bitmask & 8) {
                    game.sample[additionSet].hitclap.volume = volume;
                    game.sample[additionSet].hitclap.play();
                }
            }
            if (hit.type == 'circle' || hit.type == 'spinner') {
                let toplay = hit.hitSound;
                let normalSet = hit.hitSample.normalSet || defaultSet;
                let additionSet = hit.hitSample.additionSet || normalSet;
                playHit(toplay, normalSet, additionSet);
            }
            if (hit.type == 'slider') {
                let toplay = hit.edgeHitsounds[id];
                let normalSet = hit.edgeSets[id].normalSet || defaultSet;
                let additionSet = hit.edgeSets[id].additionSet || normalSet;
                playHit(toplay, normalSet, additionSet);
            }
        };
        this.hitSuccess = function(hit, points, time) {
            this.scoreOverlay.hit(points, 300, time);
            if (points > 0) {
                if (hit.type == "spinner") self.playHitsound(hit, 0, hit.endTime);
                else {
                    self.playHitsound(hit, 0, hit.time);
                    self.errorMeter.hit(time - hit.time, time);
                }
                if (hit.type == "slider") hit.judgements[hit.judgements.length - 1].defaultScore = 50;
            }

            hit.score = points;
            hit.clickTime = time;
            self.invokeJudgement(hit.judgements[0], points, time);
        };

        let futuremost = 0, current = 0;
        if (track.hitObjects.length > 0) futuremost = track.hitObjects[0].time;
        let waitinghitid = 0;

        this.updateUpcoming = function(time) {
            while (waitinghitid < self.hits.length && self.hits[waitinghitid].endTime < time) ++waitinghitid;
            const findindex = i => {
                let l = 0, r = self.gamefield.children.length;
                while (l + 1 < r) {
                    let m = Math.floor((l + r) / 2) - 1;
                    if ((self.gamefield.children[m].depth || 0) < i) l = m + 1;
                    else r = m + 1;
                }
                return l;
            }
            while (current < self.hits.length && futuremost < time + 3000) {
                let hit = self.hits[current++];
                for (let i = hit.judgements.length - 1; i >= 0; --i) self.gamefield.addChildAt(hit.judgements[i], findindex(hit.judgements[i].depth || .0001));
                for (let i = hit.objects.length - 1; i >= 0; --i) self.gamefield.addChildAt(hit.objects[i], findindex(hit.objects[i].depth || .0001));
                self.upcomingHits.push(hit);
                if (hit.time > futuremost) futuremost = hit.time;
            }
            for (let i = 0; i < self.upcomingHits.length; ++i) {
                let hit = self.upcomingHits[i];
                let diff = hit.time - time;
                let despawn = -this.objectDespawnTime;
                if (hit.type === "slider") despawn -= hit.sliderTimeTotal;
                if (hit.type === "spinner") despawn -= hit.endTime - hit.time;
                if (diff < despawn) {
                    self.upcomingHits.splice(i--, 1);
                    _.each(hit.objects, function(o) {
                        self.gamefield.removeChild(o);
                        o.destroy();
                    });
                    _.each(hit.judgements, function(o) {
                        self.gamefield.removeChild(o);
                        o.destroy();
                    });
                    hit.destroyed = true;
                }
            }
        }
        this.updateFollowPoints = function(f, time) {
            for (let i = 0; i < f.children.length; ++i) {
                let o = f.children[i];
                let startx = f.x1 + (o.fraction - .1) * f.dx;
                let starty = f.y1 + (o.fraction - .1) * f.dy;
                let endx = f.x1 + o.fraction * f.dx;
                let endy = f.y1 + o.fraction * f.dy;
                let fadeOutTime = f.t1 + o.fraction * f.dt;
                let fadeInTime = fadeOutTime - f.preempt;
                let relpos = clamp01((time - fadeInTime) / f.hit.objectFadeInTime);
                relpos *= 2 - relpos;
                o.x = startx + (endx - startx) * relpos;
                o.y = starty + (endy - starty) * relpos;
                o.alpha = .5 * (time < fadeOutTime ? clamp01((time - fadeInTime) / f.hit.objectFadeInTime) : 1 - clamp01((time - fadeOutTime) / f.hit.objectFadeInTime));
            }
        }
        this.updateHitCircle = function(hit, time) {
            if (hit.followPoints) this.updateFollowPoints(hit.followPoints, time);
            let diff = hit.time - time;
            let approachFullAppear = this.approachTime - this.approachFadeInTime;

            if (diff <= this.approachTime && diff > 0) {
                let scalemul = diff / this.approachTime * this.approachScale + 1;
                hit.approach.scale.set(.5 * this.hitSpriteScale * scalemul);
            }
            else hit.approach.scale.set(.5 * this.hitSpriteScale);

            if (diff <= this.approachTime && diff > approachFullAppear) hit.approach.alpha = (this.approachTime - diff) / this.approachFadeInTime;
            else if (diff <= approachFullAppear && hit.score < 0) hit.approach.alpha = 1;
            let noteFullAppear = this.approachTime - hit.objectFadeInTime;

            const setcircleAlpha = alpha => {
                hit.base.alpha = alpha;
                hit.circle.alpha = alpha;
                for (let i = 0; i < hit.numbers.length; ++i) hit.numbers[i].alpha = alpha;
                hit.glow.alpha = alpha * self.glowMaxOpacity;
            }
            if (diff <= this.approachTime && diff > noteFullAppear) {
                let alpha = (this.approachTime - diff) / hit.objectFadeInTime;
                setcircleAlpha(alpha);
            }
            else if (diff <= noteFullAppear) {
                if (-diff > hit.objectFadeOutOffset) {
                    let timeAfter = -diff - hit.objectFadeOutOffset;
                    setcircleAlpha(clamp01(1 - timeAfter / hit.circleFadeOutTime));
                    hit.approach.alpha = clamp01(1 - timeAfter / 50);
                }
                else setcircleAlpha(1);
            }
            if (hit.score > 0 && hit.enableflash) {
                hit.burst.visible = true;
                let timeAfter = time - hit.clickTime;
                let t = timeAfter / this.glowFadeOutTime;
                let newscale = 1 + .5 * t * (2 - t);

                hit.burst.scale.set(newscale * hit.burst.initialscale);
                hit.glow.scale.set(newscale * hit.glow.initialscale);
                hit.burst.alpha = this.flashMaxOpacity * clamp01(timeAfter < this.flashFadeInTime ? timeAfter / this.flashFadeInTime : 1 - (timeAfter - this.flashFadeInTime) / this.flashFadeOutTime);
                hit.glow.alpha = clamp01(1 - timeAfter / this.glowFadeOutTime) * this.glowMaxOpacity;

                if (hit.base.visible) {
                    if (timeAfter < this.flashFadeInTime) {
                        hit.base.scale.set(newscale * hit.base.initialscale);
                        hit.circle.scale.set(newscale * hit.circle.initialscale);
                        for (let i = 0; i < hit.numbers.length; ++i) hit.numbers[i].scale.set(newscale * hit.numbers[i].initialscale);
                    }
                    else {
                        hit.base.visible = false;
                        hit.circle.visible = false;
                        for (let i = 0; i < hit.numbers.length; ++i) hit.numbers[i].visible = false;
                        hit.approach.visible = false;
                    }
                }
            }
            this.updateJudgement(hit.judgements[0], time);
        }
        this.updateSlider = function(hit, time) {
            this.updateHitCircle(hit, time);
            let noteFullAppear = this.approachTime - hit.objectFadeInTime;
            hit.body.startt = 0;
            hit.body.endt = 1;

            const setbodyAlpha = alpha => {
                hit.body.alpha = alpha;
                for (let i = 0; i < hit.ticks.length; ++i) hit.ticks[i].alpha = alpha;
            }
            let diff = hit.time - time;
            if (diff <= this.approachTime && diff > noteFullAppear) {
                setbodyAlpha((this.approachTime - diff) / hit.objectFadeInTime);
                if (hit.reverse) hit.reverse.alpha = hit.body.alpha;
                if (hit.reverse_b) hit.reverse_b.alpha = hit.body.alpha;
            }
            else if (diff <= noteFullAppear) {
                if (-diff > hit.fadeOutOffset) {
                    let t = clamp01((-diff - hit.fadeOutOffset) / hit.fadeOutDuration);
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
                    let t = clamp01((time - hit.time + this.approachTime) / this.approachTime * 3);
                    hit.body.endt = t;
                    if (hit.reverse) {
                        let p = hit.curve.pointAt(t);
                        hit.reverse.x = p.x;
                        hit.reverse.y = p.y;

                        if (t < .5) {
                            let p2 = hit.curve.pointAt(t + .005);
                            hit.reverse.rotation = Math.atan2(p.y - p2.y, p.x - p2.x);
                        }
                        else {
                            let p2 = hit.curve.pointAt(t - .005);
                            hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
                        }
                    }
                }
            }
            const resizeFollow = (hit, time, dir) => {
                if (!hit.followLasttime) hit.followLasttime = time;
                if (!hit.followLinearSize) hit.followLinearSize = 1;
                hit.followLinearSize = Math.max(1, Math.min(2, hit.followLinearSize + (time - hit.followLasttime) * dir));
                hit.followSize = hit.followLinearSize;
                hit.followLasttime = time;
            }
            if (-diff >= 0 && -diff <= hit.fadeOutDuration + hit.sliderTimeTotal) {
                let t = -diff / hit.sliderTime;
                let nextRep = Math.floor(t);
                let prevRep = hit.lastRep;

                let atEnd = false;
                if (nextRep > hit.lastrep) {
                    hit.lastrep = nextRep;
                    if (nextRep > 0 && nextRep <= hit.repeat) atEnd = true;
                }

                hit.currentRepeat = Math.min(Math.ceil(t), hit.repeat);
                t = repeatclamp(Math.min(t, hit.repeat));
                let at = hit.curve.pointAt(t);

                hit.follow.x = at.x;
                hit.follow.y = at.y;
                hit.ball.x = at.x;
                hit.ball.y = at.y;
                if (hit.base.visible && hit.score <= 0) {
                    hit.base.x = at.x;
                    hit.base.y = at.y;
                    hit.circle.x = at.x;
                    hit.circle.y = at.y;
                    for (let i = 0; i < hit.numbers.length; ++i) {
                        hit.numbers[i].x = at.x;
                        hit.numbers[i].y = at.y;
                    }
                    hit.glow.x = at.x;
                    hit.glow.y = at.y;
                    hit.burst.x = at.x;
                    hit.burst.y = at.y;
                    hit.approach.x = at.x;
                    hit.approach.y = at.y;
                }

                let dx = game.mouseX - at.x;
                let dy = game.mouseY - at.y;
                let followPixelSize = hit.followSize * this.circleRadius;
                let isfollowing = this.auto || dx * dx + dy * dy <= followPixelSize * followPixelSize;
                let predict = game.mouse(this.realtime);
                let dx1 = predict.x - at.x;
                let dy1 = predict.y - at.y;
                isfollowing |= dx1 * dx1 + dy1 * dy1 <= (followPixelSize + predict.r) * (followPixelSize + predict.r);
                let activated = this.auto || (this.game.down && isfollowing || hit.followSize > 1.01);

                for (; hit.nexttick < hit.ticks.length; ++hit.nexttick) {
                    let currentTick = hit.ticks[hit.nexttick];
                    if (currentTick.time > time) break;

                    if (!currentTick.result) {
                        if (activated) {
                            currentTick.result = true;
                            self.playTicksound(hit, currentTick.time);
                            hit.judgements[hit.judgements.length - 1].defaultScore = 50;
                        }
                        self.scoreOverlay.hit(activated ? 10 : 0, 10, currentTick.time);
                    }
                }
                if (atEnd && activated) {
                    let i = nextRep;
                    do {
                        let judge = hit.judgements[i];
                        self.invokeJudgement(judge, 300, judge.finalTime);
                        self.scoreOverlay.hit(300, 300, judge.finalTime);
                    } while (--i > prevRep);
                    self.playHitsound(hit, nextRep, hit.time + nextRep * hit.sliderTime);
                }
                if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
                    hit.ball.visible = true;
                    hit.ball.alpha = 1;
                    hit.follow.visible = true;
                    resizeFollow(hit, time, (activated ? 1 : -1) / this.followZoomInTime);
                    hit.follow.scale.x = hit.follow.scale.y = hit.followSize * .45 * this.hitSpriteScale;
                    hit.follow.alpha = hit.followSize - 1;
                }

                let timeAfter = -diff - hit.sliderTimeTotal;
                if (timeAfter > 0) {
                    resizeFollow(hit, time, -1 / this.followZoomInTime);
                    hit.follow.scale.x = hit.follow.scale.y = hit.followSize * .45 * this.hitSpriteScale;
                    hit.follow.alpha = hit.followSize - 1;
                    hit.ball.alpha = this.fadeOutEasing(timeAfter / this.ballFadeOutTime);
                    hit.ball.scale.x = hit.ball.scale.y = (1 + .15 * timeAfter / this.ballFadeOutTime) * .5 * this.hitSpriteScale;
                }
                if (hit.repeat > 1) {
                    hit.reverse.visible = hit.currentRepeat < hit.repeat - hit.repeat % 2;
                    if (hit.reverse_b) hit.reverse_b.visible = hit.currentRepeat < hit.repeat - 1 + hit.repeat % 2;
                }
                if (game.snakeout && hit.currentRepeat == hit.repeat) {
                    if (hit.repeat % 2 == 1) {
                        hit.body.startt = t;
                        hit.body.endt = 1;
                    }
                    else {
                        hit.body.startt = 0;
                        hit.body.endt = t;
                    }
                }
            }
            for (let i = 0; i < hit.ticks.length; ++i) {
                if (time < hit.ticks[i].appeartime) {
                    let dt = (hit.ticks[i].appeartime - time) / 500;
                    hit.ticks[i].alpha *= clamp01(1 - dt);
                    hit.ticks[i].scale.set(.5 * this.hitSpriteScale * (.5 + .5 * clamp01((1 - dt) * (1 + dt))));
                }
                else hit.ticks[i].scale.set(.5 * this.hitSpriteScale);

                if (time >= hit.ticks[i].time) {
                    let dt = (time - hit.ticks[i].time) / 150;
                    if (hit.ticks[i].result) {
                        hit.ticks[i].alpha *= clamp01(-Math.pow(dt - 1, 5));
                        hit.ticks[i].scale.set(.5 * this.hitSpriteScale * (1 + .5 * dt * (2 - dt)));
                    }
                    else {
                        hit.ticks[i].alpha *= clamp01(1 - dt);
                        hit.ticks[i].tint = colorLerp(0xffffff, 0xff0000, clamp01(dt * 2));
                    }
                }
            }
            for (let i = 0; i < hit.judgements.length; ++i) this.updateJudgement(hit.judgements[i], time);
        }
        this.updateSpinner = function(hit, time) {
            if (time >= hit.time && time <= hit.endTime) {
                if (game.down && !game.paused) {
                    let Xr = game.mouseX - hit.x;
                    let Yr = game.mouseY - hit.y;

                    let mouseAngle = Math.atan2(Yr, Xr);
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
            if (time >= hit.time - self.spinnerZoomInTime - self.spinnerAppearTime) {
                if (time <= hit.endTime) alpha = 1;
                else alpha = clamp01(1 - (time - hit.endTime) / self.spinnerFadeOutTime);
            }
            hit.top.alpha = alpha;
            hit.progress.alpha = alpha;
            hit.base.alpha = alpha;

            if (time < hit.endTime) {
                hit.top.scale.set(.3 * clamp01((time - (hit.time - self.spinnerZoomInTime - self.spinnerAppearTime)) / self.spinnerZoomInTime));
                hit.base.scale.set(.6 * clamp01((time - (hit.time - self.spinnerZoomInTime)) / self.spinnerZoomInTime));
            }
            if (time < hit.time) {
                let t = (hit.time - time) / (self.spinnerZoomInTime + self.spinnerAppearTime);
                if (t <= 1) hit.top.rotation = -t * t * 10;
            }

            let progress = hit.rotationProgress / hit.rotationRequired;
            if (time > hit.time) {
                hit.base.rotation = hit.rotation / 2;
                hit.top.rotation = hit.rotation / 2;
                hit.progress.scale.set(.6 * (.13 + .87 * clamp01(progress)));
            }
            else hit.progress.scale.set(0);

            if (time >= hit.endTime) {
                if (hit.score < 0) {
                    if (this.auto) this.hitSuccess(hit, 300, hit.endTime);
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
        this.updateHitObjects = function(time) {
            self.updateUpcoming(time);
            for (let i = self.upcomingHits.length - 1; i >= 0; --i) {
                let hit = self.upcomingHits[i];
                switch (hit.type) {
                    case "circle":
                        self.updateHitCircle(hit, time);
                        break;
                    case "slider":
                        self.updateSlider(hit, time);
                        break;
                    case "spinner":
                        self.updateSpinner(hit, time);
                        break;
                }
            }
        }
        this.updateBackground = function(time) {
            if (!self.background) return;
            let fade = game.backgroundDimRate;
            if (time < -self.wait) fade *= Math.max(0, 1 - (-self.wait - time) / self.backgroundFadeTime);
            self.background.tint = colorLerp(0xffffff, 0, fade);
        }

        this.breakIndex = 0;
        this.render = function(timestamp) {
            let time;
            if (this.audioReady) time = osu.audio.getPosition() * 1000 + self.offset;
            if (typeof time !== 'undefined') {
                let breakEnd;
                for (let i = this.breakIndex; i < track.breaks.length; ++i) {
                    let b = track.breaks[i];
                    if (time >= b.startTime && time <= b.endTime) {
                        breakEnd = b.endTime;
                        this.breakIndex = i;
                        break;
                    }
                }

                if (breakEnd) this.breakOverlay.countdown(breakEnd, time);
                else if (time < this.skipTime) this.breakOverlay.countdown(this.skipTime, time);
                else this.breakOverlay.visible = false;

                this.updateBackground(time);
                this.updateHitObjects(time);
                this.scoreOverlay.update(time);
                game.updatePlayerActions(time);
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
                    this.scoreOverlay.showSummary(track.metadata, this.errorMeter.record, this.retry, this.quit);
                }
                self.background.tint = 0xffffff;
            }
        }
        this.destroy = function() {
            const removeHit = o => {
                self.gamefield.removeChild(o);
                o.destroy();
            };
            _.each(self.hits, hit => {
                if (!hit.destroyed) {
                    _.each(hit.objects, removeHit);
                    _.each(hit.judgements, removeHit);
                    hit.destroyed = true;
                }
            });

            let opt = {
                children: true, texture: false
            };
            self.scoreOverlay.destroy(opt);
            self.errorMeter.destroy(opt);
            self.loadingMenu.destroy(opt);
            self.volumeMenu.destroy(opt);
            self.breakOverlay.destroy(opt);
            self.progressOverlay.destroy(opt);
            self.gamefield.destroy(opt);
            self.background.destroy();

            game.window.onresize = null;
            window.removeEventListener("blur", blurCallback);
            window.removeEventListener('wheel', volumeCallback);
            window.removeEventListener('keyup', pauseCallback);
            window.removeEventListener('keydown', skipCallback);
            game.cleanupPlayerActions();
            self.render = () => { };
        };
        this.start = function() {
            self.started = true;
            self.skipped = false;
            osu.audio.gain.gain.value = game.musicVolume * game.masterVolume;
            osu.audio.playbackRate = self.playbackRate;
            osu.audio.play(self.backgroundFadeTime + self.wait);
        };
        this.retry = () => {
            if (!game.paused) {
                osu.audio.pause();
                game.paused = true;
            }
            self.destroy();
            self.constructor(game, osu, track);
            self.loadingMenu.hide();
            self.audioReady = true;
            self.start();
        }
        this.quit = () => {
            if (!game.paused) {
                osu.audio.pause();
                game.paused = true;
            }
            self.destroy();
            if (window.quitGame) window.quitGame();
        }
        this.skip = () => {
            if (osu.audio && osu.audio.seekforward(self.skipTime / 1000)) self.skipped = true;
        };
    }
    return Playback;
});