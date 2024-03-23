import { game } from './main.js';

function triggerTap(playback) {
    const click = {
        x: game.mouseX, y: game.mouseY,
        time: playback.osu.audio.pos * 1000 + game.globalOffset
    };
    let hit = playback.newHits.find(inUpcoming(click, playback));
    if (!hit && game.mouse) {
        const res = game.mouse(playback.realtime);
        res.time = click.time;
        hit = playback.newHits.find(inUpcoming_grace(res, playback));
    }
    else if (hit) {
        if (hit.type === 'circle' || hit.type === 'slider') {
            if (game.autoplay) playback.hitSuccess(hit, 300, hit.time);
            else {
                let points = 50;
                const diff = click.time - hit.time;
                if (Math.abs(diff) <= playback.GoodTime) points = 100;
                if (Math.abs(diff) <= playback.GreatTime) points = 300;
                playback.hitSuccess(hit, points, click.time);
            }
        }
    }
};
const inUpcoming = (click, playback) => hit => {
    const dx = click.x - hit.x, dy = click.y - hit.y;
    return hit.score < 0 && dx * dx + dy * dy < playback.circleRadius * playback.circleRadius && Math.abs(click.time - hit.time) < playback.MehTime;
}, inUpcoming_grace = (predict, playback) => hit => {
    const dx = predict.x - hit.x, dy = predict.y - hit.y, r = predict.r + playback.circleRadius;
    return hit.score < 0 && dx * dx + dy * dy < r * r && Math.abs(predict.time - hit.time) < playback.MehTime;
}, spinRadius = 60;
export default function playerActions(playback) {
    if (game.autoplay) var auto = {
        curid: 0, lastx: game.mouseX, lasty: game.mouseY, lasttime: 0
    }
    game.updatePlayerActions = time => {
        let cur = auto.curObj;
        if (game.down && cur) {
            if (cur.type === 'circle' || time > cur.endTime) {
                game.down = false;
                auto.curObj = null;
                auto.lasttime = time;
                auto.lastx = game.mouseX;
                auto.lasty = game.mouseY;
            }
            else if (cur.type === 'slider') {
                game.mouseX = cur.ball.x || cur.x;
                game.mouseY = cur.ball.y || cur.y;
            }
            else if (!game.paused) {
                const ang = Math.atan2(game.mouseY - cur.y, game.mouseX - cur.x) + .75;
                game.mouseX = cur.x + spinRadius * Math.cos(ang);
                game.mouseY = cur.y + spinRadius * Math.sin(ang);
            }
        }

        cur = auto.curObj;
        while (auto.curid < playback.hits.length && playback.hits[auto.curid].time < time) {
            const hit = playback.hits[auto.curid];
            if (hit.score < 0) {
                let targX = hit.x, targY = hit.y;
                if (hit.type === 'spinner') {
                    const ang = Math.atan2(game.mouseY - targY, game.mouseX - targX);
                    targX += spinRadius * Math.cos(ang);
                    targY += spinRadius * Math.sin(ang);
                }
                game.mouseX = targX;
                game.mouseY = targY;

                game.down = true;
                triggerTap(playback);
            }
            ++auto.curid;
        }
        if (!cur && auto.curid < playback.hits.length) {
            cur = playback.hits[auto.curid];
            auto.curObj = cur;
        }
        if (!cur || cur.time > time + playback.approachTime) {
            auto.lasttime = time;
            return;
        }
        if (!game.down) {
            let targX = cur.x, targY = cur.y;
            if (cur.type === 'spinner') {
                const ang = Math.atan2(game.mouseY - targY, game.mouseX - targX);
                targX += spinRadius * Math.cos(ang);
                targY += spinRadius * Math.sin(ang);
            }
            const t = .5 - Math.sin((Math.pow(1 - Math.max(0, Math.min(1, (time - auto.lasttime) / (cur.time - auto.lasttime))), 1.5) - .5) * Math.PI) / 2;

            game.mouseX = t * targX + (1 - t) * auto.lastx;
            game.mouseY = t * targY + (1 - t) * auto.lasty;

            if (time >= cur.time) {
                game.down = true;
                triggerTap(playback);
            }
        }
    };
    if (!game.autoplay) {
        const cursorData = [{
            x: 256, y: 192, t: playback.realtime
        }];
        let k1, k2, m1, m2;

        game.mouse = t => {
            let i = 0;
            while (i < cursorData.length - 1 && cursorData[0].t - cursorData[i].t < 40 && t - cursorData[i].t < 100) ++i;

            const velocity = i === 0 ? {
                x: 0, y: 0
            } : {
                x: (cursorData[0].x - cursorData[i].x) / (cursorData[0].t - cursorData[i].t),
                y: (cursorData[0].y - cursorData[i].y) / (cursorData[0].t - cursorData[i].t)
            }, dt = Math.min(t - cursorData[0].t + playback.activeTime, 40);
            return {
                x: cursorData[0].x + velocity.x * dt, y: cursorData[0].y + velocity.y * dt,
                r: Math.hypot(velocity.x, velocity.y) * Math.max(t - cursorData[0].t, playback.activeTime)
            };
        };
        function mousemoveCallback(e) {
            game.mouseX = (e.clientX - playback.gfx.xoffset) / playback.gfx.width * 512;
            game.mouseY = (e.clientY - playback.gfx.yoffset) / playback.gfx.height * 384;
            cursorData.unshift({
                x: game.mouseX, y: game.mouseY, t: playback.realtime
            });
            if (cursorData.length > 10) cursorData.pop();
        }
        function mousedownCallback(e) {
            mousemoveCallback(e);
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
            triggerTap(playback);
        }
        function mouseupCallback(e) {
            mousemoveCallback(e);
            if (e.button === 0) m1 = false;
            else if (e.button === 2) m2 = false;
            else return;

            e.preventDefault();
            e.stopPropagation();
            game.down = k1 || k2 || m1 || m2;
        }
        function keydownCallback(e) {
            if (e.keyCode === game.K1keycode) {
                if (k1) return;
                k1 = true;
            }
            else if (e.keyCode === game.K2keycode) {
                if (k2) return;
                k2 = true;
            }
            else return;

            e.preventDefault();
            e.stopPropagation();
            game.down = k1 || k2 || m1 || m2;
            triggerTap(playback);
        }
        function keyupCallback(e) {
            if (e.keyCode === game.K1keycode) k1 = false;
            else if (e.keyCode === game.K2keycode) k2 = false;
            else return;

            e.preventDefault();
            e.stopPropagation();
            game.down = k1 || k2 || m1 || m2;
        }

        window.addEventListener('mousemove', mousemoveCallback);
        if (game.allowMouseButton) {
            window.addEventListener('mousedown', mousedownCallback);
            window.addEventListener('mouseup', mouseupCallback);
        }
        window.addEventListener('keydown', keydownCallback);
        window.addEventListener('keyup', keyupCallback);

        game.cleanupPlayerActions = () => {
            window.removeEventListener('mousemove', mousemoveCallback);
            window.removeEventListener('mousedown', mousedownCallback);
            window.removeEventListener('mouseup', mouseupCallback);
            window.removeEventListener('keydown', keydownCallback);
            window.removeEventListener('keyup', keyupCallback);
        };
    }
};