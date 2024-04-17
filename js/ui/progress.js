'use strict';

function timeformat(ms) {
    let s = ms / 1000, prefix = '';
    if (s < 0) {
        prefix = '-';
        s = -s;
    }

    let m = Math.floor(s / 60);
    if (m >= 60) {
        prefix += `${Math.floor(m / 60)}:`;
        m %= 60;
    }
    return `${prefix}${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
const font = {
    fontFamily: 'Venera', fontSize: 16, fill: 0xddffff
};

export default class ProgressOverlay extends PIXI.Container {
    remaining = new PIXI.Text(null, font);
    past = new PIXI.Text(null, font);

    constructor(starttime, endtime) {
        super();

        this.starttime = starttime;
        this.endtime = endtime;

        this.remaining.roundPixels = this.past.roundPixels = true;
        this.remaining.anchor.set(1);
        this.past.anchor.set(0, 1);

        super.addChild(this.remaining, this.past);
    }
    update(time) {
        if (time > this.endtime) return;

        this.remaining.x = innerWidth - 10;
        this.remaining.y = this.past.y = innerHeight - 10;
        this.past.x = 10;

        this.remaining.text = timeformat(this.endtime - time);
        this.past.text = timeformat(time - this.starttime);
    }
}