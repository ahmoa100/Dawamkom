export async function openStorage() {
  const Bucket = process.env.DAWAMAK_STORAGE_BUCKET;
  if (!Bucket) return null;
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({ region: process.env.DAWAMAK_STORAGE_REGION || 'us-east-1' });
  const location = { Bucket, Key: process.env.DAWAMAK_STORAGE_KEY || 'dawamkom/state.json' };
  let etag;

  return {
    async read({ bootstrap = false } = {}) {
      try {
        const response = await client.send(new GetObjectCommand({ ...location, IfNoneMatch: etag }));
        const saved = JSON.parse(await response.Body.transformToString());
        if (!response.ETag || saved.version !== 1 || !saved.state || !Array.isArray(saved.partners) || !saved.profile) {
          throw new Error('Invalid Dawamkom storage snapshot.');
        }
        etag = response.ETag;
        return saved;
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 304 && etag) return null;
        if (bootstrap && error.name === 'NoSuchKey') return null;
        throw error;
      }
    },
    async write(snapshot) {
      const response = await client.send(new PutObjectCommand({
        ...location,
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
        Body: JSON.stringify({ version: 1, ...snapshot }),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
      }));
      etag = response.ETag;
    },
  };
}

export function storageConflict(error) {
  return [409, 412].includes(error.$metadata?.httpStatusCode);
}
