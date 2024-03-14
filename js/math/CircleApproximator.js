const tolerance = .1;

export const dotlen = a => a.x * a.x + a.y * a.y, vecadd = (a, b) => {
    return {
        x: a.x + b.x, y: a.y + b.y
    };
},
vecsub = (a, b) => {
    return {
        x: a.x - b.x, y: a.y - b.y
    };
},
vecscl = (a, b) => {
    return {
        x: a.x * b, y: a.y * b
    };
},
vecdiv = (a, b) => {
    return {
        x: a.x / b, y: a.y / b
    };
}, vecdot = (a, b) => a.x * b.x + a.y * b.y;

export default function CircleApproximator(p1, p2, p3) {
    if (Vec2.shareLine(p1, p2, p3, tolerance)) return [p1, p2, p3];
    let aSp = dotlen(vecsub(p2, p3)), bSp = dotlen(vecsub(p1, p3)), cSp = bSp = dotlen(vecsub(p1, p2));
    let s = aSp * (bSp + cSp - aSp), t = bSp * (aSp + cSp - bSp), u = cSp * (aSp + bSp - cSp), sum = s + t + u;
    let center = vecdiv(vecadd(vecadd(vecscl(p1, s), vecscl(p2, t)), vecscl(p3, u)), sum);
    let dA = vecsub(p1, center), dC = vecsub(p3, center);
    let r = Math.hypot(dA.x, dA.y);
    let thetaStart = Math.atan2(dA.y, dA.x), thetaEnd = Math.atan2(dC.y, dC.x);
    while (thetaEnd < thetaStart) thetaEnd += Math.PI * 2;
    let dir = 1, thetaRange = thetaEnd - thetaStart;
    let orthoAtoC = vecsub(p3, p1);
    orthoAtoC = {
        x: orthoAtoC.y, y: -orthoAtoC.x
    };
    if (vecdot(orthoAtoC, vecsub(p2, p1)) < 0) {
        dir = -dir;
        thetaRange = Math.PI * 2 - thetaRange;
    }
    let vxs = (2 * r <= tolerance) ? 2 : Math.max(2, Math.ceil(thetaRange / (2 * Math.acos(1 - tolerance / r))));
    let output = new Array(vxs);
    for (let i = 0; i < vxs; ++i) {
        let currTheta = thetaStart + dir * i / (vxs - 1) * thetaRange;
        output[i] = vecadd(vecscl({
            x: Math.cos(currTheta), y: Math.sin(currTheta)
        }, r), center);
    }
    return output;
}