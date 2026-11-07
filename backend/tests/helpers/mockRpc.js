/**
 * Helper generating mocked fetch responses for NEAR RPC view_access_key queries.
 */
export function createMockNearRpc({
  permission = "FullAccess",
  errorCode = null,
  httpStatus = 200,
  networkError = false,
} = {}) {
  return async (url, options) => {
    if (networkError) {
      throw new Error("Failed to connect to NEAR RPC endpoint: ECONNREFUSED");
    }

    if (httpStatus !== 200) {
      return {
        ok: false,
        status: httpStatus,
        json: async () => ({ error: "Internal Server Error" }),
      };
    }

    if (errorCode) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: "knovara-access-key-query",
          error: {
            name: "HANDLER_ERROR",
            cause: { name: errorCode },
            message: `Key error: ${errorCode}`,
          },
        }),
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: "2.0",
        id: "knovara-access-key-query",
        result: {
          nonce: 100,
          permission:
            permission === "FullAccess"
              ? "FullAccess"
              : {
                  FunctionCall: {
                    allowance: "100000000000000000000000",
                    receiver_id: "some_contract.testnet",
                    method_names: ["some_method"],
                  },
                },
          block_height: 12345678,
          block_hash: "9Yw8c9k1n5q2m3...",
        },
      }),
    };
  };
}

