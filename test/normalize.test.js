"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
    normalize,
    dashboardValue,
    isCompleteTransition,
    topicFor
} = require("../lib/normalize");

test("washer running with remain time", () => {
    const state = normalize({
        info: { name: "Washer", type: "DEVICE_WASHER", model: "F14" },
        raw: {
            runState: { currentState: "RUNNING" },
            timer: { remainHour: 1, remainMinute: 5 },
            remoteControlEnable: { remoteControlEnabled: true }
        }
    });
    assert.equal(state.running, true);
    assert.equal(state.complete, false);
    assert.equal(state.remainMinutes, 65);
    assert.equal(state.remoteStart, true);
});

test("washer nested main location", () => {
    const state = normalize({
        info: { name: "Washer", type: "DEVICE_WASHER" },
        raw: { main: { runState: { currentState: "END" }, timer: { remainHour: 0, remainMinute: 0 } } }
    });
    assert.equal(state.running, false);
    assert.equal(state.complete, true);
    assert.equal(state.state, "END");
});

test("complete transition", () => {
    const running = { running: true, state: "RUNNING" };
    const done = { running: false, complete: true, state: "END" };
    assert.equal(isCompleteTransition(running, done), true);
    assert.equal(isCompleteTransition(done, done), false);
});

test("ac normalize", () => {
    const state = normalize({
        info: { name: "Hall AC", type: "DEVICE_AIR_CONDITIONER" },
        raw: {
            operation: { airConOperationMode: "POWER_ON" },
            airConJobMode: { currentJobMode: "COOL" },
            temperature: { currentTemperatureC: 27, targetTemperatureC: 24 },
            airFlow: { windStrength: "MID" }
        }
    });
    assert.equal(state.power, true);
    assert.equal(state.mode, "COOL");
    assert.equal(state.currentTemperature, 27);
    assert.equal(state.targetTemperature, 24);
});

test("fridge door", () => {
    const state = normalize({
        info: { name: "Fridge", type: "DEVICE_REFRIGERATOR" },
        raw: { doorStatus: { doorState: "OPEN" }, temperature: { fridgeTargetTemperatureC: 3 } }
    });
    assert.equal(state.doorOpen, true);
    assert.equal(state.fridgeTemp, 3);
});

test("dashboard field and topic", () => {
    const state = { remainMinutes: 12, running: true };
    assert.equal(dashboardValue(state, "remainMinutes"), 12);
    assert.deepEqual(dashboardValue(state, ""), state);
    assert.equal(topicFor({ name: "Kitchen Washer" }), "home/lg/kitchen-washer");
});
