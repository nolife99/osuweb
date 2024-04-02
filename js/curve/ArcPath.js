const tau = 2 * Math.PI, dotlen = a => a.x * a.x + a.y * a.y, vecsub = (a, b) => {
    return {
        x: a.x - b.x, y: a.y - b.y
    };
}, vecdot = (a, b) => a.x * b.x + a.y * b.y;

export default function ArcPath(hit) {
    const a = {
        x: hit.x, y: hit.y
    }, b = hit.keyframes[0], c = hit.keyframes[1],
        d = 2 * (a.x * vecsub(b, c).y + b.x * vecsub(c, a).y + c.x * vecsub(a, b).y);

    if (d === 0) return null;
    const aSq = dotlen(a), bSq = dotlen(b), cSq = dotlen(c), center = {
        x: (aSq * vecsub(b, c).y + bSq * vecsub(c, a).y + cSq * vecsub(a, b).y) / d,
        y: (aSq * vecsub(c, b).x + bSq * vecsub(a, c).x + cSq * vecsub(b, a).x) / d
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
        pointLength: arcRange * radius, pointAt: t => {
            const ang = thetaStart + t * expectRange;
            return {
                x: Math.cos(ang) * radius + center.x, y: Math.sin(ang) * radius + center.y, t: t
            };
        }
    };
};