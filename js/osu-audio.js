import { actx } from './lib/sound.js';

export default class OsuAudio {
    constructor(buffer, callback) {
        this.started = 0;
        this.position = 0;

        this.gain = new GainNode(actx);
        this.gain.connect(actx.destination);
        this.speed = 1;

        const decode = node => actx.decodeAudioData(node.buf, decoded => {
            this.decoded = decoded;
            if (callback) callback(this);
        }, e => {
            console.warn('Error decoding audio:', e);
            let buf8 = new Uint8Array(node.buf), i = node.sync;
            buf8.indexOf = Array.prototype.indexOf;
            const b = buf8;

            while (true) {
                ++node.retry;
                i = b.indexOf(0xFF, i);
                if (i === -1 || (b[i + 1] & 0xE0 === 0xE0)) break;
                ++i;
            }
            if (i !== -1) {
                node.buf.splice(i);
                node.sync = i;
                decode(node);
            }
        });
        decode({
            buf: buffer, sync: 0, retry: 0
        });
    }
    get pos() {
        return this.playing ? this.position + (actx.currentTime - this.started) * this.speed : this.position;
    }
    play(wait = 0) {
        this.source = new AudioBufferSourceNode(actx);
        this.source.playbackRate.value = this.speed;
        this.source.buffer = this.decoded;
        this.source.connect(this.gain);
        this.started = actx.currentTime;

        if (wait > 0) {
            this.position = -wait / 1000;
            window.setTimeout(() => this.source.start(Math.max(0, this.pos), 0), wait / this.speed);
        }
        else this.source.start(0, this.position);
        this.playing = true;
    }
    pause() {
        if (!this.playing || this.pos <= 0) return false;
        this.position += (actx.currentTime - this.started) * this.speed;
        this.source.stop();
        this.playing = false;
        return true;
    }
    seek(time) {
        if (this.playing && this.pos > 0 && time > actx.currentTime - this.started) {
            this.position = time;
            this.source.stop();
            this.source.disconnect(this.gain);
            this.source = new AudioBufferSourceNode(actx);
            this.source.playbackRate.value = this.speed;
            this.source.buffer = this.decoded;
            this.source.connect(this.gain);
            this.source.start(0, this.position);
            this.started = actx.currentTime;
            return true;
        }
        else return false;
    }
};