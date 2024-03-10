const bernstein = (i, n, t) => binomialCoefficient(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i), binomialCoefficient = (n, k) => {
    if (k < 0 || k > n) return 0;
    if (k == 0 || k == n) return 1;
    k = Math.min(k, n - k);

    let c = 1;
    for (let i = 0; i < k; ++i) c *= (n - i) / (i + 1);
    return c;
};
export default class BSpline {
    constructor(points) {;
        this.totalDistance = 0;
        this.points = points;

        let approxLength = 0;
        for (let i = 0; i < points.length - 1; ++i) {
            let pt = points[i], nextPt = points[i + 1];
            approxLength += Math.hypot(pt.x - nextPt.x, pt.y - nextPt.y);
        }

        this.ncurve = Math.floor(approxLength / 5) + 2;
        this.curve = new Array(this.ncurve);
        this.curveDistance = new Array(this.ncurve);

        for (let i = 0; i < this.ncurve; ++i) {
            let curve = this.pointAt(i / (this.ncurve - 1));
            this.curve[i] = curve;

            if (i == 0) this.curveDistance[i] = 0;
            else {
                let prevCurve = this.curve[i - 1];
                this.curveDistance[i] = Math.hypot(curve.x - prevCurve.x, curve.y - prevCurve.y);
                this.totalDistance += this.curveDistance[i];
            }
        }
    }
    pointAt(t) {
        let c = {
            x: 0, y: 0
        }, n = this.points.length - 1;
        for (let i = 0; i <= n; ++i) {
            let pt = this.points[i], b = bernstein(i, n, t);
            c.x += pt.x * b;
            c.y += pt.y * b;
        }
        return c;
    }
};