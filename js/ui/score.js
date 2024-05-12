'use strict';

import { game, skin } from '../main.js';

const charSpacing = 10;
class LazyNumber {
    lasttime = Number.MIN_SAFE_INTEGER;
    constructor(value, lag) {
        this.lag = lag;
        this.value = value;
        this.target = value;
    }
    update(time) {
        this.value += (this.target - this.value) * (1 - Math.exp((this.lasttime - time) / this.lag));
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
function errortext(a) {
    let sum = 0;
    for (const i of a) sum += i;

    const mean = sum / a.length;
    let devSq = 0;
    for (const i of a) devSq += (i - mean) * 2;

    const sgnavg = mean.toFixed(0);
    return `${sgnavg[0] !== '-' ? '+' + sgnavg : sgnavg}±${Math.sqrt(devSq / a.length).toFixed(0)}ms`;
}
function modstext() {
    const l = '+', arr = [];
    if (game.easy) arr.push('EZ');
    if (game.daycore) arr.push('DC');
    if (game.hidden) arr.push('HD');
    if (game.hardrock) arr.push('HR');
    if (game.nightcore) arr.push('NC');
    if (game.autoplay) arr.push('AT');
    if (arr.length === 0) return '';
    return l.concat(...arr);
}
function newdiv(parent, classname, text) {
    const div = document.createElement('div');
    if (parent) parent.appendChild(div);
    if (classname) div.className = classname;
    if (text) div.innerText = text;
    return div;
}
function setSpriteArrayText(arr, str) {
    arr.width = 0;
    for (let i = 0; i < str.length; ++i) {
        const digit = arr[i], ch = str[i];
        digit.texture = skin[`score-${ch === '%' ? 'percent' : ch}.png`];
        digit.knownwidth = digit.scale.x * (digit.texture.width + charSpacing);
        digit.visible = true;
        arr.width += digit.knownwidth;
    }
    for (let i = str.length; i < arr.length; ++i) arr[i].visible = false;
}
function setSpriteArrayPos(arr, x, y, mul) {
    for (const s of arr) {
        s.scale.set(mul);
        s.position.set(x + s.scale.x * charSpacing / 2, y);
        x += s.knownwidth;
    }
}
export default class ScoreOverlay extends PIXI.Container {
    score = 0;
    combo = 0;
    maxcombo = 0;
    fullcombo = 0;
    judgeTotal = 0;
    maxJudgeTotal = 0;
    HP = 1;
    judgecnt = {
        great: 0, good: 0, meh: 0, miss: 0
    };

    scoreDisplay = new LazyNumber(0, 250);
    comboDisplay = new LazyNumber(0, 150);
    accuracyDisplay = new LazyNumber(100, 200);
    HPDisplay = new LazyNumber(1, 200);

    constructor(HPdrain, scoreMultiplier) {
        super();

        this.HPdrain = HPdrain;
        this.size = innerHeight / 800;
        this.scoreMultiplier = scoreMultiplier;

        this.scoreDigits = this.newSpriteArray(10, .4, 0xddffff);
        this.comboDigits = this.newSpriteArray(5, .2, 0xddffff);
        this.accDigits = this.newSpriteArray(7, .2, 0xddffff);
        this.HPbar = this.newSpriteArray(3, .5);

        this.HPbar[0].texture = skin['hpbarleft.png'];
        this.HPbar[1].texture = skin['hpbarright.png'];
        this.HPbar[2].texture = skin['hpbarmid.png'];
        this.HPbar[0].anchor.x = 1;
        this.HPbar[0].scale.x = this.HPbar[1].scale.x = innerWidth / 500;
        this.HPbar[0].y = this.HPbar[1].y = this.HPbar[2].y = -7 * this.size;
    }
    newSpriteArray(len, scaleMul, tint = 0xffffff) {
        const a = Array(len);
        for (let i = 0; i < len; ++i) {
            const s = a[i] = this.addChild(new PIXI.Sprite);
            s.scale.set(this.size * scaleMul);
            s.tint = tint;
        }
        return a;
    }
    HPincreasefor(result, isTick) {
        if (isTick) {
            if (result === 0) return -.005 * this.HPdrain;
            return .005 * (10.2 - this.HPdrain);
        }
        switch (result) {
            case 0: return -.02 * this.HPdrain;
            case 50: return .01 * (4 - this.HPdrain);
            case 100: return .01 * (8 - this.HPdrain);
            case 300: return .01 * (10.2 - this.HPdrain);
        }
    }
    hit(result, maxresult, time) {
        const isTick = maxresult !== 300;
        if (!isTick) switch (result) {
            case 300: ++this.judgecnt.great; break;
            case 100: ++this.judgecnt.good; break;
            case 50: ++this.judgecnt.meh; break;
            default: ++this.judgecnt.miss; break;
        }

        this.judgeTotal += result;
        this.maxJudgeTotal += maxresult;
        this.score += result * (maxresult === 300 ? 1 + this.combo * this.scoreMultiplier / 25 : 1);
        this.HP = Math.min(1, Math.max(0, this.HP + this.HPincreasefor(result, isTick)));

        const oldCombo = this.combo;
        this.combo = result > 0 ? this.combo + 1 : 0;
        this.maxcombo = Math.max(this.maxcombo, this.combo);
        ++this.fullcombo;

        if (result === 0 && oldCombo > 20) {
            game.sampleComboBreak.volume = game.masterVolume * game.effectVolume;
            game.sampleComboBreak.play();
        }

        this.scoreDisplay.set(time, this.score);
        this.comboDisplay.set(time, this.combo);
        this.accuracyDisplay.set(time, this.judgeTotal / this.maxJudgeTotal * 100);
        this.HPDisplay.set(time, this.HP);
    }
    update(time) {
        this.size = innerHeight / 800;

        this.HPbar[0].scale.x = this.HPbar[1].scale.x = innerWidth / 500;
        this.HPbar[0].scale.y = this.HPbar[1].scale.y = this.size / 2;
        this.HPbar[0].y = this.HPbar[1].y = this.HPbar[2].y = -7 * this.size;
        this.HPbar[0].x = this.HPbar[1].x = this.HPbar[2].x = this.HPDisplay.valueAt(time) * innerWidth;

        setSpriteArrayText(this.scoreDigits, this.scoreDisplay.valueAt(time).toFixed(0).padStart(6, '0'));
        setSpriteArrayText(this.comboDigits, this.comboDisplay.valueAt(time).toFixed(0) + 'x');
        setSpriteArrayText(this.accDigits, this.accuracyDisplay.valueAt(time).toFixed(2) + '%');

        const x = innerWidth / 2, y = innerHeight * .017, side = Math.min(innerWidth / 640, innerHeight / 480);
        setSpriteArrayPos(this.scoreDigits, x - this.scoreDigits.width / 2, y, this.size * .4);
        setSpriteArrayPos(this.accDigits, x - this.scoreDigits.width / 2 - this.accDigits.width - 16 * side, y + 3 * side, this.size / 5);
        setSpriteArrayPos(this.comboDigits, x + this.scoreDigits.width / 2 + 16 * side, y + 3 * side, this.size / 5);
    }
    showSummary(metadata, a, playback) {
        const acc = this.judgeTotal / this.maxJudgeTotal * 100, grading = document.body.appendChild(newdiv(null, 'grading'));
        grading.classList.add('transparent');

        let rank = 'SS';
        if (acc < .7) rank = 'D';
        else if (acc < .8) rank = 'C';
        else if (acc < .9) rank = 'B';
        else if (acc < .95) rank = 'A';
        else if (acc < 1) rank = 'S';

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
        newdiv(left, 'block acc', acc.toFixed(2) + '%');
        newdiv(left, 'block err', errortext(a));
        newdiv(left, 'block great', this.judgecnt.great.toString());
        newdiv(left, 'block good', this.judgecnt.good.toString());
        newdiv(left, 'block meh', this.judgecnt.meh.toString());
        newdiv(left, 'block miss', this.judgecnt.miss.toString());
        newdiv(left, 'block combo', `${this.maxcombo}/${this.fullcombo}x`);

        const b1 = newdiv(grading, 'btn retry'), b2 = newdiv(grading, 'btn quit');
        newdiv(b1, 'inner', 'Retry');
        newdiv(b2, 'inner', 'Quit');

        b1.onclick = () => {
            grading.remove();
            playback.retry();
        };
        b2.onclick = () => {
            grading.remove();
            playback.quit();
        };
        setTimeout(() => grading.classList.remove('transparent'), 100);
    }
    destroy(opt) {
        super.destroy(opt);
    }
};