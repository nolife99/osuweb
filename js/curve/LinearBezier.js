import FlattenBSpline from './BSpline.js';

const lerp = (a, b, t) => a + (b - a) * t;
export default class LinearBezier {
    constructor(hit, line) {
        this.definedLength = hit.pixelLength;
        this.splines = [];

        const points = [];
        for (let i = -1, lastPt; i < hit.keyframes.length; ++i) {
            const pt = i !== -1 ? hit.keyframes[i] : {
                x: hit.x,
                y: hit.y
            };
            if (line) {
                if (lastPt) {
                    points.push(pt);
                    this.splines.push(points.splice(0));
                }
            }
            else if (lastPt && pt.x === lastPt.x && pt.y === lastPt.y) {
                const pts = points.splice(0);
                if (pts.length > 1) this.splines.push(FlattenBSpline(pts));
            }
            points.push(pt);
            lastPt = pt;
        }
        if (!line && points.length > 1) this.splines.push(FlattenBSpline(points.splice(0)));

        this.pointLength = 0;
        this.preLens = this.splines.map(curve => {
            const parts = new Float32Array(curve.length - 1);
            for (let j = 0; j < curve.length - 1; ++j) {
                const cur = curve[j], nex = curve[j + 1];
                this.pointLength += parts[j] = Math.hypot(nex.x - cur.x, nex.y - cur.y);
            }
            return {
                lengths: parts, total: this.pointLength
            };
        });
    }
    pointAt(t) {
        const target = t * this.definedLength;
        if (this.pointLength < target) {
            const lastCurve = this.splines.at(-1), p1 = lastCurve.at(-1), p2 = lastCurve.at(-2),
                dir = Math.atan2(p1.y - p2.y, p1.x - p2.x), overshoot = target - this.pointLength;
            return {
                x: p1.x + overshoot * Math.cos(dir), y: p1.y + overshoot * Math.sin(dir), t: t
            };
        }
        let length = 0, i = 0;
        while (i < this.preLens.length - 1 && this.preLens[i].total < target) length = this.preLens[i++].total;

        try {
            var curve = this.splines[i], preLen = this.preLens[i].lengths;
        }
        catch {
            console.log(this.splines);
        }
        for (let j = 0; j < curve.length - 1; ++j) {
            const partLen = preLen[j];
            if (length + partLen >= target) {
                const partT = (target - length) / partLen, cur = curve[j], nex = curve[j + 1];
                return {
                    x: lerp(cur.x, nex.x, partT), y: lerp(cur.y, nex.y, partT), t: t
                };
            }
            length += partLen;
        }
        const last = this.splines.at(-1).at(-1);
        return {
            x: last.x, y: last.y, t: t
        };
    }
};