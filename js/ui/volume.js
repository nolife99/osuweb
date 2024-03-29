const volumeRange = document.getElementById('mastervolume-range');

export default class VolumeMenu extends PIXI.Container {
    constructor(windowfield) {
        super();

        this.fadetime = 1000;
        this.visible = false;
        this.t0 = 0;

        this.mastertext = new PIXI.Text('MASTER', {
            fontFamily: 'Venera', fontSize: 20, fill: 0xffffff
        });
        this.volumetext = new PIXI.Text(null, {
            fontFamily: 'Venera', fontSize: 40, fill: 0xffffff
        });
        this.mastertext.roundPixels = true;
        this.volumetext.roundPixels = true;
        this.mastertext.anchor.set(.5);
        this.volumetext.anchor.set(.5);

        super.addChild(this.mastertext);
        super.addChild(this.volumetext);

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

        volumeRange.value = volume;
        volumeRange.onchange();
        volumeRange.oninput();
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
        else super.alpha = 1 - Math.pow(dt / this.fadetime, 5);
    }
    destroy(opt) {
        super.destroy(opt);
    }
}