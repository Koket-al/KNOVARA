import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoServer } from "./server.js";

test("Demo Provider: Health check, OpenAPI, Auth & Filtering", async (t) => {
  const server = createDemoServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => server.close());

  await t.test("GET /health returns healthy status", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "healthy");
    assert.equal(data.provider, "Advanced Materials Research");
  });

  await t.test("GET /v1/openapi.json returns valid 3.1.0 specification", async () => {
    const res = await fetch(`${baseUrl}/v1/openapi.json`);
    assert.equal(res.status, 200);
    const spec = await res.json();
    assert.equal(spec.openapi, "3.1.0");
    assert.ok(spec.paths["/v1/materials/recommendations"]);
  });

  await t.test("POST /v1/materials/recommendations without key returns 401", async () => {
    const res = await fetch(`${baseUrl}/v1/materials/recommendations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application: "drone bracket" }),
    });
    assert.equal(res.status, 401);
  });

  await t.test("POST /v1/materials/recommendations with valid key filters correctly", async () => {
    const res = await fetch(`${baseUrl}/v1/materials/recommendations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-provider-api-key": "demo_adv_materials_secret_2026",
      },
      body: JSON.stringify({
        application: "drone bracket",
        maximumDensity: 3.0,
        minimumTensileStrengthMpa: 400,
        corrosionResistance: "moderate",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.recommendations.length >= 2);
    // Density must be <= 3.0 and tensileStrength >= 400
    for (const rec of data.recommendations) {
      assert.ok(rec.densityGcm3 <= 3.0);
      assert.ok(rec.tensileStrengthMpa >= 400);
      assert.ok(rec.standardReference);
      assert.ok(rec.suitabilityScore > 0);
    }
    assert.ok(data.disclaimer.includes("MMPDS-01"));
  });
});
