import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.js";

let customS3Client = null;

/**
 * Returns the active S3/R2 client instance.
 * Allows mock injection during automated testing.
 *
 * @returns {S3Client}
 */
export function getS3Client() {
  if (customS3Client) {
    return customS3Client;
  }

  return new S3Client({
    region: config.R2_REGION || "auto",
    endpoint: config.R2_ENDPOINT_URL,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
    // R2 requires path-style addressing when using custom S3 endpoints
    forcePathStyle: true,
  });
}

/**
 * Sets a custom S3 client instance (e.g. mock client for isolated testing).
 *
 * @param {object|null} client
 */
export function setMockS3Client(client) {
  customS3Client = client;
}

/**
 * Generates a short-lived presigned PUT URL for direct browser-to-R2 upload.
 *
 * @param {object} params
 * @param {string} params.bucket - Target bucket name
 * @param {string} params.key - Unpredictable object key
 * @param {string} params.contentType - Expected file MIME type
 * @param {number} [params.expiresIn] - URL validity in seconds
 * @returns {Promise<string>}
 */
export async function generatePresignedUploadUrl({
  bucket = config.R2_EVIDENCE_BUCKET,
  key,
  contentType,
  expiresIn = config.R2_UPLOAD_URL_TTL_SECONDS,
}) {
  const client = getS3Client();

  // Allow mock client implementation during testing
  if (typeof client.getPresignedUrl === "function") {
    return client.getPresignedUrl({ bucket, key, contentType, expiresIn });
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Retrieves metadata for an object in R2.
 *
 * @param {string} bucket
 * @param {string} key
 * @returns {Promise<{ contentLength: number, contentType: string, eTag: string }>}
 */
export async function headObject(bucket = config.R2_EVIDENCE_BUCKET, key) {
  const client = getS3Client();
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const res = await client.send(command);
  return {
    contentLength: res.ContentLength || 0,
    contentType: res.ContentType || "application/octet-stream",
    eTag: res.ETag || "",
  };
}

/**
 * Retrieves the object data stream from R2.
 *
 * @param {string} bucket
 * @param {string} key
 * @returns {Promise<stream.Readable>}
 */
export async function getObjectStream(bucket = config.R2_EVIDENCE_BUCKET, key) {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const res = await client.send(command);
  return res.Body;
}

/**
 * Copies an object within or between buckets in R2.
 * Used for copying from temporary pending upload to immutable finalized evidence key.
 *
 * @param {string} sourceBucket
 * @param {string} sourceKey
 * @param {string} targetBucket
 * @param {string} targetKey
 * @returns {Promise<object>}
 */
export async function copyObject(sourceBucket, sourceKey, targetBucket, targetKey) {
  const client = getS3Client();
  const command = new CopyObjectCommand({
    CopySource: `${sourceBucket}/${encodeURIComponent(sourceKey)}`,
    Bucket: targetBucket,
    Key: targetKey,
  });

  return client.send(command);
}

/**
 * Puts raw bytes or text directly into R2.
 * Used for storing canonical manifest and metadata descriptor JSON documents.
 *
 * @param {string} bucket
 * @param {string} key
 * @param {Buffer|string} body
 * @param {string} contentType
 * @returns {Promise<object>}
 */
export async function putObject(
  bucket = config.R2_EVIDENCE_BUCKET,
  key,
  body,
  contentType = "application/json"
) {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  return client.send(command);
}

/**
 * Deletes an object from R2 (used for cleaning up temporary pending uploads).
 *
 * @param {string} bucket
 * @param {string} key
 * @returns {Promise<object>}
 */
export async function deleteObject(bucket = config.R2_EVIDENCE_BUCKET, key) {
  const client = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return client.send(command);
}

/**
 * Streams raw object bytes incrementally into SHA-256 without buffering the entire
 * file into memory. Measures actual streamed byte count and captures leading bytes
 * for magic-byte file signature validation.
 *
 * @param {stream.Readable} readableStream
 * @param {number} [maxHeaderBytes=512] - Number of leading bytes to capture for signature inspection
 * @returns {Promise<{ sha256Hex: string, totalBytes: number, headerBuffer: Buffer }>}
 */
export async function calculateStreamSha256(readableStream, maxHeaderBytes = 512) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    let totalBytes = 0;
    const headerChunks = [];
    let headerBytesCount = 0;

    const recordHeaderChunk = (chunk) => {
      if (headerBytesCount < maxHeaderBytes) {
        const needed = maxHeaderBytes - headerBytesCount;
        const slice = chunk.subarray(0, needed);
        headerChunks.push(slice);
        headerBytesCount += slice.length;
      }
    };

    // Handle standard Node.js readable stream
    if (typeof readableStream.on === "function") {
      readableStream.on("data", (chunk) => {
        totalBytes += chunk.length;
        hash.update(chunk);
        recordHeaderChunk(chunk);
      });

      readableStream.on("end", () => {
        resolve({
          sha256Hex: hash.digest("hex").toLowerCase(),
          totalBytes,
          headerBuffer: Buffer.concat(headerChunks),
        });
      });

      readableStream.on("error", (err) => {
        reject(err);
      });
      return;
    }

    // Handle WHATWG web ReadableStream (e.g. from fetch or newer AWS SDK runtimes)
    if (typeof readableStream.getReader === "function") {
      const reader = readableStream.getReader();
      function readChunk() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              resolve({
                sha256Hex: hash.digest("hex").toLowerCase(),
                totalBytes,
                headerBuffer: Buffer.concat(headerChunks),
              });
              return;
            }
            if (value) {
              const bufferChunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
              totalBytes += bufferChunk.length;
              hash.update(bufferChunk);
              recordHeaderChunk(bufferChunk);
            }
            readChunk();
          })
          .catch(reject);
      }
      readChunk();
      return;
    }

    reject(new Error("ERR_INVALID_STREAM: Unsupported stream implementation"));
  });
}
