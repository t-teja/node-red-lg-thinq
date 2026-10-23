"use strict";

function truthy(value) {
    return value === true || value === 1 || /^(on|true|start|1)$/i.test(String(value));
}

function falsy(value) {
    return value === false || value === 0 || /^(off|false|stop|0)$/i.test(String(value));
}

function washerMode(value) {
    const v = String(value).toUpperCase();
    if (["START", "ON", "RUN"].includes(v) || truthy(value)) {
        return "START";
    }
    if (["STOP", "PAUSE"].includes(v)) {
        return "STOP";
    }
    if (["POWER_OFF", "OFF"].includes(v) || falsy(value)) {
        return "POWER_OFF";
    }
    if (["WAKE_UP", "WAKE", "REMOTE"].includes(v)) {
        return "WAKE_UP";
    }
    return v;
}

function acPower(value) {
    if (truthy(value) || String(value).toUpperCase() === "POWER_ON") {
        return "POWER_ON";
    }
    if (falsy(value) || String(value).toUpperCase() === "POWER_OFF") {
        return "POWER_OFF";
    }
    return undefined;
}

function acMode(value) {
    const map = {
        cool: "COOL",
        heat: "HEAT",
        dry: "DRY",
        fan: "FAN",
        auto: "AUTO",
        air_clean: "AIR_CLEAN",
        airclean: "AIR_CLEAN"
    };
    const key = String(value).toLowerCase();
    return map[key] || String(value).toUpperCase();
}

function isQuery(payload, topic) {
    if (topic === "status" || topic === "query" || topic === "refresh") {
        return true;
    }
    if (payload === "status" || payload === "query" || payload === "refresh") {
        return true;
    }
    if (payload && typeof payload === "object" && payload.status === true) {
        return true;
    }
    return false;
}

function toControl(deviceType, payload) {
    const type = String(deviceType || "");
    if (payload && typeof payload === "object" && payload.raw && typeof payload.raw === "object") {
        return payload.raw;
    }
    if (payload && typeof payload === "object" && payload.control && typeof payload.control === "object") {
        return payload.control;
    }

    if (/WASHER|DRYER|WASHTOWER|WASHCOMBO|DISH_WASHER/.test(type)) {
        const key = /DRYER/.test(type) ? "dryerOperationMode"
            : /DISH/.test(type) ? "dishWasherOperationMode"
            : "washerOperationMode";
        if (typeof payload !== "object" || payload === null) {
            return { operation: { [key]: washerMode(payload) } };
        }
        const body = {};
        const op = payload.operation || payload.power || payload.mode;
        if (op !== undefined) {
            body.operation = { [key]: washerMode(op) };
        }
        return Object.keys(body).length ? body : payload;
    }

    if (/AIR_CONDITIONER/.test(type)) {
        if (typeof payload !== "object" || payload === null) {
            if (typeof payload === "number") {
                return { temperature: { targetTemperatureC: payload } };
            }
            if (/^(cool|heat|dry|fan|auto|air_clean)$/i.test(String(payload))) {
                return { airConJobMode: { currentJobMode: acMode(payload) } };
            }
            const power = acPower(payload);
            if (power) {
                return { operation: { airConOperationMode: power } };
            }
            return null;
        }
        const body = {};
        if (payload.power !== undefined) {
            body.operation = { airConOperationMode: acPower(payload.power) };
        }
        if (payload.mode) {
            body.airConJobMode = { currentJobMode: acMode(payload.mode) };
        }
        if (payload.temperature !== undefined || payload.targetTemperature !== undefined) {
            body.temperature = {
                targetTemperatureC: payload.temperature ?? payload.targetTemperature
            };
        }
        if (payload.fan) {
            body.airFlow = { windStrength: String(payload.fan).toUpperCase() };
        }
        return Object.keys(body).length ? body : payload;
    }

    if (typeof payload === "object" && payload !== null) {
        return payload;
    }
    return null;
}

module.exports = {
    isQuery,
    toControl,
    washerMode,
    acPower,
    acMode
};
