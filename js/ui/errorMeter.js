import { skin } from '../main.js';

const barheight = 220, color300 = 0x66ccff, color100 = 0x88b300, color50 = 0xffcc22;
class ErrorMeter extends PIXI.Container {
    avgmarker = new PIXI.Sprite(skin['reversearrow.png']);

    constructor(r300, r100, r50) {
        super();

        this.lscale = barheight / 2 / r50;
        const newbarpiece = (height, tint) => {
            const piece = new PIXI.Sprite(skin['errormeterbar.png']);
            piece.width = 2;
            piece.height = height;
            piece.tint = tint;
            piece.anchor.set(.5);
            piece.x = 0;
            piece.y = 0;
            super.addChild(piece);
        }
        newbarpiece(barheight, color50);
        newbarpiece(barheight * r100 / r50, color100);
        newbarpiece(barheight * r300 / r50, color300);

        const centerline = new PIXI.Sprite(skin['errormeterbar.png']);
        centerline.width = 5;
        centerline.height = 2;
        centerline.anchor.set(0, .5);
        centerline.tint = color300;
        centerline.x = 0;
        centerline.y = 0;
        super.addChild(centerline);

        this.avgmarker.scale.set(.08);
        this.avgmarker.anchor.set(.5);
        this.avgmarker.x = -8;
        this.avgmarker.y = 0;
        super.addChild(this.avgmarker);

        this.ticks = Array(20);
        for (let i = 0; i < this.ticks.length; ++i) {
            const tick = new PIXI.Sprite(skin['followpoint.png']);
            tick.scale.set(.25, .19);
            tick.anchor.set(0, .5);
            tick.alpha = 0;
            tick.t0 = Number.MIN_SAFE_INTEGER;
            tick.x = 2;
            this.ticks[i] = tick;
            super.addChild(tick);
        }
        this.poolptr = 0;
        this.avgerror = 0;
    }
    update(time) {
        for (const tick of this.ticks) tick.alpha = Math.exp(-(time - tick.t0) / 1000);
    }
    hit(hiterror, time) {
        const tick = this.ticks[this.poolptr];
        this.poolptr = (this.poolptr + 1) % this.ticks.length;
        tick.t0 = time;
        tick.y = hiterror * this.lscale;
        this.avgerror = this.avgerror * .9 + hiterror * .1;
        this.avgmarker.y = this.avgerror * this.lscale;
    }
    destroy(opt) {
        super.destroy(opt);
    }
}
export default class ErrorMeterOverlay extends PIXI.Container {
    record = [];

    constructor(windowfield, r300, r100, r50) {
        super();

        this.barl = new ErrorMeter(r300, r100, r50);
        this.barr = new ErrorMeter(r300, r100, r50);
        this.barr.scale.x = -1;
        super.addChild(this.barl);
        super.addChild(this.barr);

        this.resize(windowfield);
    }
    resize(windowfield) {
        this.barl.x = 27;
        this.barl.y = windowfield.height / 2;
        this.barr.x = windowfield.width - 27;
        this.barr.y = windowfield.height / 2;
    }
    hit(hiterror, time) {
        this.barl.hit(hiterror, time);
        this.barr.hit(hiterror, time);
        this.record.push(hiterror);
    }
    update(time) {
        this.barl.update(time);
        this.barr.update(time);
    }
    destroy(opt) {
        super.destroy(opt);
    }
}