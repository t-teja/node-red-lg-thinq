"use strict";

const EventEmitter = require("events");

function wol(mac, broadcast) {
    const wake = require("wake_on_lan");
    return new Promise((resolve, reject) => {
        const opts = {};
        if (broadcast) {
            opts.address = broadcast;
        }
        wake.wake(mac, opts, (err) => err ? reject(err) : resolve());
    });
}

class WebOsTv extends EventEmitter {
    constructor(opts) {
        super();
        this.ip = opts.ip;
        this.mac = opts.mac;
        this.broadcast = opts.broadcast || "255.255.255.255";
        this.secure = Boolean(opts.secure);
        this.clientKey = opts.clientKey || "";
        this.reconnectMs = Math.max(2, Number(opts.reconnect) || 5) * 1000;
        this.saveKey = opts.saveKey || (() => {});
        this.log = opts.log || { debug() {}, warn() {}, error() {} };
        this.lgtv = null;
        this.connected = false;
        this.closed = false;
    }

    url() {
        const scheme = this.secure ? "wss" : "ws";
        const port = this.secure ? 3001 : 3000;
        return `${scheme}://${this.ip}:${port}`;
    }

    connect() {
        if (this.lgtv || this.closed) {
            return;
        }
        const lgtv2 = require("lgtv2");
        const options = {
            url: this.url(),
            timeout: 5000,
            reconnect: this.reconnectMs,
            saveKey: (key, cb) => {
                this.clientKey = key;
                this.saveKey(key);
                if (typeof cb === "function") {
                    cb();
                }
            }
        };
        if (this.clientKey) {
            options.clientKey = this.clientKey;
        }
        this.lgtv = lgtv2(options);
        this.lgtv.on("connect", () => {
            this.connected = true;
            this.emit("power", true);
            this.emit("status", { power: true, connected: true, state: "On" });
        });
        this.lgtv.on("connecting", () => {
            this.emit("connecting");
        });
        this.lgtv.on("error", (err) => {
            this.log.debug("webos: " + (err && err.message));
        });
        this.lgtv.on("close", () => {
            const was = this.connected;
            this.connected = false;
            if (was) {
                this.emit("power", false);
                this.emit("status", { power: false, connected: false, state: "Off" });
            }
        });
        this.lgtv.on("prompt", () => {
            this.emit("prompt");
        });
    }

    request(uri, payload) {
        return new Promise((resolve, reject) => {
            if (!this.lgtv) {
                reject(new Error("TV not connected"));
                return;
            }
            this.lgtv.request(uri, payload || {}, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }

    async on() {
        if (this.mac) {
            await wol(this.mac, this.broadcast);
        }
        if (!this.lgtv) {
            this.connect();
        }
    }

    async off() {
        await this.request("ssap://system/turnOff");
    }

    async toggle() {
        if (this.connected) {
            await this.off();
        } else {
            await this.on();
        }
    }

    async status() {
        return {
            power: this.connected,
            connected: this.connected,
            state: this.connected ? "On" : "Off"
        };
    }

    close() {
        this.closed = true;
        if (this.lgtv && this.lgtv.disconnect) {
            try {
                this.lgtv.disconnect();
            } catch {
                // ignore
            }
        }
        this.lgtv = null;
        this.removeAllListeners();
    }
}

module.exports = {
    WebOsTv,
    wol
};
