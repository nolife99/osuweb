const circTolerance = .15, twoPi = 2 * Math.PI;

define([], () => {
    const dotlen = a => a.x * a.x + a.y * a.y, vecsub = (a, b) => {
        return {
            x: a.x - b.x, y: a.y - b.y
        };
    }, vecdot = (a, b) => a.x * b.x + a.y * b.y;
    function ArcPath(hit) {
        let a = {
            x: hit.x, y: hit.y
        }, b = {
            x: hit.keyframes[0].x, y: hit.keyframes[0].y
        }, c = {
            x: hit.keyframes[1].x, y: hit.keyframes[1].y
        }, d = 2 * (a.x * vecsub(b, c).y + b.x * vecsub(c, a).y + c.x * vecsub(a, b).y);

        let aSq = dotlen(a), bSq = dotlen(b), cSq = dotlen(c), center = {
            x: (aSq * vecsub(b, c).y + bSq * vecsub(c, a).y + cSq * vecsub(a, b).y) / d,
            y: (aSq * vecsub(c, b).x + bSq * vecsub(a, c).x + cSq * vecsub(b, a).x) / d
        }, dA = vecsub(a, center), dC = vecsub(c, center);

        let radius = Math.hypot(dA.x, dA.y), thetaStart = Math.atan2(dA.y, dA.x), thetaEnd = Math.atan2(dC.y, dC.x);
        while (thetaEnd < thetaStart) thetaEnd += twoPi;

        let direct = 1, arcRange = thetaEnd - thetaStart, orthoAtoC = vecsub(c, a);
        orthoAtoC = {
            x: orthoAtoC.y, y: -orthoAtoC.x
        };
        if (vecdot(orthoAtoC, vecsub(b, a)) < 0) {
            direct = -1;
            arcRange = twoPi - arcRange;
        }

        let expectAng = hit.pixelLength / radius;
        if (arcRange > expectAng * .97) arcRange = expectAng;

        const pointAt = t => {
            let ang = thetaStart + direct * t * arcRange;
            return {
                x: Math.cos(ang) * radius + center.x, y: Math.sin(ang) * radius + center.y, t: t
            };
        };

        let verts = 2 * radius <= circTolerance ? 2 : Math.max(2, Math.floor(arcRange / (2 * Math.acos(1 - circTolerance / radius))));
        if (!verts) return [];
        let output = new Array(verts);

        for (var i = 0, l = 0; i < verts; ++i) {
            output[i] = pointAt(i / (verts - 1));
            if (i > 0) l += Math.hypot(output[i].x - output[i - 1].x, output[i].y - output[i - 1].y);
        }
        return {
            curve: output, pointAt: pointAt, totalDistance: l
        };
    }
    return ArcPath;
});