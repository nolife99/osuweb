function timeformat(ms) {
    let s = ms / 1000, prefix = '';
    if (s < 0) {
        prefix = '-';
        s = -s;
    }

    let m = Math.floor(s / 60);
    if (m >= 60) {
        prefix += Math.floor(m / 60) + ':';
        m %= 60;
    }
    return prefix.concat(m, ':', (s % 60).toFixed(0).padStart(2, '0'));
}
export default class ProgressOverlay extends PIXI.Container {
    constructor(windowfield, starttime, endtime) {
        super();

        this.starttime = starttime;
        this.endtime = endtime;

        const font = {
            fontFamily: 'Venera', fontSize: 16, fill: 0xddffff, trim: true
        };
        this.remaining = new PIXI.Text(null, font);
        this.remaining.roundPixels = true;
        this.remaining.anchor.set(1);
        super.addChild(this.remaining);
        
        this.past = new PIXI.Text(null, font);
        this.past.roundPixels = true;
        this.past.anchor.set(0, 1);
        super.addChild(this.past);

        this.resize(windowfield);
    }
    resize(windowfield) {
        this.remaining.x = windowfield.width - 10;
        this.remaining.y = windowfield.height - 10;
        this.past.x = 10;
        this.past.y = windowfield.height - 10;
    }
    update(time) {
        if (time >= this.endtime) return;
        this.remaining.text = timeformat(this.endtime - time);
        this.past.text = timeformat(time - this.starttime);
    }
}