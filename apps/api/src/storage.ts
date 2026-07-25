// F-202 document storage. The api never stores bytes in Postgres (spec AC 3): the object
// lands in an S3-compatible bucket and only its metadata is persisted.
//
// The seam is the `DocumentStorage` type, not the SDK. ARCHITECTURE AD-3 requires this code
// to stay vendor-neutral, and the provider baseline (Supabase Storage over its S3-compatible
// endpoint, SigV4 signed URLs — DEPLOY.md §1) is reached through the standard S3 client, so
// swapping providers is a change of endpoint and credentials, not of callers.

import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * A storage failure the api chose to surface. The message is our own text; a provider or SDK
 * message never reaches a client, because it can carry the bucket, the endpoint, and the
 * credential identity used to sign the request.
 */
export class DocumentStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentStorageError";
  }
}

export type DocumentStorage = {
  /**
   * Streams `body` to the object at `key`, replacing anything already there. `sizeBytes` is the
   * declared length: S3 needs it up front to sign a single-part PUT, and it is what makes this a
   * stream rather than a buffer — the api never holds the whole file (ARCHITECTURE API Surface,
   * "the api streams to S3").
   */
  put(key: string, body: Readable, contentType: string, sizeBytes: number): Promise<void>;
  /** A URL that grants read access to `key` for `expiresInSeconds` and no longer. */
  signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Removes the object. Used to compensate an upload whose metadata write then failed. */
  remove(key: string): Promise<void>;
};

export type S3StorageSettings = {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
};

/**
 * The S3 settings from the environment, or null when any of them is missing. Returning null
 * rather than throwing keeps the api bootable without cloud credentials (DEPLOY.md: the
 * scaffold runs locally with no accounts); the routes then answer 503 instead of pretending
 * an upload succeeded.
 */
export function s3SettingsFromEnv(env: NodeJS.ProcessEnv): S3StorageSettings | null {
  const { S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = env;
  if (!S3_ENDPOINT || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
    return null;
  }
  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    bucket: S3_BUCKET,
  };
}

/**
 * Path-style addressing: Supabase Storage serves one bucket path under a fixed project
 * hostname and does not resolve `<bucket>.<host>` virtual-host URLs.
 */
export function s3ClientFor(settings: S3StorageSettings): S3Client {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
    },
  });
}

export function createS3DocumentStorage(client: S3Client, bucket: string): DocumentStorage {
  return {
    async put(key, body, contentType, sizeBytes) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ContentLength: sizeBytes,
          }),
        );
      } catch (error) {
        // The bucket name, endpoint and signing identity all live in SDK error text.
        console.error("document upload to object storage failed", error);
        throw new DocumentStorageError("document storage is unavailable");
      }
    },

    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error) {
        console.error("removing an orphaned document object failed", error);
        throw new DocumentStorageError("document storage is unavailable");
      }
    },

    async signedDownloadUrl(key, expiresInSeconds) {
      try {
        return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
          expiresIn: expiresInSeconds,
        });
      } catch (error) {
        console.error("signing a document download url failed", error);
        throw new DocumentStorageError("document storage is unavailable");
      }
    },
  };
}

/**
 * Stands in for storage the deployment never configured. Every call fails loudly with our own
 * message, so an unconfigured environment cannot silently accept an upload it did not store.
 */
export function unconfiguredDocumentStorage(): DocumentStorage {
  const unavailable = (): never => {
    throw new DocumentStorageError("document storage is not configured");
  };
  return {
    put: async () => unavailable(),
    signedDownloadUrl: async () => unavailable(),
    remove: async () => unavailable(),
  };
}
