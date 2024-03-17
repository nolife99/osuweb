import OsuAudio from './osu-audio.js';
import ArcPath from './curve/ArcPath.js';
import LinearBezier from './curve/LinearBezier.js';

const HIT_TYPE_CIRCLE = 1, HIT_TYPE_SLIDER = 2, HIT_TYPE_NEWCOMBO = 4, HIT_TYPE_SPINNER = 8;
function stackHitObjects(track) {
    let AR = track.difficulty.ApproachRate, approachTime = AR < 5 ? 1800 - 120 * AR : 1950 - 150 * AR,
        stackDistance = 3, stackThreshold = approachTime * track.general.StackLeniency;

    function getintv(A, B) {
        let endTime = A.time;
        if (A.type === 'slider') endTime += A.repeat * A.timing.beatMs * (A.pixelLength / track.difficulty.SliderMultiplier) / 100;
        return B.time - endTime;
    }
    function getdist(A, B) {
        let x = A.x, y = A.y;
        return Math.hypot(x - B.x, y - B.y);
    }

    let chains = [], stacked = new Array(track.hitObjects.length);
    stacked.fill(false);

    for (let i = 0; i < track.hitObjects.length; ++i) {
        if (stacked[i]) continue;
        let hitI = track.hitObjects[i];
        if (hitI.type === 'spinner') continue;
        stacked[i] = true;
        let newchain = [hitI];

        for (let j = i + 1; j < track.hitObjects.length; ++j) {
            let hitJ = track.hitObjects[j];
            if (hitJ.type === 'spinner' || getintv(newchain[newchain.length - 1], hitJ) > stackThreshold) break;
            if (getdist(newchain[newchain.length - 1], hitJ) <= stackDistance) {
                if (stacked[j]) break;
                stacked[j] = true;
                newchain.push(hitJ);
            }
        }
        if (newchain.length > 1) chains.push(newchain);
    }

    let stackScale = (1 - .7 * (track.difficulty.CircleSize - 5) / 5) * 3.2;
    function movehit(hit, dep) {
        let ofs = dep * stackScale;
        hit.x += ofs;
        hit.y += ofs;
    }
    for (let i = 0; i < chains.length; ++i) {
        if (chains[i][0].type === 'slider') for (let j = 0, dep = 0; j < chains[i].length; ++j) {
            movehit(chains[i][j], dep);
            if (chains[i][j].type !== 'slider' || chains[i][j].repeat % 2 === 0) ++dep;
        }
        else for (let j = 0, dep = 0; j < chains[i].length; ++j) {
            let cur = chains[i].length - 1 - j;
            if (j > 0 && (chains[i][cur].type === 'slider' && chains[i][cur].repeat % 2 === 1)) --dep;
            movehit(chains[i][cur], -dep);
            ++dep;
        }
    }
}

class Track {
    constructor(zip, track) {
        let self = this;
        this.track = track;
        this.zip = zip;
        this.ondecoded = null;
        this.general = {};
        this.metadata = {};
        this.difficulty = {};
        this.colors = [];
        this.breaks = [];
        this.events = [];
        this.timing = [];
        this.hitObjects = [];

        this.decode = (() => {
            let lines = self.track.replace('\r', '').split('\n'), section = null, combo = 0, index = 0, forceNewCombo = false;
            for (let i = 0; i < lines.length; ++i) {
                let line = lines[i].trim();
                if (line === '' || line.indexOf('//') === 0) continue;
                if (line.indexOf('[') === 0) {
                    section = line;
                    continue;
                }

                let key, value, parts;
                switch (section) {
                    case '[General]':
                        key = line.substr(0, line.indexOf(':')), value = line.substr(line.indexOf(':') + 1).trim();
                        if (isNaN(value)) self.general[key] = value;
                        else self.general[key] = +value;
                        break;

                    case '[Metadata]':
                        key = line.substr(0, line.indexOf(':')), value = line.substr(line.indexOf(':') + 1).trim();
                        self.metadata[key] = value;
                        break;

                    case '[Events]':
                        parts = line.split(',');
                        if (+parts[0] === 2) self.breaks.push({
                            startTime: +parts[1],
                            endTime: +parts[2]
                        });
                        else self.events.push(parts);
                        break;

                    case '[Difficulty]':
                        parts = line.split(':'), value = parts[1].trim();
                        if (isNaN(value)) self.difficulty[parts[0]] = value;
                        else self.difficulty[parts[0]] = (+value);
                        break;

                    case '[TimingPoints]':
                        parts = line.split(',');
                        let t = {
                            offset: +parts[0],
                            beatMs: +parts[1],
                            meter: +parts[2],
                            sampleSet: +parts[3],
                            sampleIndex: +parts[4],
                            volume: +parts[5],
                            uninherit: +parts[6],
                            kaiMode: +parts[7]
                        };
                        if (t.beatMs < 0) t.uninherit = 0;
                        this.timing.push(t);
                        break;

                    case '[Colours]':
                        parts = line.split(':'), key = parts[0].trim(), value = parts[1].trim();
                        if (key === 'SliderTrackOverride') self.colors.SliderTrackOverride = value.split(',');
                        else if (key === 'SliderBorder') self.colors.SliderBorder = value.split(',');
                        else self.colors.push(value.split(','));
                        break;

                    case '[HitObjects]':
                        parts = line.split(',');
                        let hit = {
                            x: +parts[0],
                            y: +parts[1],
                            time: +parts[2],
                            type: +parts[3],
                            hitSound: +parts[4]
                        };
                        if ((hit.type & HIT_TYPE_NEWCOMBO) > 0 || forceNewCombo) {
                            ++combo;
                            combo += (hit.type >> 4) & 7;
                            index = 0;
                        }
                        forceNewCombo = false;
                        hit.combo = combo;
                        hit.index = index++;

                        if ((hit.type & HIT_TYPE_CIRCLE) > 0) {
                            hit.type = 'circle';
                            let hitSample = (parts.length > 5 ? parts[5] : '0:0:0:0:').split(':');
                            hit.hitSample = {
                                normalSet: +hitSample[0],
                                additionSet: +hitSample[1],
                                index: +hitSample[2],
                                volume: +hitSample[3],
                                filename: hitSample[4]
                            };
                        }
                        else if ((hit.type & HIT_TYPE_SLIDER) > 0) {
                            hit.type = 'slider';
                            let sliderKeys = parts[5].split('|');
                            hit.sliderType = sliderKeys[0];
                            hit.keyframes = [];
                            for (let j = 1; j < sliderKeys.length; ++j) {
                                let p = sliderKeys[j].split(':');
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
                                let additions = parts[9].split('|');
                                for (let wdnmd = 0; wdnmd < additions.length; ++wdnmd) {
                                    let sets = additions[wdnmd].split(':');
                                    hit.edgeSets[wdnmd].normalSet = +sets[0];
                                    hit.edgeSets[wdnmd].additionSet = +sets[1];
                                }
                            }

                            let hitSample = (parts.length > 10 ? parts[10] : '0:0:0:0:').split(':');
                            hit.hitSample = {
                                normalSet: +hitSample[0],
                                additionSet: +hitSample[1],
                                index: +hitSample[2],
                                volume: +hitSample[3],
                                filename: hitSample[4]
                            };
                        }
                        else if ((hit.type & HIT_TYPE_SPINNER) > 0) {
                            if (hit.type & HIT_TYPE_NEWCOMBO) --combo;
                            hit.combo = combo - ((hit.type >> 4) & 7);
                            forceNewCombo = true;
                            hit.type = 'spinner';
                            hit.endTime = +parts[5];
                            if (hit.endTime < hit.time) hit.endTime = hit.time + 1;

                            let hitSample = (parts.length > 6 ? parts[6] : '0:0:0:0:').split(':');
                            hit.hitSample = {
                                normalSet: +hitSample[0],
                                additionSet: +hitSample[1],
                                index: +hitSample[2],
                                volume: +hitSample[3],
                                filename: hitSample[4]
                            };
                        }
                        self.hitObjects.push(hit);
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
            for (let i = 0; i < this.timing.length; ++i) {
                let point = this.timing[i];
                if (point.uninherit === 0) {
                    point.uninherit = 1;
                    point.beatMs *= -.01 * last.beatMs;
                    point.truebeatMs = last.truebeatMs;
                }
                else {
                    last = point;
                    point.truebeatMs = point.beatMs;
                }
            }
            for (let i = 0, j = 0; i < this.hitObjects.length; ++i) {
                let hit = this.hitObjects[i];
                while (j + 1 < this.timing.length && this.timing[j + 1].offset <= hit.time) ++j;
                hit.timing = this.timing[j];

                if (hit.type === 'circle') hit.endTime = hit.time;
                else if (hit.type === 'slider') {
                    hit.sliderTime = hit.timing.beatMs * (hit.pixelLength / this.difficulty.SliderMultiplier) / 100;
                    hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
                    hit.endTime = hit.time + hit.sliderTimeTotal;

                    if (hit.sliderType === 'P' && hit.keyframes.length === 2) hit.curve = ArcPath(hit);
                    else hit.curve = new LinearBezier(hit, hit.keyframes.length === 1);
                }
            }
            this.length = (this.hitObjects[this.hitObjects.length - 1].endTime - this.hitObjects[0].time) / 1000;
            stackHitObjects(this);

            if (this.ondecoded !== null) this.ondecoded(this);
        }).bind(this);
    }
}
export default class Osu {
    constructor(zip) {
        let self = this;
        this.zip = zip;
        this.song = null;
        this.ondecoded = null;
        this.onready = null;
        this.tracks = [];
        let count = 0;

        this.track_decoded = () => {
            if (++count === self.raw_tracks.length && self.ondecoded !== null) self.ondecoded(this);
        };
        this.load = () => {
            self.raw_tracks = zip.children.filter(c => c.name.indexOf('.osu') === c.name.length - 4);
            self.raw_tracks.forEach(t => t.getText(text => {
                let track = new Track(zip, text);
                self.tracks.push(track);
                track.ondecoded = self.track_decoded;
                track.decode();
            }));
        };
        this.getCoverSrc = img => {
            for (let i = 0; i < this.tracks.length; ++i) {
                let trEv = this.tracks[i].events;
                try {
                    let file = trEv[0][2];
                    if (trEv[0][0] === 'Video') file = trEv[1][2];
                    file = file.substr(1, file.length - 2);
                    zip.getChildByName(file).getBlob('image/jpeg', blob => img.src = URL.createObjectURL(blob));
                    break;
                }
                catch (error) {
                    img.src = 'asset/skin/defaultbg.jpg';
                }
            }
        };
        this.filterTracks = () => self.tracks = self.tracks.filter(t => t.general.Mode !== 3);
        this.sortTracks = () => self.tracks.sort((a, b) => a.difficulty.OverallDifficulty - b.difficulty.OverallDifficulty);

        this.load_mp3 = () => zip.children.find(c => c.name.toLowerCase() === self.tracks[0].general.AudioFilename.toLowerCase())
            .getBlob('audio/mpeg', blob => {
                let reader = new FileReader();
                reader.onload = e => self.audio = new OsuAudio(e.target.result, () => {
                    if (self.onready) self.onready();
                });
                reader.readAsArrayBuffer(blob);
            });
    }
    requestStar() {
        fetch('https://api.sayobot.cn/v2/beatmapinfo?0=' + this.tracks[0].metadata.BeatmapSetID).then(r => r.json()).then(e => {
            if (e.status === 0) e.data.bid_data.forEach(data => this.tracks.forEach(track => {
                if (track.metadata.BeatmapID == data.bid) {
                    track.difficulty.star = data.star;
                    track.length = data.length;
                }
            }));
        });
    }
};