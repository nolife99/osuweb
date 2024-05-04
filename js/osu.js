'use strict';

import OsuAudio from './osuAudio.js';

const typeCirc = 1, typeSlider = 2, typeNC = 4, typeSpin = 8, clamp = (num, min, max) => Math.min(Math.max(num, min), max),
    convertcolor = color => (+color[0] << 16) | (+color[1] << 8) | (+color[2] << 0);

class Track {
    general = {};
    metadata = {};
    difficulty = {};
    colors = [];
    breaks = [];
    events = [];
    timing = [];
    hits = [];

    constructor(track) {
        this.track = track;
    }
    decode(ondecoded) {
        let section, combo = 0, index = 0, forceNewCombo = false, key, value, parts;
        for (const l of this.track.split('\n')) {
            const line = l.trim();
            if (line === '' || line.indexOf('//') === 0) continue;
            if (line.indexOf('[') === 0) {
                section = line;
                continue;
            }
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
                    else this.difficulty[parts[0]] = +value;
                    break;

                case '[TimingPoints]':
                    parts = line.split(',');
                    const t = {
                        offset: +parts[0],
                        beatMs: +parts[1],
                        // meter: +parts[2],
                        sampleSet: +parts[3],
                        // sampleIndex: +parts[4],
                        volume: +parts[5] / 100,
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
                            normal: +hitSample[0],
                            addition: +hitSample[1],
                            // index: +hitSample[2],
                            // volume: +hitSample[3],
                            // filename: hitSample[4]
                        };
                    }
                    else if ((hit.type & typeSlider) > 0) {
                        const sliderKeys = parts[5].split('|');
                        hit.keyframes = new Array(sliderKeys.length - 1);
                        if (hit.keyframes.length === 0) hit.type = 'circle';
                        else {
                            for (let j = 1; j < sliderKeys.length; ++j) {
                                const p = sliderKeys[j].split(':');
                                hit.keyframes[j - 1] = {
                                    x: +p[0], y: +p[1]
                                };
                            }
                            hit.type = 'slider';
                            hit.sliderType = sliderKeys[0];
                            hit.repeat = +parts[6];
                            hit.pixelLength = +parts[7];

                            if (parts.length > 8) hit.edgeHitsounds = parts[8].split('|').map(Number);
                            else hit.edgeHitsounds = new Uint8Array(hit.repeat + 1);

                            hit.edgeSets = Array(hit.repeat + 1);
                            for (let wdnmd = 0; wdnmd < hit.repeat + 1; ++wdnmd) hit.edgeSets[wdnmd] = {
                                normal: 0, addition: 0
                            };
                            if (parts.length > 9) {
                                const additions = parts[9].split('|');
                                for (let wdnmd = 0; wdnmd < additions.length; ++wdnmd) {
                                    const sets = additions[wdnmd].split(':');
                                    hit.edgeSets[wdnmd].normal = +sets[0];
                                    hit.edgeSets[wdnmd].addition = +sets[1];
                                }
                            }
                        }
                        const hitSample = (parts.length > 10 ? parts[10] : '0:0:0:0:').split(':');
                        hit.hitSample = {
                            normal: +hitSample[0],
                            addition: +hitSample[1],
                            // index: +hitSample[2],
                            // volume: +hitSample[3],
                            // filename: hitSample[4]
                        };
                    }
                    else if ((hit.type & typeSpin) > 0) {
                        if (hit.type & typeNC) --combo;
                        hit.combo = combo - ((hit.type >> 4) & 7);
                        forceNewCombo = true;
                        hit.type = 'spinner';
                        hit.endTime = +parts[5];
                        if (hit.endTime < hit.time) hit.endTime = hit.time + 1;

                        const hitSample = (parts.length > 6 ? parts[6] : '0:0:0:0:').split(':');
                        hit.hitSample = {
                            normal: +hitSample[0],
                            addition: +hitSample[1],
                            // index: +hitSample[2],
                            // volume: +hitSample[3],
                            // filename: hitSample[4]
                        };
                    }
                    this.hits.push(hit);
                    break;
            }
        }
        if (this.colors.length === 0) this.colors = [0x609f9f, 0xc0c0c0, 0x80ffff, 0x8bbfde];
        this.difficulty.star = 0;

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
        for (const hit of this.hits) {
            while (j + 1 < this.timing.length && this.timing[j + 1].offset <= hit.time) ++j;
            hit.timing = this.timing[j];
            hit.hitIndex = curIdx++;
            hit.chain = 0;

            if (hit.type === 'circle') hit.endTime = hit.time;
            else if (hit.type === 'slider') {
                hit.sliderTime = hit.pixelLength / (this.difficulty.SliderMultiplier * 100 * hit.timing.velocity) * hit.timing.beatMs;
                hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
                hit.endTime = hit.time + hit.sliderTimeTotal;

                hit.repeats = Array(hit.repeat - 1);
                for (let i = 1; i < hit.repeat; ++i) hit.repeats[i - 1] = {
                    time: hit.time + i * hit.sliderTime
                };
            }
        }
        this.length = (this.hits.at(-1).endTime - this.hits[0].time) / 1000;
        this.oldStar = (this.difficulty.HPDrainRate + this.difficulty.CircleSize + this.difficulty.OverallDifficulty + clamp(this.hits.length / this.length * 8, 0, 16)) / 38 * 5;
        ondecoded(this);
    }
}
export default class Osu {
    tracks = [];
    count = 0;
    onready = () => { };

    constructor(zip) {
        this.zip = zip;
    }
    load(ondecoded) {
        const rawTracks = this.zip.children.filter(c => c.name.indexOf('.osu') === c.name.length - 4);
        for (const t of rawTracks) t.getText().then(text => {
            const track = new Track(text);
            this.tracks.push(track);
            track.decode(() => {
                if (++this.count === rawTracks.length) this.sortTracks().then(ondecoded);
            });
        });
    }
    getCoverSrc(img) {
        for (const track of this.tracks) {
            try {
                const file = track.events[0][2];
                if (track.events[0][0] === 'Video') file = track.events[1][2];

                const entry = this.zip.getChildByName(file.slice(1, file.length - 1)), id = (entry.id + entry.uncompressedSize).toString();
                entry.getData64URI('image/jpeg').then(b => {
                    img.src = b;
                    if (!PIXI.Assets.get(id)) {
                        PIXI.Assets.add(id, b);
                        PIXI.Assets.load(id);
                    }
                });
                return;
            }
            catch { }
        }
        img.src = 'asset/skin/defaultbg.jpg';
    }
    loadAudio(track) {
        return this.zip.getChildByName(track.general.AudioFilename).getUint8Array().then(e => this.audio = new OsuAudio(e, this.onready));
    }
    sortTracks() {
        this.tracks = this.tracks.filter(t => t.general.Mode !== 3);
        return fetch('https://api.sayobot.cn/v2/beatmapinfo?0=' + this.tracks[0].metadata.BeatmapSetID, {
            signal: AbortSignal.timeout(5000)
        }).then(r => r.json()).then(e => {
            for (const data of e.data.bid_data) for (const track of this.tracks) if (track.metadata.BeatmapID == data.bid) track.difficulty.star = data.star;
        }).then(() => this.tracks.sort((a, b) => a.difficulty.star - b.difficulty.star), () => this.tracks.sort((a, b) => a.oldStar - b.oldStar));
    }
};