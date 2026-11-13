import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "./server.js";
import { saveLocalCredential, getLocalCredential } from "./credentialStore.js";

test("MCP Server & Adapter Security Invariants", async (t) => {
  await t.test("knovara_call_asset_api fails securely if credential missing", async () => {
    await assert.rejects(
      async () => {
        await executeTool("knovara_call_asset_api", {
          asset_id: "disc-unauthorized-999",
          operation_id: "get_material_recommendations",
          parameters: {},
        });
      },
      /ERR_NO_LOCAL_CREDENTIAL/
    );
  });

  await t.test("Credential store isolates token out of LLM arguments", async () => {
    const mockToken = "knov_live_abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    saveLocalCredential("disc-mat-demo", mockToken);

    assert.equal(getLocalCredential("disc-mat-demo"), mockToken);

    let capturedHeaders = {};
    const mockFetch = async (url, options) => {
      capturedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "success", mockResult: true }),
      };
    };

    const result = await executeTool(
      "knovara_call_asset_api",
      {
        asset_id: "disc-mat-demo",
        operation_id: "get_material_recommendations",
        parameters: { application: "drone bracket" },
      },
      mockFetch
    );

    assert.equal(capturedHeaders.Authorization, `Bearer ${mockToken}`);
    assert.equal(result.status, "success");
  });
});

