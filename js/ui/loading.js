import { skin } from '../main.js';

const allFont = {
    fontFamily: 'Venera', fontSize: 14, fill: 0xffffff
};
export default class LoadingMenu extends PIXI.Container {
    fadetime = 200;
    alpha = 1;
    hidden = false;

    bg = new PIXI.Sprite(skin['hpbarright.png']);
    loading = new PIXI.Sprite(skin['dot.png']);

    constructor(track) {
        super();

        this.bg.rotation = Math.PI / 2;
        this.bg.anchor.set(.5);
        this.bg.scale.set(.6, 500);
        this.bg.alpha = .8;
        this.loading.anchor.set(.5, .3);
        this.loading.scale.set(1, .6);

        super.addChild(this.bg);
        super.addChild(this.loading);

        this.title = new PIXI.Text(track.metadata.Title || '-', {
            fontFamily: 'Venera', fontSize: 24, fill: 0xffffff
        });
        this.artist = new PIXI.Text(track.metadata.Artist || '-', allFont);
        this.version = new PIXI.Text(track.metadata.Version || '-', allFont);
        this.source = new PIXI.Text('Source: ' + (track.metadata.Source || '-'), allFont);
        this.mapper = new PIXI.Text('Mapper: ' + (track.metadata.Creator || '-'), allFont);

        this.title.roundPixels = this.artist.roundPixels = this.version.roundPixels = this.source.roundPixels = this.mapper.roundPixels = true;
        this.title.anchor.set(.5);
        this.artist.anchor.set(.5);
        this.version.anchor.set(.5);
        this.source.anchor.set(.5);
        this.mapper.anchor.set(.5);

        super.addChild(this.title, this.artist, this.version, this.source, this.mapper);
    }
    update(timestamp) {
        if (super.alpha <= 0) this.visible = false;
        if (!this.visible) return;

        this.bg.x = this.title.x = this.artist.x = this.version.x = this.source.x = this.mapper.x = this.loading.x = innerWidth / 2;
        this.bg.y = this.loading.y = innerHeight / 2;
        this.title.y = this.bg.y - 90;
        this.artist.y = this.bg.y - 60;
        this.version.y = this.bg.y + 60;
        this.source.y = this.bg.y + 85;
        this.mapper.y = this.bg.y + 110;

        if (!this.hidden) {
            this.loading.rotation = timestamp * .0075;
            return;
        }
        else if (!this.t0) this.t0 = timestamp;

        const dt = timestamp - this.t0;
        if (dt > this.fadetime) this.visible = false;
        else super.alpha = 1 - dt / this.fadetime;
    }
    destroy(opt) {
        super.destroy(opt);
    }
}