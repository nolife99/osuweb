import BSpline from './BSpline.js';

const lerp = (a, b, t) => a * (1 - t) + b * t;
export default class LinearBezier {
    constructor(hit, line) {
        const beziers = [], points = [];
        let lastPoi;

        for (let i = -1; i < hit.keyframes.length; ++i) {
            let tpoi;
            if (i !== -1) tpoi = hit.keyframes[i];
            else tpoi = {
                x: hit.x,
                y: hit.y
            };
            if (line) {
                if (lastPoi) {
                    points.push(tpoi);
                    beziers.push(new BSpline(points.splice(0)));
                }
            }
            else if (lastPoi && tpoi.x === lastPoi.x && tpoi.y === lastPoi.y) {
                const pts = points.splice(0);
                if (pts.length > 1) beziers.push(new BSpline(pts));
            }
            points.push(tpoi);
            lastPoi = tpoi;
        }
        if (!line && points.length > 1) beziers.push(new BSpline(points.splice(0)));

        let distAt = 0, curPoint = 0, curveIndex = 0, curCurve = beziers[0], lastCurve = curCurve.curve[0], lastDist = 0;
        this.ncurve = Math.ceil(hit.pixelLength / 5);
        this.path = new Array(this.ncurve + 1);

        for (let i = 0; i < this.path.length; ++i) {
            const prefDistance = i * hit.pixelLength / this.ncurve;
            while (distAt < prefDistance) {
                lastDist = distAt;
                lastCurve = curCurve.curve[curPoint++];

                if (curPoint >= curCurve.curve.length) {
                    if (curveIndex < beziers.length - 1) {
                        curCurve = beziers[++curveIndex];
                        curPoint = 0;
                    }
                    else {
                        curPoint = curCurve.curve.length - 1;
                        if (lastDist === distAt) break;
                    }
                }
                if (curPoint > 0) distAt += curCurve.curveDistance(curPoint);
            }

            const thisCurve = curCurve.curve[curPoint];
            if (lastCurve === thisCurve) this.path[i] = thisCurve;
            else {
                const t = (prefDistance - lastDist) / (distAt - lastDist);
                this.path[i] = {
                    x: lerp(lastCurve.x, thisCurve.x, t),
                    y: lerp(lastCurve.y, thisCurve.y, t)
                };
            }
            this.path[i].t = i / this.ncurve;
        }
    }
    pointAt(t) {
        const indexF = t * this.ncurve, index = Math.floor(indexF);
        if (index >= this.ncurve) return this.path[this.ncurve];
        else {
            const poi = this.path[index], poi2 = this.path[index + 1], t = indexF - index;
            return {
                x: lerp(poi.x, poi2.x, t),
                y: lerp(poi.y, poi2.y, t),
                t: lerp(poi.t, poi2.t, t)
            };
        }
    }
};