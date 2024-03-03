const circTolerance = .15;

define([], () => {
    const dotlen = a => a.x * a.x + a.y * a.y;
    const vecsub = (a, b) => {
        return {
            x: a.x - b.x, y: a.y - b.y
        };
    }
    const vecdot = (a, b) => a.x * b.x + a.y * b.y;

    function ArcPath(hit) {
        var a = {
            x: hit.x, y: hit.y
        };
        var b = {
            x: hit.keyframes[0].x, y: hit.keyframes[0].y
        };
        var c = {
            x: hit.keyframes[1].x, y: hit.keyframes[1].y
        };

        var d = 2 * (a.x * vecsub(b, c).y + b.x * vecsub(c, a).y + c.x * vecsub(a, b).y);
        var aSq = dotlen(a);
        var bSq = dotlen(b);
        var cSq = dotlen(c);

        var center = {
            x: (aSq * vecsub(b, c).y + bSq * vecsub(c, a).y + cSq * vecsub(a, b).y) / d,
            y: (aSq * vecsub(c, b).x + bSq * vecsub(a, c).x + cSq * vecsub(b, a).x) / d
        };

        var dA = vecsub(a, center);
        var dC = vecsub(c, center);
        var radius = Math.hypot(dA.x, dA.y);

        var thetaStart = Math.atan2(dA.y, dA.x);
        var thetaEnd = Math.atan2(dC.y, dC.x);

        const twoPi = 2 * Math.PI;
        while (thetaEnd < thetaStart) thetaEnd += twoPi;

        var direct = 1;
        var arcRange = thetaEnd - thetaStart;

        var orthoAtoC = vecsub(c, a);
        orthoAtoC = {
            x: orthoAtoC.y, y: -orthoAtoC.x
        };
        if (vecdot(orthoAtoC, vecsub(b, a)) < 0) {
            direct = -1;
            arcRange = twoPi - arcRange;
        }

        var expectAng = hit.pixelLength / radius;
        if (arcRange > expectAng * .97) arcRange = expectAng;

        const pointAt = t => {
            var ang = thetaStart + direct * t * arcRange;
            return {
                x: Math.cos(ang) * radius + center.x, y: Math.sin(ang) * radius + center.y, t: t
            };
        };

        var verts = 2 * radius <= circTolerance ? 2 : Math.max(2, Math.floor(arcRange / (2 * Math.acos(1 - circTolerance / radius))));
        if (!verts) return [];
        var output = new Array(verts);

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