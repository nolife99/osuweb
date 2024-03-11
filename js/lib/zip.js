(obj => {
    "use strict";

    var ERR_BAD_FORMAT = "File format is not recognized.";
    var ERR_CRC = "CRC failed.";
    var ERR_ENCRYPTED = "File contains encrypted entry.";
    var ERR_ZIP64 = "File is using Zip64 (4gb+ file size).";
    var ERR_READ = "Error while reading zip file.";
    var ERR_WRITE_DATA = "Error while writing file data.";
    var ERR_READ_DATA = "Error while reading file data.";
    var CHUNK_SIZE = 524288;
    var TEXT_PLAIN = "text/plain";

    var appendABViewSupported;
    try {
        appendABViewSupported = new Blob([new DataView(new ArrayBuffer(0))]).size === 0;
    }
    catch (e) { }

    class Crc32 {
        constructor() {
            this.crc = -1;
        }
        append(data) {
            var crc = this.crc | 0, table = this.table;
            for (var i = 0, len = data.length | 0; i < len; ++i) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
            this.crc = crc;
        }
        get() {
            return ~this.crc;
        }
    }
    Crc32.prototype.table = (() => {
        var i, j, t, table = [];
        for (i = 0; i < 256; ++i) {
            t = i;
            for (j = 0; j < 8; ++j) {
                if (t & 1) t = (t >>> 1) ^ 0xedb88320;
                else t = t >>> 1;
            }
            table[i] = t;
        }
        return table;
    })();

    function blobSlice(blob, index, length) {
        if (blob.slice) return blob.slice(index, index + length);
        else if (blob.webkitSlice) return blob.webkitSlice(index, index + length);
        else if (blob.mozSlice) return blob.mozSlice(index, index + length);
        else if (blob.msSlice) return blob.msSlice(index, index + length);
    }
    function getDataHelper(byteLength, bytes) {
        var dataBuffer, dataArray;
        dataBuffer = new ArrayBuffer(byteLength);
        dataArray = new Uint8Array(dataBuffer);
        if (bytes) dataArray.set(bytes, 0);
        return {
            buffer: dataBuffer,
            array: dataArray,
            view: new DataView(dataBuffer)
        };
    }

    function Reader() { }
    function TextReader(text) {
        var blobReader;
        this.size = 0;
        this.init = function (callback, onerror) {
            var blob = new Blob([text], {
                type: TEXT_PLAIN
            });
            blobReader = new BlobReader(blob);
            blobReader.init(() => {
                this.size = blobReader.size;
                callback();
            }, onerror);
        };
        this.readUint8Array = (index, length, callback, onerror) => blobReader.readUint8Array(index, length, callback, onerror);
    }
    TextReader.prototype = new Reader();
    TextReader.prototype.constructor = TextReader;

    function Data64URIReader(dataURI) {
        var that = this, dataStart;
        function init(callback) {
            var dataEnd = dataURI.length;
            while (dataURI.charAt(dataEnd - 1) === "=") --dataEnd;
            dataStart = dataURI.indexOf(",") + 1;
            that.size = Math.floor((dataEnd - dataStart) * .75);
            callback();
        }

        that.size = 0;
        that.init = init;
        that.readUint8Array = function (index, length, callback) {
            var i, data = getDataHelper(length);
            var start = Math.floor(index / 3) * 4;
            var end = Math.ceil((index + length) / 3) * 4;
            var bytes = obj.atob(dataURI.substring(start + dataStart, end + dataStart));
            var delta = index - Math.floor(start / 4) * 3;
            for (i = delta; i < delta + length; ++i) data.array[i - delta] = bytes.charCodeAt(i);
            callback(data.array);
        };
    }
    Data64URIReader.prototype = new Reader();
    Data64URIReader.prototype.constructor = Data64URIReader;

    function BlobReader(blob) {
        this.size = 0;
        this.init = function (callback) {
            this.size = blob.size;
            callback();
        };
        this.readUint8Array = (index, length, callback, onerror) => {
            var reader = new FileReader();
            reader.onload = e => callback(new Uint8Array(e.target.result));
            reader.onerror = onerror;
            try {
                reader.readAsArrayBuffer(blobSlice(blob, index, length));
            }
            catch (e) {
                onerror(e);
            }
        };
    }
    BlobReader.prototype = new Reader();
    BlobReader.prototype.constructor = BlobReader;

    function Writer() { }
    Writer.prototype.getData = function (callback) {
        callback(this.data);
    };

    function TextWriter(encoding) {
        var blob;
        this.init = callback => {
            blob = new Blob([], {
                type: TEXT_PLAIN
            });
            callback();
        };
        this.writeUint8Array = (array, callback) => {
            blob = new Blob([blob, appendABViewSupported ? array : array.buffer], {
                type: TEXT_PLAIN
            });
            callback();
        };
        this.getData = (callback, onerror) => {
            var reader = new FileReader();
            reader.onload = e => callback(e.target.result);
            reader.onerror = onerror;
            reader.readAsText(blob, encoding);
        };
    }
    TextWriter.prototype = new Writer();
    TextWriter.prototype.constructor = TextWriter;

    function Data64URIWriter(contentType) {
        var data = "", pending = "";
        this.init = callback => {
            data += "data:" + (contentType || "") + ";base64,";
            callback();
        };
        this.writeUint8Array = (array, callback) => {
            var i, delta = pending.length, dataString = pending;
            pending = "";
            for (i = 0; i < (Math.floor((delta + array.length) / 3) * 3) - delta; ++i) dataString += String.fromCharCode(array[i]);
            for (; i < array.length; ++i) pending += String.fromCharCode(array[i]);
            if (dataString.length > 2) data += obj.btoa(dataString);
            else pending = dataString;
            callback();
        };
        this.getData = callback => callback(data + obj.btoa(pending));
    }
    Data64URIWriter.prototype = new Writer();
    Data64URIWriter.prototype.constructor = Data64URIWriter;

    function BlobWriter(contentType) {
        var blob;
        this.init = callback => {
            blob = new Blob([], {
                type: contentType
            });
            callback();
        };
        this.writeUint8Array = (array, callback) => {
            blob = new Blob([blob, appendABViewSupported ? array : array.buffer], {
                type: contentType
            });
            callback();
        };
        this.getData = callback => callback(blob);
    }
    BlobWriter.prototype = new Writer();
    BlobWriter.prototype.constructor = BlobWriter;

    function launchWorkerProcess(worker, initialMessage, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror) {
        var chunkIndex = 0, index, outputSize, sn = initialMessage.sn, crc;
        function onflush() {
            worker.removeEventListener('message', onmessage, false);
            onend(outputSize, crc);
        }
        function onmessage(event) {
            var message = event.data, data = message.data, err = message.error;
            if (err) {
                err.toString = () => 'Error: ' + this.message;
                onreaderror(err);
                return;
            }
            if (message.sn !== sn) return;
            if (typeof message.codecTime === 'number') worker.codecTime += message.codecTime;
            if (typeof message.crcTime === 'number') worker.crcTime += message.crcTime;

            switch (message.type) {
                case 'append':
                    if (data) {
                        outputSize += data.length;
                        writer.writeUint8Array(data, () => step(), onwriteerror);
                    }
                    else step();
                    break;

                case 'flush':
                    crc = message.crc;
                    if (data) {
                        outputSize += data.length;
                        writer.writeUint8Array(data, () => onflush(), onwriteerror);
                    }
                    else onflush();
                    break;

                case 'progress':
                    if (onprogress) onprogress(index + message.loaded, size);
                    break;

                case 'importScripts': case 'newTask': case 'echo': break;
                default: console.warn('zip.js:launchWorkerProcess: unknown message: ', message);
            }
        }
        function step() {
            index = chunkIndex * CHUNK_SIZE;
            if (index < size) reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), array => {
                if (onprogress) onprogress(index, size);
                var msg = index === 0 ? initialMessage : {
                    sn: sn
                };
                msg.type = 'append';
                msg.data = array;

                try {
                    worker.postMessage(msg, [array.buffer]);
                }
                catch (ex) {
                    worker.postMessage(msg);
                }
                ++chunkIndex;
            }, onreaderror);
            else worker.postMessage({
                sn: sn,
                type: 'flush'
            });
        }

        outputSize = 0;
        worker.addEventListener('message', onmessage, false);
        step();
    }
    function launchProcess(process, reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror) {
        var chunkIndex = 0, index, outputSize = 0, crcInput = crcType === 'input', crcOutput = crcType === 'output', crc = new Crc32();
        function step() {
            var outputData;
            index = chunkIndex * CHUNK_SIZE;
            if (index < size) reader.readUint8Array(offset + index, Math.min(CHUNK_SIZE, size - index), inputData => {
                var outputData;
                try {
                    outputData = process.append(inputData, loaded => {
                        if (onprogress) onprogress(index + loaded, size);
                    });
                }
                catch (e) {
                    onreaderror(e);
                    return;
                }
                if (outputData) {
                    outputSize += outputData.length;
                    writer.writeUint8Array(outputData, () => {
                        ++chunkIndex;
                        setTimeout(step, 1);
                    }, onwriteerror);
                    if (crcOutput) crc.append(outputData);
                }
                else {
                    ++chunkIndex;
                    setTimeout(step, 1);
                }
                if (crcInput) crc.append(inputData);
                if (onprogress) onprogress(index, size);
            }, onreaderror);
            else {
                try {
                    outputData = process.flush();
                }
                catch (e) {
                    onreaderror(e);
                    return;
                }
                if (outputData) {
                    if (crcOutput) crc.append(outputData);
                    outputSize += outputData.length;
                    writer.writeUint8Array(outputData, () => onend(outputSize, crc.get()), onwriteerror);
                }
                else onend(outputSize, crc.get());
            }
        }
        step();
    }
    function inflate(worker, sn, reader, writer, offset, size, computeCrc32, onend, onprogress, onreaderror, onwriteerror) {
        var crcType = computeCrc32 ? 'output' : 'none';
        if (obj.zip.useWebWorkers) launchWorkerProcess(worker, {
            sn: sn,
            codecClass: 'Inflater',
            crcType: crcType,
        }, reader, writer, offset, size, onprogress, onend, onreaderror, onwriteerror);
        else launchProcess(new obj.zip.Inflater(), reader, writer, offset, size, crcType, onprogress, onend, onreaderror, onwriteerror);
    }
    function decodeASCII(str) {
        var i, out = "", charCode, extendedASCII = ['\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7', '\u00EA', '\u00EB',
            '\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5', '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9',
            '\u00FF', '\u00D6', '\u00DC', '\u00F8', '\u00A3', '\u00D8', '\u00D7', '\u0192', '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1',
            '\u00AA', '\u00BA', '\u00BF', '\u00AE', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB', '_', '_', '_', '\u00A6', '\u00A6',
            '\u00C1', '\u00C2', '\u00C0', '\u00A9', '\u00A6', '\u00A6', '+', '+', '\u00A2', '\u00A5', '+', '+', '-', '-', '+', '-', '+', '\u00E3',
            '\u00C3', '+', '+', '-', '-', '\u00A6', '-', '+', '\u00A4', '\u00F0', '\u00D0', '\u00CA', '\u00CB', '\u00C8', 'i', '\u00CD', '\u00CE',
            '\u00CF', '+', '+', '_', '_', '\u00A6', '\u00CC', '_', '\u00D3', '\u00DF', '\u00D4', '\u00D2', '\u00F5', '\u00D5', '\u00B5', '\u00FE',
            '\u00DE', '\u00DA', '\u00DB', '\u00D9', '\u00FD', '\u00DD', '\u00AF', '\u00B4', '\u00AD', '\u00B1', '_', '\u00BE', '\u00B6', '\u00A7',
            '\u00F7', '\u00B8', '\u00B0', '\u00A8', '\u00B7', '\u00B9', '\u00B3', '\u00B2', '_', ' '];
        for (i = 0; i < str.length; ++i) {
            charCode = str.charCodeAt(i) & 0xff;
            if (charCode > 127) out += extendedASCII[charCode - 128];
            else out += String.fromCharCode(charCode);
        }
        return out;
    }
    const decodeUTF8 = string => decodeURIComponent(escape(string));

    function getString(bytes) {
        var str = "";
        for (var i = 0; i < bytes.length; ++i) str += String.fromCharCode(bytes[i]);
        return str;
    }
    function getDate(timeRaw) {
        var date = (timeRaw & 0xffff0000) >> 16, time = timeRaw & 0x0000ffff;
        try {
            return new Date(1980 + ((date & 0xfe00) >> 9), ((date & 0x01e0) >> 5) - 1, date & 0x001f, (time & 0xf800) >> 11, (time & 0x07e0) >> 5, (time & 0x001f) * 2, 0);
        }
        catch (e) { }
    }
    function readCommonHeader(entry, data, index, centralDirectory, onerror) {
        entry.version = data.view.getUint16(index, true);
        entry.bitFlag = data.view.getUint16(index + 2, true);
        entry.compressionMethod = data.view.getUint16(index + 4, true);
        entry.lastModDateRaw = data.view.getUint32(index + 6, true);
        entry.lastModDate = getDate(entry.lastModDateRaw);
        if ((entry.bitFlag & 0x01) === 0x01) {
            onerror(ERR_ENCRYPTED);
            return;
        }
        if (centralDirectory || (entry.bitFlag & 0x0008) !== 0x0008) {
            entry.crc32 = data.view.getUint32(index + 10, true);
            entry.compressedSize = data.view.getUint32(index + 14, true);
            entry.uncompressedSize = data.view.getUint32(index + 18, true);
        }
        if (entry.compressedSize === 0xffffffff || entry.uncompressedSize === 0xffffffff) {
            onerror(ERR_ZIP64);
            return;
        }
        entry.filenameLength = data.view.getUint16(index + 22, true);
        entry.extraFieldLength = data.view.getUint16(index + 24, true);
    }
    function createZipReader(reader, callback, onerror) {
        var inflateSN = 0;

        class Entry {
            constructor() { }
            getData(writer, onend, onprogress, checkCrc32) {
                function testCrc32(crc32) {
                    var dataCrc32 = getDataHelper(4);
                    dataCrc32.view.setUint32(0, crc32);
                    return this.crc32 === dataCrc32.view.getUint32(0);
                };
                function getWriterData(_e, crc32) {
                    if (checkCrc32 && !testCrc32(crc32)) onerror(ERR_CRC);
                    else writer.getData(data => onend(data));
                };
                const onreaderror = err => onerror(err || ERR_READ_DATA);
                const onwriteerror = err => onerror(err || ERR_WRITE_DATA);

                reader.readUint8Array(this.offset, 30, bytes => {
                    var data = getDataHelper(bytes.length, bytes), dataOffset;
                    if (data.view.getUint32(0) !== 0x504b0304) {
                        onerror(ERR_BAD_FORMAT);
                        return;
                    }
                    readCommonHeader(this, data, 4, false, onerror);
                    dataOffset = this.offset + 30 + this.filenameLength + this.extraFieldLength;
                    writer.init(() => inflate(this._worker, inflateSN++, reader, writer, dataOffset, this.compressedSize, checkCrc32, getWriterData, onprogress, onreaderror, onwriteerror), onwriteerror);
                }, onreaderror);
            }
        }
        function seekEOCDR(eocdrCallback) {
            var EOCDR_MIN = 22;
            if (reader.size < EOCDR_MIN) {
                onerror(ERR_BAD_FORMAT);
                return;
            }
            var ZIP_COMMENT_MAX = 256 * 256, EOCDR_MAX = EOCDR_MIN + ZIP_COMMENT_MAX;
            const doSeek = (length, eocdrNotFoundCallback) => reader.readUint8Array(reader.size - length, length, bytes => {
                for (var i = bytes.length - EOCDR_MIN; i >= 0; --i) if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
                    eocdrCallback(new DataView(bytes.buffer, i, EOCDR_MIN));
                    return;
                }
                eocdrNotFoundCallback();
            }, () => onerror(ERR_READ));
            doSeek(EOCDR_MIN, () => doSeek(Math.min(EOCDR_MAX, reader.size), () => onerror(ERR_BAD_FORMAT)));
        }
        var zipReader = {
            getEntries: function (callback) {
                var worker = this._worker;
                seekEOCDR(dataView => {
                    var datalength, fileslength;
                    datalength = dataView.getUint32(16, true);
                    fileslength = dataView.getUint16(8, true);
                    if (datalength < 0 || datalength >= reader.size) {
                        onerror(ERR_BAD_FORMAT);
                        return;
                    }
                    reader.readUint8Array(datalength, reader.size - datalength, bytes => {
                        var i, index = 0, entries = [], entry, filename, comment, data = getDataHelper(bytes.length, bytes);
                        for (i = 0; i < fileslength; ++i) {
                            entry = new Entry();
                            entry._worker = worker;
                            if (data.view.getUint32(index) !== 0x504b0102) {
                                onerror(ERR_BAD_FORMAT);
                                return;
                            }
                            readCommonHeader(entry, data, index + 6, true, onerror);
                            entry.commentLength = data.view.getUint16(index + 32, true);
                            entry.directory = ((data.view.getUint8(index + 38) & 0x10) === 0x10);
                            entry.offset = data.view.getUint32(index + 42, true);
                            filename = getString(data.array.subarray(index + 46, index + 46 + entry.filenameLength));
                            entry.filename = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(filename) : decodeASCII(filename);
                            if (!entry.directory && entry.filename.charAt(entry.filename.length - 1) === "/") entry.directory = true;
                            comment = getString(data.array.subarray(index + 46 + entry.filenameLength + entry.extraFieldLength, index + 46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength));
                            entry.comment = ((entry.bitFlag & 0x0800) === 0x0800) ? decodeUTF8(comment) : decodeASCII(comment);
                            entries.push(entry);
                            index += 46 + entry.filenameLength + entry.extraFieldLength + entry.commentLength;
                        }
                        callback(entries);
                    }, () => onerror(ERR_READ));
                });
            },
            close: function (callback) {
                if (this._worker) {
                    this._worker.terminate();
                    this._worker = null;
                }
                if (callback) callback();
            },
            _worker: null
        };

        if (!obj.zip.useWebWorkers) callback(zipReader);
        else createWorker('inflater', worker => {
            zipReader._worker = worker;
            callback(zipReader);
        }, err => onerror(err));
    }
    function resolveURLs(urls) {
        var a = document.createElement('a');
        return urls.map(url => {
            a.href = url;
            return a.href;
        });
    }

    var DEFAULT_WORKER_SCRIPTS = {
        inflater: ['z-worker.js', 'inflate.js']
    };
    function createWorker(type, callback, onerror) {
        function errorHandler(err) {
            worker.terminate();
            onerror(err);
        }
        function onmessage(ev) {
            var msg = ev.data;
            if (msg.error) {
                worker.terminate();
                onerror(msg.error);
                return;
            }
            if (msg.type === 'importScripts') {
                worker.removeEventListener('message', onmessage);
                worker.removeEventListener('error', errorHandler);
                callback(worker);
            }
        }
        if (obj.zip.workerScripts !== null && obj.zip.workerScriptsPath !== null) {
            onerror(new Error('Either zip.workerScripts or zip.workerScriptsPath may be set, not both.'));
            return;
        }
        var scripts;
        if (obj.zip.workerScripts) {
            scripts = obj.zip.workerScripts[type];
            if (!Array.isArray(scripts)) {
                onerror(new Error('zip.workerScripts.' + type + ' is not an array!'));
                return;
            }
            scripts = resolveURLs(scripts);
        }
        else {
            scripts = DEFAULT_WORKER_SCRIPTS[type].slice(0);
            scripts[0] = (obj.zip.workerScriptsPath || '') + scripts[0];
        }
        var worker = new Worker(scripts[0]);
        worker.codecTime = worker.crcTime = 0;
        worker.postMessage({
            type: 'importScripts',
            scripts: scripts.slice(1)
        });
        worker.addEventListener('message', onmessage);
        worker.addEventListener('error', errorHandler);
    }
    const onerror_default = error => console.warn(error);

    obj.zip = {
        Reader: Reader,
        Writer: Writer,
        BlobReader: BlobReader,
        Data64URIReader: Data64URIReader,
        TextReader: TextReader,
        BlobWriter: BlobWriter,
        Data64URIWriter: Data64URIWriter,
        TextWriter: TextWriter,
        createReader: (reader, callback, onerror) => {
            onerror = onerror || onerror_default;
            reader.init(() => createZipReader(reader, callback, onerror), onerror);
        },
        useWebWorkers: true,
        workerScriptsPath: null,
        workerScripts: null
    };
})(this);
(() => {
    "use strict";

    var CHUNK_SIZE = 524288;
    var TextWriter = zip.TextWriter,
        BlobWriter = zip.BlobWriter,
        Data64URIWriter = zip.Data64URIWriter,
        Reader = zip.Reader,
        TextReader = zip.TextReader,
        BlobReader = zip.BlobReader,
        Data64URIReader = zip.Data64URIReader,
        createReader = zip.createReader;

    function ZipBlobReader(entry) {
        var that = this, blobReader;
        function getData(callback) {
            if (that.data) callback();
            else entry.getData(new BlobWriter(), function (data) {
                that.data = data;
                blobReader = new BlobReader(data);
                callback();
            }, null, that.checkCrc32);
        }

        that.size = 0;
        that.init = callback => {
            that.size = entry.uncompressedSize;
            callback();
        };
        that.readUint8Array = (index, length, callback, onerror) => getData(() => blobReader.readUint8Array(index, length, callback, onerror), onerror);
    }
    ZipBlobReader.prototype = new Reader();
    ZipBlobReader.prototype.constructor = ZipBlobReader;
    ZipBlobReader.prototype.checkCrc32 = false;

    function getTotalSize(entry) {
        var size = 0;
        function process(entry) {
            size += entry.uncompressedSize || 0;
            entry.children.forEach(process);
        }
        process(entry);
        return size;
    }
    function initReaders(entry, onend, onerror) {
        var index = 0;
        function next() {
            if (index++ < entry.children.length) process(entry.children[index]);
            else onend();
        }
        function process(child) {
            if (child.directory) initReaders(child, next, onerror);
            else {
                child.reader = new child.Reader(child.data, onerror);
                child.reader.init(() => {
                    child.uncompressedSize = child.reader.size;
                    next();
                });
            }
        }
        if (entry.children.length) process(entry.children[index]);
        else onend();
    }
    function getFileEntry(fileEntry, entry, onend, onprogress, onerror, totalSize, checkCrc32) {
        var currentIndex = 0;
        function process(fileEntry, entry, onend, onprogress, onerror, totalSize) {
            var childIndex = 0;
            function addChild(child) {
                function nextChild(childFileEntry) {
                    currentIndex += child.uncompressedSize || 0;
                    process(childFileEntry, child, () => {
                        ++childIndex;
                        processChild();
                    }, onprogress, onerror, totalSize);
                }
                if (child.directory) fileEntry.getDirectory(child.name, {
                    create: true
                }, nextChild, onerror);
                else fileEntry.getFile(child.name, {
                    create: true
                }, file => child.getData(new zip.FileWriter(file, zip.getMimeType(child.name)), nextChild, index => {
                    if (onprogress) onprogress(currentIndex + index, totalSize);
                }, checkCrc32), onerror);
            }
            function processChild() {
                var child = entry.children[childIndex];
                if (child) addChild(child);
                else onend();
            }
            processChild();
        }
        if (entry.directory) process(fileEntry, entry, onend, onprogress, onerror, totalSize);
        else entry.getData(new zip.FileWriter(fileEntry, zip.getMimeType(entry.name)), onend, onprogress, checkCrc32);
    }
    function resetFS(fs) {
        fs.entries = [];
        fs.root = new ZipDirectoryEntry(fs);
    }
    function bufferedCopy(reader, writer, onend, onprogress, onerror) {
        var chunkIndex = 0;
        function stepCopy() {
            var index = chunkIndex * CHUNK_SIZE;
            if (onprogress) onprogress(index, reader.size);
            if (index < reader.size) reader.readUint8Array(index, Math.min(CHUNK_SIZE, reader.size - index), array => writer.writeUint8Array(new Uint8Array(array), () => {
                ++chunkIndex;
                stepCopy();
            }), onerror);
            else writer.getData(onend);
        }
        stepCopy();
    }
    const addChild = (parent, name, params, directory) => directory ? new ZipDirectoryEntry(parent.fs, name, params, parent) : new ZipFileEntry(parent.fs, name, params, parent);

    class ZipEntry {
        constructor() { }
        init(fs, name, params, parent) {
            if (!params) params = {};
            this.fs = fs;
            this.name = name;
            this.id = fs.entries.length;
            this.parent = parent;
            this.children = [];
            this.zipVersion = params.zipVersion || 0x14;
            this.uncompressedSize = 0;
            fs.entries.push(this);
            if (parent) this.parent.children.push(this);
        }
        getFileEntry(fileEntry, onend, onprogress, onerror, checkCrc32) {
            initReaders(this, () => getFileEntry(fileEntry, this, onend, onprogress, onerror, getTotalSize(that), checkCrc32), onerror);
        }
        getFullname() {
            var fullname = this.name, entry = this.parent;
            while (entry) {
                fullname = (entry.name ? entry.name + "/" : "") + fullname;
                entry = entry.parent;
            }
            return fullname;
        }
        isDescendantOf(ancestor) {
            var entry = this.parent;
            while (entry && entry.id !== ancestor.id) entry = entry.parent;
            return !!entry;
        }
    }

    var ZipFileEntryProto;
    function ZipFileEntry(fs, name, params, parent) {
        var that = this;
        ZipEntry.prototype.init.call(that, fs, name, params, parent);
        that.Reader = params.Reader;
        that.Writer = params.Writer;
        that.data = params.data;
        if (params.getData) that.getData = params.getData;
    }
    ZipFileEntry.prototype = ZipFileEntryProto = new ZipEntry();
    ZipFileEntryProto.constructor = ZipFileEntry;
    ZipFileEntryProto.getData = function (writer, onend, onprogress, onerror) {
        var that = this;
        if (!writer || (writer.constructor === that.Writer && that.data)) onend(that.data);
        else {
            if (!that.reader) that.reader = new that.Reader(that.data, onerror);
            that.reader.init(() => writer.init(() => bufferedCopy(that.reader, writer, onend, onprogress, onerror), onerror));
        }
    };
    ZipFileEntryProto.getText = function (onend, onprogress, checkCrc32, encoding) {
        this.getData(new TextWriter(encoding), onend, onprogress, checkCrc32);
    };
    ZipFileEntryProto.getBlob = function (mimeType, onend, onprogress, checkCrc32) {
        this.getData(new BlobWriter(mimeType), onend, onprogress, checkCrc32);
    };
    ZipFileEntryProto.getData64URI = function (mimeType, onend, onprogress, checkCrc32) {
        this.getData(new Data64URIWriter(mimeType), onend, onprogress, checkCrc32);
    };

    var ZipDirectoryEntryProto;
    function ZipDirectoryEntry(fs, name, params, parent) {
        var that = this;
        ZipEntry.prototype.init.call(that, fs, name, params, parent);
        that.directory = true;
    }
    ZipDirectoryEntry.prototype = ZipDirectoryEntryProto = new ZipEntry();
    ZipDirectoryEntryProto.constructor = ZipDirectoryEntry;
    ZipDirectoryEntryProto.importBlob = function (blob, onend, onerror) {
        this.importZip(new BlobReader(blob), onend, onerror);
    };
    ZipDirectoryEntryProto.importText = function (text, onend, onerror) {
        this.importZip(new TextReader(text), onend, onerror);
    };
    ZipDirectoryEntryProto.importData64URI = function (dataURI, onend, onerror) {
        this.importZip(new Data64URIReader(dataURI), onend, onerror);
    };
    ZipDirectoryEntryProto.importZip = function (reader, onend, onerror) {
        createReader(reader, zipReader => zipReader.getEntries(entries => {
            entries.forEach(entry => {
                var parent = this, path = entry.filename.split("/"), name = path.pop();
                path.forEach(pathPart => parent = parent.getChildByName(pathPart) || new ZipDirectoryEntry(this.fs, pathPart, null, parent));
                if (!entry.directory) addChild(parent, name, {
                    data: entry,
                    Reader: ZipBlobReader
                });
            });
            onend();
        }), onerror);
    };
    ZipDirectoryEntryProto.getChildByName = function (name) {
        var i, child;
        for (i = 0; i < this.children.length; ++i) {
            child = this.children[i];
            if (child.name === name) return child;
        }
    };

    function FS() {
        resetFS(this);
    }
    FS.prototype = {
        find: function (fullname) {
            var i, path = fullname.split("/"), node = this.root;
            for (i = 0; node && i < path.length; ++i) node = node.getChildByName(path[i]);
            return node;
        },
        getById: function (id) {
            return this.entries[id];
        },
        importBlob: function (blob, onend, onerror) {
            resetFS(this);
            this.root.importBlob(blob, onend, onerror);
        },
        importText: function (text, onend, onerror) {
            resetFS(this);
            this.root.importText(text, onend, onerror);
        },
        importData64URI: function (dataURI, onend, onerror) {
            resetFS(this);
            this.root.importData64URI(dataURI, onend, onerror);
        }
    };
    zip.fs = {
        FS: FS,
        ZipDirectoryEntry: ZipDirectoryEntry,
        ZipFileEntry: ZipFileEntry
    };
    zip.getMimeType = () => "application/octet-stream"
})();