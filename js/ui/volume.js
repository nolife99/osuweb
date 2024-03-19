export default class VolumeMenu extends PIXI.Container {
    constructor(windowfield) {
        super();

        this.fadetime = 1000;
        this.visible = false;
        this.alpha = 1;
        this.t0 = 0;

        this.mastertext = new PIXI.Text('MASTER', {
            fontFamily: 'Venera', fontSize: 20, fill: 0xffffff
        });
        this.mastertext.anchor.set(.5);

        this.volumetext = new PIXI.Text('', {
            fontFamily: 'Venera', fontSize: 40, fill: 0xffffff
        });
        this.volumetext.anchor.set(.5);

        this.addChild(this.mastertext);
        this.addChild(this.volumetext);

        this.resize(windowfield);
    }
    resize(windowfield) {
        this.mastertext.x = windowfield.width - 100;
        this.mastertext.y = windowfield.height / 2 - 30;
        this.volumetext.x = windowfield.width - 100;
        this.volumetext.y = windowfield.height / 2 + 10;
    }
    setVolume(volume) {
        this.changed = true;
        this.volumetext.text = volume.toFixed(0);
    }
    update(timestamp) {
        if (this.changed) {
            this.visible = true;
            this.t0 = timestamp;
            this.changed = false;
        }
        if (!this.visible) return;

        const dt = timestamp - this.t0;
        if (dt > this.fadetime) this.visible = false;
        else this.alpha = 1 - Math.pow(dt / this.fadetime, 5);
    }
}