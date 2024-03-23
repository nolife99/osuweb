import OsuAudio from './osu-audio.js';
import ArcPath from './curve/ArcPath.js';
import LinearBezier from './curve/LinearBezier.js';

const typeCirc = 1, typeSlider = 2, typeNC = 4, typeSpin = 8, clamp = (num, min, max) => Math.min(Math.max(num, min), max);
function stackHitObjects(track) {
    const AR = track.difficulty.ApproachRate, approachTime = AR < 5 ? 1800 - 120 * AR : 1950 - 150 * AR,
        stackDistance = Math.sqrt(12.5), stackThreshold = approachTime * track.general.StackLeniency;

    function getintv(A, B) {
        let endTime = A.time;
        if (A.type === 'slider') endTime += A.repeat * A.timing.beatMs * (A.pixelLength / track.difficulty.SliderMultiplier) / 100;
        return B.time - endTime;
    }
    function getdist(A, B) {
        let x = A.x, y = A.y;
        if (A.type == "slider" && A.repeat % 2 == 1) {
            const pt = A.curve.pointAt(1);
            x = pt.x;
            y = pt.y;
        }
        return Math.hypot(x - B.x, y - B.y);
    }

    const chains = [], stacked = new Array(track.hitObjects.length);
    stacked.fill(false);

    for (let i = 0; i < track.hitObjects.length; ++i) {
        if (stacked[i]) continue;
        const hitI = track.hitObjects[i];
        if (hitI.type === 'spinner') continue;
        stacked[i] = true;
        const newchain = [hitI];

        for (let j = i + 1; j < track.hitObjects.length; ++j) {
            const hitJ = track.hitObjects[j];
            if (hitJ.type === 'spinner' || getintv(newchain[newchain.length - 1], hitJ) > stackThreshold) break;
            if (getdist(newchain[newchain.length - 1], hitJ) <= stackDistance) {
                if (stacked[j]) break;
                stacked[j] = true;
                newchain.push(hitJ);
            }
        }
        if (newchain.length > 1) chains.push(newchain);
    }

    const stackScale = (1 - .7 * (track.difficulty.CircleSize - 5) / 5) * 3.2;
    function movehit(hit, dep) {
        const ofs = dep * stackScale;
        hit.x += ofs;
        hit.y += ofs;
        if (hit.type == "slider") {
            for (const k of hit.keyframes) {
                k.x += ofs;
                k.y += ofs;
            }
            if (hit.sliderType === 'P' && hit.keyframes.length === 2) hit.curve = ArcPath(hit);
            else for (const p of hit.curve.path) {
                p.x += ofs;
                p.y += ofs;
            }
        }
    }
    for (let i = 0; i < chains.length; ++i) {
        if (chains[i][0].type === 'slider') for (let j = 0, dep = 0; j < chains[i].length; ++j) {
            movehit(chains[i][j], dep);
            if (chains[i][j].type !== 'slider' || chains[i][j].repeat % 2 === 0) ++dep;
        }
        else for (let j = 0, dep = 0; j < chains[i].length; ++j) {
            const cur = chains[i].length - 1 - j;
            if (j > 0 && (chains[i][cur].type === 'slider' && chains[i][cur].repeat % 2 === 1)) --dep;
            movehit(chains[i][cur], -dep);
            ++dep;
        }
    }
}

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
                    key = line.slice(0, line.indexOf(':')), value = line.slice(line.indexOf(':') + 1).trim();
                    if (isNaN(value)) this.general[key] = value;
                    else this.general[key] = +value;
                    break;

                case '[Metadata]':
                    key = line.slice(0, line.indexOf(':')), value = line.slice(line.indexOf(':') + 1).trim();
                    this.metadata[key] = value;
                    break;

                case '[Events]':
                    parts = line.split(',');
                    if (+parts[0] === 2) this.breaks.push({
                        startTime: +parts[1],
                        endTime: +parts[2]
                    });
                    else this.events.push(parts);
                    break;

                case '[Difficulty]':
                    parts = line.split(':'), value = parts[1].trim();
                    if (isNaN(value)) this.difficulty[parts[0]] = value;
                    else this.difficulty[parts[0]] = (+value);
                    break;

                case '[TimingPoints]':
                    parts = line.split(',');
                    const t = {
                        offset: +parts[0],
                        beatMs: +parts[1],
                        meter: +parts[2],
                        sampleSet: +parts[3],
                        sampleIndex: +parts[4],
                        volume: +parts[5],
                        uninherit: +parts[6],
                        kiaiMode: +parts[7]
                    };
                    if (t.beatMs < 0) t.uninherit = 0;
                    this.timing.push(t);
                    break;

                case '[Colours]':
                    parts = line.split(':'), key = parts[0].trim(), value = parts[1].trim();
                    if (key === 'SliderTrackOverride') this.colors.SliderTrackOverride = value.split(',');
                    else if (key === 'SliderBorder') this.colors.SliderBorder = value.split(',');
                    else this.colors.push(value.split(','));
                    break;

                case '[HitObjects]':
                    parts = line.split(',');
                    const hit = {
                        x: +parts[0],
                        y: +parts[1],
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
                            normalSet: +hitSample[0],
                            additionSet: +hitSample[1],
                            index: +hitSample[2],
                            volume: +hitSample[3],
                            filename: hitSample[4]
                        };
                    }
                    else if ((hit.type & typeSlider) > 0) {
                        hit.type = 'slider';
                        const sliderKeys = parts[5].split('|');
                        hit.sliderType = sliderKeys[0];
                        hit.keyframes = [];
                        for (let j = 1; j < sliderKeys.length; ++j) {
                            const p = sliderKeys[j].split(':');
                            hit.keyframes.push({
                                x: +p[0],
                                y: +p[1]
                            });
                        }
                        hit.repeat = +parts[6];
                        hit.pixelLength = +parts[7];

                        if (parts.length > 8) hit.edgeHitsounds = parts[8].split('|').map(Number);
                        else {
                            hit.edgeHitsounds = new Array(hit.repeat + 1);
                            for (let wdnmd = 0; wdnmd < hit.repeat + 1; ++wdnmd) hit.edgeHitsounds[wdnmd] = 0;
                        }

                        hit.edgeSets = new Array(hit.repeat + 1);
                        for (let wdnmd = 0; wdnmd < hit.repeat + 1; ++wdnmd) hit.edgeSets[wdnmd] = {
                            normalSet: 0,
                            additionSet: 0
                        };
                        if (parts.length > 9) {
                            const additions = parts[9].split('|');
                            for (let wdnmd = 0; wdnmd < additions.length; ++wdnmd) {
                                const sets = additions[wdnmd].split(':');
                                hit.edgeSets[wdnmd].normalSet = +sets[0];
                                hit.edgeSets[wdnmd].additionSet = +sets[1];
                            }
                        }

                        const hitSample = (parts.length > 10 ? parts[10] : '0:0:0:0:').split(':');
                        hit.hitSample = {
                            normalSet: +hitSample[0],
                            additionSet: +hitSample[1],
                            index: +hitSample[2],
                            volume: +hitSample[3],
                            filename: hitSample[4]
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
                            normalSet: +hitSample[0],
                            additionSet: +hitSample[1],
                            index: +hitSample[2],
                            volume: +hitSample[3],
                            filename: hitSample[4]
                        };
                    }
                    this.hitObjects.push(hit);
                    break;
            }
        }

        this.general.PreviewTime /= 10;
        if (this.general.PreviewTime > this.hitObjects[0].time) this.general.PreviewTime = 0;

        if (this.colors.length === 0) this.colors = [
            [96, 159, 159],
            [192, 192, 192],
            [128, 255, 255],
            [139, 191, 222]
        ];

        if (this.difficulty.OverallDifficulty) {
            this.difficulty.HPDrainRate = this.difficulty.HPDrainRate || this.difficulty.OverallDifficulty;
            this.difficulty.CircleSize = this.difficulty.CircleSize || this.difficulty.OverallDifficulty;
            this.difficulty.ApproachRate = this.difficulty.ApproachRate || this.difficulty.OverallDifficulty;
        }

        let last = this.timing[0];
        for (const point of this.timing) {
            if (point.uninherit === 0) {
                point.uninherit = 1;
                point.beatMs *= -.01 * last.beatMs;
                point.truebeatMs = last.truebeatMs;
                point.inherited = last;
            }
            else {
                last = point;
                point.truebeatMs = point.beatMs;
            }
        }

        let j = 0;
        for (const hit of this.hitObjects) {
            while (j + 1 < this.timing.length && this.timing[j + 1].offset <= hit.time) ++j;
            hit.timing = this.timing[j];

            if (hit.type === 'circle') hit.endTime = hit.time;
            else if (hit.type === 'slider') {
                hit.sliderTime = (hit.timing.beatMs || hit.timing.inherited.beatMs) * (hit.pixelLength / this.difficulty.SliderMultiplier) / 100;
                hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
                hit.endTime = hit.time + hit.sliderTimeTotal;

                if (hit.sliderType === 'P' && hit.keyframes.length === 2) hit.curve = ArcPath(hit);
                else hit.curve = new LinearBezier(hit, hit.keyframes.length === 1);
            }
        }
        this.length = (this.hitObjects[this.hitObjects.length - 1].endTime - this.hitObjects[0].time) / 1000;
        stackHitObjects(this);

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

                const entry = this.zip.getChildByName(file.slice(1, file.length - 1)), id = entry.id.toString();
                entry.getData64URI().then(b => {
                    img.src = b;
                    if (!PIXI.Loader.shared.resources[id]) PIXI.Loader.shared.add({
                        key: id,
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
    filterTracks() {
        this.tracks = this.tracks.filter(t => t.general.Mode !== 3);
    }
    sortTracks() {
        this.tracks = this.tracks.filter(t => t.general.Mode !== 3);
        this.tracks.sort((a, b) => a.oldStar - b.oldStar);
    }
    load_mp3(tIndex) {
        this.zip.getChildByName(this.tracks[tIndex].general.AudioFilename).getUint8Array().then((e => this.audio = new OsuAudio(e, this.onready)));
    }
    requestStar() {
        fetch('https://api.sayobot.cn/v2/beatmapinfo?0=' + this.tracks[0].metadata.BeatmapSetID).then(r => r.json()).then(e => {
            if (e.status === 0) for (const data of e.data.bid_data) for (const track of this.tracks) if (track.metadata.BeatmapID == data.bid) {
                track.difficulty.star = data.star;
                track.length = data.length;
            }
        });
    }
};