define([], () => {
    class LazyNumber {
        constructor(value) {
            this.value = value;
            this.target = value;
            this.lasttime = -1000000;
        }
        update(time) {
            this.value += (this.target - this.value) * (1 - Math.exp((this.lasttime - time) / 200));
            this.lasttime = time;
        }
        set(time, value) {
            this.update(time);
            this.target = value;
        }
        valueAt(time) {
            this.update(time);
            return this.value;
        }
    }

    function ScoreOverlay(windowfield, HPdrain, scoreMultiplier) {
        PIXI.Container.call(this);

        this.field = windowfield;
        this.HPdrain = HPdrain;
        this.scaleMul = windowfield.height / 800;
        this.scoreMultiplier = scoreMultiplier;

        this.score = 0;
        this.combo = 0;
        this.maxcombo = 0;
        this.fullcombo = 0;
        this.judgeTotal = 0;
        this.maxJudgeTotal = 0;
        this.HP = 1;
        this.judgecnt = {
            great: 0, good: 0, meh: 0, miss: 0
        }

        this.score4display = new LazyNumber(0);
        this.combo4display = new LazyNumber(0);
        this.accuracy4display = new LazyNumber(100);
        this.HP4display = new LazyNumber(1);

        this.newSpriteArray = (len, scaleMul, tint = 0xffffff) => {
            let a = new Array(len);
            for (let i = 0; i < len; ++i) {
                a[i] = new PIXI.Sprite();
                a[i].scale.x = a[i].scale.y = this.scaleMul * scaleMul;
                a[i].anchor.x = 0;
                a[i].anchor.y = 0;
                a[i].alpha = 1;
                a[i].tint = tint;
                this.addChild(a[i]);
            }
            return a;
        }

        this.scoreDigits = this.newSpriteArray(10, .4, 0xddffff);
        this.comboDigits = this.newSpriteArray(6, .2, 0xddffff);
        this.accuracyDigits = this.newSpriteArray(7, .2, 0xddffff);

        this.HPbar = this.newSpriteArray(3, .5);
        this.HPbar[0].texture = Skin["hpbarleft.png"];
        this.HPbar[1].texture = Skin["hpbarright.png"];
        this.HPbar[2].texture = Skin["hpbarmid.png"];
        this.HPbar[0].anchor.x = 1;
        this.HPbar[0].scale.x = this.field.width / 500;
        this.HPbar[1].scale.x = this.field.width / 500;
        this.HPbar[0].y = -7 * this.scaleMul;
        this.HPbar[1].y = -7 * this.scaleMul;
        this.HPbar[2].y = -7 * this.scaleMul;

        this.resize = windowfield => {
            this.field = windowfield;
            this.scaleMul = windowfield.height / 800;

            function f(a, mul) {
                for (let i = 0; i < a.length; ++i) a[i].scale.x = a[i].scale.y = mul;
            };
            f(this.scoreDigits, this.scaleMul * .4);
            f(this.comboDigits, this.scaleMul * .2);
            f(this.accuracyDigits, this.scaleMul * .2);
            f(this.HPbar, this.scaleMul * .5);

            this.HPbar[0].scale.x = this.field.width / 500;
            this.HPbar[1].scale.x = this.field.width / 500;
            this.HPbar[0].y = -7 * this.scaleMul;
            this.HPbar[1].y = -7 * this.scaleMul;
            this.HPbar[2].y = -7 * this.scaleMul;
        }
        this.HPincreasefor = result => {
            switch (result) {
                case 0: return -.02 * this.HPdrain;
                case 50: return .01 * (4 - this.HPdrain);
                case 100: return .01 * (8 - this.HPdrain);
                case 300: return .01 * (10.2 - this.HPdrain);
                default: return 0;
            }
        }
        this.hit = (result, maxresult, time) => {
            if (maxresult == 300) {
                if (result == 300) ++this.judgecnt.great;
                else if (result == 100) ++this.judgecnt.good;
                else if (result == 50) ++this.judgecnt.meh;
                else if (result == 0) ++this.judgecnt.miss;
            }

            this.judgeTotal += result;
            this.maxJudgeTotal += maxresult;
            this.score += result * (maxresult == 300 ? 1 + this.combo * this.scoreMultiplier / 25 : 1);
            this.HP = Math.min(1, Math.max(0, this.HP + this.HPincreasefor(result)));

            let oldCombo = this.combo;
            this.combo = result > 0 ? this.combo + 1 : 0;
            this.maxcombo = Math.max(this.maxcombo, this.combo);
            ++this.fullcombo;

            if (result == 0 && oldCombo > 20) {
                window.game.sampleComboBreak.volume = window.game.masterVolume * window.game.effectVolume;
                window.game.sampleComboBreak.play();
            }

            this.score4display.set(time, this.score);
            this.combo4display.set(time, this.combo);
            this.accuracy4display.set(time, this.judgeTotal / this.maxJudgeTotal * 100);
            this.HP4display.set(time, this.HP);
        }

        this.charspacing = 10;
        this.setSpriteArrayText = (arr, str) => {
            arr.width = 0;
            for (let i = 0; i < str.length; ++i) {
                let digit = arr[i], ch = str[i];
                digit.texture = Skin["score-" + (ch === '%' ? "percent" : ch) + ".png"];
                digit.knownwidth = digit.scale.x * (digit.texture.width + this.charspacing);
                digit.visible = true;
                arr.width += digit.knownwidth;
            }

            for (let i = str.length; i < arr.length; ++i) arr[i].visible = false;
            arr.useLength = str.length;
        }
        this.setSpriteArrayPos = (arr, x, y) => {
            let curx = x;
            for (let i = 0; i < arr.useLength; ++i) {
                arr[i].x = curx + arr[i].scale.x * this.charspacing / 2;
                arr[i].y = y;
                curx += arr[i].knownwidth;
            }
        }
        this.update = time => {
            let HPpos = this.HP4display.valueAt(time) * this.field.width;
            this.HPbar[0].x = HPpos;
            this.HPbar[1].x = HPpos;
            this.HPbar[2].x = HPpos;

            this.setSpriteArrayText(this.scoreDigits, this.score4display.valueAt(time).toFixed(0).padStart(6, '0'));
            this.setSpriteArrayText(this.comboDigits, this.combo4display.valueAt(time).toFixed(0) + "x");
            this.setSpriteArrayText(this.accuracyDigits, this.accuracy4display.valueAt(time).toFixed(2) + "%");

            let basex = this.field.width * .5, basey = this.field.height * .017;
            let unit = Math.min(this.field.width / 640, this.field.height / 480);
            this.setSpriteArrayPos(this.scoreDigits, basex - this.scoreDigits.width / 2, basey);
            this.setSpriteArrayPos(this.accuracyDigits, basex - this.scoreDigits.width / 2 - this.accuracyDigits.width - 16 * unit, basey + 3 * unit);
            this.setSpriteArrayPos(this.comboDigits, basex + this.scoreDigits.width / 2 + 16 * unit, basey + 3 * unit);
        }
        this.showSummary = (metadata, a, retryCallback, quitCallback) => {
            function grade(acc) {
                if (acc >= 1) return 'SS';
                if (acc >= .95) return 'S';
                if (acc >= .9) return 'A';
                if (acc >= .8) return 'B';
                if (acc >= .7) return 'C';
                return 'D';
            }
            function errortext() {
                let sum = 0;
                for (let i = 0; i < a.length; ++i) sum += a[i];
                let avg = sum / a.length, sumsqerr = 0;
                for (let i = 0; i < a.length; ++i) {
                    let base = a[i] - avg;
                    sumsqerr += base * base;
                }
                let letiance = sumsqerr / a.length, stdev = Math.sqrt(letiance), sgnavg = avg.toFixed(0);
                if (sgnavg[0] != '-') sgnavg = '+' + sgnavg;
                return sgnavg + "±" + stdev.toFixed(0) + "ms";
            }
            function modstext() {
                let l = [], game = window.game;
                if (game.easy) l.push("EZ");
                if (game.daycore) l.push("DC");
                if (game.hidden) l.push("HD");
                if (game.hardrock) l.push("HR");
                if (game.nightcore) l.push("NC");
                if (game.autoplay) l.push("AT");
                if (l.length == 0) return "";
                let s = l[0];
                for (let i = 1; i < l.length; ++i) s = s + '+' + l[i];
                return s;
            }
            function newdiv(parent, classname, text) {
                let div = document.createElement("div");
                if (parent) parent.appendChild(div);
                if (classname) div.className = classname;
                if (text) div.innerText = text;
                return div;
            }

            let acc = this.judgeTotal / this.maxJudgeTotal, rank = grade(acc), grading = newdiv(null, "grading");
            grading.classList.add("transparent");
            document.body.appendChild(grading);

            let top = newdiv(grading, "top"), info = newdiv(top, "beatmap-info");
            newdiv(info, "title", metadata.Title);
            newdiv(info, "artist", metadata.Artist);
            newdiv(info, "version", metadata.Version);
            newdiv(info, "mapper", "mapped by " + metadata.Creator);
            newdiv(info, "version", modstext());
            newdiv(top, "ranking", "Ranking");
            newdiv(top, "grade " + rank, rank);

            let left = newdiv(grading, "left");
            newdiv(left, "block score", this.score.toFixed(0));
            newdiv(left, "block acc", (acc * 100).toFixed(2) + "%");
            newdiv(left, "block err", errortext());
            newdiv(left, "block great", this.judgecnt.great.toString());
            newdiv(left, "block good", this.judgecnt.good.toString());
            newdiv(left, "block meh", this.judgecnt.meh.toString());
            newdiv(left, "block miss", this.judgecnt.miss.toString());
            newdiv(left, "block placeholder");
            newdiv(left, "block combo", this.maxcombo.toString() + "/" + this.fullcombo.toString() + "x");

            let b1 = newdiv(grading, "btn retry"), b2 = newdiv(grading, "btn quit");
            newdiv(b1, "inner", "Retry");
            newdiv(b2, "inner", "Quit");

            b1.onclick = () => {
                grading.remove();
                retryCallback();
            }
            b2.onclick = () => {
                grading.remove();
                quitCallback();
            }
            window.setTimeout(() => grading.classList.remove("transparent"), 100);
        }
    }

    if (PIXI.Container) ScoreOverlay.__proto__ = PIXI.Container;
    ScoreOverlay.prototype = Object.create(PIXI.Container && PIXI.Container.prototype);
    ScoreOverlay.prototype.constructor = ScoreOverlay;
    ScoreOverlay.prototype.destroy = function(options) {
        PIXI.Container.prototype.destroy.call(this, options);
    };

    return ScoreOverlay;
});