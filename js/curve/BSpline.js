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
        this.curve = BSplineToPiecewiseLinear(points, Math.max(1, points.length - 1));
    }
    curveDistance(i) {
        const curve = this.curve[i], prevCurve = this.curve[i - 1];
        return Math.hypot(curve.x - prevCurve.x, curve.y - prevCurve.y);
    }
    pointAt(t) {
        let c = {
            x: 0, y: 0
        };
        const n = this.points.length - 1;
        for (let i = 0; i <= n; ++i) {
            const pt = this.points[i], b = bernstein(i, n, t);
            c.x += pt.x * b;
            c.y += pt.y * b;
        }
        return c;
    }
};
function BSplineToPiecewiseLinear(points, degree) {
    if (points.length < 2) return points.length == 0 ? [] : [points[0]];
    degree = Math.min(degree, points.length - 1);

    const output = [], pointCount = points.length - 1, toFlatten = bSplineToBezierInternal(points, degree), freeBuffers = [],
        subdivisionBuffer1 = new Array(degree + 1), subdivisionBuffer2 = new Array(degree * 2 + 1), leftChild = subdivisionBuffer2;

    while (toFlatten.length > 0) {
        const parent = toFlatten.pop();
        if (bezierIsFlatEnough(parent)) {
            bezierApproximate(parent, output, subdivisionBuffer1, subdivisionBuffer2, degree + 1);
            freeBuffers.push(parent);
            continue;
        }
        const rightChild = freeBuffers.length > 0 ? freeBuffers.pop() : new Array(degree + 1);
        bezierSubdivide(parent, leftChild, rightChild, subdivisionBuffer1, degree + 1);

        for (let i = 0; i < degree + 1; ++i) parent[i] = leftChild[i];
        toFlatten.push(rightChild);
        toFlatten.push(parent);
    }
    output.push(points[pointCount]);
    return output;
}
function bSplineToBezierInternal(controlPoints, degree) {
    const result = [], pointCount = controlPoints.length - 1, points = controlPoints.map(a => ({...a}));
    if (degree === pointCount) result.push(points);
    else {
        for (let i = 0; i < pointCount - degree; ++i) {
            const subBezier = new Array(degree + 1);
            subBezier[0] = points[i];

            for (let j = 0; j < degree - 1; ++j) {
                subBezier[j + 1] = points[i + 1];
                for (let k = 1; k < degree - j; ++k) {
                    const l = Math.min(k, pointCount - degree - i);
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
        const v1 = controlPoints[i - 1].x - 2 * controlPoints[i].x + controlPoints[i + 1].x,
            v2 = controlPoints[i - 1].y - 2 * controlPoints[i].y + controlPoints[i + 1].y;

        if (v1 * v1 + v2 * v2 > .25) return false;
    }
    return true;
}
function bezierSubdivide(controlPoints, l, r, subdivisionBuffer, count) {
    const midpoints = subdivisionBuffer;
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
    const l = subdivisionBuffer2, r = subdivisionBuffer1;
    bezierSubdivide(controlPoints, l, r, subdivisionBuffer1, count);

    for (let i = 0; i < count - 1; ++i) l[count + i] = r[i + 1];
    output.push(controlPoints[0]);

    for (let i = 1; i < count - 1; ++i) {
        const index = 2 * i;
        output.push({
            x: .25 * (l[index - 1].x + 2 * l[index].x + l[index + 1].x),
            y: .25 * (l[index - 1].y + 2 * l[index].y + l[index + 1].y)
        });
    }
}