define(["underscore", "curve/BSpline"], (_, BSpline) => {
    const lerp = (a, b, t) => a * (1 - t) + b * t;
    class LinearBeizer {
        constructor(hit, line) {
            this.hitObject = hit;
            this.ncurve = 0;
            this.startAngle = 0;
            this.endAngle = 0;

            var beziers = [];
            var points = [];
            var lastPoi = null;

            for (var i = -1; i < hit.keyframes.length; ++i) {
                var tpoi;
                if (i !== -1) tpoi = hit.keyframes[i];
                else tpoi = {
                    x: hit.x,
                    y: hit.y
                };

                if (line) {
                    if (lastPoi !== null) {
                        points.push(tpoi);
                        beziers.push(new BSpline(points));
                        points.splice(0);
                    }
                }
                else if (lastPoi !== null && tpoi.x == lastPoi.x && tpoi.y == lastPoi.y) {
                    if (points.length >= 2) beziers.push(new BSpline(points));
                    points.splice(0);
                }

                points.push(tpoi);
                lastPoi = tpoi;
            }
            if (!line && points.length > 1) {
                beziers.push(new BSpline(points));
                points.splice(0);
            }
            var distanceAt = 0;
            var curPoint = 0;
            var curCurveIndex = 0;
            var curCurve = beziers[0];
            var lastCurve = curCurve.curve[0];
            var lastDistanceAt = 0;

            this.ncurve = Math.floor(hit.pixelLength / 4);
            this.curve = new Array(this.ncurve + 1);

            for (var i = 0; i < this.curve.length; ++i) {
                var prefDistance = i * hit.pixelLength / this.ncurve;
                while (distanceAt < prefDistance) {
                    lastDistanceAt = distanceAt;
                    lastCurve = curCurve.curve[curPoint++];

                    if (curPoint >= curCurve.ncurve) {
                        if (curCurveIndex < beziers.length - 1) {
                            curCurve = beziers[++curCurveIndex];
                            curPoint = 0;
                        }
                        else {
                            curPoint = curCurve.ncurve - 1;
                            if (lastDistanceAt === distanceAt) break;
                        }
                    }
                    distanceAt += curCurve.curveDistance[curPoint];
                }

                var thisCurve = curCurve.curve[curPoint];
                if (lastCurve == thisCurve) this.curve[i] = thisCurve;
                else {
                    var t = (prefDistance - lastDistanceAt) / (distanceAt - lastDistanceAt);
                    this.curve[i] = {
                        x: lerp(lastCurve.x, thisCurve.x, t),
                        y: lerp(lastCurve.y, thisCurve.y, t),
                    };
                }
                this.curve[i].t = i / this.ncurve;
            }
        }
        pointAt(t) {
            var indexF = t * this.ncurve;
            var index = Math.floor(indexF);
            if (index >= this.ncurve) return this.curve[this.ncurve];
            else {
                var poi = this.curve[index];
                var poi2 = this.curve[index + 1];
                var t = indexF - index;
                return {
                    x: lerp(poi.x, poi2.x, t),
                    y: lerp(poi.y, poi2.y, t)
                };
            }
        }
    }
    return LinearBeizer;
});