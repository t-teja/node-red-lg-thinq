"use strict";

const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");
const { ThinQApi, ThinQMQTTClient } = require("thinqconnect");
const { unwrapDevices, deviceInfo } = require("./util");
const { parseMqtt } = require("./mqtt-parse");

const CLIENT_BODY = {
    type: "MQTT",
    "service-code": "SVC202",
    "device-type": "607",
    allowExist: true
};

class ThinQSession extends EventEmitter {
    constructor(opts) {
        super();
        this.pat = opts.pat;
        this.country = opts.country || "IN";
        this.clientId = opts.clientId;
        this.userDir = opts.userDir;
        this.nodeId = opts.nodeId;
        this.pollMs = Math.max(10, Number(opts.pollSeconds) || 60) * 1000;
        this.realtime = opts.realtime !== false;
        this.log = opts.log || { debug() {}, warn() {}, error() {}, info() {} };
        this.api = new ThinQApi(this.pat, this.country, this.clientId);
        this.devices = [];
        this.mqtt = null;
        this.timer = null;
        this.closed = false;
        this.mqttState = "disconnected";
    }

    certDir() {
        return path.join(this.userDir, "lg-thinq", this.nodeId);
    }

    certPath() {
        return path.join(this.certDir(), "mqtt.json");
    }

    loadCerts() {
        try {
            return JSON.parse(fs.readFileSync(this.certPath(), "utf8"));
        } catch {
            return null;
        }
    }

    saveCerts(mqtt) {
        fs.mkdirSync(this.certDir(), { recursive: true });
        fs.writeFileSync(this.certPath(), JSON.stringify({
            certificate: mqtt.certificate,
            privateKey: mqtt.privateKey,
            rootCa: mqtt.rootCa,
            topicSubscription: mqtt.topicSubscription,
            mqttServer: mqtt.mqttServer
        }, null, 2));
    }

    async listDevices() {
        const response = await this.api.asyncGetDeviceList();
        if (response.status !== 200) {
            const err = new Error(response.errorMessage || "ThinQ device list failed");
            err.code = response.errorCode;
            throw err;
        }
        this.devices = unwrapDevices(response.body).map(deviceInfo).filter((d) => d.deviceId);
        return this.devices;
    }

    async getStatus(deviceId) {
        const response = await this.api.asyncGetDeviceStatus(deviceId);
        if (response.status !== 200) {
            const err = new Error(response.errorMessage || "ThinQ status failed");
            err.code = response.errorCode;
            throw err;
        }
        return response.body || {};
    }

    async control(deviceId, payload) {
        const response = await this.api.asyncPostDeviceControl(deviceId, payload);
        if (response.status !== 200) {
            const err = new Error(response.errorMessage || "ThinQ control failed");
            err.code = response.errorCode;
            throw err;
        }
        return response.body;
    }

    async subscribe(deviceId) {
        try {
            await this.api.asyncPostEventSubscribe(deviceId);
        } catch (err) {
            this.log.warn("event subscribe: " + err.message);
        }
        try {
            await this.api.asyncPostPushSubscribe(deviceId);
        } catch (err) {
            this.log.warn("push subscribe: " + err.message);
        }
    }

    async startMqtt() {
        const mqtt = new ThinQMQTTClient(
            this.api,
            this.clientId,
            (topic, payload) => this.onMqtt(topic, payload),
            (err) => {
                this.mqttState = "interrupted";
                this.emit("mqtt", this.mqttState, err);
            },
            () => {
                this.mqttState = "connected";
                this.emit("mqtt", this.mqttState);
            },
            (err) => {
                this.mqttState = "failed";
                this.emit("mqtt", this.mqttState, err);
            },
            () => {
                this.mqttState = "closed";
                this.emit("mqtt", this.mqttState);
            }
        );
        await mqtt.asyncInit();
        const saved = this.loadCerts();
        if (saved && saved.certificate && saved.privateKey && saved.rootCa && saved.topicSubscription) {
            mqtt.certificate = saved.certificate;
            mqtt.privateKey = saved.privateKey;
            mqtt.rootCa = saved.rootCa;
            mqtt.topicSubscription = saved.topicSubscription;
            if (saved.mqttServer) {
                mqtt.mqttServer = saved.mqttServer;
            }
            const registered = await this.api.asyncPostClientRegister(CLIENT_BODY);
            if (registered.status !== 200) {
                this.log.warn("client register with saved certs failed, issuing new cert");
                const ok = await mqtt.asyncPrepareMqtt();
                if (!ok) {
                    throw new Error("ThinQ MQTT prepare failed");
                }
                this.saveCerts(mqtt);
            }
        } else {
            const ok = await mqtt.asyncPrepareMqtt();
            if (!ok) {
                throw new Error("ThinQ MQTT prepare failed");
            }
            this.saveCerts(mqtt);
        }
        await mqtt.asyncConnectMqtt();
        this.mqtt = mqtt;
        this.mqttState = "connected";
        this.emit("mqtt", this.mqttState);
    }

    onMqtt(topic, payload) {
        const parsed = parseMqtt(topic, payload);
        if (!parsed) {
            return;
        }
        this.emit("push", parsed);
        if (parsed.deviceId) {
            this.emit("device", parsed.deviceId, parsed);
        }
    }

    startPoll() {
        if (this.timer) {
            return;
        }
        this.timer = setInterval(() => this.emit("poll"), this.pollMs);
        if (typeof this.timer.unref === "function") {
            this.timer.unref();
        }
    }

    async start() {
        await this.listDevices();
        this.startPoll();
        if (this.realtime) {
            try {
                await this.startMqtt();
            } catch (err) {
                this.log.warn("ThinQ realtime MQTT unavailable, polling only: " + err.message);
                this.mqttState = "polling";
                this.emit("mqtt", this.mqttState, err);
            }
        } else {
            this.mqttState = "polling";
            this.emit("mqtt", this.mqttState);
        }
    }

    async stop() {
        this.closed = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.mqtt && this.mqtt.asyncDisconnectMqtt) {
            try {
                await this.mqtt.asyncDisconnectMqtt();
            } catch (err) {
                this.log.debug("mqtt disconnect: " + err.message);
            }
        }
        this.mqtt = null;
        this.removeAllListeners();
    }
}

async function testConnection({ pat, country, clientId }) {
    const api = new ThinQApi(pat, country, clientId);
    const response = await api.asyncGetDeviceList();
    if (response.status !== 200) {
        const err = new Error(response.errorMessage || "ThinQ login failed");
        err.code = response.errorCode;
        throw err;
    }
    return unwrapDevices(response.body).map(deviceInfo).filter((d) => d.deviceId);
}

module.exports = {
    ThinQSession,
    testConnection
};
