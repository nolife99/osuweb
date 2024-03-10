'use strict';

function fixSetTarget(param) {
    if (!param) return;
    if (!param.setTargetAtTime) param.setTargetAtTime = param.setTargetValueAtTime;
}
if (window.hasOwnProperty('webkitAudioContext') &&
    !window.hasOwnProperty('AudioContext')) {
    window.AudioContext = webkitAudioContext;

    if (!AudioContext.prototype.hasOwnProperty('createGain')) AudioContext.prototype.createGain = AudioContext.prototype.createGainNode;
    if (!AudioContext.prototype.hasOwnProperty('createDelay')) AudioContext.prototype.createDelay = AudioContext.prototype.createDelayNode;
    if (!AudioContext.prototype.hasOwnProperty('createScriptProcessor')) AudioContext.prototype.createScriptProcessor = AudioContext.prototype.createJavaScriptNode;
    if (!AudioContext.prototype.hasOwnProperty('createPeriodicWave')) AudioContext.prototype.createPeriodicWave = AudioContext.prototype.createWaveTable;

    AudioContext.prototype.internal_createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
        let node = this.internal_createGain();
        fixSetTarget(node.gain);
        return node;
    };

    AudioContext.prototype.internal_createDelay = AudioContext.prototype.createDelay;
    AudioContext.prototype.createDelay = function (maxDelayTime) {
        let node = maxDelayTime ? this.internal_createDelay(maxDelayTime) : this.internal_createDelay();
        fixSetTarget(node.delayTime);
        return node;
    };

    AudioContext.prototype.internal_createBufferSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
        let node = this.internal_createBufferSource();
        if (!node.start) node.start = function (when, offset, duration) {
            if (offset || duration) this.noteGrainOn(when || 0, offset, duration);
            else this.noteOn(when || 0);
        };
        else {
            node.internal_start = node.start;
            node.start = function (when, offset, duration) {
                if (duration) node.internal_start(when || 0, offset, duration);
                else node.internal_start(when || 0, offset || 0);
            };
        }
        if (!node.stop) node.stop = function (when) {
            this.noteOff(when || 0);
        };
        else {
            node.internal_stop = node.stop;
            node.stop = when => node.internal_stop(when || 0);
        }
        fixSetTarget(node.playbackRate);
        return node;
    };

    AudioContext.prototype.internal_createDynamicsCompressor = AudioContext.prototype.createDynamicsCompressor;
    AudioContext.prototype.createDynamicsCompressor = function () {
        let node = this.internal_createDynamicsCompressor();
        fixSetTarget(node.threshold);
        fixSetTarget(node.knee);
        fixSetTarget(node.ratio);
        fixSetTarget(node.reduction);
        fixSetTarget(node.attack);
        fixSetTarget(node.release);
        return node;
    };

    AudioContext.prototype.internal_createBiquadFilter = AudioContext.prototype.createBiquadFilter;
    AudioContext.prototype.createBiquadFilter = function () {
        let node = this.internal_createBiquadFilter();
        fixSetTarget(node.frequency);
        fixSetTarget(node.detune);
        fixSetTarget(node.Q);
        fixSetTarget(node.gain);
        return node;
    };

    if (AudioContext.prototype.hasOwnProperty('createOscillator')) {
        AudioContext.prototype.internal_createOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () {
            let node = this.internal_createOscillator();
            if (!node.start) node.start = function (when) {
                this.noteOn(when || 0);
            };
            else {
                node.internal_start = node.start;
                node.start = when => node.internal_start(when || 0);
            }
            if (!node.stop) node.stop = function (when) {
                this.noteOff(when || 0);
            };
            else {
                node.internal_stop = node.stop;
                node.stop = when => node.internal_stop(when || 0);
            }

            if (!node.setPeriodicWave) node.setPeriodicWave = node.setWaveTable;
            fixSetTarget(node.frequency);
            fixSetTarget(node.detune);
            return node;
        };
    }
}
if (window.hasOwnProperty('webkitOfflineAudioContext') && !window.hasOwnProperty('OfflineAudioContext')) window.OfflineAudioContext = webkitOfflineAudioContext;

export let sounds = {
    toLoad: 0,
    loaded: 0,
    audioExtensions: ['mp3', 'ogg', 'wav', 'webm'],
    whenLoaded: undefined,
    onProgress: undefined,
    onFailed: (source, _e) => {
        throw new Error('Audio could not be loaded: ' + source);
    },
    load: function (sources) {
        let self = this;
        self.toLoad = sources.length;
        sources.forEach(source => {
            let extension = source.split('.').pop();
            if (self.audioExtensions.indexOf(extension) !== -1) {
                let soundSprite = makeSound(source, self.loadHandler.bind(self), true, self.onFailed);
                soundSprite.name = source;
                self[soundSprite.name] = soundSprite;
            }
        });
    },
    loadHandler: function (source) {
        let self = this;
        ++self.loaded;

        if (self.onProgress) self.onProgress(100 * self.loaded / self.toLoad, {
            url: source
        });
        if (self.toLoad === self.loaded) {
            self.toLoad = 0;
            self.loaded = 0;
            if (self.whenLoaded) self.whenLoaded();
        }
    }
};

export let actx = new AudioContext();
function makeSound(source, loadHandler, shouldLoadSound, failHandler) {
    let o = {};
    o.volumeNode = actx.createGain();
    o.panNode = actx.createStereoPanner ? actx.createStereoPanner() : actx.createPanner();
    o.delayNode = actx.createDelay();
    o.feedbackNode = actx.createGain();
    o.filterNode = actx.createBiquadFilter();
    o.convolverNode = actx.createConvolver();
    o.soundNode = null;
    o.buffer = null;
    o.source = source;
    o.loop = false;
    o.playing = false;
    o.loadHandler = undefined;
    o.panValue = 0;
    o.volumeValue = 1;
    o.startTime = 0;
    o.startOffset = 0;
    o.speed = 1;
    o.echo = false;
    o.delayValue = .3;
    o.feebackValue = .3;
    o.filterValue = 0;
    o.reverb = false;
    o.reverbImpulse = null;
    o.play = function () {
        o.startTime = actx.currentTime;
        o.soundNode = actx.createBufferSource();
        o.soundNode.buffer = o.buffer;
        o.soundNode.playbackRate.value = this.speed;
        o.soundNode.connect(o.volumeNode);
        if (!o.reverb) o.volumeNode.connect(o.panNode);
        else {
            o.volumeNode.connect(o.convolverNode);
            o.convolverNode.connect(o.panNode);
            o.convolverNode.buffer = o.reverbImpulse;
        }
        o.panNode.connect(actx.destination);

        if (o.echo) {
            o.feedbackNode.gain.value = o.feebackValue;
            o.delayNode.delayTime.value = o.delayValue;
            o.filterNode.frequency.value = o.filterValue;
            o.delayNode.connect(o.feedbackNode);

            if (o.filterValue > 0) {
                o.feedbackNode.connect(o.filterNode);
                o.filterNode.connect(o.delayNode);
            }
            else o.feedbackNode.connect(o.delayNode);

            o.volumeNode.connect(o.delayNode);
            o.delayNode.connect(o.panNode);
        }

        o.soundNode.loop = o.loop;
        o.soundNode.start(0, o.startOffset % o.buffer.duration);
        o.playing = true;
    };
    o.pause = () => {
        if (o.playing) {
            o.soundNode.stop(0);
            o.startOffset += actx.currentTime - o.startTime;
            o.playing = false;
        }
    };
    o.getPos = () => actx.currentTime - o.startTime + o.startOffset;
    o.restart = () => {
        if (o.playing) o.soundNode.stop(0);
        o.startOffset = 0;
        o.play();
    };
    o.playFrom = value => {
        if (o.playing) o.soundNode.stop(0);
        o.startOffset = value;
        o.play();
    };
    o.setEcho = (delayValue, feedbackValue, filterValue) => {
        if (!delayValue) delayValue = .3;
        if (!feedbackValue) feedbackValue = .3;
        if (!filterValue) filterValue = 0;
        o.delayValue = delayValue;
        o.feebackValue = feedbackValue;
        o.filterValue = filterValue;
        o.echo = true;
    };
    o.setReverb = (duration, decay, reverse) => {
        if (!duration) duration = 2;
        if (!decay) decay = 2;
        if (!reverse) reverse = false;
        o.reverbImpulse = impulseResponse(duration, decay, reverse, actx);
        o.reverb = true;
    };
    o.fade = (endValue, durationInSeconds) => {
        if (o.playing) {
            o.volumeNode.gain.linearRampToValueAtTime(o.volumeNode.gain.value, actx.currentTime);
            o.volumeNode.gain.linearRampToValueAtTime(endValue, actx.currentTime + durationInSeconds);
        }
    };
    o.fadeIn = (durationInSeconds) => {
        o.volumeNode.gain.value = 0;
        o.fade(1, durationInSeconds);
    };
    o.fadeOut = durationInSeconds => o.fade(0, durationInSeconds);

    Object.defineProperties(o, {
        volume: {
            get: () => o.volumeValue,
            set: value => {
                o.volumeNode.gain.value = value;
                o.volumeValue = value;
            },
            enumerable: true, configurable: true
        },
        pan: {
            get: () => {
                if (!actx.createStereoPanner) return o.panValue;
                else return o.panNode.pan.value;
            },
            set: value => {
                if (!actx.createStereoPanner) {
                    var x = value, y = 0, z = 1 - Math.abs(x);
                    o.panNode.setPosition(x, y, z);
                    o.panValue = value;
                }
                else o.panNode.pan.value = value;
            },
            enumerable: true, configurable: true
        }
    });
    if (shouldLoadSound) fetch(source).then(response => response.arrayBuffer()).then(buf => actx.decodeAudioData(buf, buffer => {
        o.buffer = buffer;
        o.hasLoaded = true;
        if (loadHandler) loadHandler(o.source);
    }, error => {
        if (failHandler) failHandler(o.source, error);
    }));
    return o;
}