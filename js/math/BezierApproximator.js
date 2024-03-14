const tolerance = .25, tolerance_sq = tolerance * tolerance;

import { vecadd, vecsub, vecscl, dotlen } from "./CircleApproximator.js";

export default class BezierApproximator {
    constructor(controlPoints) {
        this.controlPoints = controlPoints;
        this.count = controlPoints.length;
        this.subdivisionBuffer1 = new Array(this.count);
        this.subdivisionBuffer2 = new Array(this.count * 2 - 1);
    }
    isFlatEnough(controlPoints) {
        for (let i = 1; i < controlPoints.length - 1; ++i) if (dotlen(vecadd(vecsub(vecsub(
            controlPoints[i - 1], controlPoints[i]), controlPoints[i]), controlPoints[i + 1])) > tolerance_sq * 4) return false;
        return true;
    }
    subdivide(cp, l, r) {
        let mid = this.subdivisionBuffer1;
        for (let i = 0; i < this.count; ++i) mid[i] = cp[i];
        for (let i = 0; i < this.count; i++) {
            l[i] = mid[0];
            r[this.count - i - 1] = mid[this.count - i - 1];
            for (let j = 0; j < this.count - i - 1; j++) mid[j] = vecscl(vecadd(mid[j], mid[j + 1]), .5);
        }
    }
    approximate(cp, out) {
        let l = subdivisionBuffer2, r = subdivisionBuffer1;
        this.subdivide(cp, l, r);

        for (let i = 0; i < this.count - 1; ++i) l[i + this.count] = r[i + 1];
        out.push(cp[0]);
        for (let idx, i = 1; i < this.count - 1; i++) {
            idx = 2 * i;
            out.push(vecscl(vecadd(vecadd(vecscl(l[idx], 2), l[idx - 1]), l[idx + 1]), .25));
        }
    }
    createBezier() {
        let out = [];
        if (this.count == 0) return out;
        if (this.count == 2) {
            out.push(this.controlPoints[0]);
            out.push(this.controlPoints[1]);
            return out;
        }

        let toFlatten = [], freeBuffers = [];
        toFlatten.push(this.controlPoints);

        let lc = subdivisionBuffer2, parent, rc;
        while (toFlatten.length > 0) {
            parent = toFlatten.pop();
            if (this.isFlatEnough(parent)) {
                this.approximate(parent, out);
                freeBuffers.push(parent);
            }
            else {
                rc = freeBuffers.length > 0 ? freeBuffers.pop() : new Array(this.count);
                this.subdivide(parent, lc, rc);
                for (let i = 0; i < this.count; ++i) parent[i] = lc[i];

                toFlatten.push(rc);
                toFlatten.push(parent);
            }
        }
        out.push(this.controlPoints[this.count - 1]);
        return out;
    }
}