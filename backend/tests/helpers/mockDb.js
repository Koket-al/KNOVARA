import mongoose from "mongoose";
import { User } from "../../src/models/User.js";
import { AuthChallenge } from "../../src/models/AuthChallenge.js";
import { EvidenceUpload } from "../../src/models/EvidenceUpload.js";
import { EvidenceManifest } from "../../src/models/EvidenceManifest.js";
import { PublicMetadataDescriptor } from "../../src/models/PublicMetadataDescriptor.js";

class InMemoryCollection {
  constructor(name) {
    this.name = name;
    this.docs = new Map();
  }

  clear() {
    this.docs.clear();
  }

  insert(doc) {
    const key =
      doc.upload_id ||
      doc.manifest_id ||
      (doc.discovery_id ? `${doc.discovery_id}_${doc.version || "1.0.0"}` : null) ||
      doc.nonce ||
      doc.account_id ||
      String(Math.random());
    this.docs.set(key, { ...doc });
    return this.docs.get(key);
  }

  find(query = {}) {
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
  }

  findOne(query = {}) {
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
      }
      return { ...existingDoc };
    }

    if (options.upsert) {
      const newDoc = {};
      if (filter.account_id) newDoc.account_id = filter.account_id;
      if (filter.nonce) newDoc.nonce = filter.nonce;
      if (filter.upload_id) newDoc.upload_id = filter.upload_id;
      if (filter.discovery_id) newDoc.discovery_id = filter.discovery_id;
      if (filter.version) newDoc.version = filter.version;
      if (update.$setOnInsert) Object.assign(newDoc, update.$setOnInsert);
      if (update.$set) Object.assign(newDoc, update.$set);
      const key =
        newDoc.upload_id ||
        newDoc.manifest_id ||
        (newDoc.discovery_id ? `${newDoc.discovery_id}_${newDoc.version || "1.0.0"}` : null) ||
        newDoc.nonce ||
        newDoc.account_id ||
        String(Math.random());
      this.docs.set(key, newDoc);
      return { ...newDoc };
    }

    return null;
  }

  _matches(doc, query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && typeof v === "object") {
        if ("$in" in v && Array.isArray(v.$in)) {
          if (!v.$in.includes(doc[k])) return false;
          continue;
        }
        if ("$gt" in v) {
          const docVal = doc[k] instanceof Date ? doc[k].getTime() : new Date(doc[k]).getTime();
          const queryVal = v.$gt instanceof Date ? v.$gt.getTime() : new Date(v.$gt).getTime();
          if (!(docVal > queryVal)) return false;
          continue;
        }
      }
      if (doc[k] !== v) return false;
    }
    return true;
  }
}

export const challengeStore = new InMemoryCollection("auth_challenges");
export const userStore = new InMemoryCollection("users");
export const evidenceUploadStore = new InMemoryCollection("evidence_uploads");
export const evidenceManifestStore = new InMemoryCollection("evidence_manifests");
export const publicDescriptorStore = new InMemoryCollection("public_descriptors");

let isMockInstalled = false;

/**
 * Installs in-memory model intercepts for isolated fast testing.
 */
export function setupMockDatabase() {
  process.env.NODE_ENV = "test";
  if (isMockInstalled) return;

  // Intercept AuthChallenge save
  const originalChallengeSave = AuthChallenge.prototype.save;
  AuthChallenge.prototype.save = async function () {
    const data = this.toObject();
    challengeStore.insert(data);
    return this;
  };

  // Intercept AuthChallenge findOneAndDelete
  AuthChallenge.findOneAndDelete = async function (query) {
    return challengeStore.findOneAndDelete(query);
  };

  // Intercept AuthChallenge findOne
  AuthChallenge.findOne = async function (query) {
    return challengeStore.findOne(query);
  };

  // Intercept AuthChallenge deleteMany
  AuthChallenge.deleteMany = async function () {
    challengeStore.clear();
    return { acknowledged: true, deletedCount: 0 };
  };

  // Intercept User findOneAndUpdate
  User.findOneAndUpdate = async function (filter, update, options) {
    return userStore.findOneAndUpdate(filter, update, options);
  };

  // Intercept User findOne
  User.findOne = async function (query) {
    return userStore.findOne(query);
  };

  // Intercept User deleteMany
  User.deleteMany = async function () {
    userStore.clear();
    return { acknowledged: true, deletedCount: 0 };
  };

  // Intercept EvidenceUpload
  EvidenceUpload.prototype.save = async function () {
    const data = this.toObject();
    evidenceUploadStore.insert(data);
    return this;
  };
  EvidenceUpload.findOne = async function (query) {
    return evidenceUploadStore.findOne(query);
  };
  EvidenceUpload.find = async function (query) {
    return evidenceUploadStore.find(query);
  };
  EvidenceUpload.findOneAndUpdate = async function (filter, update, options) {
    return evidenceUploadStore.findOneAndUpdate(filter, update, options);
  };
  EvidenceUpload.updateMany = async function (filter, update) {
    return evidenceUploadStore.updateMany(filter, update);
  };
  EvidenceUpload.deleteMany = async function () {
    evidenceUploadStore.clear();
    return { acknowledged: true, deletedCount: 0 };
  };

  // Intercept EvidenceManifest
  EvidenceManifest.prototype.save = async function () {
    const data = this.toObject();
    evidenceManifestStore.insert(data);
    return this;
  };
  EvidenceManifest.findOne = async function (query) {
    return evidenceManifestStore.findOne(query);
  };
  EvidenceManifest.findOneAndUpdate = async function (filter, update, options) {
    return evidenceManifestStore.findOneAndUpdate(filter, update, options);
  };
  EvidenceManifest.deleteMany = async function () {
    evidenceManifestStore.clear();
    return { acknowledged: true, deletedCount: 0 };
  };

  // Intercept PublicMetadataDescriptor
  PublicMetadataDescriptor.prototype.save = async function () {
    const data = this.toObject();
    publicDescriptorStore.insert(data);
    return this;
  };
  PublicMetadataDescriptor.findOne = async function (query) {
    return publicDescriptorStore.findOne(query);
  };
  PublicMetadataDescriptor.findOneAndUpdate = async function (filter, update, options) {
    return publicDescriptorStore.findOneAndUpdate(filter, update, options);
  };
  PublicMetadataDescriptor.deleteMany = async function () {
    publicDescriptorStore.clear();
    return { acknowledged: true, deletedCount: 0 };
  };

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
}
