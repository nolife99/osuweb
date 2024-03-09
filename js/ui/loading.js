define([], () => {
    class LoadingMenu extends PIXI.Container {
        constructor(windowfield, track) {
            super();
            PIXI.Container.call(this);

            this.fadetime = 200;
            this.alpha = 1;
            this.hidden = false;

            this.bg = new PIXI.Sprite(Skin['hpbarright.png']);
            this.bg.rotation = Math.PI / 2;
            this.bg.anchor.set(.5);
            this.bg.scale.set(.6, 500);
            this.bg.alpha = .8;
            this.addChild(this.bg);

            let allFont = {
                font: {
                    name: 'Venera', size: 14
                }
            };
            this.titletext = new PIXI.BitmapText(track.metadata.Title || '-', {
                font: {
                    name: 'Venera', size: 24
                }
            });
            this.artisttext = new PIXI.BitmapText(track.metadata.Artist || '-', allFont);
            this.versiontext = new PIXI.BitmapText(track.metadata.Version || '-', allFont);
            this.sourcetext = new PIXI.BitmapText("Source: " + (track.metadata.Source || '-'), allFont);
            this.mappertext = new PIXI.BitmapText("Mapper: " + (track.metadata.Creator || '-'), allFont);
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

            this.loading = new PIXI.Sprite(Skin['dot.png']);
            this.loading.anchor.set(.5, .3);
            this.loading.scale.set(1, .6);
            this.addChild(this.loading);

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
            if (!this.visible) return;
            if (!this.hidden) {
                this.loading.rotation = timestamp * .0075;
                return;
            }
            if (this.hidden && !this.t0) {
                this.t0 = timestamp;
                this.changed = false;
            }

            let dt = timestamp - this.t0;
            if (dt > this.fadetime) this.visible = false;
            else this.alpha = 1 - dt / this.fadetime;
        }
        destroy(options) {
            PIXI.Container.prototype.destroy.call(this, options);
        }
    }
    return LoadingMenu;
});