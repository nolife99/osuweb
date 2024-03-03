define([], function() {
    function ProgressOverlay(windowfield, starttime, endtime) {
        PIXI.Container.call(this);
        this.starttime = starttime;
        this.endtime = endtime;

        var font = {
            font: {
                name: 'Venera', size: 16
            }, tint: 0xddffff
        };

        this.remaining = new PIXI.BitmapText("", font);
        this.remaining.anchor.set(1);
        this.addChild(this.remaining);

        this.past = new PIXI.BitmapText("", font);
        this.past.anchor.set(0, 1);
        this.addChild(this.past);

        this.resize = function(windowfield) {
            this.remaining.x = windowfield.width - 10;
            this.remaining.y = windowfield.height - 10;
            this.past.x = 10;
            this.past.y = windowfield.height - 10;
        }
        this.resize(windowfield);

        const timeformat = ms => {
            let s = ms / 1000;
            let prefix = '';
            if (s < 0) {
                prefix = '-';
                s = -s;
            }
            return prefix + Math.floor(s / 60) + ":" + (s % 60).toFixed(0).padStart(2, '0');
        }
        this.update = function(time) {
            if (time >= this.endtime) return;
            this.remaining.text = timeformat(this.endtime - time);
            this.past.text = timeformat(time - this.starttime);
        }
    }

    if (PIXI.Container) ProgressOverlay.__proto__ = PIXI.Container;
    ProgressOverlay.prototype = Object.create(PIXI.Container && PIXI.Container.prototype);
    ProgressOverlay.prototype.constructor = ProgressOverlay;
    ProgressOverlay.prototype.destroy = function(options) {
        PIXI.Container.prototype.destroy.call(this, options);
    };

    return ProgressOverlay;
});