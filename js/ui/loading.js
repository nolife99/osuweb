import { skin } from '../main.js'

export default class LoadingMenu extends PIXI.Container {
    constructor(windowfield, track) {
        super();

        this.fadetime = 200;
        this.alpha = 1;
        this.hidden = false;

        this.bg = new PIXI.Sprite(skin['hpbarright.png']);
        this.loading = new PIXI.Sprite(skin['dot.png']);
        this.bg.rotation = Math.PI / 2;
        this.bg.anchor.set(.5);
        this.bg.scale.set(.6, 500);
        this.bg.alpha = .8;
        this.loading.anchor.set(.5, .3);
        this.loading.scale.set(1, .6);

        this.addChild(this.bg);
        this.addChild(this.loading);

        const allFont = {
            fontFamily: 'Venera', fontSize: 14, fill: 0xffffff
        };
        this.titletext = new PIXI.Text(track.metadata.Title || '-', {
            fontFamily: 'Venera', fontSize: 24, fill: 0xffffff
        });
        this.artisttext = new PIXI.Text(track.metadata.Artist || '-', allFont);
        this.versiontext = new PIXI.Text(track.metadata.Version || '-', allFont);
        this.sourcetext = new PIXI.Text('Source: ' + (track.metadata.Source || '-'), allFont);
        this.mappertext = new PIXI.Text('Mapper: ' + (track.metadata.Creator || '-'), allFont);
        this.titletext.anchor.set(.5);
        this.artisttext.anchor.set(.5);
        this.versiontext.anchor.set(.5);
        this.sourcetext.anchor.set(.5);
        this.mappertext.anchor.set(.5);

        this.addChild(this.titletext);
        this.addChild(this.artisttext);
        this.addChild(this.versiontext);
        this.addChild(this.sourcetext);
        this.addChild(this.mappertext);

        this.resize(windowfield);
    }
    resize(windowfield) {
        this.bg.x = windowfield.width / 2;
        this.bg.y = windowfield.height / 2;
        this.titletext.x = windowfield.width / 2;
        this.artisttext.x = windowfield.width / 2;
        this.versiontext.x = windowfield.width / 2;
        this.sourcetext.x = windowfield.width / 2;
        this.mappertext.x = windowfield.width / 2;
        this.titletext.y = windowfield.height / 2 - 90;
        this.artisttext.y = windowfield.height / 2 - 60;
        this.versiontext.y = windowfield.height / 2 + 60;
        this.sourcetext.y = windowfield.height / 2 + 85;
        this.mappertext.y = windowfield.height / 2 + 110;
        this.loading.x = windowfield.width / 2;
        this.loading.y = windowfield.height / 2;
    }
    hide(_e) {
        this.hidden = true;
    }
    update(timestamp) {
        if (this.alpha <= 0) this.visible = false;
        if (!this.visible) return;

        if (!this.hidden) {
            this.loading.rotation = timestamp * .0075;
            return;
        }
        else if (!this.t0) {
            this.t0 = timestamp;
            this.changed = false;
        }

        const dt = timestamp - this.t0;
        if (dt > this.fadetime) this.visible = false;
        else this.alpha = 1 - dt / this.fadetime;
    }
}