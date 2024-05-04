'use strict';

const actx = new AudioContext;
export const sounds = {
    load: (sources, onLoad) => {
        let toLoad = sources.length, loaded = 0;
        for (const source of sources) {
            const o = {
                volumeNode: new GainNode(actx),
                get volume() {
                    return o.volumeNode.gain.value;
                },
                set volume(value) {
                    o.volumeNode.gain.value = value;
                },
                play: () => {
                    o.soundNode = new AudioBufferSourceNode(actx, {
                        buffer: o.buffer
                    });
                    o.soundNode.connect(o.volumeNode).connect(actx.destination);
                    o.soundNode.start();
                }
            };
            fetch(source, { 
                method: "GET", mode: 'no-cors'
            }).then(response => response.arrayBuffer()).then(buf => actx.decodeAudioData(buf, buffer => {
                o.buffer = buffer;
                o.hasLoaded = true;
                if (toLoad === ++loaded) onLoad();
            }));
            o.name = source;
            sounds[o.name] = o;
        }
    }
};
export default class OsuAudio {
    started = 0;
    position = 0;
    speed = 1;
    ctx = actx;
    gain = new GainNode(actx);

    constructor(buffer, callback) {
        this.gain.connect(actx.destination);
        actx.decodeAudioData(buffer.buffer, async decoded => {
            this.decoded = decoded;
            callback();
            await actx.resume();
        });
    }
    get pos() {
        return this.playing ? this.position + (actx.currentTime - this.started) * this.speed : this.position;
    }
    play(wait = 0) {
        this.source = new AudioBufferSourceNode(actx, {
            buffer: this.decoded, playbackRate: this.speed
        });
        this.source.connect(this.gain);

        if (wait > 0) {
            this.position = -wait / 1000;
            this.source.start(actx.currentTime + wait / 1000 / this.speed);
        }
        else this.source.start(0, this.position);
        this.started = actx.currentTime;
        this.playing = true;
    }
    pause() {
        if (!this.playing || this.pos < 0) return false;
        this.position += (actx.currentTime - this.started) * this.speed;
        this.source.stop(this.position);
        this.source.disconnect(this.gain);
        this.playing = false;
        return true;
    }
    seek(time) {
        if (this.playing && time > actx.currentTime - this.started) {
            this.source.stop();
            this.source.disconnect(this.gain);
            this.source = new AudioBufferSourceNode(actx, {
                buffer: this.decoded, playbackRate: this.speed
            });
            this.source.connect(this.gain);
            this.source.start(0, time);
            this.position = time;
            this.started = actx.currentTime;
            return true;
        }
        else return false;
    }
};