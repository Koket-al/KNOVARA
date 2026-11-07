import crypto from "crypto";
import { Readable } from "stream";
import { setMockS3Client } from "../../src/services/r2Storage.js";

class InMemoryR2Storage {
  constructor() {
    this.objects = new Map();
  }

  clear() {
    this.objects.clear();
  }

  _makeKey(bucket, key) {
    return `${bucket}:::${key}`;
  }

  put(bucket, key, body, contentType = "application/octet-stream") {
    const buffer = Buffer.isBuffer(body)
      ? body
      : typeof body === "string"
      ? Buffer.from(body, "utf8")
      : Buffer.from(String(body));

    const eTag = `"${crypto.createHash("md5").update(buffer).digest("hex")}"`;

    this.objects.set(this._makeKey(bucket, key), {
      body: buffer,
      contentType,
      contentLength: buffer.length,
      eTag,
      lastModified: new Date(),
    });

    return { eTag };
  }

  head(bucket, key) {
    const item = this.objects.get(this._makeKey(bucket, key));
    if (!item) {
      const err = new Error("NotFound: The specified key does not exist.");
      err.name = "NotFound";
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }

    return {
      ContentLength: item.contentLength,
      ContentType: item.contentType,
      ETag: item.eTag,
      LastModified: item.lastModified,
    };
  }

  get(bucket, key) {
    const meta = this.head(bucket, key);
    const item = this.objects.get(this._makeKey(bucket, key));
    const stream = Readable.from(item.body);

    return {
      Body: stream,
      ContentLength: meta.ContentLength,
      ContentType: meta.ContentType,
      ETag: meta.ETag,
    };
  }

  copy(sourceBucket, sourceKey, targetBucket, targetKey) {
    // sourceKey may be formatted as `${sourceBucket}/${encodedKey}`
    let actualSourceKey = sourceKey;
    if (actualSourceKey.startsWith(`${sourceBucket}/`)) {
      actualSourceKey = decodeURIComponent(actualSourceKey.replace(`${sourceBucket}/`, ""));
    }

    const sourceItem = this.head(sourceBucket, actualSourceKey);
    const item = this.objects.get(this._makeKey(sourceBucket, actualSourceKey));

    return this.put(targetBucket, targetKey, item.body, sourceItem.ContentType);
  }

  delete(bucket, key) {
    this.objects.delete(this._makeKey(bucket, key));
    return { DeleteMarker: true };
  }
}

export const r2Store = new InMemoryR2Storage();

/**
 * Creates a mock S3Client that routes commands to InMemoryR2Storage.
 */
export function createMockS3Client() {
  return {
    getPresignedUrl: async ({ bucket, key, contentType, expiresIn }) => {
      return `https://mock-cf-account.r2.cloudflarestorage.com/${bucket}/${encodeURIComponent(key)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresIn}&X-Amz-SignedHeaders=content-type`;
    },
    send: async (command) => {
      const name = command.constructor.name;
      const input = command.input;

      if (name === "PutObjectCommand") {
        return r2Store.put(input.Bucket, input.Key, input.Body, input.ContentType);
      }

      if (name === "HeadObjectCommand") {
        return r2Store.head(input.Bucket, input.Key);
      }

      if (name === "GetObjectCommand") {
        return r2Store.get(input.Bucket, input.Key);
      }

      if (name === "CopyObjectCommand") {
        return r2Store.copy(
          input.CopySource.split("/")[0],
          input.CopySource,
          input.Bucket,
          input.Key
        );
      }

      if (name === "DeleteObjectCommand") {
        return r2Store.delete(input.Bucket, input.Key);
      }

      throw new Error(`MockS3Client: Unsupported command '${name}'`);
    },
  };
}

/**
 * Installs mock S3 client for automated tests.
 */
export function setupMockR2() {
  setMockS3Client(createMockS3Client());
}

/**
 * Resets all stored mock objects.
 */
export function clearMockR2() {
  r2Store.clear();
}
