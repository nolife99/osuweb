export default function FlattenBSpline(pts) {
    if (pts.length < 2) return pts.length == 0 ? [] : [pts[0]];
    const deg = pts.length - 1;

    const output = [], toFlatten = [structuredClone(pts)], freeBufs = [],
        subBuf1 = new Array(deg + 1), subBuf2 = new Array(deg * 2 + 1), leftChild = subBuf2;

    while (toFlatten.length > 0) {
        const parent = toFlatten.pop();
        if (bezierIsFlat(parent)) {
            bezierApprox(parent, output, subBuf1, subBuf2, deg + 1);
            freeBufs.push(parent);
            continue;
        }
        const rightChild = freeBufs.length > 0 ? freeBufs.pop() : new Array(deg + 1);
        bezierSubdivide(parent, leftChild, rightChild, subBuf1, deg + 1);

        for (let i = 0; i < deg + 1; ++i) parent[i] = leftChild[i];
        toFlatten.push(rightChild);
        toFlatten.push(parent);
    }
    output.push(pts[deg]);
    return output;
}
function bezierIsFlat(pts) {
    for (let i = 1; i < pts.length - 1; ++i) {
        const last = pts[i - 1], cur = pts[i], next = pts[i + 1], v1 = last.x - 2 * cur.x + next.x, v2 = last.y - 2 * cur.y + next.y;
        if (v1 * v1 + v2 * v2 > .3) return false;
    }
    return true;
}
function bezierSubdivide(pts, l, r, subBuf, count) {
    const midpts = subBuf;
    for (let i = 0; i < count; ++i) midpts[i] = pts[i];
    for (let i = 0; i < count; ++i) {
        l[i] = midpts[0];
        r[count - i - 1] = midpts[count - i - 1];
        for (let j = 0; j < count - i - 1; ++j) {
            const cur = midpts[j], next = midpts[j + 1];
            midpts[j] = {
                x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2
            }
        }
    }
}
function bezierApprox(pts, output, subBuf1, subBuf2, count) {
    const l = subBuf2, r = subBuf1;
    bezierSubdivide(pts, l, r, subBuf1, count);

    for (let i = 0; i < count - 1; ++i) l[count + i] = r[i + 1];
    output.push(pts[0]);

    for (let i = 1; i < count - 1; ++i) {
        const index = 2 * i, last = l[index - 1], cur = l[index], next = l[index + 1];
        output.push({
            x: (last.x + 2 * cur.x + next.x) / 4, y: (last.y + 2 * cur.y + next.y) / 4
        });
    }
}