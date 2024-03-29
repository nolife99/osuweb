import OsuAudio from './osu-audio.js';

const typeCirc = 1, typeSlider = 2, typeNC = 4, typeSpin = 8, clamp = (num, min, max) => Math.min(Math.max(num, min), max),
    convertcolor = color => (+color[0] << 16) | (+color[1] << 8) | (+color[2] << 0);

class Track {
    constructor(zip, track) {
        this.track = track;
        this.zip = zip;
        this.general = {};
        this.metadata = {};
        this.difficulty = {};
        this.colors = [];
        this.breaks = [];
        this.events = [];
        this.timing = [];
        this.hitObjects = [];
        this.ondecoded = () => { };
    }
    decode() {
        let section, combo = 0, index = 0, forceNewCombo = false;
        for (const l of this.track.replace('\r', '').split('\n')) {
            const line = l.trim();
            if (line === '' || line.indexOf('//') === 0) continue;
            if (line.indexOf('[') === 0) {
                section = line;
                continue;
            }

            let key, value, parts;
            switch (section) {
                case '[General]':
                    key = line.slice(0, line.indexOf(':')), value = line.slice(line.indexOf(':') + 1);
                    if (isNaN(value)) this.general[key] = value.trim();
                    else this.general[key] = +value;
                    break;

                case '[Metadata]':
                    key = line.slice(0, line.indexOf(':')), value = line.slice(line.indexOf(':') + 1);
                    this.metadata[key] = value;
                    break;

                case '[Events]':
                    parts = line.split(',');
                    if (+parts[0] === 2) this.breaks.push({
                        startTime: +parts[1], endTime: +parts[2]
                    });
                    else this.events.push(parts);
                    break;

                case '[Difficulty]':
                    parts = line.split(':'), value = parts[1];
                    if (isNaN(value)) this.difficulty[parts[0]] = value;
                    else this.difficulty[parts[0]] = (+value);
                    break;

                case '[TimingPoints]':
                    parts = line.split(',');
                    const t = {
                        offset: +parts[0],
                        beatMs: +parts[1],
                        // meter: +parts[2],
                        sampleSet: +parts[3],
                        // sampleIndex: +parts[4],
                        volume: +parts[5],
                        uninherit: +parts[6],
                        // kiaiMode: +parts[7]
                    };
                    this.timing.push(t);
                    break;

                case '[Colours]':
                    parts = line.split(':'), key = parts[0], value = parts[1].split(',');
                    if (key === 'SliderTrackOverride') this.colors.SliderTrackOverride = convertcolor(value);
                    else if (key === 'SliderBorder') this.colors.SliderBorder = convertcolor(value);
                    else this.colors.push(convertcolor(value));
                    break;

                case '[HitObjects]':
                    parts = line.split(',');
                    const hit = {
                        x: +parts[0], y: +parts[1],
                        time: +parts[2],
                        type: +parts[3],
                        hitSound: +parts[4]
                    };
                    hit.chain = 0;
                    if ((hit.type & typeNC) > 0 || forceNewCombo) {
                        ++combo;
                        combo += (hit.type >> 4) & 7;
                        index = 0;
                    }
                    forceNewCombo = false;
                    hit.combo = combo;
                    hit.index = index++;

                    if ((hit.type & typeCirc) > 0) {
                        hit.type = 'circle';
                        const hitSample = (parts.length > 5 ? parts[5] : '0:0:0:0:').split(':');
                        hit.hitSample = {
                            normalSet: +hitSample[0],
                            additionSet: +hitSample[1],
                            // index: +hitSample[2],
                            // volume: +hitSample[3],
                            // filename: hitSample[4]
                        };
                    }
                    else if ((hit.type & typeSlider) > 0) {
                        const sliderKeys = parts[5].split('|');
                        hit.keyframes = [];
                        for (let j = 1; j < sliderKeys.length; ++j) {
                            const p = sliderKeys[j].split(':');
                            hit.keyframes.push({
                                x: +p[0], y: +p[1]
                            });
                        }
                        if (hit.keyframes.length === 0) hit.type = 'circle';
                        else {
                            hit.type = 'slider';
                            hit.sliderType = sliderKeys[0];
                            hit.repeat = +parts[6];
                            hit.pixelLength = +parts[7];

                            if (parts.length > 8) hit.edgeHitsounds = parts[8].split('|').map(Number);
                            else hit.edgeHitsounds = new Uint8Array(hit.repeat + 1);

                            hit.edgeSets = new Array(hit.repeat + 1);
                            for (let wdnmd = 0; wdnmd < hit.repeat + 1; ++wdnmd) hit.edgeSets[wdnmd] = {
                                normalSet: 0, additionSet: 0
                            };
                            if (parts.length > 9) {
                                const additions = parts[9].split('|');
                                for (let wdnmd = 0; wdnmd < additions.length; ++wdnmd) {
                                    const sets = additions[wdnmd].split(':');
                                    hit.edgeSets[wdnmd].normalSet = +sets[0];
                                    hit.edgeSets[wdnmd].additionSet = +sets[1];
                                }
                            }
                        }
                        const hitSample = (parts.length > 10 ? parts[10] : '0:0:0:0:').split(':');
                        hit.hitSample = {
                            normalSet: +hitSample[0],
                            additionSet: +hitSample[1],
                            // index: +hitSample[2],
                            // volume: +hitSample[3],
                            // filename: hitSample[4]
                        };
                    }
                    else if ((hit.type & typeSpin) > 0) {
                        hit.chain = 0;
                        if (hit.type & typeNC) --combo;
                        hit.combo = combo - ((hit.type >> 4) & 7);
                        forceNewCombo = true;
                        hit.type = 'spinner';
                        hit.endTime = +parts[5];
                        if (hit.endTime < hit.time) hit.endTime = hit.time + 1;

                        const hitSample = (parts.length > 6 ? parts[6] : '0:0:0:0:').split(':');
                        hit.hitSample = {
                            normalSet: +hitSample[0],
                            additionSet: +hitSample[1],
                            // index: +hitSample[2],
                            // volume: +hitSample[3],
                            // filename: hitSample[4]
                        };
                    }
                    this.hitObjects.push(hit);
                    break;
            }
        }

        this.general.PreviewTime /= 10;
        if (this.general.PreviewTime > this.hitObjects[0].time) this.general.PreviewTime = 0;
        if (this.colors.length === 0) this.colors = [0x609f9f, 0xc0c0c0, 0x80ffff, 0x8bbfde];

        let last = this.timing[0];
        for (const point of this.timing) {
            if (point.uninherit === 0) {
                if (isNaN(point.beatMs)) {
                    point.isNaN = true;
                    point.velocity = 1;
                }
                else point.velocity = Math.max(-100 / point.beatMs, .1);
                point.beatMs = last.beatMs;
            }
            else {
                last = point;
                point.velocity = 1;
            }
        }

        let j = 0, curIdx = 0;
        for (const hit of this.hitObjects) {
            while (j + 1 < this.timing.length && this.timing[j + 1].offset <= hit.time) ++j;
            hit.timing = this.timing[j];
            hit.hitIndex = curIdx++;

            if (hit.type === 'circle') hit.endTime = hit.time;
            else if (hit.type === 'slider') {
                hit.ticks = [];
                hit.sliderTime = hit.pixelLength / (this.difficulty.SliderMultiplier * 100 * hit.timing.velocity) * hit.timing.beatMs;
                hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
                hit.endTime = hit.time + hit.sliderTimeTotal;

                hit.repeats = new Array(hit.repeat - 1);
                for (let i = 1; i < hit.repeat; ++i) hit.repeats[i - 1] = {
                    time: hit.time + i * hit.sliderTime
                };
            }
        }
        this.length = (this.hitObjects.at(-1).endTime - this.hitObjects[0].time) / 1000;
        this.oldStar = (this.difficulty.HPDrainRate + this.difficulty.CircleSize + this.difficulty.OverallDifficulty + clamp(this.hitObjects.length / this.length * 8, 0, 16)) / 38 * 5;
        this.ondecoded(this);
    }
}
export default class Osu {
    constructor(zip) {
        this.zip = zip;
        this.tracks = [];
        this.count = 0;

        this.onready = () => { };
        this.ondecoded = () => { };
    }
    load() {
        const rawTracks = this.zip.children.filter(c => c.name.indexOf('.osu') === c.name.length - 4);
        for (const t of rawTracks) t.getText().then(text => {
            const track = new Track(this.zip, text);
            this.tracks.push(track);
            track.ondecoded = () => {
                if (++this.count === rawTracks.length) this.ondecoded(this);
            };
            track.decode();
        });
    }
    getCoverSrc(img) {
        for (const track of this.tracks) {
            try {
                const file = track.events[0][2];
                if (track.events[0][0] === 'Video') file = track.events[1][2];

                const entry = this.zip.getChildByName(file.slice(1, file.length - 1)), id = entry.id + entry.uncompressedSize;
                entry.getData64URI().then(b => {
                    img.src = b;
                    if (!PIXI.Loader.shared.resources[id]) PIXI.Loader.shared.add({
                        key: id.toString(),
                        url: b,
                        loadType: PIXI.LoaderResource.LOAD_TYPE.IMAGE
                    });
                }).catch(e => console.log("Couldn't cache background:", e.message));
                return;
            }
            catch { }
        }
        img.src = 'asset/skin/defaultbg.jpg';
    }
    load_mp3(tIndex) {
        return this.zip.getChildByName(this.tracks[tIndex].general.AudioFilename).getUint8Array().then((e => this.audio = new OsuAudio(e, this.onready)));
    }
    sortTracks() {
        this.tracks = this.tracks.filter(t => t.general.Mode !== 3);
        fetch('https://api.sayobot.cn/v2/beatmapinfo?0=' + this.tracks[0].metadata.BeatmapSetID).then(r => r.json()).then(e => {
            if (e.status === 0) for (const data of e.data.bid_data) for (const track of this.tracks) if (track.metadata.BeatmapID == data.bid) {
                track.difficulty.star = data.star;
                track.length = data.length;
            }
        }).then(() => this.tracks.sort((a, b) => a.difficulty.star - b.difficulty.star));
    }
};