import { skin } from '../main.js';

export default class BreakOverlay extends PIXI.Container {
    constructor(windowfield) {
        super();

        this.fadetime = 200;
        this.appearthreshold = 3000;
        this.visible = false;

        this.barmid = new PIXI.Sprite(skin['bar.png']);
        this.barmid.anchor.set(.5);
        this.barmid.x = 0;
        this.barmid.y = 0;

        this.barleft = new PIXI.Sprite(skin['barend.png']);
        this.barleft.anchor.set(.1, .5);
        this.barleft.rotation = Math.PI;
        this.barleft.y = 0;

        this.barright = new PIXI.Sprite(skin['barend.png']);
        this.barright.anchor.set(.1, .5);
        this.barright.y = 0;

        this.barmid.blendMode = PIXI.BLEND_MODES.ADD;
        this.barleft.blendMode = PIXI.BLEND_MODES.ADD;
        this.barright.blendMode = PIXI.BLEND_MODES.ADD;

        this.barmid.scale.set(.3);
        this.barleft.scale.set(.3);
        this.barright.scale.set(.3);

        super.addChild(this.barmid);
        super.addChild(this.barleft);
        super.addChild(this.barright);

        this.number = new PIXI.Text(null, {
            fontFamily: 'Venera', fontSize: 40, fill: 0xffffff, trim: true
        });
        this.number.roundPixels = true;
        this.number.anchor.set(.5);
        this.number.x = 0;
        this.number.y = -40;
        super.addChild(this.number);
        this.resize(windowfield);
    }
    resize(windowfield) {
        this.x = windowfield.width / 2;
        this.y = windowfield.height / 2;
    }
    countdown(nextapproachtime, time) {
        if (nextapproachtime - time > this.appearthreshold && !this.visible) {
            this.visible = true;
            this.starttime = time;
            this.nextapproachtime = nextapproachtime;
        }
        if (!this.visible) return;
        if (time >= this.nextapproachtime) {
            this.visible = false;
            return;
        }

        const t = this.nextapproachtime - time, radius = 200 * t / (this.nextapproachtime - this.starttime);
        this.barmid.width = 2 * radius;
        this.barleft.x = -radius;
        this.barright.x = radius;
        this.number.text = Math.ceil(t / 1000).toString();
        super.alpha = Math.min(t, time - this.starttime - 500) / this.fadetime;
    }
    destroy(opt) {
        super.destroy(opt);
    }
}