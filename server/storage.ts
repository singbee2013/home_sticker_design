/**
 * 阿里云 OSS 存储
 * 使用 AWS S3 SDK（OSS 兼容 S3 接口）
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

function getOSSClient(): S3Client {
  if (!ENV.ossAccessKeyId || !ENV.ossAccessKeySecret || !ENV.ossBucket) {
    throw new Error(
      "Alibaba Cloud OSS not configured. Set OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET, OSS_ENDPOINT in .env"
    );
  }
  return new S3Client({
    region: ENV.ossRegion,
    endpoint: ENV.ossEndpoint,
    credentials: {
      accessKeyId: ENV.ossAccessKeyId,
      secretAccessKey: ENV.ossAccessKeySecret,
    },
    forcePathStyle: false,
  });
}

/**
 * Upload a file to OSS and return its public URL.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const client = getOSSClient();
  const key = relKey.replace(/^\/+/, "");
  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({
      Bucket: ENV.ossBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Do not force object ACL here.
      // Many OSS buckets have Object ACL disabled (Bucket owner enforced),
      // and setting ACL causes AccessDenied: "no right to access this object because of bucket acl".
    })
  );

  // Build public URL: https://{bucket}.{endpoint-host}/{key}
  const endpointHost = ENV.ossEndpoint.replace(/^https?:\/\//, "");
  const url = `https://${ENV.ossBucket}.${endpointHost}/${key}`;
  return { key, url };
}

/**
 * Get a pre-signed download URL (valid 1 hour) for private files.
 * For public-read buckets the public URL is sufficient — this is kept for compatibility.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const client = getOSSClient();
  const key = relKey.replace(/^\/+/, "");

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: ENV.ossBucket, Key: key }),
    { expiresIn: 3600 }
  );
  return { key, url };
}
