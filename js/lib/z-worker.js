(global => {
    "use strict";

    addEventListener("message", event => {
        let message = event.data, type = message.type, sn = message.sn, handler = handlers[type];
        if (handler) {
            try {
                handler(message);
            }
            catch (e) {
                onError(type, sn, e);
            }
        }
    });

    let handlers = {
        importScripts: doImportScripts,
        newTask: newTask,
        append: processData,
        flush: processData
    }, tasks = {};

    function doImportScripts(msg) {
        if (msg.scripts && msg.scripts.length > 0) importScripts.apply(undefined, msg.scripts);
        postMessage({
            type: 'importScripts'
        });
    }
    function newTask(msg) {
        let CodecClass = global[msg.codecClass], sn = msg.sn;
        if (tasks[sn]) throw Error('duplicated sn');
        tasks[sn] = {
            codec: new CodecClass(msg.options),
            crcInput: msg.crcType === 'input',
            crcOutput: msg.crcType === 'output',
            crc: new Crc32()
        };
        postMessage({
            type: 'newTask', sn: sn
        });
    }
    let now = global.performance ? global.performance.now.bind(global.performance) : Date.now;

    function processData(msg) {
        let sn = msg.sn, type = msg.type, input = msg.data, task = tasks[sn];
        if (!task && msg.codecClass) {
            newTask(msg);
            task = tasks[sn];
        }

        let isAppend = type === 'append', start = now(), output;
        if (isAppend) {
            try {
                output = task.codec.append(input, function (loaded) {
                    postMessage({
                        type: 'progress', sn: sn, loaded: loaded
                    });
                });
            }
            catch (e) {
                delete tasks[sn];
                throw e;
            }
        }
        else {
            delete tasks[sn];
            output = task.codec.flush();
        }
        let codecTime = now() - start;

        start = now();
        if (input && task.crcInput) task.crc.append(input);
        if (output && task.crcOutput) task.crc.append(output);
        let crcTime = now() - start, rmsg = {
            type: type, sn: sn, codecTime: codecTime, crcTime: crcTime
        }, transferables = [];
        if (output) {
            rmsg.data = output;
            transferables.push(output.buffer);
        }
        if (!isAppend && (task.crcInput || task.crcOutput)) rmsg.crc = task.crc.get();

        try {
            postMessage(rmsg, transferables);
        }
        catch (ex) {
            postMessage(rmsg);
        }
    }
    const onError = (type, sn, e) => postMessage({
        type: type,
        sn: sn,
        error: formatError(e)
    });
    function formatError(e) {
        return {
            message: e.message, stack: e.stack
        };
    }

    class Crc32 {
        constructor() {
            this.crc = -1;
        }
        append(data) {
            var crc = this.crc | 0, table = this.table;
            for (var ofs = 0, len = data.length | 0; ofs < len; ++ofs) crc = (crc >>> 8) ^ table[(crc ^ data[ofs]) & 0xFF];
            this.crc = crc;
        }
        get() {
            return ~this.crc;
        }
    }
    Crc32.prototype.table = (() => {
        let i, j, t, table = [];
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
})(this);