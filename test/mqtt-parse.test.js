"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseMqtt, completeEventName } = require("../lib/mqtt-parse");

test("device status report", () => {
    const parsed = parseMqtt("t", Buffer.from(JSON.stringify({
        deviceId: "abc",
        pushType: "DEVICE_STATUS",
        report: { runState: { currentState: "RUNNING" } }
    })));
    assert.equal(parsed.deviceId, "abc");
    assert.equal(parsed.notification, false);
    assert.equal(parsed.state.runState.currentState, "RUNNING");
});

test("washing complete push", () => {
    const parsed = parseMqtt("t", JSON.stringify({
        deviceId: "abc",
        pushType: "DEVICE_PUSH",
        eventType: "washing_is_complete"
    }));
    assert.equal(parsed.notification, true);
    assert.equal(parsed.event, "washing_is_complete");
});

test("complete event name by type", () => {
    assert.equal(completeEventName("DEVICE_WASHER"), "washing_is_complete");
    assert.equal(completeEventName("DEVICE_DRYER"), "drying_is_complete");
    assert.equal(completeEventName("DEVICE_DISH_WASHER"), "cleaning_is_complete");
});
