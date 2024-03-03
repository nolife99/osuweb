define(["underscore", "osu-audio", "curve/LinearBezier", "curve/ArcPath"], (_, OsuAudio, LinearBezier, ArcPath) => {
    var HIT_TYPE_CIRCLE = 1, HIT_TYPE_SLIDER = 2, HIT_TYPE_NEWCOMBO = 4, HIT_TYPE_SPINNER = 8;

    const stackHitObjects = track => {
        const AR = track.difficulty.ApproachRate;
        const approachTime = AR < 5 ? 1800 - 120 * AR : 1950 - 150 * AR;
        const stackDistance = 3;
        const stackThreshold = approachTime * track.general.StackLeniency;

        const getintv = (A, B) => {
            var endTime = A.time;
            if (A.type == "slider") endTime += A.repeat * A.timing.millisecondsPerBeat * (A.pixelLength / track.difficulty.SliderMultiplier) / 100;
            return B.time - endTime;
        }
        const getdist = (A, B) => {
            var x = A.x;
            var y = A.y;
            if (A.type == "slider" && A.repeat % 2 == 1) {
                x = A.curve.curve[A.curve.curve.length - 1].x;
                y = A.curve.curve[A.curve.curve.length - 1].y;
            }
            return Math.hypot(x - B.x, y - B.y);
        }

        var chains = [];
        var stacked = new Array(track.hitObjects.length);
        stacked.fill(false);

        for (var i = 0; i < track.hitObjects.length; ++i) {
            if (stacked[i]) continue;
            var hitI = track.hitObjects[i];
            if (hitI.type == "spinner") continue;
            stacked[i] = true;
            var newchain = [hitI];

            for (var j = i + 1; j < track.hitObjects.length; ++j) {
                var hitJ = track.hitObjects[j];
                if (hitJ.type == "spinner") break;
                if (getintv(newchain[newchain.length - 1], hitJ) > stackThreshold) break;
                if (getdist(newchain[newchain.length - 1], hitJ) <= stackDistance) {
                    if (stacked[j]) break;
                    stacked[j] = true;
                    newchain.push(hitJ);
                }
            }
            if (newchain.length > 1) chains.push(newchain);
        }

        const stackScale = (1 - .7 * (track.difficulty.CircleSize - 5) / 5) * 3.2;
        const movehit = (hit, dep) => {
            const ofs = dep * stackScale;
            hit.x += ofs;
            hit.y += ofs;

            if (hit.type == "slider") {
                for (var j = 0; j < hit.keyframes.length; ++j) {
                    hit.keyframes[j].x += ofs;
                    hit.keyframes[j].y += ofs;
                }
                for (var j = 0; j < hit.curve.curve.length; ++j) {
                    hit.curve.curve[j].x += ofs;
                    hit.curve.curve[j].y += ofs;
                }
            }
        }
        for (var i = 0; i < chains.length; ++i) {
            if (chains[i][0].type == "slider") for (var j = 0, dep = 0; j < chains[i].length; ++j) {
                movehit(chains[i][j], dep);
                if (chains[i][j].type != "slider" || chains[i][j].repeat % 2 == 0) ++dep;
            }
            else for (var j = 0, dep = 0; j < chains[i].length; ++j) {
                var cur = chains[i].length - 1 - j;
                if (j > 0 && (chains[i][cur].type == "slider" && chains[i][cur].repeat % 2 == 1)) --dep;
                movehit(chains[i][cur], -dep);
                ++dep;
            }
        }
    }

    class Track {
        constructor(zip, track) {
            var self = this;
            this.track = track;
            this.zip = zip;
            this.ondecoded = null;
            this.general = {};
            this.metadata = {};
            this.difficulty = {};
            this.colors = [];
            this.breaks = [];
            this.events = [];
            this.timingPoints = [];
            this.hitObjects = [];

            this.decode = _.bind(function () {
                var lines = self.track.replace("\r", "").split("\n");
                var section = null;
                var combo = 0, index = 0;
                var forceNewCombo = false;

                for (var i = 0; i < lines.length; ++i) {
                    var line = lines[i].trim();
                    if (line === "" || line.indexOf("//") === 0) continue;
                    if (line.indexOf("[") === 0) {
                        section = line;
                        continue;
                    }
                    switch (section) {
                        case "[General]":
                            var key = line.substr(0, line.indexOf(":"));
                            var value = line.substr(line.indexOf(":") + 1).trim();
                            if (isNaN(value)) self.general[key] = value;
                            else self.general[key] = +value;
                            break;

                        case "[Metadata]":
                            var key = line.substr(0, line.indexOf(":"));
                            var value = line.substr(line.indexOf(":") + 1).trim();
                            self.metadata[key] = value;
                            break;

                        case "[Events]":
                            var parts = line.split(",");
                            if (+parts[0] == 2) self.breaks.push({
                                startTime: +parts[1],
                                endTime: +parts[2]
                            });
                            else self.events.push(parts);
                            break;

                        case "[Difficulty]":
                            var parts = line.split(":");
                            var value = parts[1].trim();
                            if (isNaN(value)) self.difficulty[parts[0]] = value;
                            else self.difficulty[parts[0]] = (+value);
                            break;

                        case "[TimingPoints]":
                            var parts = line.split(",");
                            var t = {
                                offset: +parts[0],
                                millisecondsPerBeat: +parts[1],
                                meter: +parts[2],
                                sampleSet: +parts[3],
                                sampleIndex: +parts[4],
                                volume: +parts[5],
                                uninherited: +parts[6],
                                kaiMode: +parts[7]
                            };
                            if (t.millisecondsPerBeat < 0) t.uninherited = 0;
                            this.timingPoints.push(t);
                            break;

                        case "[Colours]":
                            var parts = line.split(":");
                            var key = parts[0].trim();
                            var value = parts[1].trim();
                            if (key == "SliderTrackOverride") self.colors.SliderTrackOverride = value.split(',');
                            else if (key == "SliderBorder") self.colors.SliderBorder = value.split(',');
                            else self.colors.push(value.split(','));
                            break;

                        case "[HitObjects]":
                            var parts = line.split(",");
                            var hit = {
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
                                hit.type = "circle";
                                var hitSample = (parts.length > 5 ? parts[5] : '0:0:0:0:').split(":");
                                hit.hitSample = {
                                    normalSet: +hitSample[0],
                                    additionSet: +hitSample[1],
                                    index: +hitSample[2],
                                    volume: +hitSample[3],
                                    filename: hitSample[4]
                                };
                            }
                            else if ((hit.type & HIT_TYPE_SLIDER) > 0) {
                                hit.type = "slider";
                                var sliderKeys = parts[5].split("|");
                                hit.sliderType = sliderKeys[0];
                                hit.keyframes = [];
                                for (var j = 1; j < sliderKeys.length; ++j) {
                                    var p = sliderKeys[j].split(":");
                                    hit.keyframes.push({
                                        x: +p[0],
                                        y: +p[1]
                                    });
                                }
                                hit.repeat = +parts[6];
                                hit.pixelLength = +parts[7];

                                if (parts.length > 8) hit.edgeHitsounds = parts[8].split("|").map(Number);
                                else {
                                    hit.edgeHitsounds = new Array(hit.repeat + 1);
                                    for (var wdnmd = 0; wdnmd < hit.repeat + 1; ++wdnmd) hit.edgeHitsounds[wdnmd] = 0;
                                }

                                hit.edgeSets = new Array(hit.repeat + 1);
                                for (var wdnmd = 0; wdnmd < hit.repeat + 1; ++wdnmd) hit.edgeSets[wdnmd] = {
                                    normalSet: 0,
                                    additionSet: 0
                                };
                                if (parts.length > 9) {
                                    var additions = parts[9].split("|");
                                    for (var wdnmd = 0; wdnmd < additions.length; ++wdnmd) {
                                        var sets = additions[wdnmd].split(":");
                                        hit.edgeSets[wdnmd].normalSet = +sets[0];
                                        hit.edgeSets[wdnmd].additionSet = +sets[1];
                                    }
                                }

                                const hitSample = (parts.length > 10 ? parts[10] : '0:0:0:0:').split(":");
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
                                hit.type = "spinner";
                                hit.endTime = +parts[5];
                                if (hit.endTime < hit.time) hit.endTime = hit.time + 1;
                                const hitSample = (parts.length > 6 ? parts[6] : '0:0:0:0:').split(":");
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

                var last = this.timingPoints[0];
                for (var i = 0; i < this.timingPoints.length; ++i) {
                    var point = this.timingPoints[i];
                    if (point.uninherited === 0) {
                        point.uninherited = 1;
                        point.millisecondsPerBeat *= -.01 * last.millisecondsPerBeat;
                        point.trueMillisecondsPerBeat = last.trueMillisecondsPerBeat;
                    }
                    else {
                        last = point;
                        point.trueMillisecondsPerBeat = point.millisecondsPerBeat;
                    }
                }
                for (var i = 0, j = 0; i < this.hitObjects.length; ++i) {
                    var hit = this.hitObjects[i];
                    while (j + 1 < this.timingPoints.length && this.timingPoints[j + 1].offset <= hit.time) ++j;
                    hit.timing = this.timingPoints[j];

                    if (hit.type == "circle") hit.endTime = hit.time;
                    else if (hit.type == "slider") {
                        hit.sliderTime = hit.timing.millisecondsPerBeat * (hit.pixelLength / this.difficulty.SliderMultiplier) / 100;
                        hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
                        hit.endTime = hit.time + hit.sliderTimeTotal;

                        if (hit.sliderType === "P" && hit.keyframes.length == 2) {
                            hit.curve = new ArcPath(hit);
                            if (hit.curve.length == 0) hit.curve = new LinearBezier(hit, false);
                        }
                        else hit.curve = new LinearBezier(hit, hit.keyframes.length == 1);
                        if (hit.curve.length < 2) console.error("[curve] slider curve calculation failed");
                    }
                }
                this.length = (this.hitObjects[this.hitObjects.length - 1].endTime - this.hitObjects[0].time) / 1000;
                stackHitObjects(this);

                if (this.ondecoded !== null) this.ondecoded(this);
            }, this);
        }
    }
    class Osu {
        constructor(zip) {
            var self = this;
            this.zip = zip;
            this.song = null;
            this.ondecoded = null;
            this.onready = null;
            this.tracks = [];
            var count = 0;

            this.track_decoded = function () {
                if (++count == self.raw_tracks.length && self.ondecoded !== null) self.ondecoded(this);
            };
            this.load = function () {
                self.raw_tracks = _.filter(zip.children, c => c.name.indexOf(".osu") === c.name.length - 4);
                if (!_.isEmpty(self.raw_tracks)) _.each(self.raw_tracks, function (t) {
                    t.getText(function (text) {
                        var track = new Track(zip, text);
                        self.tracks.push(track);
                        track.ondecoded = self.track_decoded;
                        track.decode();
                    });
                });
            };
            this.getCoverSrc = function (img) {
                for (let i = 0; i < this.tracks.length; ++i) {
                    let trEv = this.tracks[i].events;
                    try {
                        let file = trEv[0][2];
                        if (trEv[0][0] === "Video") file = trEv[1][2];
                        file = file.substr(1, file.length - 2);
                        zip.getChildByName(file).getBlob("image/jpeg", blob => img.src = URL.createObjectURL(blob));
                        break;
                    }
                    catch (error) {
                        img.src = "asset/skin/defaultbg.jpg";
                    }
                }
            };
            this.requestStar = () => fetch("https://api.sayobot.cn/beatmapinfo?1=" + this.tracks[0].metadata.BeatmapSetID)
                .then(response => response.json()).then(info => {
                    if (info.status == 0) info.data.forEach(data => this.tracks.forEach(track => {
                        if (track.metadata.BeatmapID == data.bid) {
                            track.difficulty.star = data.star;
                            track.length = data.length;
                        }
                    }));
                });
            this.filterTracks = () => self.tracks = self.tracks.filter(t => t.general.Mode !== 3);
            this.sortTracks = () => self.tracks.sort((a, b) => a.difficulty.OverallDifficulty - b.difficulty.OverallDifficulty);

            this.load_mp3 = () => _.find(zip.children, c => c.name.toLowerCase() === self.tracks[0].general.AudioFilename.toLowerCase())
                .getBlob("audio/mpeg", blob => {
                    let reader = new FileReader();
                    reader.onload = e => self.audio = new OsuAudio(e.target.result, () => {
                        if (self.onready) self.onready();
                    });
                    reader.readAsArrayBuffer(blob);
                });
        }
    };
    return Osu;
});