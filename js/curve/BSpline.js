const bernstein = (i, n, t) => binomialCoefficient(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i), binomialCoefficient = (n, k) => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);

    let c = 1;
    for (let i = 0; i < k; ++i) c *= (n - i) / (i + 1);
    return c;
};
export default class BSpline {
    constructor(points) {
        this.points = points;

        let approxLength = 0;
        for (let i = 0; i < points.length - 1; ++i) {
            let pt = points[i], nextPt = points[i + 1];
            approxLength += Math.hypot(pt.x - nextPt.x, pt.y - nextPt.y);
        }

        this.ncurve = Math.ceil(approxLength / 7);
        this.curve = new Array(this.ncurve);
        this.curveDistance = new Array(this.ncurve);

        for (let i = 0; i < this.ncurve; ++i) {
            let curve = this.pointAt(i / (this.ncurve - 1));
            this.curve[i] = curve;

            if (i === 0) this.curveDistance[i] = 0;
            else {
                let prevCurve = this.curve[i - 1];
                this.curveDistance[i] = Math.hypot(curve.x - prevCurve.x, curve.y - prevCurve.y);
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
/*
function BSplineToPiecewiseLinear(points, degree) {
    if (points.length < 2) return points.length == 0 ? [] : [points[0]];
    degree = Math.min(degree, points.length - 1);

    let output = [], pointCount = points.length - 1;

    let toFlatten = bSplineToBezierInternal(points, degree);
    let freeBuffers = [];

    // "toFlatten" contains all the curves which are not yet approximated well enough.
    // We use a stack to emulate recursion without the risk of running into a stack overflow.
    // (More specifically, we iteratively and adaptively refine our curve with a
    // <a href="https://en.wikipedia.org/wiki/Depth-first_search">Depth-first search</a>
    // over the tree resulting from the subdivisions we make.)

    let subdivisionBuffer1 = new Array(degree + 1), subdivisionBuffer2 = new Array(degree * 2 + 1);
    let leftChild = subdivisionBuffer2;

    while (toFlatten.length > 0) {
        let parent = toFlatten.pop();
        if (bezierIsFlatEnough(parent)) {
            // If the control points we currently operate on are sufficiently "flat", we use
            // an extension to De Casteljau's algorithm to obtain a piecewise-linear approximation
            // of the bezier curve represented by our control points, consisting of the same amount
            // of points as there are control points.
            bezierApproximate(parent, output, subdivisionBuffer1, subdivisionBuffer2, degree + 1);

            freeBuffers.push(parent);
            continue;
        }

        // If we do not yet have a sufficiently "flat" (in other words, detailed) approximation we keep
        // subdividing the curve we are currently operating on.
        let rightChild = freeBuffers.length > 0 ? freeBuffers.pop() : new Array(degree + 1);
        bezierSubdivide(parent, leftChild, rightChild, subdivisionBuffer1, degree + 1);

        // We re-use the buffer of the parent for one of the children, so that we save one allocation per iteration.
        for (let i = 0; i < degree + 1; ++i) parent[i] = leftChild[i];

        toFlatten.push(rightChild);
        toFlatten.push(parent);
    }

    output.push(points[pointCount]);
    return output;
}
function bSplineToBezierInternal(controlPoints, degree) {
    let result = [];
    let pointCount = controlPoints.length - 1, points = controlPoints.map(h => Object.assign({}, h));

    if (degree === pointCount) result.push(points);
    else {
        // Subdivide B-spline into bezier control points at knots.
        for (let i = 0; i < pointCount - degree; ++i) {
            let subBezier = new Array(degree + 1);
            subBezier[0] = points[i];

            // Destructively insert the knot degree-1 times via Boehm's algorithm.
            for (let j = 0; j < degree - 1; ++j) {
                subBezier[j + 1] = points[i + 1];
                for (let k = 1; k < degree - j; ++k) {
                    let l = Math.min(k, pointCount - degree - i);
                    points[i + k] = {
                        x: (l * points[i + k].x + points[i + k + 1].x) / (l + 1),
                        y: (l * points[i + k].y + points[i + k + 1].y) / (l + 1)
                    };
                }
            }

            subBezier[degree] = points[i + 1];
            result.push(subBezier);
        }

        result.push(points.splice(pointCount - degree));
        result.reverse();
    }

    return result;
}
function bezierIsFlatEnough(controlPoints) {
    for (let i = 1; i < controlPoints.length - 1; ++i) {
        let v1 = controlPoints[i - 1].x - 2 * controlPoints[i].x + controlPoints[i + 1].x,
            v2 = controlPoints[i - 1].y - 2 * controlPoints[i].y + controlPoints[i + 1].y;

        if (v1 * v1 + v2 * v2 > .3) return false;
    }
    return true;
}
function bezierSubdivide(controlPoints, l, r, subdivisionBuffer, count) {
    let midpoints = subdivisionBuffer;
    for (let i = 0; i < count; ++i) midpoints[i] = controlPoints[i];
    for (let i = 0; i < count; ++i) {
        l[i] = midpoints[0];
        r[count - i - 1] = midpoints[count - i - 1];
        for (let j = 0; j < count - i - 1; ++j) midpoints[j] = {
            x: (midpoints[j].x + midpoints[j + 1].x) / 2,
            y: (midpoints[j].y + midpoints[j + 1].y) / 2
        }
    }
}
function bezierApproximate(controlPoints, output, subdivisionBuffer1, subdivisionBuffer2, count) {
    let l = subdivisionBuffer2, r = subdivisionBuffer1;
    bezierSubdivide(controlPoints, l, r, subdivisionBuffer1, count);

    for (let i = 0; i < count - 1; ++i) l[count + i] = r[i + 1];
    output.push(controlPoints[0]);

    for (let i = 1; i < count - 1; ++i) {
        let index = 2 * i;
        output.push({
            x: .25 * (l[index - 1].x + 2 * l[index].x + l[index + 1].x),
            y: .25 * (l[index - 1].y + 2 * l[index].y + l[index + 1].y)
        });
    }
} */