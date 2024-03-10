function triggerTap() {
    let click = {
        x: game.mouseX, y: game.mouseY,
        time: playback.osu.audio.getPos() * 1000
    }, hit = playback.newHits.find(inUpcoming(click));
    if (!hit && game.mouse) {
        let res = game.mouse(new Date().getTime());
        res.time = click.time;
        hit = playback.newHits.find(inUpcoming_grace(res));
    }
    else if (hit) {
        if (hit.type == 'circle' || hit.type == 'slider') {
            if (playback.autoplay) playback.hitSuccess(hit, 300, hit.time);
            else {
                let points = 50;
                let diff = click.time - hit.time;
                if (Math.abs(diff) <= playback.GoodTime) points = 100;
                if (Math.abs(diff) <= playback.GreatTime) points = 300;
                playback.hitSuccess(hit, points, click.time);
            }
        }
    }
};
const inUpcoming = click => hit => {
    let dx = click.x - hit.x, dy = click.y - hit.y;
    return hit.score < 0 && dx * dx + dy * dy < playback.circleRadius * playback.circleRadius && Math.abs(click.time - hit.time) < playback.MehTime;
}, inUpcoming_grace = predict => hit => {
    let dx = predict.x - hit.x, dy = predict.y - hit.y, r = predict.r + playback.circleRadius;
    return hit.score < 0 && dx * dx + dy * dy < r * r && Math.abs(predict.time - hit.time) < playback.MehTime;
}, spinRadius = 60;
export default function playerActions(playback) {
    if (playback.autoplay) var auto = {
        curObj: null, curid: 0, lastx: window.game.mouseX, lasty: window.game.mouseY, lasttime: 0
    }
    window.game.updatePlayerActions = time => {
        let cur = auto.curObj;
        if (window.game.down && cur) {
            if (cur.type == 'circle' || time > cur.endTime) {
                window.game.down = false;
                auto.curObj = null;
                auto.lasttime = time;
                auto.lastx = window.game.mouseX;
                auto.lasty = window.game.mouseY;
            }
            else if (cur.type == 'slider') {
                window.game.mouseX = cur.ball.x || cur.x;
                window.game.mouseY = cur.ball.y || cur.y;
            }
            else if (!window.game.paused) {
                let ang = Math.atan2(window.game.mouseY - cur.y, window.game.mouseX - cur.x) + .75;
                window.game.mouseX = cur.x + spinRadius * Math.cos(ang);
                window.game.mouseY = cur.y + spinRadius * Math.sin(ang);
            }
        }

        cur = auto.curObj;
        while (auto.curid < playback.hits.length && playback.hits[auto.curid].time < time) {
            let hit = playback.hits[auto.curid];
            if (hit.score < 0) {
                let targX = hit.x, targY = hit.y;
                if (hit.type === 'spinner') {
                    let ang = Math.atan2(window.game.mouseY - targY, window.game.mouseX - targX);
                    targX += spinRadius * Math.cos(ang);
                    targY += spinRadius * Math.sin(ang);
                }
                window.game.mouseX = targX;
                window.game.mouseY = targY;

                window.game.down = true;
                triggerTap();
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
        if (!window.game.down) {
            let targX = cur.x, targY = cur.y;
            if (cur.type === 'spinner') {
                let ang = Math.atan2(window.game.mouseY - targY, window.game.mouseX - targX);
                targX += spinRadius * Math.cos(ang);
                targY += spinRadius * Math.sin(ang);
            }
            let t = (time - auto.lasttime) / (cur.time - auto.lasttime);

            t = Math.max(0, Math.min(1, t));
            t = .5 - Math.sin((Math.pow(1 - t, 1.5) - .5) * Math.PI) / 2;

            window.game.mouseX = t * targX + (1 - t) * auto.lastx;
            window.game.mouseY = t * targY + (1 - t) * auto.lasty;

            if (time + 13 >= cur.time) {
                window.game.down = true;
                triggerTap();
            }
        }
    };
    if (!playback.autoplay) {
        let movehistory = [{
            x: 256, y: 192, t: new Date().getTime()
        }], k1, k2, m1, m2;
        window.game.mouse = t => {
            let m = movehistory, i = 0;
            while (i < m.length - 1 && m[0].t - m[i].t < 40 && t - m[i].t < 100) ++i;

            let velocity = i == 0 ? {
                x: 0, y: 0
            } : {
                x: (m[0].x - m[i].x) / (m[0].t - m[i].t), y: (m[0].y - m[i].y) / (m[0].t - m[i].t)
            };
            let dt = Math.min(t - m[0].t + window.activeTime, 40);
            return {
                x: m[0].x + velocity.x * dt, y: m[0].y + velocity.y * dt,
                r: Math.hypot(velocity.x, velocity.y) * Math.max(t - m[0].t, window.activeTime)
            };
        };
        function mousemoveCallback(e) {
            window.game.mouseX = (e.clientX - gfx.xoffset) / gfx.width * 512;
            window.game.mouseY = (e.clientY - gfx.yoffset) / gfx.height * 384;
            movehistory.unshift({
                x: window.game.mouseX, y: window.game.mouseY, t: new Date().getTime()
            });
            if (movehistory.length > 10) movehistory.pop();
        }
        function mousedownCallback(e) {
            mousemoveCallback(e);
            if (e.button == 0) {
                if (m1) return;
                m1 = true;
            }
            else if (e.button == 2) {
                if (m2) return;
                m2 = true;
            }
            else return;

            e.preventDefault();
            e.stopPropagation();
            window.game.down = k1 || k2 || m1 || m2;
            triggerTap();
        }
        function mouseupCallback(e) {
            mousemoveCallback(e);
            if (e.button == 0) m1 = false;
            else if (e.button == 2) m2 = false;
            else return;

            e.preventDefault();
            e.stopPropagation();
            window.game.down = k1 || k2 || m1 || m2;
        }
        function keydownCallback(e) {
            if (e.keyCode == window.game.K1keycode) {
                if (k1) return;
                k1 = true;
            }
            else if (e.keyCode == window.game.K2keycode) {
                if (k2) return;
                k2 = true;
            }
            else return;

            e.preventDefault();
            e.stopPropagation();
            window.game.down = k1 || k2 || m1 || m2;
            triggerTap();
        }
        function keyupCallback(e) {
            if (e.keyCode == window.game.K1keycode) k1 = false;
            else if (e.keyCode == window.game.K2keycode) k2 = false;
            else return;

            e.preventDefault();
            e.stopPropagation();
            window.game.down = k1 || k2 || m1 || m2;
        }

        window.addEventListener('mousemove', mousemoveCallback);
        if (window.game.allowMouseButton) {
            window.addEventListener('mousedown', mousedownCallback);
            window.addEventListener('mouseup', mouseupCallback);
        }
        window.addEventListener('keydown', keydownCallback);
        window.addEventListener('keyup', keyupCallback);

        window.game.cleanupPlayerActions = () => {
            window.removeEventListener('mousemove', mousemoveCallback);
            window.removeEventListener('mousedown', mousedownCallback);
            window.removeEventListener('mouseup', mouseupCallback);
            window.removeEventListener('keydown', keydownCallback);
            window.removeEventListener('keyup', keyupCallback);
        };
    }
};