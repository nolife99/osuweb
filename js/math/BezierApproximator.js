export default class BezierApproximator {
    paths = [];
    calcLength = 0;

    constructor(hit, line) {
        this.definedLength = hit.pixelLength;
        const points = [];

        for (let i = -1, prev; i < hit.keyframes.length; ++i) {
            const pt = i !== -1 ? hit.keyframes[i] : {
                x: hit.x, y: hit.y
            };
            if (line) {
                if (prev) {
                    points.push(pt);
                    this.paths.push(points.splice(0));
                }
            }
            else if (prev && pt.x === prev.x && pt.y === prev.y) {
                const pts = points.splice(0);
                if (pts.length > 1) this.paths.push(FlattenBezier(pts));
            }
            points.push(pt);
            prev = pt;
        }
        if (!line && points.length > 1) this.paths.push(FlattenBezier(points));

        this.preLens = this.paths.map(curve => {
            const parts = new Float32Array(curve.length - 1);
            for (let j = 0; j < parts.length; ++j) {
                const cur = curve[j], nex = curve[j + 1];
                this.calcLength += parts[j] = Math.hypot(nex.x - cur.x, nex.y - cur.y);
            }
            return {
                lengths: parts, total: this.calcLength
            };
        });
    }
    pointAt(t) {
        const target = t * this.definedLength;
        if (this.calcLength < target) {
            const lastCurve = this.paths.at(-1), p1 = lastCurve.at(-1), p2 = lastCurve.at(-2),
                dir = Math.atan2(p1.y - p2.y, p1.x - p2.x), overshoot = target - this.calcLength;
            return {
                x: p1.x + overshoot * Math.cos(dir), y: p1.y + overshoot * Math.sin(dir), t: t
            };
        }
        let length = 0, i = 0;
        while (i < this.preLens.length - 1 && this.preLens[i].total < target) length = this.preLens[i++].total;

        const curve = this.paths[i], preLen = this.preLens[i].lengths;
        for (let j = 0; j < curve.length - 1; ++j) {
            const partLen = preLen[j];
            if (length + partLen >= target) {
                const partT = (target - length) / partLen, cur = curve[j], nex = curve[j + 1];
                return {
                    x: cur.x + (nex.x - cur.x) * partT, y: cur.y + (nex.y - cur.y) * partT, t: t
                };
            }
            length += partLen;
        }
        const last = this.paths.at(-1).at(-1);
        return {
            x: last.x, y: last.y, t: t
        };
    }
};
const FlattenBezier = pts => {
    if (pts.length === 2) return pts;
    const deg = pts.length - 1, output = [], toFlatten = [structuredClone(pts)], freeBufs = [],
        subBuf1 = Array(pts.length), subBuf2 = Array(deg * 2 + 1), l = subBuf2;

    while (toFlatten.length > 0) {
        const parent = toFlatten.pop();
        let isFlat = true;

        for (let i = 1; i < parent.length - 1; ++i) {
            const last = parent[i - 1], cur = parent[i], next = parent[i + 1];
            if ((last.x - 2 * cur.x + next.x) ** 2 + (last.y - 2 * cur.y + next.y) ** 2 > .36) {
                isFlat = false;
                break;
            }
        }
        if (isFlat) {
            for (let i = 0; i < pts.length; ++i) subBuf1[i] = parent[i];
            for (let i = 0, k = deg; i < pts.length; ++i, --k) {
                subBuf2[i] = subBuf1[0];
                for (let j = 0; j < k; ++j) {
                    const cur = subBuf1[j], next = subBuf1[j + 1];
                    subBuf1[j] = {
                        x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2
                    }
                }
            }
            for (let i = 1; i < pts.length; ++i) subBuf2[deg + i] = subBuf1[i];
            output.push(parent[0]);

            for (let i = 1; i < deg; ++i) {
                const idx = i * 2, last = subBuf2[idx - 1], cur = subBuf2[idx], next = subBuf2[idx + 1];
                output.push({
                    x: (last.x + 2 * cur.x + next.x) / 4, y: (last.y + 2 * cur.y + next.y) / 4
                });
            }
            freeBufs.push(parent);
            continue;
        }
        for (let i = 0; i < pts.length; ++i) subBuf1[i] = parent[i];

        const r = freeBufs.length > 0 ? freeBufs.pop() : Array(pts.length);
        for (let i = 0, k = deg; i < pts.length; ++i, --k) {
            l[i] = subBuf1[0];
            r[k] = subBuf1[k];
            for (let j = 0; j < k; ++j) {
                const cur = subBuf1[j], next = subBuf1[j + 1];
                subBuf1[j] = {
                    x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2
                }
            }
        }
        for (let i = 0; i < pts.length; ++i) parent[i] = l[i];

        toFlatten.push(r);
        toFlatten.push(parent);
    }
    output.push(pts[deg]);
    return output;
};