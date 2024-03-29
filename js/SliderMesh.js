const twoPi = 2 * Math.PI, vertexSrc = `
    precision lowp float;
    attribute vec4 pos;
    varying float dist;
    uniform float dx, dy, dt, ox, oy, ot;
    void main() {
        dist = pos.w;
        gl_Position = vec4(pos.xy, pos.w + 2.0 * float(pos.z * dt > ot), 1.0);
        gl_Position.xy = gl_Position.xy * vec2(dx, dy) + vec2(ox, oy);
    }`, fragmentSrc = `
    precision lowp float;
    varying float dist;
    uniform sampler2D uSampler2;
    uniform float alpha;
    uniform float texturepos;
    void main() {
        gl_FragColor = alpha * texture2D(uSampler2, vec2(dist, texturepos));
    }`, borderwidth = .13, innerPortion = 1 - borderwidth, edgeFade = .5, centerFade = .3, blurrate = .017, width = 200;

function newTexture(colors, SliderTrackOverride, SliderBorder) {
    const buff = new Uint8Array(colors.length * width * 4);
    for (let k = 0; k < colors.length; ++k) {
        const tint = SliderTrackOverride ? SliderTrackOverride : colors[k], bordertint = SliderBorder ? SliderBorder : 0xffffff,
            borderR = bordertint >> 16, borderG = (bordertint >> 8) & 255, borderB = bordertint & 255, borderA = 1,
            innerR = tint >> 16, innerG = (tint >> 8) & 255, innerB = tint & 255, innerA = 1;

        for (let i = 0; i < width; ++i) {
            const position = i / width;
            let R, G, B, A;

            if (position >= innerPortion) {
                R = borderR;
                G = borderG;
                B = borderB;
                A = borderA;
            }
            else {
                R = innerR;
                G = innerG;
                B = innerB;
                A = innerA * (edgeFade * position / innerPortion + centerFade);
            }
            R *= A;
            G *= A;
            B *= A;

            const ease = 1 - position;
            if (ease < blurrate) {
                const blur = ease / blurrate;
                R *= blur;
                G *= blur;
                B *= blur;
                A *= blur;
            }
            if (innerPortion - position > 0 && innerPortion - position < blurrate) {
                const mu = (innerPortion - position) / blurrate, ea = (1 - mu) * borderA;
                R = mu * R + ea * borderR;
                G = mu * G + ea * borderG;
                B = mu * B + ea * borderB;
                A = mu * innerA + ea;
            }

            const col = (k * width + i) * 4;
            buff[col] = R;
            buff[col + 1] = G;
            buff[col + 2] = B;
            buff[col + 3] = A * 255;
        }
    }
    return PIXI.Texture.fromBuffer(buff, width, colors.length);
}

const DIVIDES = 36;
function curveGeometry(curve, length, radius) {
    const vert = [], index = [], first = curve.pointAt(0), res = Math.ceil(length / (length > 24000 ? length / 8000 : 4.5));
    vert.push(first.x, first.y, 0, 0);

    for (let i = 1; i < res; ++i) {
        const curCurve = curve.pointAt((i + 1) / res), lastCurve = curve.pointAt(i / res),
            x = curCurve.x, y = curCurve.y, t = curCurve.t,
            lx = lastCurve.x, ly = lastCurve.y, lt = lastCurve.t,
            dx = x - lx, dy = y - ly, length = Math.hypot(dx, dy),
            ox = radius * -dy / length, oy = radius * dx / length;

        vert.push(lx + ox, ly + oy, lt, 1);
        vert.push(lx - ox, ly - oy, lt, 1);
        vert.push(x + ox, y + oy, t, 1);
        vert.push(x - ox, y - oy, t, 1);
        vert.push(x, y, t, 0);

        const n = 5 * i + 1;
        index.push(n - 6, n - 5, n - 1, n - 5, n - 1, n - 3);
        index.push(n - 6, n - 4, n - 1, n - 4, n - 1, n - 2);
    }
    function addArc(c, p1, p2, t) {
        const vrt = vert[4 * c], nextVrt = vert[4 * c + 1], theta1 = Math.atan2(vert[4 * p1 + 1] - nextVrt, vert[4 * p1] - vrt);
        let theta2 = Math.atan2(vert[4 * p2 + 1] - nextVrt, vert[4 * p2] - vrt);
        if (theta1 > theta2) theta2 += twoPi;
        let theta = theta2 - theta1, divs = Math.floor(DIVIDES * Math.abs(theta) / twoPi);
        theta /= divs;

        let last = p1;
        for (let i = 1; i < divs; ++i) {
            const newv = vert.push(vrt + radius * Math.cos(theta1 + i * theta), nextVrt + radius * Math.sin(theta1 + i * theta), t, 1) / 4 - 1;
            index.push(c, last, newv);
            last = newv;
        }
        index.push(c, last, p2);
    }
    addArc(0, 1, 2, 0);
    addArc(5 * res - 5, 5 * res - 6, 5 * res - 7, 1);

    for (let i = 1; i < res - 1; ++i) {
        const c = curve.pointAt((i + 1) / res), b = curve.pointAt(i / res), n = curve.pointAt((i + 2) / res);
        if ((c.x - b.x) * (n.y - c.y) > (n.x - c.x) * (c.y - b.y)) addArc(5 * i, 5 * i - 1, 5 * i + 2);
        else addArc(5 * i, 5 * i + 1, 5 * i - 2);
    }
    return new PIXI.Geometry().addAttribute('pos', vert, 4).addIndex(index);
}
function circleGeometry(radius) {
    const vert = [], index = [];
    vert.push(0, 0, 0, 0);
    for (let i = 0; i < DIVIDES; ++i) {
        const theta = twoPi / DIVIDES * i;
        vert.push(radius * Math.cos(theta), radius * Math.sin(theta), 0, 1);
        index.push(0, i + 1, (i + 1) % DIVIDES + 1);
    }
    return new PIXI.Geometry().addAttribute('pos', vert, 4).addIndex(index);
}
export default class SliderMesh extends PIXI.Container {
    constructor(curve, tintid) {
        super();

        this.curve = curve;
        this.geometry = curveGeometry(curve, curve.pointLength, this.radius);
        this.tintid = tintid;
        this.startt = 0;
        this.endt = 1;
    }
    _render(renderer) {
        const shader = this.shader;
        shader.alpha = this.worldAlpha;
        if (shader.update) shader.update();
        renderer.batch.flush();

        this.uniforms.alpha = this.alpha;
        this.uniforms.texturepos = this.tintid / this.ncolors;
        this.uniforms.dt = 0;
        this.uniforms.ot = .5;

        const ox0 = this.uniforms.ox, oy0 = this.uniforms.oy, gl = renderer.gl;
        let glType, indexLength;

        gl.clearDepth(1);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(false, false, false, false);
        renderer.state.set(null);
        renderer.state.setDepthTest(true);

        function bind(geometry) {
            renderer.shader.bind(shader);
            renderer.geometry.bind(geometry, shader);
            const data = geometry.indexBuffer.data;
            glType = data.BYTES_PER_ELEMENT === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
            indexLength = data.length;
        }
        if (this.startt === 0 && this.endt === 1) {
            this.uniforms.dt = 0;
            this.uniforms.ot = 1;
            bind(this.geometry);
            gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
        }
        else if (this.endt === 1) {
            if (this.startt !== 1) {
                this.uniforms.dt = -1;
                this.uniforms.ot = -this.startt;
                bind(this.geometry);
                gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
            }
            this.uniforms.dt = 0;
            this.uniforms.ot = 1;
            const p = this.curve.pointAt(this.startt);
            this.uniforms.ox += p.x * this.uniforms.dx;
            this.uniforms.oy += p.y * this.uniforms.dy;

            bind(this.circle);
            gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
        }
        else if (this.startt === 0) {
            if (this.endt !== 0) {
                this.uniforms.dt = 1;
                this.uniforms.ot = this.endt;
                bind(this.geometry);
                gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
            }
            this.uniforms.dt = 0;
            this.uniforms.ot = 1;
            const p = this.curve.pointAt(this.endt);
            this.uniforms.ox += p.x * this.uniforms.dx;
            this.uniforms.oy += p.y * this.uniforms.dy;

            bind(this.circle);
            gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
        }

        gl.depthFunc(gl.EQUAL);
        gl.colorMask(true, true, true, true);

        if (this.startt === 0 && this.endt === 1) gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
        else if (this.endt === 1) {
            if (this.startt !== 1) {
                gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
                this.uniforms.ox = ox0;
                this.uniforms.oy = oy0;
                this.uniforms.dt = -1;
                this.uniforms.ot = -this.startt;
                bind(this.geometry);
            }
            gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
        }
        else if (this.startt === 0) {
            if (this.endt !== 0) {
                gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
                this.uniforms.ox = ox0;
                this.uniforms.oy = oy0;
                this.uniforms.dt = 1;
                this.uniforms.ot = this.endt;
                bind(this.geometry);
            }
            gl.drawElements(gl.TRIANGLES, indexLength, glType, 0);
        }
        gl.depthFunc(gl.LESS);
        renderer.state.setDepthTest(false);

        this.uniforms.ox = ox0;
        this.uniforms.oy = oy0;
    }
    initialize(colors, radius, transform, SliderTrackOverride, SliderBorder) {
        this.radius = radius;
        this.ncolors = colors.length;
        this.circle = circleGeometry(radius);
        this.uniforms = {
            uSampler2: newTexture(colors, SliderTrackOverride, SliderBorder), alpha: 1,
            dx: transform.dx, dy: transform.dy, ox: transform.ox, oy: transform.oy,
            texturepos: 0
        };
        this.shader = PIXI.Shader.from(vertexSrc, fragmentSrc, this.uniforms);
    }
    resetTransform(transform) {
        this.uniforms.dx = transform.dx;
        this.uniforms.dy = transform.dy;
        this.uniforms.ox = transform.ox;
        this.uniforms.oy = transform.oy;
    }
    destroy(opt) {
        super.destroy(opt);
        this.geometry.destroy(opt);
    }
    deallocate() {
        const opt = {
            children: true, texture: true, baseTexture: true
        };
        this.uniforms.uSampler2.destroy(opt);
        this.circle.destroy(opt);
        this.shader.destroy(opt);
    }
}