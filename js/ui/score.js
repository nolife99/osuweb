const charSpacing = 10;
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
function grade(acc) {
    if (acc >= 1) return 'SS';
    if (acc >= .95) return 'S';
    if (acc >= .9) return 'A';
    if (acc >= .8) return 'B';
    if (acc >= .7) return 'C';
    return 'D';
}
function errortext(a) {
    let sum = 0;
    for (const i of a) sum += i;

    const avg = sum / a.length; 
    let sumsqerr = 0;

    for (const i of a) {
        const base = i - avg;
        sumsqerr += base * base;
    }
    let sgnavg = avg.toFixed(0);
    if (sgnavg[0] !== '-') sgnavg = '+' + sgnavg;
    return sgnavg + '±' + Math.sqrt(sumsqerr / a.length).toFixed(0) + 'ms';
}
function modstext() {
    let l = '+'; 
    if (window.game.easy) l += 'EZ';
    if (window.game.daycore) l += 'DC';
    if (window.game.hidden) l += 'HD';
    if (window.game.hardrock) l += 'HR';
    if (window.game.nightcore) l += 'NC';
    if (window.game.autoplay) l += 'AT';
    if (l === '+') return '';
    return l;
}
function newdiv(parent, classname, text) {
    const div = document.createElement('div');
    if (parent) parent.appendChild(div);
    if (classname) div.className = classname;
    if (text) div.innerText = text;
    return div;
}
function f(a, mul) {
    for (let i = 0; i < a.length; ++i) a[i].scale.x = a[i].scale.y = mul;
}
function setSpriteArrayText(arr, str) {
    arr.width = 0;
    for (let i = 0; i < str.length; ++i) {
        const digit = arr[i], ch = str[i];
        digit.texture = window.skin['score-' + (ch === '%' ? 'percent' : ch) + '.png'];
        digit.knownwidth = digit.scale.x * (digit.texture.width + charSpacing);
        digit.visible = true;
        arr.width += digit.knownwidth;
    }

    for (let i = str.length; i < arr.length; ++i) arr[i].visible = false;
    arr.useLength = str.length;
}
function setSpriteArrayPos(arr, x, y) {
    let curx = x;
    for (let i = 0; i < arr.useLength; ++i) {
        const s = arr[i];
        s.x = curx + s.scale.x * charSpacing / 2;
        s.y = y;
        curx += s.knownwidth;
    }
}
export default class ScoreOverlay extends PIXI.Container {
    constructor(windowfield, HPdrain, scoreMultiplier) {
        super();

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
        };

        this.score4display = new LazyNumber(0);
        this.combo4display = new LazyNumber(0);
        this.accuracy4display = new LazyNumber(100);
        this.HP4display = new LazyNumber(1);

        this.scoreDigits = this.newSpriteArray(10, .4, 0xddffff);
        this.comboDigits = this.newSpriteArray(6, .2, 0xddffff);
        this.accuracyDigits = this.newSpriteArray(7, .2, 0xddffff);

        this.HPbar = this.newSpriteArray(3, .5);
        this.HPbar[0].texture = window.skin['hpbarleft.png'];
        this.HPbar[1].texture = window.skin['hpbarright.png'];
        this.HPbar[2].texture = window.skin['hpbarmid.png'];
        this.HPbar[0].anchor.x = 1;
        this.HPbar[0].scale.x = this.field.width / 500;
        this.HPbar[1].scale.x = this.field.width / 500;
        this.HPbar[0].y = -7 * this.scaleMul;
        this.HPbar[1].y = -7 * this.scaleMul;
        this.HPbar[2].y = -7 * this.scaleMul;
    }
    newSpriteArray(len, scaleMul, tint = 0xffffff) {
        const a = new Array(len);
        for (let i = 0; i < len; ++i) {
            const s = new PIXI.Sprite();
            s.scale.x = s.scale.y = this.scaleMul * scaleMul;
            s.anchor.x = 0;
            s.anchor.y = 0;
            s.alpha = 1;
            s.tint = tint;
            a[i] = s;
            this.addChild(s);
        }
        return a;
    }
    resize(windowfield) {
        this.field = windowfield;
        this.scaleMul = windowfield.height / 800;

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
    HPincreasefor(result) {
        switch (result) {
            case 0: return -.02 * this.HPdrain;
            case 50: return .01 * (4 - this.HPdrain);
            case 100: return .01 * (8 - this.HPdrain);
            case 300: return .01 * (10.2 - this.HPdrain);
            default: return 0;
        }
    }
    hit(result, maxresult, time) {
        if (maxresult === 300) {
            if (result === 300) ++this.judgecnt.great;
            else if (result === 100) ++this.judgecnt.good;
            else if (result === 50) ++this.judgecnt.meh;
            else if (result === 0) ++this.judgecnt.miss;
        }

        this.judgeTotal += result;
        this.maxJudgeTotal += maxresult;
        this.score += result * (maxresult === 300 ? 1 + this.combo * this.scoreMultiplier / 25 : 1);
        this.HP = Math.min(1, Math.max(0, this.HP + this.HPincreasefor(result)));

        const oldCombo = this.combo;
        this.combo = result > 0 ? this.combo + 1 : 0;
        this.maxcombo = Math.max(this.maxcombo, this.combo);
        ++this.fullcombo;

        if (result === 0 && oldCombo > 20) {
            window.game.sampleComboBreak.volume = window.game.masterVolume * window.game.effectVolume;
            window.game.sampleComboBreak.play();
        }

        this.score4display.set(time, this.score);
        this.combo4display.set(time, this.combo);
        this.accuracy4display.set(time, this.judgeTotal / this.maxJudgeTotal * 100);
        this.HP4display.set(time, this.HP);
    }
    update(time) {
        const HPpos = this.HP4display.valueAt(time) * this.field.width;
        this.HPbar[0].x = HPpos;
        this.HPbar[1].x = HPpos;
        this.HPbar[2].x = HPpos;

        setSpriteArrayText(this.scoreDigits, this.score4display.valueAt(time).toFixed(0).padStart(6, '0'));
        setSpriteArrayText(this.comboDigits, this.combo4display.valueAt(time).toFixed(0) + 'x');
        setSpriteArrayText(this.accuracyDigits, this.accuracy4display.valueAt(time).toFixed(2) + '%');

        const basex = this.field.width * .5, basey = this.field.height * .017, unit = Math.min(this.field.width / 640, this.field.height / 480);
        setSpriteArrayPos(this.scoreDigits, basex - this.scoreDigits.width / 2, basey);
        setSpriteArrayPos(this.accuracyDigits, basex - this.scoreDigits.width / 2 - this.accuracyDigits.width - 16 * unit, basey + 3 * unit);
        setSpriteArrayPos(this.comboDigits, basex + this.scoreDigits.width / 2 + 16 * unit, basey + 3 * unit);
    }
    showSummary(metadata, a, retryCallback, quitCallback) {
        const acc = this.judgeTotal / this.maxJudgeTotal, rank = grade(acc), grading = newdiv(null, 'grading');
        grading.classList.add('transparent');
        document.body.appendChild(grading);

        const top = newdiv(grading, 'top'), info = newdiv(top, 'beatmap-info');
        newdiv(info, 'title', metadata.Title);
        newdiv(info, 'artist', metadata.Artist);
        newdiv(info, 'version', metadata.Version);
        newdiv(info, 'mapper', 'mapped by ' + metadata.Creator);
        newdiv(info, 'version', modstext());
        newdiv(top, 'ranking', 'Ranking');
        newdiv(top, 'grade ' + rank, rank);

        const left = newdiv(grading, 'left');
        newdiv(left, 'block score', this.score.toFixed(0));
        newdiv(left, 'block acc', (acc * 100).toFixed(2) + '%');
        newdiv(left, 'block err', errortext(a));
        newdiv(left, 'block great', this.judgecnt.great.toString());
        newdiv(left, 'block good', this.judgecnt.good.toString());
        newdiv(left, 'block meh', this.judgecnt.meh.toString());
        newdiv(left, 'block miss', this.judgecnt.miss.toString());
        newdiv(left, 'block placeholder');
        newdiv(left, 'block combo', this.maxcombo.toString() + '/' + this.fullcombo.toString() + 'x');

        const b1 = newdiv(grading, 'btn retry'), b2 = newdiv(grading, 'btn quit');
        newdiv(b1, 'inner', 'Retry');
        newdiv(b2, 'inner', 'Quit');

        b1.onclick = () => {
            grading.remove();
            retryCallback();
        };
        b2.onclick = () => {
            grading.remove();
            quitCallback();
        };
        window.setTimeout(() => grading.classList.remove('transparent'), 100);
    }
}