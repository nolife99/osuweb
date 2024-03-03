define(["underscore"], _ => {
    const bernstein = (i, n, t) => binomialCoefficient(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);
    const binomialCoefficient = (n, k) => {
        if (k < 0 || k > n) return 0;
        if (k == 0 || k == n) return 1;
        k = Math.min(k, n - k);

        var c = 1;
        for (var i = 0; i < k; ++i) c *= (n - i) / (i + 1);
        return c;
    }

    class BSpline {
        constructor(points) {
            this.curve = [];
            this.curveDistance = [];
            this.totalDistance = 0;
            this.points = points;

            var approxLength = 0;
            for (var i = 0; i < points.length - 1; ++i) {
                var pt = points[i], nextPt = points[i + 1];
                approxLength += Math.hypot(pt.x - nextPt.x, pt.y - nextPt.y);
            }

            this.ncurve = Math.floor(approxLength / 5) + 2;
            for (var i = 0; i < this.ncurve; ++i) {
                var curve = this.pointAt(i / (this.ncurve - 1));
                this.curve.push(curve);

                if (i == 0) this.curveDistance.push(0);
                else {
                    var prevCurve = this.curve[i - 1];
                    this.curveDistance.push(Math.hypot(curve.x - prevCurve.x, curve.y - prevCurve.y));
                    this.totalDistance += this.curveDistance[i];
                }
            }
        }
        pointAt(t) {
            var c = {
                x: 0, y: 0
            };
            var n = this.points.length - 1;

            for (var i = 0; i <= n; ++i) {
                var b = bernstein(i, n, t);
                c.x += this.points[i].x * b;
                c.y += this.points[i].y * b;
            }
            return c;
        }
    }
    return BSpline;
});