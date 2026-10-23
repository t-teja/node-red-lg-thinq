"use strict";

function decodePayload(payload) {
    if (payload == null) {
        return null;
    }
    if (typeof payload === "object" && !Buffer.isBuffer(payload) && !(payload instanceof ArrayBuffer)) {
        return payload;
    }
    const text = Buffer.isBuffer(payload)
        ? payload.toString("utf8")
        : Buffer.from(payload).toString("utf8");
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

function eventCode(data) {
    const candidates = [
        data.eventType,
        data.pushCode,
        data.notificationCode,
        data.type,
        data.data && data.data.eventType,
        data.data && data.data.pushType,
        data.report && data.report.eventType
    ];
    for (const value of candidates) {
        if (typeof value === "string" && value && !["DEVICE_STATUS", "DEVICE_PUSH", "DEVICE_EVENT"].includes(value)) {
            return value;
        }
    }
    return undefined;
}

function parseMqtt(topic, payload) {
    const data = decodePayload(payload);
    if (!data || typeof data !== "object") {
        return null;
    }
    const deviceId = data.deviceId || data.device_id || (data.data && data.data.deviceId);
    const pushType = data.pushType || data.type || (data.data && data.data.pushType) || "DEVICE_STATUS";
    const state = data.report || data.state || data.snapshot || (data.data && (data.data.report || data.data.state)) || data;
    const code = eventCode(data);
    const isNotification = /PUSH|EVENT|NOTIF/i.test(String(pushType)) || Boolean(code);
    return {
        deviceId,
        pushType,
        event: code,
        state,
        notification: isNotification,
        raw: data,
        topic
    };
}

function completeEventName(deviceType) {
    if (/DRYER/.test(deviceType)) {
        return "drying_is_complete";
    }
    if (/DISH/.test(deviceType)) {
        return "cleaning_is_complete";
    }
    return "washing_is_complete";
}

module.exports = {
    decodePayload,
    parseMqtt,
    completeEventName
};
