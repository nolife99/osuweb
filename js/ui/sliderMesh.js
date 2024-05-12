const width = 100, DIVIDES = 36;
export default class SliderMesh extends PIXI.Container {
    startt = 0;
    endt = 1;

    constructor(curve, tintid) {
        super();

        const ibo = [], first = curve.pointAt(0), vbo = [first.x, first.y, 0, 0];
        function addArc(c, p1, p2, t) {
            const v = vbo[4 * c], nextV = vbo[4 * c + 1], aStart = Math.atan2(vbo[4 * p1 + 1] - nextV, vbo[4 * p1] - v);
            let aEnd = Math.atan2(vbo[4 * p2 + 1] - nextV, vbo[4 * p2] - v);
            if (aStart > aEnd) aEnd += 2 * Math.PI;

            let theta = aEnd - aStart;
            const divs = Math.ceil(DIVIDES * Math.abs(theta) / 2 / Math.PI);
            theta /= divs;

            for (let i = 1; i < divs; ++i) {
                const a = aStart + i * theta, newv = vbo.push(v + SliderMesh.radius * Math.cos(a), nextV + SliderMesh.radius * Math.sin(a), t, 1) / 4 - 1;
                ibo.push(c, p1, newv);
                p1 = newv;
            }
            ibo.push(c, p1, p2);
        }

        const res = Math.min(Math.ceil(curve.calcLength / 2.5), 10000);
        for (let i = 1; i < res; ++i) {
            const pt = curve.pointAt((i + 1) / res), prev = curve.pointAt(i / res), dx = pt.x - prev.x, dy = pt.y - prev.y,
                length = Math.hypot(dx, dy), ox = SliderMesh.radius * dy / length, oy = SliderMesh.radius * dx / length;

            vbo.push(prev.x - ox, prev.y + oy, prev.t, 1,
                prev.x + ox, prev.y - oy, prev.t, 1,
                pt.x - ox, pt.y + oy, pt.t, 1,
                pt.x + ox, pt.y - oy, pt.t, 1,
                pt.x, pt.y, pt.t, 0);

            const n = 5 * i;
            ibo.push(n - 5, n - 4, n,
                n - 4, n, n - 2,
                n - 5, n - 3, n,
                n - 3, n, n - 1);
        }
        addArc(0, 1, 2, 0);

        const resP = res * 5;
        addArc(resP - 5, resP - 6, resP - 7, 1);

        for (let i = 1; i < res - 1; ++i) {
            const c = curve.pointAt((i + 1) / res), b = curve.pointAt(i / res), n = curve.pointAt((i + 2) / res), p = i * 5;
            if ((c.x - b.x) * (n.y - c.y) > (n.x - c.x) * (c.y - b.y)) addArc(p, p - 1, p + 2);
            else addArc(p, p + 1, p - 2);
        }
        this.geometry = new PIXI.Geometry().addAttribute('pos', vbo, 4).addIndex(ibo);

        this.curve = curve;
        this.texelY = tintid / SliderMesh.ncolors + 1e-6;
    }
    _render(renderer) {
        renderer.batch.flush();
        renderer.state.set(SliderMesh.state);

        const uniform = SliderMesh.shader.uniforms, ox0 = uniform.ox, oy0 = uniform.oy, gl = renderer.gl;
        uniform.texelY = this.texelY;
        uniform.alpha = this.alpha;
        uniform.dt = 0;
        uniform.ot = .5;

        gl.clearStencil(0);
        gl.clearDepth(1);
        gl.clear(gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.colorMask(false, false, false, false);
        gl.depthFunc(gl.LESS);

        function bind(geometry, draw = true) {
            renderer.shader.bind(SliderMesh.shader);
            renderer.geometry.bind(geometry);
            if (draw) renderer.geometry.draw(gl.TRIANGLES);
        }
        if (this.startt === 0 && this.endt === 1) {
            uniform.dt = 0;
            uniform.ot = 1;
            bind(this.geometry);
        }
        else if (this.endt === 1) {
            if (this.startt !== 1) {
                uniform.dt = -1;
                uniform.ot = -this.startt;
                bind(this.geometry);
            }
            uniform.dt = 0;
            uniform.ot = 1;

            const p = this.curve.pointAt(this.startt);
            uniform.ox += p.x * uniform.dx;
            uniform.oy += p.y * uniform.dy;
            bind(SliderMesh.circle);
        }
        else if (this.startt === 0) {
            if (this.endt !== 0) {
                uniform.dt = 1;
                uniform.ot = this.endt;
                bind(this.geometry);
            }
            uniform.dt = 0;
            uniform.ot = 1;

            const p = this.curve.pointAt(this.endt);
            uniform.ox += p.x * uniform.dx;
            uniform.oy += p.y * uniform.dy;
            bind(SliderMesh.circle);
        }
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.EQUAL, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
        gl.depthFunc(gl.LEQUAL);
        gl.colorMask(true, true, true, true);

        if (this.startt === 0 && this.endt === 1) renderer.geometry.draw(gl.TRIANGLES);
        else if (this.endt === 1) {
            if (this.startt !== 1) {
                renderer.geometry.draw(gl.TRIANGLES);
                uniform.ox = ox0;
                uniform.oy = oy0;
                uniform.dt = -1;
                uniform.ot = -this.startt;
                bind(this.geometry, false);
            }
            renderer.geometry.draw(gl.TRIANGLES);
        }
        else if (this.startt === 0) {
            if (this.endt !== 0) {
                renderer.geometry.draw(gl.TRIANGLES);
                uniform.ox = ox0;
                uniform.oy = oy0;
                uniform.dt = 1;
                uniform.ot = this.endt;
                bind(this.geometry, false);
            }
            renderer.geometry.draw(gl.TRIANGLES);
        }
        gl.disable(gl.STENCIL_TEST);
        renderer.state.reset();

        uniform.ox = ox0;
        uniform.oy = oy0;
    }
    static initialize(colors, radius, transform, bodyTint, borderTint) {
        const buf = new Uint8Array(colors.length * width * 4), blur = .02, bodyFrac = .87, outline = borderTint || 0xffffff,
            borderR = outline >> 16, borderG = (outline >> 8) & 255, borderB = outline & 255;

        for (let k = 0; k < colors.length; ++k) {
            const tint = bodyTint || colors[k], innerR = tint >> 16, innerG = (tint >> 8) & 255, innerB = tint & 255;
            for (let i = 0; i < width; ++i) {
                const position = i / width, col = (k * width + i) * 4;
                let R, G, B, A = 1;

                if (position > bodyFrac) {
                    R = borderR;
                    G = borderG;
                    B = borderB;

                    const ease = 1 - position;
                    if (ease < blur) A *= ease / blur;
                }
                else if (bodyFrac - position < blur) {
                    const mu = (bodyFrac - position) / blur, ea = 1 - mu;
                    R = mu * innerR + ea * borderR;
                    G = mu * innerG + ea * borderG;
                    B = mu * innerB + ea * borderB;
                }
                else {
                    R = innerR;
                    G = innerG;
                    B = innerB;
                    A = position / 2 / bodyFrac + .3;
                }

                buf[col] = R * A;
                buf[col + 1] = G * A;
                buf[col + 2] = B * A;
                buf[col + 3] = A * 255;
            }
        }
        this.shader = PIXI.Shader.from(`
            attribute vec4 pos;
            varying vec2 texel;
            uniform float dx, dy, dt, ot, ox, oy, texelY;
            void main() {
                texel = vec2(pos.w, texelY);
                gl_Position = vec4(pos.xy * vec2(dx, dy) + vec2(ox, oy), pos.w + 2.0 * float(pos.z * dt > ot), 1.0);
            }`, `
            varying vec2 texel;
            uniform sampler2D texture;
            uniform float alpha;
            void main() {
                gl_FragColor = alpha * texture2D(texture, texel);
            }`, {
            texture: PIXI.Texture.fromBuffer(buf, width, colors.length),
            dx: transform.dx, dy: transform.dy, ox: transform.ox, oy: transform.oy
        });
        this.ncolors = colors.length;
        this.radius = radius;

        this.state = new PIXI.State;
        this.state.depthTest = true;

        const vbo = [0, 0, 0, 0], ibo = [], step = 2 * Math.PI / DIVIDES;
        for (let i = 0; i < DIVIDES; ++i) {
            const theta = step * i;
            vbo.push(radius * Math.cos(theta), radius * Math.sin(theta), 0, 1);
            ibo.push(0, i + 1, (i + 1) % DIVIDES + 1);
        }
        this.circle = new PIXI.Geometry().addAttribute('pos', vbo, 4).addIndex(ibo);
    }
    static resetTransform(dx, dy, ox, oy) {
        const uniform = this.shader.uniforms;
        uniform.dx = dx;
        uniform.dy = dy;
        uniform.ox = ox;
        uniform.oy = oy;
    }
    static deallocate() {
        this.circle.dispose();
        this.shader.uniforms.texture.destroy(true);
        this.shader.destroy();
    }
    destroy(opt) {
        super.destroy(opt);
        this.geometry.dispose();
    }
};