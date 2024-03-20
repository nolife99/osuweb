export const sounds = {
    toLoad: 0,
    loaded: 0,
    audioExtensions: ['mp3', 'ogg', 'wav', 'webm'],
    whenLoaded: () => { },
    onProgress: () => { },
    onFailed: (source, _e) => {
        throw new Error('Audio could not be loaded: ' + source);
    },
    load: function (sources) {
        sounds.toLoad = sources.length;
        for (const source of sources) {
            const extension = source.split('.').pop();
            if (sounds.audioExtensions.indexOf(extension) !== -1) {
                const soundSprite = makeSound(source, sounds.loadHandler, true, sounds.onFailed);
                soundSprite.name = source;
                sounds[soundSprite.name] = soundSprite;
            }
        }
    },
    loadHandler: function (source) {
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

export const actx = new AudioContext();
function makeSound(source, loadHandler, shouldLoadSound, failHandler) {
    const o = {
        volumeNode: new GainNode(actx),
        source: source,
        loop: false,
        playing: false,
        volumeValue: 1,
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
    Object.defineProperties(o, {
        volume: {
            get: () => o.volumeValue,
            set: value => {
                o.volumeNode.gain.value = value;
                o.volumeValue = value;
            },
            enumerable: true, configurable: true
        }
    });
    if (shouldLoadSound) fetch(source).then(response => response.arrayBuffer()).then(buf => actx.decodeAudioData(buf, buffer => {
        o.buffer = buffer;
        o.hasLoaded = true;
        if (loadHandler) loadHandler(o.source);
    }, e => {
        if (failHandler) failHandler(o.source, e);
    }));
    return o;
}