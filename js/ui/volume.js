const volumeRange = document.getElementById('mastervolume-range');

export default class VolumeMenu extends PIXI.Container {
    fadetime = 1000;
    visible = false;
    t0 = 0;
    mastertext = new PIXI.Text('MASTER', {
        fontFamily: 'Venera', fontSize: 20, fill: 0xffffff
    });
    volumetext = new PIXI.Text(null, {
        fontFamily: 'Venera', fontSize: 40, fill: 0xffffff
    });

    constructor() {
        super();

        this.mastertext.roundPixels = this.volumetext.roundPixels = true;
        this.mastertext.anchor.set(.5);
        this.volumetext.anchor.set(.5);

        super.addChild(this.mastertext, this.volumetext);
    }
    set(volume) {
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
        else if (!this.visible) return;

        const dt = timestamp - this.t0;
        if (dt > this.fadetime) this.visible = false;
        else this.alpha = 1 - (dt / this.fadetime) ** 5;

        if (this.alpha <= 0) {
            this.visible = false;
            return;
        }
        const ordinate = innerHeight / 2;
        this.mastertext.x = this.volumetext.x = innerWidth - 100;
        this.mastertext.y = ordinate - 30;
        this.volumetext.y = ordinate + 10;
    }
    destroy(opt) {
        super.destroy(opt);
    }
}