import CircleApproximator from "../math/CircleApproximator.js";
import BezierApproximator from "../math/BezierApproximator.js";

export default class StdSliderPathMaker {
    constructor(sld) {
        this.slider = sld;
    }
    getControlPoint() {
        return this.slider.controlPoints;
    }
    calculateSubPath(subPoints) {
        switch (this.slider.getType()) {
            case 'L': return subPoints;
            case 'P':
                if (this.getControlPoint().length != 3 || subPoints.length != 3) break;
                else {
                    let sub = CircleApproximator(subPoints[0], subPoints[1], subPoints[2]);
                    if (sub.length != 0) return sub;
                }
                break;
            case 'B': return (new BezierApproximator(subPoints)).createBezier();
        }
        return [];
    }
    calculatePath() {
        if (this.path) return this.path;

        let subControlPoints = [], path = [];
        for (let i = 0; i < this.getControlPoint().length; i++) {
            let curCurve = this.getControlPoint()[i];
            subControlPoints.push(curCurve);
            let nextCurve = this.getControlPoint()[i + 1];

            if (i == this.getControlPoint().length - 1 || (curCurve.x === nextCurve.x && curCurve.y === nextCurve.y))
                this.calculateSubPath(subControlPoints.splice(0)).forEach(v => {
                    let pt = path[path.length - 1];
                    if (path.length === 0 || (pt.x !== v.x && pt.y !== v.y)) path.push(v);
                });
        }

        this.path = path;
        return path;
    }
}