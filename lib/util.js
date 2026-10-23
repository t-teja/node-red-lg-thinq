"use strict";

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFind(obj, predicate, depth = 0) {
    if (!isObject(obj) || depth > 8) {
        return undefined;
    }
    if (predicate(obj)) {
        return obj;
    }
    for (const value of Object.values(obj)) {
        const found = deepFind(value, predicate, depth + 1);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function findValue(obj, key) {
    const hit = deepFind(obj, (node) => Object.prototype.hasOwnProperty.call(node, key));
    return hit ? hit[key] : undefined;
}

function asNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

function asBool(value) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        const v = value.toLowerCase();
        if (["true", "on", "1", "open", "power_on"].includes(v)) {
            return true;
        }
        if (["false", "off", "0", "closed", "power_off"].includes(v)) {
            return false;
        }
    }
    if (typeof value === "number") {
        return value !== 0;
    }
    return undefined;
}

function slug(name) {
    return String(name || "device")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "device";
}

function typeLabel(deviceType) {
    return String(deviceType || "")
        .replace(/^DEVICE_/, "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function unwrapDevices(body) {
    if (Array.isArray(body)) {
        return body;
    }
    if (!body || typeof body !== "object") {
        return [];
    }
    if (Array.isArray(body.item)) {
        return body.item;
    }
    if (Array.isArray(body.devices)) {
        return body.devices;
    }
    if (Array.isArray(body.deviceList)) {
        return body.deviceList;
    }
    return [];
}

function deviceInfo(entry) {
    const info = entry.deviceInfo || entry;
    return {
        deviceId: entry.deviceId || entry.id || info.deviceId,
        name: info.alias || info.name || entry.alias || "LG device",
        type: info.deviceType || info.type || "UNKNOWN",
        model: info.modelName || info.model || "",
        online: info.networkType ? true : info.reportable !== false,
        reportable: info.reportable !== false
    };
}

module.exports = {
    isObject,
    deepFind,
    findValue,
    asNumber,
    asBool,
    slug,
    typeLabel,
    unwrapDevices,
    deviceInfo
};
