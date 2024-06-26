const actx = new AudioContext;
export const sounds = (sources, onLoad) => Promise.all(sources.map(async source => await actx.decodeAudioData(await (await fetch(source)).arrayBuffer(), buffer => {
    const volumeNode = new GainNode(actx);
    sounds[source] = {
        get volume() {
            return volumeNode.gain.value;
        },
        set volume(value) {
            volumeNode.gain.value = value;
        },
        play: () => {
            const soundNode = new AudioBufferSourceNode(actx, {
                buffer: buffer
            });
            soundNode.connect(volumeNode).connect(actx.destination);
            soundNode.start();
        }
    };
}))).then(onLoad);

let started = 0, position = 0;
export default class OsuAudio {
    speed = 1;
    ctx = actx;
    gain = new GainNode(actx);

    constructor(buffer, callback) {
        this.gain.connect(actx.destination);
        actx.decodeAudioData(buffer.buffer, decoded => {
            this.decoded = decoded;
            actx.resume().then(callback);
        });
    }
    get pos() {
        return this.playing ? position + (actx.currentTime - started) * this.speed : position;
    }
    play(wait = 0) {
        this.source = new AudioBufferSourceNode(actx, {
            buffer: this.decoded, playbackRate: this.speed
        });
        this.source.connect(this.gain);

        if (wait > 0) {
            position = -wait / 1000;
            this.source.start(actx.currentTime + wait / 1000 / this.speed);
        }
        else this.source.start(0, position);
        started = actx.currentTime;
        this.playing = true;
    }
    pause() {
        if (!this.playing || this.pos < 0) return false;
        position += (actx.currentTime - started) * this.speed;
        this.source.stop(position);
        this.source.disconnect(this.gain);
        this.playing = false;
        return true;
    }
    seek(time) {
        if (this.playing && time > actx.currentTime - started) {
            this.source.stop();
            this.source.disconnect(this.gain);
            this.source = new AudioBufferSourceNode(actx, {
                buffer: this.decoded, playbackRate: this.speed
            });
            this.source.connect(this.gain);
            this.source.start(0, time);
            position = time;
            started = actx.currentTime;
            return true;
        }
        else return false;
    }
};