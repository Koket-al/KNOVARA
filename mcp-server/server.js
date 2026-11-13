import readline from "node:readline";
import { getLocalCredential, saveLocalCredential } from "./credentialStore.js";

const getBackendUrl = () => process.env.KNOVARA_BACKEND_URL || "http://localhost:5000";

const TOOLS_MANIFEST = [
  {
    name: "knovara_search_assets",
    description: "Search the KNOVARA decentralized catalog for proprietary knowledge assets, research discoveries, and computational APIs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms (e.g. 'alloys', 'drone bracket', 'battery electrolyte')" },
        category: { type: "string", description: "Optional category filter" },
        max_price_near: { type: "number", description: "Maximum monthly price in NEAR" },
      },
    },
  },
  {
    name: "knovara_get_asset_details",
    description: "Retrieve comprehensive metadata, token provenance, terms, and active API products for a specific discovery.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The discovery ID (e.g., 'disc-mat-001')" },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "knovara_get_api_spec",
    description: "Retrieve the OpenAPI 3.0/3.1 specification and available operations for an asset's API product.",
    inputSchema: {
      type: "object",
      properties: {
        api_product_id: { type: "string", description: "The API product ID" },
      },
      required: ["api_product_id"],
    },
  },
  {
    name: "knovara_prepare_subscription",
    description: "Prepare an unsigned on-chain purchase intent for a 30-day API subscription for human owner approval.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Registered agent ID" },
        discovery_id: { type: "string", description: "Target discovery ID" },
        api_product_id: { type: "string", description: "Optional specific API product ID" },
      },
      required: ["agent_id", "discovery_id"],
    },
  },
  {
    name: "knovara_check_subscription",
    description: "Check the authoritative status and expiration of an active API subscription.",
    inputSchema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "The subscription record ID" },
      },
      required: ["subscription_id"],
    },
  },
  {
    name: "knovara_call_asset_api",
    description: "Invoke a proprietary operation on a subscribed asset via the KNOVARA API Gateway. The local MCP adapter securely injects the bearer credential.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The target discovery asset ID" },
        operation_id: { type: "string", description: "The allowed operation ID from the API specification" },
        parameters: { type: "object", description: "Request body parameters according to the API specification" },
      },
      required: ["asset_id", "operation_id", "parameters"],
    },
  },
];

export async function executeTool(name, args, fetchImpl = globalThis.fetch) {
  const backendUrl = getBackendUrl();
  switch (name) {
    case "knovara_search_assets": {
      const res = await fetchImpl(`${backendUrl}/api/v1/agent/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args || {}),
      });
      const data = await res.json();
      return data;
    }

    case "knovara_get_asset_details": {
      const { asset_id } = args;
      const res = await fetchImpl(`${backendUrl}/api/v1/discoveries/${asset_id}`);
      return await res.json();
    }

    case "knovara_get_api_spec": {
      const { api_product_id } = args;
      const res = await fetchImpl(`${backendUrl}/api/v1/api-products/${api_product_id}`);
      return await res.json();
    }

    case "knovara_prepare_subscription": {
      const res = await fetchImpl(`${backendUrl}/api/v1/agent/prepare-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return await res.json();
    }

    case "knovara_check_subscription": {
      const { subscription_id } = args;
      const res = await fetchImpl(`${backendUrl}/api/v1/subscriptions/${subscription_id}`);
      return await res.json();
    }

    case "knovara_call_asset_api": {
      const { asset_id, operation_id, parameters } = args;
      const token = getLocalCredential(asset_id);

      if (!token) {
        throw new Error(
          `ERR_NO_LOCAL_CREDENTIAL: No active API credential found locally for asset '${asset_id}'. Has the human owner approved the subscription and delivered the token?`
        );
      }

      const res = await fetchImpl(
        `${backendUrl}/api/v1/gateway/assets/${asset_id}/operations/${operation_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(parameters || {}),
        }
      );

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || `Gateway returned status ${res.status}`);
      }
      return resData;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Runs the MCP stdio JSON-RPC loop.
 */
export function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    let req;
    try {
      req = JSON.parse(line);
    } catch (_e) {
      return;
    }

    const { id, method, params } = req;

    if (method === "tools/list") {
      const response = {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS_MANIFEST },
      };
      process.stdout.write(JSON.stringify(response) + "\n");
      return;
    }

    if (method === "tools/call") {
      try {
        const result = await executeTool(params.name, params.arguments);
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
      } catch (err) {
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: `Error: ${err.message}` }],
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    }
  });
}

// Auto-start if executed directly as a process
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startMcpServer();
}
