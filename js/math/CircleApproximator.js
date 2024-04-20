'use strict';

const tau = 2 * Math.PI, dotlen = a => a.x * a.x + a.y * a.y, vecsub = (a, b) => {
    return {
        x: a.x - b.x, y: a.y - b.y
    };
}, vecdot = (a, b) => a.x * b.x + a.y * b.y;

export default function CircleApproximator(hit) {
    const a = {
        x: hit.x, y: hit.y
    }, b = hit.keyframes[0], c = hit.keyframes[1],
        d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));

    if (d === 0) return null;
    const aSq = dotlen(a), bSq = dotlen(b), cSq = dotlen(c), center = {
        x: (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d,
        y: (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d
    }, dA = vecsub(a, center), dC = vecsub(c, center), radius = Math.hypot(dA.x, dA.y), thetaStart = Math.atan2(dA.y, dA.x);

    let thetaEnd = Math.atan2(dC.y, dC.x);
    while (thetaEnd < thetaStart) thetaEnd += tau;

    let direct = 1, arcRange = thetaEnd - thetaStart;
    if (vecdot({
        x: c.y - a.y, y: -(c.x - a.x)
    }, vecsub(b, a)) < 0) {
        direct = -1;
        arcRange = tau - arcRange;
    }
    const expectRange = direct * hit.pixelLength / radius;
    return {
        calcLength: arcRange * radius, pointAt: t => {
            const ang = thetaStart + t * expectRange;
            return {
                x: Math.cos(ang) * radius + center.x, y: Math.sin(ang) * radius + center.y, t: t
            };
        }
    };
};