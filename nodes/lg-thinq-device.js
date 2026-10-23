"use strict";

const { normalize, dashboardValue, isCompleteTransition, topicFor } = require("../lib/normalize");
const { isQuery, toControl } = require("../lib/commands");
const { completeEventName } = require("../lib/mqtt-parse");

module.exports = function (RED) {
    function LgThinqDevice(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.account = RED.nodes.getNode(config.account);
        node.deviceId = config.deviceId;
        node.raw = Boolean(config.raw);
        node.dashboardField = config.dashboardField || "";
        node.lastState = null;
        node.info = {
            deviceId: node.deviceId,
            name: config.deviceName || "LG device",
            type: config.deviceType || "UNKNOWN",
            model: config.deviceModel || ""
        };
        node.busy = Promise.resolve();

        if (!node.account) {
            node.status({ fill: "red", shape: "ring", text: "no account" });
            return;
        }
        if (!node.deviceId) {
            node.status({ fill: "red", shape: "ring", text: "no device" });
            return;
        }

        function sendState(event, raw, extra) {
            const sessionDevices = (node.account.session && node.account.session.devices) || [];
            const listed = sessionDevices.find((d) => d.deviceId === node.deviceId);
            if (listed) {
                node.info = listed;
            }
            const state = normalize({
                raw: raw || {},
                info: node.info,
                online: extra && extra.online
            });
            const previous = node.lastState;
            node.lastState = state;
            const msg = {
                topic: topicFor(node.info),
                deviceId: node.info.deviceId,
                name: node.info.name,
                type: node.info.type,
                event,
                state,
                payload: dashboardValue(state, node.dashboardField)
            };
            if (node.raw) {
                msg.raw = raw;
            }
            node.send([msg, null]);
            const completeFromState = isCompleteTransition(previous, state);
            if (completeFromState) {
                node.send([null, {
                    topic: topicFor(node.info) + "/event",
                    deviceId: node.info.deviceId,
                    name: node.info.name,
                    type: node.info.type,
                    event: completeEventName(node.info.type),
                    payload: { deviceId: node.info.deviceId, name: node.info.name, state: state.state },
                    state
                }]);
            }
            const label = state.state || (state.power === true ? "on" : state.power === false ? "off" : "ok");
            node.status({ fill: "green", shape: "dot", text: label });
            return state;
        }

        node.onPush = function (parsed) {
            if (parsed.notification && parsed.event) {
                const msg = {
                    topic: topicFor(node.info) + "/event",
                    deviceId: node.info.deviceId,
                    name: node.info.name,
                    type: node.info.type,
                    event: parsed.event,
                    payload: {
                        deviceId: node.info.deviceId,
                        name: node.info.name,
                        event: parsed.event
                    }
                };
                if (node.raw) {
                    msg.raw = parsed.raw;
                }
                node.send([null, msg]);
            }
            if (parsed.state) {
                sendState(parsed.event || "change", parsed.state);
            }
        };

        node.onPoll = function () {
            refresh("periodic").catch((err) => {
                node.status({ fill: "red", shape: "ring", text: err.message });
            });
        };

        node.onMqttState = function (state) {
            if (state === "connected") {
                node.status({ fill: "green", shape: "dot", text: node.lastState && node.lastState.state || "live" });
            } else if (state === "polling") {
                node.status({ fill: "yellow", shape: "ring", text: "polling" });
            } else if (state === "failed" || state === "interrupted") {
                node.status({ fill: "yellow", shape: "ring", text: "mqtt " + state });
            }
        };

        async function refresh(event) {
            if (!node.account.session) {
                throw new Error("account not started");
            }
            const raw = await node.account.session.getStatus(node.deviceId);
            return sendState(event, raw);
        }

        node.account.ready.then(() => {
            node.account.watch(node.deviceId, node);
            return refresh("initial");
        }).catch((err) => {
            node.status({ fill: "red", shape: "ring", text: err.message });
        });

        node.on("input", function (msg, send, done) {
            send = send || node.send.bind(node);
            const run = async () => {
                const payload = msg.payload;
                if (isQuery(payload, msg.topic)) {
                    await refresh("query");
                    return;
                }
                const type = node.info.type;
                const control = toControl(type, payload);
                if (!control) {
                    throw new Error("unsupported command");
                }
                await node.account.session.control(node.deviceId, control);
                await refresh("command");
            };
            node.busy = node.busy.then(run, run).then(() => done && done()).catch((err) => {
                node.status({ fill: "red", shape: "ring", text: err.message });
                if (done) {
                    done(err);
                } else {
                    node.error(err, msg);
                }
            });
        });

        node.on("close", function () {
            node.account.unwatch(node.deviceId, node);
        });
    }

    RED.nodes.registerType("lg-thinq-device", LgThinqDevice);
};
