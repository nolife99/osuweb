export const sounds = {
    toLoad: 0,
    loaded: 0,
    audioExtensions: ['mp3', 'ogg', 'wav', 'webm'],
    whenLoaded: () => { },
    load: (sources, onLoad) => {
        sounds.toLoad = sources.length;
        for (const source of sources) {
            const extension = source.split('.').at(-1);
            if (sounds.audioExtensions.includes(extension)) {
                sounds.whenLoaded = onLoad;
                const soundSprite = makeSound(source, sounds.loadHandler);
                soundSprite.name = source;
                sounds[soundSprite.name] = soundSprite;
            }
        }
    },
    loadHandler: () => {
        ++sounds.loaded;
        if (sounds.toLoad === sounds.loaded) {
            sounds.toLoad = 0;
            sounds.loaded = 0;
            sounds.whenLoaded();
        }
    }
};

const actx = new AudioContext;
function makeSound(source, loadHandler) {
    const o = {
        volumeNode: new GainNode(actx),
        get volume() {
            return o.volumeNode.gain.value;
        },
        set volume(value) {
            o.volumeNode.gain.value = value;
        },
        play: () => {
            o.soundNode = new AudioBufferSourceNode(actx);
            o.soundNode.buffer = o.buffer;
            o.soundNode.connect(o.volumeNode);
            o.volumeNode.connect(actx.destination);
            o.soundNode.start();
        }
    };
    fetch(source).then(response => response.arrayBuffer()).then(buf => actx.decodeAudioData(buf).then(buffer => {
        o.buffer = buffer;
        o.hasLoaded = true;
        loadHandler();
    }));
    return o;
}
export default class OsuAudio {
    started = 0;
    position = 0;
    speed = 1;
    gain = new GainNode(actx);

    constructor(buffer, callback) {
        this.gain.connect(actx.destination);
        actx.resume().then(() => actx.decodeAudioData(buffer.buffer).then(decoded => {
            this.decoded = decoded;
            callback();
        }));
    }
    get pos() {
        return this.playing ? this.position + (actx.currentTime - this.started) * this.speed : this.position;
    }
    play(wait = 0) {
        this.source = new AudioBufferSourceNode(actx);
        this.source.playbackRate.value = this.speed;
        this.source.buffer = this.decoded;
        this.source.connect(this.gain);

        if (wait > 0) {
            this.position = -wait / 1000;
            window.setTimeout(() => this.source.start(Math.max(0, this.position), 0), wait / this.speed);
        }
        else this.source.start(0, this.position);
        this.started = actx.currentTime;
        this.playing = true;
    }
    pause() {
        if (!this.playing || this.pos <= 0) return false;
        this.position += (actx.currentTime - this.started) * this.speed;
        this.source.stop(this.position);
        this.source.disconnect(this.gain);
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