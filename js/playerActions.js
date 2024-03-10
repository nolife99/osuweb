function checkClickdown() {
    let click = {
        x: window.game.mouseX, y: window.game.mouseY,
        time: playback.osu.audio.getPosition() * 1000
    }, hit = playback.upcomingHits.find(inUpcoming(click));
    if (!hit && game.mouse) {
        let res = game.mouse(new Date().getTime());
        res.time = click.time;
        hit = playback.upcomingHits.find(inUpcoming_grace(res));
    }
    if (hit) {
        if (hit.type == "circle" || hit.type == "slider") {
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
    let dx = click.x - hit.x;
    let dy = click.y - hit.y;
    return hit.score < 0 && dx * dx + dy * dy < playback.circleRadius * playback.circleRadius && Math.abs(click.time - hit.time) < playback.MehTime;
}, inUpcoming_grace = predict => hit => {
    var dx = predict.x - hit.x;
    var dy = predict.y - hit.y;
    var r = predict.r + playback.circleRadius;
    return result = hit.score < 0 && dx * dx + dy * dy < r * r && Math.abs(predict.time - hit.time) < playback.MehTime;
}
export default function playerActions(playback) {
    if (playback.autoplay) playback.auto = {
        currentObject: null, curid: 0, lastx: window.game.mouseX, lasty: window.game.mouseY, lasttime: 0
    }
    window.game.updatePlayerActions = time => {
        const spinRadius = 60;
        let cur = playback.auto.currentObject;
        if (window.game.down && cur) {
            if (cur.type == "circle" || time > cur.endTime) {
                window.game.down = false;
                playback.auto.currentObject = null;
                playback.auto.lasttime = time;
                playback.auto.lastx = window.game.mouseX;
                playback.auto.lasty = window.game.mouseY;
            }
            else if (cur.type == "slider") {
                window.game.mouseX = cur.ball.x || cur.x;
                window.game.mouseY = cur.ball.y || cur.y;
            }
            else if (!window.game.paused) {
                let ang = Math.atan2(window.game.mouseY - cur.y, window.game.mouseX - cur.x) + .75;
                window.game.mouseX = cur.x + spinRadius * Math.cos(ang);
                window.game.mouseY = cur.y + spinRadius * Math.sin(ang);
            }
        }

        cur = playback.auto.currentObject;
        while (playback.auto.curid < playback.hits.length && playback.hits[playback.auto.curid].time < time) {
            let hit = playback.hits[playback.auto.curid];
            if (hit.score < 0) {
                let targX = hit.x;
                let targY = hit.y;
                if (hit.type === "spinner") {
                    let ang = Math.atan2(window.game.mouseY - targY, window.game.mouseX - targX);
                    targX += spinRadius * Math.cos(ang);
                    targY += spinRadius * Math.sin(ang);
                }
                window.game.mouseX = targX;
                window.game.mouseY = targY;

                window.game.down = true;
                checkClickdown();
            }
            ++playback.auto.curid;
        }
        if (!cur && playback.auto.curid < playback.hits.length) {
            cur = playback.hits[playback.auto.curid];
            playback.auto.currentObject = cur;
        }
        if (!cur || cur.time > time + playback.approachTime) {
            playback.auto.lasttime = time;
            return;
        }
        if (!window.game.down) {
            let targX = cur.x;
            let targY = cur.y;
            if (cur.type === "spinner") {
                let ang = Math.atan2(window.game.mouseY - targY, window.game.mouseX - targX);
                targX += spinRadius * Math.cos(ang);
                targY += spinRadius * Math.sin(ang);
            }
            let t = (time - playback.auto.lasttime) / (cur.time - playback.auto.lasttime);

            t = Math.max(0, Math.min(1, t));
            t = .5 - Math.sin((Math.pow(1 - t, 1.5) - .5) * Math.PI) / 2;

            window.game.mouseX = t * targX + (1 - t) * playback.auto.lastx;
            window.game.mouseY = t * targY + (1 - t) * playback.auto.lasty;

            if (time + 13 >= cur.time) {
                window.game.down = true;
                checkClickdown();
            }
        }
    };
    if (!playback.autoplay) {
        let movehistory = [{
            x: 256, y: 192, t: new Date().getTime()
        }], k1, k2, m1, m2;
        window.game.mouse = t => {
            let m = movehistory;
            let i = 0;
            while (i < m.length - 1 && m[0].t - m[i].t < 40 && t - m[i].t < 100) ++i;

            let velocity = i == 0 ? {
                x: 0, y: 0
            } : {
                x: (m[0].x - m[i].x) / (m[0].t - m[i].t), y: (m[0].y - m[i].y) / (m[0].t - m[i].t)
            };
            let dt = Math.min(t - m[0].t + window.currentFrameInterval, 40);
            return {
                x: m[0].x + velocity.x * dt, y: m[0].y + velocity.y * dt,
                r: Math.hypot(velocity.x, velocity.y) * Math.max(t - m[0].t, window.currentFrameInterval)
            };
        }
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
            checkClickdown();
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
            checkClickdown();
        }
        function keyupCallback(e) {
            if (e.keyCode == window.game.K1keycode) k1 = false;
            else if (e.keyCode == window.game.K2keycode) k2 = false;
            else return;

            e.preventDefault();
            e.stopPropagation();
            window.game.down = k1 || k2 || m1 || m2;
        }

        window.addEventListener("mousemove", mousemoveCallback);
        if (window.game.allowMouseButton) {
            window.addEventListener("mousedown", mousedownCallback);
            window.addEventListener("mouseup", mouseupCallback);
        }
        window.addEventListener("keydown", keydownCallback);
        window.addEventListener("keyup", keyupCallback);

        window.game.cleanupPlayerActions = () => {
            window.removeEventListener("mousemove", mousemoveCallback);
            window.removeEventListener("mousedown", mousedownCallback);
            window.removeEventListener("mouseup", mouseupCallback);
            window.removeEventListener("keydown", keydownCallback);
            window.removeEventListener("keyup", keyupCallback);
        }
    }
}