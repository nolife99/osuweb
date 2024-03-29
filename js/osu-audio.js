export const sounds = {
    toLoad: 0,
    loaded: 0,
    audioExtensions: ['mp3', 'ogg', 'wav', 'webm'],
    whenLoaded: () => { },
    onProgress: () => { },
    onFailed: (source, _e) => {
        throw new Error('Audio could not be loaded: ' + source);
    },
    load: (sources, onLoad) => {
        sounds.toLoad = sources.length;
        for (const source of sources) {
            const extension = source.split('.').pop();
            if (sounds.audioExtensions.indexOf(extension) !== -1) {
                sounds.whenLoaded = onLoad;
                const soundSprite = makeSound(source, sounds.loadHandler, true, sounds.onFailed);
                soundSprite.name = source;
                sounds[soundSprite.name] = soundSprite;
            }
        }
    },
    loadHandler: source => {
        ++sounds.loaded;
        sounds.onProgress(100 * sounds.loaded / sounds.toLoad, {
            url: source
        });
        if (sounds.toLoad === sounds.loaded) {
            sounds.toLoad = 0;
            sounds.loaded = 0;
            sounds.whenLoaded();
        }
    }
};

const actx = new AudioContext;
function makeSound(source, loadHandler, shouldLoad, failHandler) {
    const o = {
        volumeNode: new GainNode(actx),
        get volume() {
            return o.volumeValue;
        },
        set volume(value) {
            o.volumeNode.gain.value = value;
            o.volumeValue = value;
        },
        volumeValue: 1,
        source: source,
        loop: false,
        playing: false,
        startTime: 0,
        startOffset: 0,
        speed: 1,
        play: () => {
            o.startTime = actx.currentTime;
            o.soundNode = new AudioBufferSourceNode(actx);
            o.soundNode.buffer = o.buffer;
            o.soundNode.playbackRate.value = o.speed;
            o.soundNode.connect(o.volumeNode);
            o.volumeNode.connect(actx.destination);

            o.soundNode.loop = o.loop;
            o.soundNode.start(0, o.startOffset % o.buffer.duration);
            o.playing = true;
        },
        pause: () => {
            if (o.playing) {
                o.soundNode.stop(0);
                o.startOffset += actx.currentTime - o.startTime;
                o.playing = false;
            }
        },
        getPos: () => actx.currentTime - o.startTime + o.startOffset,
        restart: () => {
            if (o.playing) o.soundNode.stop(0);
            o.startOffset = 0;
            o.play();
        },
        playFrom: value => {
            if (o.playing) o.soundNode.stop(0);
            o.startOffset = value;
            o.play();
        },
        fade: (endValue, durationInSeconds) => {
            if (o.playing) {
                o.volumeNode.gain.linearRampToValueAtTime(o.volumeNode.gain.value, actx.currentTime);
                o.volumeNode.gain.linearRampToValueAtTime(endValue, actx.currentTime + durationInSeconds);
            }
        },
        fadeIn: durationInSeconds => {
            o.volumeNode.gain.value = 0;
            o.fade(1, durationInSeconds);
        },
        fadeOut: durationInSeconds => o.fade(0, durationInSeconds)
    };
    if (shouldLoad) fetch(source).then(response => response.arrayBuffer()).then(buf => actx.decodeAudioData(buf, buffer => {
        o.buffer = buffer;
        o.hasLoaded = true;
        if (loadHandler) loadHandler(o.source);
    }, e => {
        if (failHandler) failHandler(o.source, e);
    }));
    return o;
}
export default class OsuAudio {
    constructor(buffer, callback) {
        this.started = 0;
        this.position = 0;

        this.gain = new GainNode(actx);
        this.gain.connect(actx.destination);
        this.speed = 1;

        actx.resume().then(() => actx.decodeAudioData(buffer.buffer, decoded => {
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