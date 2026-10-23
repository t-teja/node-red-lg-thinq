"use strict";

const { deepFind, findValue, asNumber, asBool, slug } = require("./util");

const RUNNING_STATES = new Set([
    "RUNNING", "WASHING", "RINSING", "SPINNING", "DRYING", "DETECTING",
    "PAUSE", "PAUSED", "FRESHCARE", "COOLING", "HEATING", "INITIAL",
    "PREWASH", "SOAKING", "ADD_DRAIN", "WRINKLECARE", "NIGHTDRY"
]);

const COMPLETE_STATES = new Set([
    "END", "COMPLETE", "COMPLETED", "COOLDOWN", "POWER_OFF", "OFF", "STANDBY"
]);

const POWER_ON = new Set(["POWER_ON", "ON", "START", "TRUE", "1"]);
const POWER_OFF = new Set(["POWER_OFF", "OFF", "STOP", "FALSE", "0"]);

function currentState(raw) {
    const node = deepFind(raw, (o) => typeof o.currentState === "string");
    return node ? String(node.currentState).toUpperCase() : undefined;
}

function remainMinutes(raw) {
    const timer = deepFind(raw, (o) =>
        o.remainHour !== undefined || o.remainMinute !== undefined
    );
    if (!timer) {
        return undefined;
    }
    const h = asNumber(timer.remainHour) || 0;
    const m = asNumber(timer.remainMinute) || 0;
    return h * 60 + m;
}

function pickTemp(raw, keys) {
    for (const key of keys) {
        const value = asNumber(findValue(raw, key));
        if (value !== undefined) {
            return value;
        }
    }
    return undefined;
}

function normalizeWasher(raw) {
    const state = currentState(raw) || "UNKNOWN";
    const remain = remainMinutes(raw);
    return {
        running: RUNNING_STATES.has(state),
        complete: COMPLETE_STATES.has(state) && state !== "STANDBY",
        state,
        remainMinutes: remain,
        remoteStart: asBool(findValue(raw, "remoteControlEnabled")),
        cycleCount: asNumber(findValue(raw, "cycleCount"))
    };
}

function normalizeAc(raw) {
    const op = String(findValue(raw, "airConOperationMode") || findValue(raw, "operationMode") || "").toUpperCase();
    const power = POWER_ON.has(op) ? true : POWER_OFF.has(op) ? false : asBool(findValue(raw, "power"));
    return {
        power: power === undefined ? undefined : power,
        mode: findValue(raw, "currentJobMode") || findValue(raw, "airConJobMode"),
        currentTemperature: pickTemp(raw, ["currentTemperatureC", "currentTemperature"]),
        targetTemperature: pickTemp(raw, ["targetTemperatureC", "targetTemperature", "coolTargetTemperatureC"]),
        fan: findValue(raw, "windStrength"),
        humidity: asNumber(findValue(raw, "humidity"))
    };
}

function normalizeFridge(raw) {
    const door = findValue(raw, "doorState") || findValue(raw, "doorStatus");
    return {
        fridgeTemp: pickTemp(raw, ["fridgeTargetTemperatureC", "fridgeTemp", "targetTemperatureC"]),
        freezerTemp: pickTemp(raw, ["freezerTargetTemperatureC", "freezerTemp"]),
        doorOpen: door ? String(door).toUpperCase().includes("OPEN") : asBool(findValue(raw, "doorOpen"))
    };
}

function extrasForType(type, raw) {
    if (/WASHER|DRYER|WASHTOWER|WASHCOMBO|DISH_WASHER|STYLER/.test(type)) {
        return normalizeWasher(raw);
    }
    if (/AIR_CONDITIONER|DEHUMIDIFIER|AIR_PURIFIER/.test(type)) {
        return normalizeAc(raw);
    }
    if (/REFRIGERATOR|WINE_CELLAR/.test(type)) {
        return normalizeFridge(raw);
    }
    return {};
}

function dashboardValue(state, field) {
    if (!field) {
        return state;
    }
    if (Object.prototype.hasOwnProperty.call(state, field)) {
        return state[field];
    }
    return findValue(state, field);
}

function isCompleteTransition(previous, next) {
    const wasRunning = previous && (previous.running || RUNNING_STATES.has(String(previous.state || "").toUpperCase()));
    const nowComplete = next && (next.complete || COMPLETE_STATES.has(String(next.state || "").toUpperCase()));
    return Boolean(wasRunning && nowComplete);
}

function normalize({ raw, info, online }) {
    const type = info.type || "UNKNOWN";
    const extras = extrasForType(type, raw || {});
    return {
        online: online !== false,
        name: info.name,
        type,
        model: info.model || "",
        ...extras
    };
}

function topicFor(info) {
    return `home/lg/${slug(info.name)}`;
}

module.exports = {
    RUNNING_STATES,
    COMPLETE_STATES,
    currentState,
    remainMinutes,
    normalizeWasher,
    normalizeAc,
    normalizeFridge,
    extrasForType,
    dashboardValue,
    isCompleteTransition,
    normalize,
    topicFor
};
