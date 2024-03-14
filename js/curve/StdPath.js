export default class StdPath {
    constructor(controlPoints) {
        this.controlPoints = controlPoints;
    }
    getType() {
        return this.type;
    }
    setType(type) {
        this.type = type;
    }
    setControlPoints(controlPoints) {
        this.controlPoints = controlPoints;
    }
}