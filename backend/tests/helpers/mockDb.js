import mongoose from "mongoose";
import { User } from "../../src/models/User.js";
import { AuthChallenge } from "../../src/models/AuthChallenge.js";
import { EvidenceUpload } from "../../src/models/EvidenceUpload.js";
import { EvidenceManifest } from "../../src/models/EvidenceManifest.js";
import { PublicMetadataDescriptor } from "../../src/models/PublicMetadataDescriptor.js";
import { DiscoveryProjection } from "../../src/models/DiscoveryProjection.js";
import { LicenseOfferProjection } from "../../src/models/LicenseOfferProjection.js";
import { LicenseRequestProjection } from "../../src/models/LicenseRequestProjection.js";
import { ChainTransaction } from "../../src/models/ChainTransaction.js";
import { AccountRoyaltyProjection } from "../../src/models/AccountRoyaltyProjection.js";
import { ApiProduct } from "../../src/models/ApiProduct.js";
import { ProviderConfig } from "../../src/models/ProviderConfig.js";
import { ApiCredential } from "../../src/models/ApiCredential.js";
import { AgentProfile } from "../../src/models/AgentProfile.js";
import { SubscriptionProjection } from "../../src/models/SubscriptionProjection.js";
import { PurchaseIntent } from "../../src/models/PurchaseIntent.js";

function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  if (path in obj) return obj[path];
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

class MockQuery {
  constructor(executor) {
    this._executor = executor;
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._select = null;
  }

  sort(sortObj) {
    this._sort = sortObj;
    return this;
  }

  skip(n) {
    this._skip = n;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  select(fields) {
    this._select = fields;
    return this;
  }

  lean() {
    return this;
  }

  async exec() {
    let results = await this._executor();
    if (!Array.isArray(results)) {
      return results;
    }
    if (this._sort) {
      const [field, direction] = Object.entries(this._sort)[0];
      results.sort((a, b) => {
        const valA = getNestedValue(a, field);
        const valB = getNestedValue(b, field);
        if (valA === valB) return 0;
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        if (valA > valB) return direction === -1 ? -1 : 1;
        return direction === -1 ? 1 : -1;
      });
    }
    if (this._skip > 0) {
      results = results.slice(this._skip);
    }
    if (this._limit !== null && this._limit !== undefined) {
      results = results.slice(0, this._limit);
    }
    return results;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }
}

class InMemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
  }

  clear() {
    this.docs.clear();
  }

  _getKey(doc) {
    return (
      doc.credential_id ||
      doc.token_hash ||
      doc.api_product_id ||
      doc.subscription_id ||
      doc.agent_id ||
      doc.intent_id ||
      doc.request_id ||
      doc.transaction_hash ||
      doc.upload_id ||
      doc.manifest_id ||
      (doc.discovery_id ? `${doc.discovery_id}_${doc.version || "1.0.0"}` : null) ||
      doc.offer_id ||
      doc.nonce ||
      doc.account_id ||
      doc._id ||
      String(Math.random())
    );
  }

  insert(doc) {
    const key = this._getKey(doc);
    const item = { ...doc };
    this.docs.set(key, item);
    return item;
  }

  find(query = {}) {
    const executor = async () => {
      const results = [];
      for (const [key, doc] of this.docs.entries()) {
        if (this._matches(doc, query)) {
          const item = { ...doc };
          item.save = async () => {
            this.docs.set(key, { ...item });
            return item;
          };
          results.push(item);
        }
      }
      return results;
    };
    return new MockQuery(executor);
  }

  findOne(query = {}) {
    const executor = async () => {
      for (const [key, doc] of this.docs.entries()) {
        if (this._matches(doc, query)) {
          const item = { ...doc };
          item.save = async () => {
            this.docs.set(key, { ...item });
            return item;
          };
          return item;
        }
      }
      return null;
    };
    return new MockQuery(executor);
  }

  countDocuments(query = {}) {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (this._matches(doc, query)) {
        count++;
      }
    }
    return Promise.resolve(count);
  }

  findOneAndDelete(query = {}) {
    for (const [key, doc] of this.docs.entries()) {
      if (this._matches(doc, query)) {
        this.docs.delete(key);
        return { ...doc };
      }
    }
    return null;
  }

  updateMany(filter = {}, update = {}) {
    let count = 0;
    for (const [key, doc] of this.docs.entries()) {
      if (this._matches(doc, filter)) {
        if (update.$set) {
          Object.assign(doc, update.$set);
          this.docs.set(key, { ...doc });
        }
        count++;
      }
    }
    return { acknowledged: true, modifiedCount: count, matchedCount: count };
  }

  findOneAndUpdate(filter = {}, update = {}, options = {}) {
    let existingKey = null;
    let existingDoc = null;

    for (const [key, doc] of this.docs.entries()) {
      if (this._matches(doc, filter)) {
        existingKey = key;
        existingDoc = doc;
        break;
      }
    }

    if (existingDoc) {
      if (update.$set) {
        Object.assign(existingDoc, update.$set);
      } else if (!update.$inc) {
        Object.assign(existingDoc, update);
      }
      if (update.$inc) {
        for (const [k, incVal] of Object.entries(update.$inc)) {
          existingDoc[k] = (existingDoc[k] || 0) + incVal;
        }
      }
      this.docs.set(existingKey, { ...existingDoc });
      return Promise.resolve({ ...existingDoc });
    }

    if (options.upsert) {
      const newDoc = { ...filter };
      if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
      if (update.$set) {
        Object.assign(newDoc, update.$set);
      } else {
        Object.assign(newDoc, update);
      }
      const key = this._getKey(newDoc);
      this.docs.set(key, newDoc);
      return Promise.resolve({ ...newDoc });
    }

    return Promise.resolve(null);
  }

  _matches(doc, query) {
    if (!query || Object.keys(query).length === 0) return true;
    for (const [k, v] of Object.entries(query)) {
      if (k === "$or") {
        if (!Array.isArray(v) || v.length === 0) return false;
        const anyMatch = v.some((subQuery) => this._matches(doc, subQuery));
        if (!anyMatch) return false;
        continue;
      }

      const docVal = getNestedValue(doc, k);

      if (v !== null && typeof v === "object") {
        if (v instanceof RegExp) {
          if (typeof docVal !== "string" || !v.test(docVal)) return false;
          continue;
        }
        if ("$regex" in v) {
          const re = new RegExp(v.$regex, v.$options || "");
          if (typeof docVal !== "string" || !re.test(docVal)) return false;
          continue;
        }
        if ("$in" in v && Array.isArray(v.$in)) {
          if (!v.$in.includes(docVal)) return false;
          continue;
        }
        if ("$gt" in v) {
          const d = docVal instanceof Date ? docVal.getTime() : new Date(docVal).getTime();
          const q = v.$gt instanceof Date ? v.$gt.getTime() : new Date(v.$gt).getTime();
          if (!(d > q)) return false;
          continue;
        }
        if ("$gte" in v) {
          if (!(docVal >= v.$gte)) return false;
          continue;
        }
        if ("$lt" in v) {
          if (!(docVal < v.$lt)) return false;
          continue;
        }
        if ("$lte" in v) {
          if (!(docVal <= v.$lte)) return false;
          continue;
        }
        if ("$ne" in v) {
          if (docVal === v.$ne) return false;
          continue;
        }
      }
      if (docVal !== v) return false;
    }
    return true;
  }
}

export const challengeStore = new InMemoryCollection("auth_challenges");
export const userStore = new InMemoryCollection("users");
export const evidenceUploadStore = new InMemoryCollection("evidence_uploads");
export const evidenceManifestStore = new InMemoryCollection("evidence_manifests");
export const publicDescriptorStore = new InMemoryCollection("public_descriptors");
export const discoveryProjectionStore = new InMemoryCollection("discovery_projections");
export const licenseOfferProjectionStore = new InMemoryCollection("license_offer_projections");
export const licenseRequestProjectionStore = new InMemoryCollection("license_request_projections");
export const chainTransactionStore = new InMemoryCollection("chain_transactions");
export const accountRoyaltyProjectionStore = new InMemoryCollection("account_royalty_projections");
export const apiProductStore = new InMemoryCollection("api_products");
export const providerConfigStore = new InMemoryCollection("provider_configs");
export const apiCredentialStore = new InMemoryCollection("api_credentials");
export const agentProfileStore = new InMemoryCollection("agent_profiles");
export const subscriptionProjectionStore = new InMemoryCollection("subscription_projections");
export const purchaseIntentStore = new InMemoryCollection("purchase_intents");

let isMockInstalled = false;

function bindModelMethods(ModelClass, store) {
  ModelClass.prototype.save = async function () {
    const data = this.toObject ? this.toObject() : { ...this };
    store.insert(data);
    return this;
  };
  ModelClass.create = async function (data) {
    return store.insert(data);
  };
  ModelClass.findOne = function (query) {
    return store.findOne(query);
  };
  ModelClass.find = function (query) {
    return store.find(query);
  };
  ModelClass.countDocuments = function (query) {
    return store.countDocuments(query);
  };
  ModelClass.findOneAndUpdate = function (filter, update, options) {
    return store.findOneAndUpdate(filter, update, options);
  };
  ModelClass.updateMany = function (filter, update) {
    return store.updateMany(filter, update);
  };
  ModelClass.findOneAndDelete = function (query) {
    return store.findOneAndDelete(query);
  };
  ModelClass.deleteMany = async function () {
    store.clear();
    return { acknowledged: true, deletedCount: 0 };
  };
}

/**
 * Installs in-memory model intercepts for isolated fast testing.
 */
export function setupMockDatabase() {
  process.env.NODE_ENV = "test";
  if (isMockInstalled) return;

  // Intercept AuthChallenge
  bindModelMethods(AuthChallenge, challengeStore);

  // Intercept User
  bindModelMethods(User, userStore);

  // Intercept EvidenceUpload
  bindModelMethods(EvidenceUpload, evidenceUploadStore);

  // Intercept EvidenceManifest
  bindModelMethods(EvidenceManifest, evidenceManifestStore);

  // Intercept PublicMetadataDescriptor
  bindModelMethods(PublicMetadataDescriptor, publicDescriptorStore);

  // Intercept DiscoveryProjection
  bindModelMethods(DiscoveryProjection, discoveryProjectionStore);

  // Intercept LicenseOfferProjection
  bindModelMethods(LicenseOfferProjection, licenseOfferProjectionStore);

  // Intercept LicenseRequestProjection
  bindModelMethods(LicenseRequestProjection, licenseRequestProjectionStore);

  // Intercept ChainTransaction
  bindModelMethods(ChainTransaction, chainTransactionStore);

  // Intercept AccountRoyaltyProjection
  bindModelMethods(AccountRoyaltyProjection, accountRoyaltyProjectionStore);

  // Intercept ApiProduct
  bindModelMethods(ApiProduct, apiProductStore);

  // Intercept ProviderConfig
  bindModelMethods(ProviderConfig, providerConfigStore);

  // Intercept ApiCredential
  bindModelMethods(ApiCredential, apiCredentialStore);

  // Intercept AgentProfile
  bindModelMethods(AgentProfile, agentProfileStore);

  // Intercept SubscriptionProjection
  bindModelMethods(SubscriptionProjection, subscriptionProjectionStore);

  // Intercept PurchaseIntent
  bindModelMethods(PurchaseIntent, purchaseIntentStore);

  // Mock readyState property on connection
  Object.defineProperty(mongoose.connection, "readyState", {
    get: () => 1,
    configurable: true,
  });

  isMockInstalled = true;
}

/**
 * Resets all in-memory mock data between tests.
 */
export function clearMockDatabase() {
  challengeStore.clear();
  userStore.clear();
  evidenceUploadStore.clear();
  evidenceManifestStore.clear();
  publicDescriptorStore.clear();
  discoveryProjectionStore.clear();
  licenseOfferProjectionStore.clear();
  licenseRequestProjectionStore.clear();
  chainTransactionStore.clear();
  accountRoyaltyProjectionStore.clear();
  apiProductStore.clear();
  providerConfigStore.clear();
  apiCredentialStore.clear();
  agentProfileStore.clear();
  subscriptionProjectionStore.clear();
  purchaseIntentStore.clear();
}
