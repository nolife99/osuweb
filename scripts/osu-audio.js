define([], function() {
    const syncStream = node => {
        let buf8 = new Uint8Array(node.buf);
        buf8.indexOf = Array.prototype.indexOf;

        let i = node.sync, b = buf8;
        while (1) {
            ++node.retry;
            i = b.indexOf(0xFF, i);
            if (i == -1 || (b[i + 1] & 0xE0 == 0xE0)) break;
            ++i;
        }
        if (i != -1) {
            let tmp = node.buf.slice(i);
            delete (node.buf);
            node.buf = null;
            node.buf = tmp;
            node.sync = i;
            return true;
        }
        return false;
    }
    function OsuAudio(buffer, callback) {
        let self = this;
        self.decoded = null;
        self.source = null;
        self.started = 0;
        self.position = 0;
        self.playing = false;
        self.audio = new AudioContext();

        self.gain = self.audio.createGain();
        self.gain.connect(self.audio.destination);
        self.playbackRate = 1;

        const decode = node => {
            self.audio.decodeAudioData(node.buf, decoded => {
                self.decoded = decoded;
                if (typeof callback !== "undefined") callback(self);
            }, e => {
                console.log("Error decode audio");
                if (syncStream(node)) decode(node);
            });
        }
        decode({
            buf: buffer, sync: 0, retry: 0
        });

        this.getPosition = () => self.playing ? self.position + (self.audio.currentTime - self.started) * self.playbackRate : self.position;
        this.play = (wait = 0) => {
            if (self.audio.state == "suspended") window.alert("Audio can't play. Please use Chrome or Firefox.")
            self.source = new AudioBufferSourceNode(self.audio);
            self.source.playbackRate.value = self.playbackRate;
            self.source.buffer = self.decoded;
            self.source.connect(self.gain);
            self.started = self.audio.currentTime;

            if (wait > 0) {
                self.position = -wait / 1000;
                window.setTimeout(() => self.source.start(Math.max(0, self.getPosition()), 0), wait / self.playbackRate);
            }
            else self.source.start(0, self.position);
            self.playing = true;
        };
        this.pause = () => {
            if (!self.playing || self.getPosition() <= 0) return false;
            self.position += (self.audio.currentTime - self.started) * self.playbackRate;
            self.source.stop();
            self.playing = false;
            return true;
        };
        this.seekforward = time => {
            let ofs = time;
            if (ofs > self.audio.currentTime - self.started) {
                self.position = ofs;
                self.source.stop();
                self.source = self.audio.createBufferSource();
                self.source.playbackRate.value = self.playbackRate;
                self.source.buffer = self.decoded;
                self.source.connect(self.gain);
                self.source.start(0, self.position);
                self.started = self.audio.currentTime;
                return true;
            } 
            else return false;
        }
    }

    return OsuAudio;
});