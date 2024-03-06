define([], () => {
    Container = PIXI.Container;
    const vertexSrc = `
        precision lowp float;
        attribute vec4 position;
        varying float dist;
        uniform float dx, dy, dt, ox, oy, ot;
        void main() {
            dist = position[3];
            gl_Position = vec4(position[0], position[1], position[3] + 2.0 * float(position[2] * dt > ot), 1.0);
            gl_Position.x = gl_Position.x * dx + ox;
            gl_Position.y = gl_Position.y * dy + oy;
        }`, fragmentSrc = `
        precision lowp float;
        varying float dist;
        uniform sampler2D uSampler2;
        uniform float alpha;
        uniform float texturepos;
        void main() {
            gl_FragColor = alpha * texture2D(uSampler2, vec2(dist, texturepos));
        }`, borderwidth = .128, innerPortion = 1 - borderwidth, edgeFade = .5, centerFade = .3, blurrate = .015, width = 200;

    function newTexture(colors, SliderTrackOverride, SliderBorder) {
        let buff = new Uint8Array(colors.length * width * 4);
        for (let k = 0; k < colors.length; ++k) {
            let tint = SliderTrackOverride ? SliderTrackOverride : colors[k], bordertint = SliderBorder ? SliderBorder : 0xffffff,
                borderR = bordertint >> 16, borderG = (bordertint >> 8) & 255, borderB = bordertint & 255, borderA = 1,
                innerR = tint >> 16, innerG = (tint >> 8) & 255, innerB = tint & 255, innerA = 1;

            for (let i = 0; i < width; i++) {
                let position = i / width, R, G, B, A;
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

                let ease = 1 - position;
                if (ease < blurrate) {
                    let blur = ease / blurrate;
                    R *= blur;
                    G *= blur;
                    B *= blur;
                    A *= blur;
                }
                if (innerPortion - position > 0 && innerPortion - position < blurrate) {
                    let mu = (innerPortion - position) / blurrate;
                    let ea = (1 - mu) * borderA;
                    R = mu * R + ea * borderR;
                    G = mu * G + ea * borderG;
                    B = mu * B + ea * borderB;
                    A = mu * innerA + ea;
                }

                let col = (k * width + i) * 4;
                buff[col] = R;
                buff[col + 1] = G;
                buff[col + 2] = B;
                buff[col + 3] = A * 255;
            }
        }
        return PIXI.Texture.fromBuffer(buff, width, colors.length);
    }

    const DIVIDES = 32;
    function curveGeometry(curve0, radius) {
        let curve = new Array();
        for (let i = 0; i < curve0.length; ++i) if (i == 0 ||
            Math.abs(curve0[i].x - curve0[i - 1].x) > .00001 ||
            Math.abs(curve0[i].y - curve0[i - 1].y) > .00001) curve.push(curve0[i]);

        let vert = new Array(), index = new Array(), first = curve[0];
        vert.push(first.x, first.y, first.t, 0);

        for (let i = 1; i < curve.length; ++i) {
            let x = curve[i].x;
            let y = curve[i].y;
            let t = curve[i].t;
            let lx = curve[i - 1].x;
            let ly = curve[i - 1].y;
            let lt = curve[i - 1].t;
            let dx = x - lx;
            let dy = y - ly;
            let length = Math.hypot(dx, dy);
            let ox = radius * -dy / length;
            let oy = radius * dx / length;

            vert.push(lx + ox, ly + oy, lt, 1);
            vert.push(lx - ox, ly - oy, lt, 1);
            vert.push(x + ox, y + oy, t, 1);
            vert.push(x - ox, y - oy, t, 1);
            vert.push(x, y, t, 0);

            let n = 5 * i + 1;
            index.push(n - 6, n - 5, n - 1, n - 5, n - 1, n - 3);
            index.push(n - 6, n - 4, n - 1, n - 4, n - 1, n - 2);
        }
        function addArc(c, p1, p2, t) {
            let theta_1 = Math.atan2(vert[4 * p1 + 1] - vert[4 * c + 1], vert[4 * p1] - vert[4 * c]),
                theta_2 = Math.atan2(vert[4 * p2 + 1] - vert[4 * c + 1], vert[4 * p2] - vert[4 * c]);
            if (theta_1 > theta_2) theta_2 += twoPi;
            let theta = theta_2 - theta_1, divs = Math.ceil(DIVIDES * Math.abs(theta) / twoPi);
            theta /= divs;

            let last = p1;
            for (let i = 1; i < divs; ++i) {
                vert.push(vert[4 * c] + radius * Math.cos(theta_1 + i * theta), vert[4 * c + 1] + radius * Math.sin(theta_1 + i * theta), t, 1);
                let newv = vert.length / 4 - 1;
                index.push(c, last, newv);
                last = newv;
            }
            index.push(c, last, p2);
        }
        addArc(0, 1, 2, first.t);
        addArc(5 * curve.length - 5, 5 * curve.length - 6, 5 * curve.length - 7, curve[curve.length - 1].t);

        for (let i = 1; i < curve.length - 1; ++i) {
            let c = curve[i], b = curve[i - 1], n = curve[i + 1], t = (c.x - b.x) * (n.y - c.y) - (n.x - c.x) * (c.y - b.y);
            if (t > 0) addArc(5 * i, 5 * i - 1, 5 * i + 2);
            else addArc(5 * i, 5 * i + 1, 5 * i - 2);
        }
        return new PIXI.Geometry().addAttribute('position', vert, 4).addIndex(index)
    }
    function circleGeometry(radius) {
        let vert = new Array(), index = new Array();
        vert.push(0, 0, 0, 0);
        for (let i = 0; i < DIVIDES; ++i) {
            let theta = twoPi / DIVIDES * i;
            vert.push(radius * Math.cos(theta), radius * Math.sin(theta), 0, 1);
            index.push(0, i + 1, (i + 1) % DIVIDES + 1);
        }
        return new PIXI.Geometry().addAttribute('position', vert, 4).addIndex(index);
    }
    function SliderMesh(curve, radius, tintid) {
        Container.call(this);

        this.curve = curve;
        this.geometry = curveGeometry(curve.curve, radius);
        this.alpha = 1;
        this.tintid = tintid;
        this.startt = 0;
        this.endt = 1;
        this.state = PIXI.State.for2d();
        this.drawMode = PIXI.DRAW_MODES.TRIANGLES;
        this.blendMode = PIXI.BLEND_MODES.NORMAL;
        this._roundPixels = PIXI.settings.ROUND_PIXELS;

        this._render = renderer => this._renderDefault(renderer);
        this._renderDefault = renderer => {
            let shader = this.shader;
            shader.alpha = this.worldAlpha;
            if (shader.update) shader.update();
            renderer.batch.flush();

            this.uniforms.alpha = this.alpha;
            this.uniforms.texturepos = this.tintid / this.ncolors;
            this.uniforms.dt = 0;
            this.uniforms.ot = .5;

            let ox0 = this.uniforms.ox, oy0 = this.uniforms.oy, gl = renderer.gl, glType, indexLength;
            gl.clearDepth(1);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.colorMask(false, false, false, false);
            renderer.state.set(this.state);
            renderer.state.setDepthTest(true);

            function bind(geometry) {
                renderer.shader.bind(shader);
                renderer.geometry.bind(geometry, shader);
                let byteSize = geometry.indexBuffer.data.BYTES_PER_ELEMENT;
                glType = byteSize === 2 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
                indexLength = geometry.indexBuffer.data.length;
            }
            if (this.startt == 0 && this.endt == 1) {
                this.uniforms.dt = 0;
                this.uniforms.ot = 1;
                bind(this.geometry);
                gl.drawElements(this.drawMode, indexLength, glType, 0);
            }
            else if (this.endt == 1) {
                if (this.startt != 1) {
                    this.uniforms.dt = -1;
                    this.uniforms.ot = -this.startt;
                    bind(this.geometry);
                    gl.drawElements(this.drawMode, indexLength, glType, 0);
                }
                this.uniforms.dt = 0;
                this.uniforms.ot = 1;
                let p = this.curve.pointAt(this.startt);
                this.uniforms.ox += p.x * this.uniforms.dx;
                this.uniforms.oy += p.y * this.uniforms.dy;

                bind(this.circle);
                gl.drawElements(this.drawMode, indexLength, glType, 0);
            }
            else if (this.startt == 0) {
                if (this.endt != 0) {
                    this.uniforms.dt = 1;
                    this.uniforms.ot = this.endt;
                    bind(this.geometry);
                    gl.drawElements(this.drawMode, indexLength, glType, 0);
                }
                this.uniforms.dt = 0;
                this.uniforms.ot = 1;
                let p = this.curve.pointAt(this.endt);
                this.uniforms.ox += p.x * this.uniforms.dx;
                this.uniforms.oy += p.y * this.uniforms.dy;

                bind(this.circle);
                gl.drawElements(this.drawMode, indexLength, glType, 0);
            }

            gl.depthFunc(gl.EQUAL);
            gl.colorMask(true, true, true, true);

            if (this.startt == 0 && this.endt == 1) gl.drawElements(this.drawMode, indexLength, glType, 0);
            else if (this.endt == 1) {
                if (this.startt != 1) {
                    gl.drawElements(this.drawMode, indexLength, glType, 0);
                    this.uniforms.ox = ox0;
                    this.uniforms.oy = oy0;
                    this.uniforms.dt = -1;
                    this.uniforms.ot = -this.startt;
                    bind(this.geometry);
                }
                gl.drawElements(this.drawMode, indexLength, glType, 0);
            }
            else if (this.startt == 0) {
                if (this.endt != 0) {
                    gl.drawElements(this.drawMode, indexLength, glType, 0);
                    this.uniforms.ox = ox0;
                    this.uniforms.oy = oy0;
                    this.uniforms.dt = 1;
                    this.uniforms.ot = this.endt;
                    bind(this.geometry);
                }
                gl.drawElements(this.drawMode, indexLength, glType, 0);
            }
            gl.depthFunc(gl.LESS);
            renderer.state.setDepthTest(false);

            this.uniforms.ox = ox0;
            this.uniforms.oy = oy0;
        };
        this.destroy = options => {
            Container.prototype.destroy.call(this, options);
            this.geometry.dispose();
            this.geometry = null;
            this.shader = null;
            this.state = null;
        };
    }

    if (Container) SliderMesh.__proto__ = Container;
    SliderMesh.prototype = Object.create(Container && Container.prototype);
    SliderMesh.prototype.constructor = SliderMesh;

    SliderMesh.prototype.initialize = function (colors, radius, transform, SliderTrackOverride, SliderBorder) {
        this.ncolors = colors.length;
        this.uSampler2 = newTexture(colors, SliderTrackOverride, SliderBorder);
        this.circle = circleGeometry(radius);
        this.uniforms = {
            uSampler2: this.uSampler2, alpha: 1,
            dx: transform.dx, dy: transform.dy, ox: transform.ox, oy: transform.oy,
            texturepos: 0
        };
        this.shader = PIXI.Shader.from(vertexSrc, fragmentSrc, this.uniforms);
    };
    SliderMesh.prototype.resetTransform = function(transform) {
        this.uniforms.dx = transform.dx;
        this.uniforms.dy = transform.dy;
        this.uniforms.ox = transform.ox;
        this.uniforms.oy = transform.oy;
    };

    return SliderMesh;
});