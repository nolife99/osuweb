import { game } from './main.js';

const inUpcoming = (click, playback) => hit => {
    const dx = click.x - hit.x, dy = click.y - hit.y;
    return !hit.score && dx * dx + dy * dy < playback.circleRadius * playback.circleRadius && Math.abs(click.time - hit.time) < playback.MehTime;
}, inUpcoming_grace = (predict, playback) => hit => {
    const dx = predict.x - hit.x, dy = predict.y - hit.y, r = predict.r + playback.circleRadius;
    return !hit.score && dx * dx + dy * dy < r * r && Math.abs(predict.time - hit.time) < playback.MehTime;
}, spinRadius = 60;

export default class Player {
    constructor(playback) {
        this.playback = playback;
        if (game.autoplay) {
            this.lastX = game.mouseX;
            this.lastY = game.mouseY;
            this.lastTime = 0;
        }
        else {
            this.cursorData = [{
                x: 256, y: 192, t: this.playback.realtime
            }];
            let k1, k2, m1, m2;

            this.mousemoveCallback = e => {
                game.mouseX = (e.clientX - playback.gfx.xoffset) / playback.gfx.width * 512;
                game.mouseY = (e.clientY - playback.gfx.yoffset) / playback.gfx.height * 384;
                this.cursorData.unshift({
                    x: game.mouseX, y: game.mouseY, t: this.playback.realtime
                });
                if (this.cursorData.length > 10) this.cursorData.pop();
            }
            this.mousedownCallback = e => {
                this.mousemoveCallback(e);
                if (e.button === 0) {
                    if (m1) return;
                    m1 = true;
                }
                else if (e.button === 2) {
                    if (m2) return;
                    m2 = true;
                }
                else return;

                e.preventDefault();
                e.stopPropagation();
                game.down = k1 || k2 || m1 || m2;
                this.triggerTap();
            }
            this.mouseupCallback = e => {
                this.mousemoveCallback(e);
                if (e.button === 0) m1 = false;
                else if (e.button === 2) m2 = false;
                else return;

                e.preventDefault();
                e.stopPropagation();
                game.down = k1 || k2 || m1 || m2;
            }
            this.keydownCallback = e => {
                if (e.code === game.K1keycode) {
                    if (k1) return;
                    k1 = true;
                }
                else if (e.code === game.K2keycode) {
                    if (k2) return;
                    k2 = true;
                }
                else return;

                e.preventDefault();
                e.stopPropagation();
                game.down = k1 || k2 || m1 || m2;
                this.triggerTap();
            }
            this.keyupCallback = e => {
                if (e.code === game.K1keycode) k1 = false;
                else if (e.code === game.K2keycode) k2 = false;
                else return;

                e.preventDefault();
                e.stopPropagation();
                game.down = k1 || k2 || m1 || m2;
            }
            this.disableContextMenu = e => {
                e.preventDefault();
                e.stopPropagation();
            }

            addEventListener('contextmenu', this.disableContextMenu);
            addEventListener('mousemove', this.mousemoveCallback);
            if (game.allowMouseButton) {
                addEventListener('mousedown', this.mousedownCallback);
                addEventListener('mouseup', this.mouseupCallback);
            }
            addEventListener('keydown', this.keydownCallback);
            addEventListener('keyup', this.keyupCallback);
        }
        game.down = false;
    }
    mouse(t) {
        let i = 0;
        const first = this.cursorData[0];
        while (i < this.cursorData.length - 1 && first.t - this.cursorData[i].t < 40 && t - this.cursorData[i].t < 100) ++i;

        const now = this.cursorData[i], velocity = i === 0 ? {
            x: 0, y: 0
        } : {
            x: (first.x - now.x) / (first.t - now.t),
            y: (first.y - now.y) / (first.t - now.t)
        }, dt = Math.min(t - first.t + this.playback.activeTime, 40);
        return {
            x: first.x + velocity.x * dt, y: first.y + velocity.y * dt,
            r: Math.hypot(velocity.x, velocity.y) * Math.max(t - first.t, this.playback.activeTime)
        };
    }
    triggerTap() {
        const click = {
            x: game.mouseX, y: game.mouseY, time: this.playback.audioTick
        };
        let hit = this.playback.newHits.find(inUpcoming(click, this.playback));
        if (!hit && !game.autoplay) {
            const res = this.mouse(this.playback.realtime);
            res.time = click.time;
            hit = this.playback.newHits.find(inUpcoming_grace(res, this.playback));
        }
        else if (hit) {
            if (hit.type === 'circle' || hit.type === 'slider') {
                if (game.autoplay) this.playback.hitSuccess(hit, hit.type === 'slider' ? 30 : 300, hit.time);
                else {
                    let points = 50;
                    const diff = click.time - hit.time;
                    if (Math.abs(diff) <= this.playback.GoodTime) points = 100;
                    if (Math.abs(diff) <= this.playback.GreatTime) points = 300;
                    this.playback.hitSuccess(hit, hit.type === 'slider' ? 30 : points, click.time);
                }
            }
        }
    }
    cleanup() {
        removeEventListener('contextmenu', this.disableContextMenu);
        removeEventListener('mousemove', this.mousemoveCallback);
        removeEventListener('mousedown', this.mousedownCallback);
        removeEventListener('mouseup', this.mouseupCallback);
        removeEventListener('keydown', this.keydownCallback);
        removeEventListener('keyup', this.keyupCallback);
    }
    update(time) {
        let cur = this.curObj;
        if (game.down && cur && !cur.destroyed) {
            if (cur.type === 'circle' || time > cur.endTime) {
                if (cur.type !== 'spinner') {
                    const { x, y } = cur.ball || cur;
                    game.mouseX = x;
                    game.mouseY = y;
                }
                game.down = false;

                this.curObj = null;
                this.lastX = game.mouseX;
                this.lastY = game.mouseY;
                this.lastTime = time;
            }
            else if (cur.type === 'slider') {
                const { x, y } = cur.ball;
                game.mouseX = x;
                game.mouseY = y;
            }
            else if (!game.paused) {
                const ang = Math.atan2(game.mouseY - cur.y, game.mouseX - cur.x) + .75;
                game.mouseX = cur.x + spinRadius * Math.cos(ang);
                game.mouseY = cur.y + spinRadius * Math.sin(ang);
            }
        }

        cur = this.curObj;
        for (var i = 0; i < this.playback.newHits.length; ++i) {
            const hit = this.playback.newHits[i];
            if (hit.time > time) break;

            if (!hit.score) {
                let targX = hit.x, targY = hit.y;
                if (hit.type === 'spinner') {
                    const ang = Math.atan2(game.mouseY - targY, game.mouseX - targX);
                    targX += spinRadius * Math.cos(ang);
                    targY += spinRadius * Math.sin(ang);
                }
                game.mouseX = targX;
                game.mouseY = targY;

                game.down = true;
                this.triggerTap(this.playback);

                if (!cur || cur.type !== 'slider' || hit.type !== 'circle') {
                    cur = hit;
                    this.curObj = hit;
                }
            }
        }
        if (!cur && i < this.playback.newHits.length) {
            cur = this.playback.newHits[i];
            this.curObj = cur;
        }
        if (!cur || cur.time > time + this.playback.approachTime) {
            this.lastTime = time;
            return;
        }
        if (!game.down) {
            let { x, y } = cur;
            if (cur.type === 'spinner') {
                const ang = Math.atan2(game.mouseY - y, game.mouseX - x);
                x += spinRadius * Math.cos(ang);
                x += spinRadius * Math.sin(ang);
            }
            const t = Math.sin(((time - this.lastTime) / (cur.time - this.lastTime) * Math.PI) / 2), ease = 1 - t;
            game.mouseX = t * x + ease * this.lastX;
            game.mouseY = t * y + ease * this.lastY;
        }
    }
};