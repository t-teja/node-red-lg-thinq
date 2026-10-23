"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isQuery, toControl } = require("../lib/commands");

test("status is a query", () => {
    assert.equal(isQuery("status"), true);
    assert.equal(isQuery(true, "status"), true);
    assert.equal(isQuery("start"), false);
});

test("washer shortcuts", () => {
    assert.deepEqual(toControl("DEVICE_WASHER", "start"), {
        operation: { washerOperationMode: "START" }
    });
    assert.deepEqual(toControl("DEVICE_WASHER", "off"), {
        operation: { washerOperationMode: "POWER_OFF" }
    });
});

test("ac shortcuts", () => {
    assert.deepEqual(toControl("DEVICE_AIR_CONDITIONER", true), {
        operation: { airConOperationMode: "POWER_ON" }
    });
    assert.deepEqual(toControl("DEVICE_AIR_CONDITIONER", 24), {
        temperature: { targetTemperatureC: 24 }
    });
    assert.deepEqual(toControl("DEVICE_AIR_CONDITIONER", "cool"), {
        airConJobMode: { currentJobMode: "COOL" }
    });
    assert.deepEqual(toControl("DEVICE_AIR_CONDITIONER", { power: true, temperature: 22, fan: "high" }), {
        operation: { airConOperationMode: "POWER_ON" },
        temperature: { targetTemperatureC: 22 },
        airFlow: { windStrength: "HIGH" }
    });
});

test("raw pass through", () => {
    const raw = { foo: { bar: 1 } };
    assert.deepEqual(toControl("DEVICE_OVEN", { raw }), raw);
});
