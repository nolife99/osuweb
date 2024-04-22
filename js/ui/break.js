import { skin } from '../main.js';

export default class BreakOverlay extends PIXI.Container {
    fadetime = 200;
    visible = false;

    barmid = new PIXI.Sprite(skin['bar.png']);
    barleft = new PIXI.Sprite(skin['barend.png']);
    barright = new PIXI.Sprite(skin['barend.png']);
    number = new PIXI.Text(null, {
        fontFamily: 'Venera', fontSize: 40, fill: 0xffffff
    });

    constructor() {
        super();

        this.barmid.anchor.set(.5);
        this.barleft.anchor.set(.08, .5);
        this.barright.anchor.set(.08, .5);
        this.barleft.rotation = Math.PI;

        this.barmid.scale.set(.3);
        this.barleft.scale.set(.3);
        this.barright.scale.set(.3);

        this.number.roundPixels = true;
        this.number.anchor.set(.5);
        this.number.y = -40;

        this.barmid.blendMode = this.barleft.blendMode = this.barright.blendMode = PIXI.BLEND_MODES.ADD;
        this.addChild(this.barmid, this.barleft, this.barright, this.number);
    }
    countdown(end, time) {
        if (!this.visible) {
            this.visible = true;
            this.starttime = time;
            this.end = end;
        }
        if (!this.visible) return;
        if (time > this.end) {
            this.visible = false;
            return;
        }
        this.position.set(innerWidth / 2, innerHeight / 2);

        const t = this.end - time, radius = 200 * t / (this.end - this.starttime);
        this.barmid.width = 2 * radius;
        this.barleft.x = -radius;
        this.barright.x = radius;
        this.number.text = Math.ceil(t / 1000).toString();
        this.alpha = Math.min(t, time - this.starttime - 200) / this.fadetime;
    }
    destroy(opt) {
        super.destroy(opt);
    }
}