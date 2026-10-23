"use strict";

const { WebOsTv } = require("../lib/webos");
const { slug } = require("../lib/util");

module.exports = function (RED) {
    function LgThinqTv(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.ip = config.ip;
        node.mac = config.mac;
        node.broadcast = config.broadcast || "255.255.255.255";
        node.secure = Boolean(config.secure);
        node.reconnect = Number(config.reconnect) || 5;
        const clientKey = (node.credentials && node.credentials.clientKey) || "";

        if (!node.ip) {
            node.status({ fill: "red", shape: "ring", text: "no IP" });
            return;
        }

        node.tv = new WebOsTv({
            ip: node.ip,
            mac: node.mac,
            broadcast: node.broadcast,
            secure: node.secure,
            reconnect: node.reconnect,
            clientKey,
            log: node,
            saveKey: function (key) {
                RED.nodes.addCredentials(node.id, { clientKey: key });
            }
        });

        function emit(event, payload, send) {
            const msg = {
                topic: "home/lg/" + slug(config.name || "tv"),
                event,
                payload
            };
            if (send) {
                send(msg);
            } else {
                node.send(msg);
            }
        }

        node.tv.on("prompt", () => {
            node.status({ fill: "yellow", shape: "ring", text: "accept pairing on TV" });
        });
        node.tv.on("connecting", () => {
            node.status({ fill: "yellow", shape: "ring", text: "connecting" });
        });
        node.tv.on("status", (payload) => {
            node.status({
                fill: payload.power ? "green" : "grey",
                shape: "dot",
                text: payload.state
            });
            emit(payload.power ? "on" : "off", payload);
        });

        node.tv.connect();

        node.on("input", function (msg, send, done) {
            send = send || node.send.bind(node);
            const payload = msg.payload;
            const run = async () => {
                if (payload === "status" || msg.topic === "status") {
                    emit("query", await node.tv.status(), send);
                    return;
                }
                if (payload === "on" || payload === true) {
                    await node.tv.on();
                    return;
                }
                if (payload === "off" || payload === false) {
                    await node.tv.off();
                    return;
                }
                if (payload === "toggle") {
                    await node.tv.toggle();
                    return;
                }
                if (payload && typeof payload === "object") {
                    if (payload.volume !== undefined) {
                        await node.tv.request("ssap://audio/setVolume", { volume: Number(payload.volume) });
                    }
                    if (payload.mute !== undefined) {
                        await node.tv.request("ssap://audio/setMute", { mute: Boolean(payload.mute) });
                    }
                    if (payload.app) {
                        await node.tv.request("ssap://system.launcher/launch", { id: payload.app });
                    }
                    if (payload.toast) {
                        await node.tv.request("ssap://system.notifications/createToast", { message: String(payload.toast) });
                    }
                    emit("command", payload, send);
                }
            };
            run().then(() => done && done()).catch((err) => {
                node.status({ fill: "red", shape: "ring", text: err.message });
                if (done) {
                    done(err);
                } else {
                    node.error(err, msg);
                }
            });
        });

        node.on("close", function () {
            node.tv.close();
        });
    }

    RED.nodes.registerType("lg-thinq-tv", LgThinqTv, {
        credentials: {
            clientKey: { type: "password" }
        }
    });
};
