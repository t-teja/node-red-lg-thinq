"use strict";

const { v4: uuidv4 } = require("uuid");
const { ThinQSession, testConnection } = require("../lib/session");

module.exports = function (RED) {
    function LgThinqAccount(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.country = config.country || "IN";
        node.clientId = config.clientId || uuidv4();
        node.pollSeconds = Number(config.pollSeconds) || 60;
        node.realtime = config.realtime !== false;
        node.watchers = new Map();
        node.session = null;

        const pat = node.credentials && node.credentials.pat;
        if (!pat) {
            node.warn("LG ThinQ account has no Personal Access Token");
            node.ready = Promise.resolve();
            return;
        }

        node.session = new ThinQSession({
            pat,
            country: node.country,
            clientId: node.clientId,
            userDir: RED.settings.userDir,
            nodeId: node.id,
            pollSeconds: node.pollSeconds,
            realtime: node.realtime,
            log: node
        });

        node.session.on("device", (deviceId, parsed) => {
            const set = node.watchers.get(deviceId);
            if (!set) {
                return;
            }
            for (const watcher of set) {
                watcher.onPush(parsed);
            }
        });
        node.session.on("poll", () => {
            for (const set of node.watchers.values()) {
                for (const watcher of set) {
                    watcher.onPoll();
                }
            }
        });
        node.session.on("mqtt", (state, err) => {
            node.mqttState = state;
            if (err) {
                node.debug("mqtt: " + err.message);
            }
            for (const set of node.watchers.values()) {
                for (const watcher of set) {
                    watcher.onMqttState(state, err);
                }
            }
        });

        node.ready = node.session.start().catch((err) => {
            node.error("ThinQ start failed: " + err.message);
        });

        node.watch = function (deviceId, watcher) {
            if (!deviceId) {
                return;
            }
            if (!node.watchers.has(deviceId)) {
                node.watchers.set(deviceId, new Set());
            }
            node.watchers.get(deviceId).add(watcher);
            if (node.session) {
                node.session.subscribe(deviceId).catch((err) => node.debug(err.message));
            }
        };

        node.unwatch = function (deviceId, watcher) {
            const set = node.watchers.get(deviceId);
            if (!set) {
                return;
            }
            set.delete(watcher);
            if (set.size === 0) {
                node.watchers.delete(deviceId);
            }
        };

        node.on("close", function (removed, done) {
            const finish = () => done();
            if (node.session) {
                node.session.stop().then(finish, finish);
            } else {
                done();
            }
        });
    }

    RED.nodes.registerType("lg-thinq-account", LgThinqAccount, {
        credentials: {
            pat: { type: "password" }
        }
    });

    RED.httpAdmin.post(
        "/lg-thinq/devices",
        RED.auth.needsPermission("nodes.read"),
        async function (req, res) {
            try {
                const id = req.body && req.body.id;
                const country = (req.body && req.body.country) || "IN";
                let pat = req.body && req.body.pat;
                let clientId = (req.body && req.body.clientId) || uuidv4();
                if ((!pat || pat === "__PWRD__") && id) {
                    const stored = RED.nodes.getCredentials(id);
                    if (stored && stored.pat) {
                        pat = stored.pat;
                    }
                }
                const existing = id && RED.nodes.getNode(id);
                if (existing && existing.clientId) {
                    clientId = existing.clientId;
                }
                if (!pat) {
                    res.status(400).json({ error: "Personal Access Token is required" });
                    return;
                }
                const devices = await testConnection({ pat, country, clientId });
                res.json({ devices });
            } catch (err) {
                res.status(400).json({ error: err.message, code: err.code });
            }
        }
    );
};
