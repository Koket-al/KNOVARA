import express from "express";
import crypto from "crypto";
import { ApiProduct } from "../models/ApiProduct.js";
import { ProviderConfig } from "../models/ProviderConfig.js";
import { encryptSecret } from "../services/encryption.js";
import { prepareSubscriptionOfferIntent } from "../services/transactionIntent.js";

const router = express.Router();

/**
 * Validates OpenAPI 3.0/3.1 document structure and extracts endpoints.
 */
function validateOpenApiSpec(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("ERR_INVALID_SPEC: Spec must be a valid JSON object");
  }

  if (!spec.openapi || !spec.openapi.startsWith("3.")) {
    throw new Error("ERR_UNSUPPORTED_OPENAPI_VERSION: OpenAPI version must be 3.0.x or 3.1.x");
  }

  if (!spec.info || !spec.info.title) {
    throw new Error("ERR_MISSING_INFO: Spec must include 'info.title'");
  }

  if (!spec.paths || typeof spec.paths !== "object") {
    throw new Error("ERR_MISSING_PATHS: Spec must include 'paths'");
  }

  const endpoints = [];
  for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
    if (typeof pathItem !== "object") continue;
    for (const [method, op] of Object.entries(pathItem)) {
      const httpMethod = method.toUpperCase();
      if (["GET", "POST", "PUT", "DELETE", "PATCH"].includes(httpMethod)) {
        const operationId = op.operationId || `${method}_${pathKey.replace(/[^a-zA-Z0-9]/g, "_")}`;
        endpoints.push({
          path: pathKey,
          method: httpMethod,
          operation_id: operationId,
          summary: op.summary || "",
          description: op.description || "",
        });
      }
    }
  }

  if (endpoints.length === 0) {
    throw new Error("ERR_NO_VALID_OPERATIONS: OpenAPI specification contains no valid operations");
  }

  const canonicalJson = JSON.stringify(spec);
  const specHash = crypto.createHash("sha256").update(canonicalJson).digest("hex");

  return { endpoints, specHash };
}

/**
 * POST /api/v1/api-products
 * Registers a new API product with OpenAPI 3.0/3.1 specification.
 */
router.post("/", async (req, res) => {
  try {
    const {
      discovery_id,
      token_id,
      title,
      description,
      version = "1.0.0",
      openapi_spec,
      monthly_price_near,
    } = req.body;

    if (!discovery_id || !token_id || !title || !openapi_spec || monthly_price_near === undefined) {
      return res.status(400).json({
        error: "ERR_MISSING_REQUIRED_FIELDS: discovery_id, token_id, title, openapi_spec, and monthly_price_near are required",
      });
    }

    const { endpoints, specHash } = validateOpenApiSpec(openapi_spec);

    const priceNearNum = Number(monthly_price_near);
    if (isNaN(priceNearNum) || priceNearNum <= 0) {
      return res.status(400).json({
        error: "ERR_INVALID_PRICE: monthly_price_near must be a positive number",
      });
    }

    // Convert NEAR to exact yoctoNEAR string (1 NEAR = 10^24 yoctoNEAR)
    const priceYocto = BigInt(Math.round(priceNearNum * 1e6)) * 10n ** 18n;

    const apiProductId = `api-prod-${crypto.randomUUID()}`;

    const product = await ApiProduct.create({
      api_product_id: apiProductId,
      discovery_id,
      token_id,
      version,
      title,
      description,
      openapi_spec,
      canonical_spec_hash: specHash,
      endpoints,
      monthly_price_near: priceNearNum,
      monthly_price_yocto: priceYocto.toString(),
      duration_days: 30,
      status: "draft",
    });

    res.status(201).json({
      success: true,
      product: {
        api_product_id: product.api_product_id,
        discovery_id: product.discovery_id,
        token_id: product.token_id,
        title: product.title,
        version: product.version,
        canonical_spec_hash: product.canonical_spec_hash,
        endpoints_count: product.endpoints.length,
        endpoints: product.endpoints,
        monthly_price_near: product.monthly_price_near,
        monthly_price_yocto: product.monthly_price_yocto,
        status: product.status,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/v1/api-products
 * Lists published API products or products for a discovery.
 */
router.get("/", async (req, res) => {
  try {
    const { discovery_id } = req.query;
    const query = {};
    if (discovery_id) {
      query.discovery_id = discovery_id;
    }
    const products = await ApiProduct.find(query).sort({ created_at: -1 }).lean();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/api-products/:apiProductId
 * Retrieves API product details and public OpenAPI specification.
 */
router.get("/:apiProductId", async (req, res) => {
  try {
    const product = await ApiProduct.findOne({ api_product_id: req.params.apiProductId }).lean();
    if (!product) {
      return res.status(404).json({ error: "ERR_PRODUCT_NOT_FOUND" });
    }
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/api-products/:apiProductId/provider-config
 * Sets or updates provider upstream base URL and encrypted secret.
 */
router.post("/:apiProductId/provider-config", async (req, res) => {
  try {
    const { apiProductId } = req.params;
    const {
      base_url,
      auth_type = "api_key",
      secret_token,
      header_name = "x-provider-api-key",
      allowed_paths = [],
      timeout_ms = 30000,
    } = req.body;

    if (!base_url || !secret_token) {
      return res.status(400).json({
        error: "ERR_MISSING_FIELDS: base_url and secret_token are required",
      });
    }

    const product = await ApiProduct.findOne({ api_product_id: apiProductId });
    if (!product) {
      return res.status(404).json({ error: "ERR_PRODUCT_NOT_FOUND" });
    }

    const { encrypted_secret, iv, auth_tag } = encryptSecret(secret_token);

    const config = await ProviderConfig.findOneAndUpdate(
      { api_product_id: apiProductId },
      {
        api_product_id: apiProductId,
        base_url,
        auth_type,
        encrypted_secret,
        iv,
        auth_tag,
        header_name,
        allowed_paths,
        timeout_ms,
        status: "active",
        updated_at: new Date(),
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      provider_config: {
        api_product_id: config.api_product_id,
        base_url: config.base_url,
        auth_type: config.auth_type,
        header_name: config.header_name,
        timeout_ms: config.timeout_ms,
        status: config.status,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/v1/api-products/:apiProductId/prepare-offer-intent
 * Prepares on-chain intent to publish the API subscription offer.
 */
router.post("/:apiProductId/prepare-offer-intent", async (req, res) => {
  try {
    const { apiProductId } = req.params;
    const { terms_hash } = req.body;

    const product = await ApiProduct.findOne({ api_product_id: apiProductId });
    if (!product) {
      return res.status(404).json({ error: "ERR_PRODUCT_NOT_FOUND" });
    }

    const offerId = `offer-${crypto.randomUUID().slice(0, 8)}`;
    const termsHashHex = terms_hash || product.canonical_spec_hash;

    const intent = prepareSubscriptionOfferIntent({
      offerId,
      discoveryId: product.discovery_id,
      apiProductId: product.api_product_id,
      openapiSpecHash: product.canonical_spec_hash,
      termsHash: termsHashHex,
      priceYocto: product.monthly_price_yocto,
    });

    product.offer_id = offerId;
    product.status = "published";
    await product.save();

    res.json({
      success: true,
      offer_id: offerId,
      intent,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
