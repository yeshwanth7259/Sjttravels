const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const required = ['SJT_S3_ENDPOINT', 'SJT_S3_BUCKET', 'SJT_S3_REGION', 'SJT_S3_ACCESS_KEY_ID', 'SJT_S3_SECRET_ACCESS_KEY'];
const missing = required.filter(key => !process.env[key]);
const remote = missing.length === 0;
const endpointText = process.env.SJT_S3_ENDPOINT || '';
const endpoint = remote ? new URL(endpointText) : null;
const bucket = process.env.SJT_S3_BUCKET || '';
const region = process.env.SJT_S3_REGION || '';
const accessKey = process.env.SJT_S3_ACCESS_KEY_ID || '';
const secretKey = process.env.SJT_S3_SECRET_ACCESS_KEY || '';
const forcePathStyle = process.env.SJT_S3_FORCE_PATH_STYLE !== 'false';
const localDirectory = process.env.SJT_PRIVATE_DOCUMENTS_DIR || path.join(__dirname, 'private_driver_documents');
const DOCUMENT_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateKey(key) {
  if (typeof key !== 'string' || !DOCUMENT_KEY_PATTERN.test(key)) throw new Error('Invalid document key.');
  return key;
}

async function storageFetch(url, options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      if (response.status < 500 || attempt === 2) return response;
      lastError = new Error(`Private object storage returned status ${response.status}.`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
    }
    await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
  }
  throw new Error(lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError'
    ? 'Private object storage request timed out.' : 'Private object storage is unavailable.');
}

if (remote && (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)) {
  throw new Error('SJT_S3_ENDPOINT must be an HTTPS endpoint without embedded credentials or query parameters.');
}

function validateProductionConfig() {
  if (!remote) throw new Error(`Production requires private S3-compatible document storage. Missing: ${missing.join(', ')}`);
}

const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const encodePath = value => value.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
const encodeQuery = value => encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

function signingKey(dateStamp) {
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp);
  const regionKey = crypto.createHmac('sha256', dateKey).update(region).digest();
  const serviceKey = crypto.createHmac('sha256', regionKey).update('s3').digest();
  return crypto.createHmac('sha256', serviceKey).update('aws4_request').digest();
}

function objectUrl(key) {
  validateKey(key);
  const url = new URL(endpoint);
  const basePath = url.pathname.replace(/\/$/, '');
  if (forcePathStyle) url.pathname = `${basePath}/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
  else {
    url.hostname = `${bucket}.${url.hostname}`;
    url.pathname = `${basePath}/${encodeURIComponent(key)}`;
  }
  return url;
}

function signRequest(method, key, contentType, body = Buffer.alloc(0)) {
  const url = objectUrl(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(name => `${name}:${String(headers[name]).trim()}\n`).join('');
  const canonicalRequest = [method, encodePath(url.pathname), '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(dateStamp), stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, headers: { ...headers, Authorization: authorization } };
}

function presignedGetUrl(key, expiresSeconds = 60) {
  validateKey(key);
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 60) throw new Error('Invalid signed URL lifetime.');
  const url = objectUrl(key);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const values = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host'
  };
  const canonicalQuery = Object.keys(values).sort().map(name => `${encodeQuery(name)}=${encodeQuery(values[name])}`).join('&');
  const canonicalRequest = ['GET', encodePath(url.pathname), canonicalQuery, `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(dateStamp), stringToSign, 'hex');
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

async function put(key, bytes, contentType) {
  validateKey(key);
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 5 * 1024 * 1024) throw new Error('Invalid private document payload.');
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].includes(contentType)) throw new Error('Unsupported private document type.');
  if (!remote) {
    fs.mkdirSync(localDirectory, { recursive: true });
    fs.writeFileSync(path.join(localDirectory, key), bytes, { flag: 'wx', mode: 0o600 });
    return;
  }
  const signed = signRequest('PUT', key, contentType, bytes);
  const response = await storageFetch(signed.url, { method: 'PUT', headers: signed.headers, body: bytes });
  if (!response.ok) throw new Error(`Private object upload failed with status ${response.status}.`);
}

async function remove(key) {
  validateKey(key);
  if (!remote) {
    const file = path.join(localDirectory, key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  const signed = signRequest('DELETE', key, '', Buffer.alloc(0));
  const response = await storageFetch(signed.url, { method: 'DELETE', headers: signed.headers });
  if (!response.ok && response.status !== 404) throw new Error(`Private object cleanup failed with status ${response.status}.`);
}

async function getRemoteObject(key) {
  validateKey(key);
  if (!remote) throw new Error('Remote private document storage is not configured.');
  const signed = await storageFetch(presignedGetUrl(key, 60), { method: 'GET' });
  return signed;
}

module.exports = {
  isRemote: remote,
  localDirectory,
  validateProductionConfig,
  put,
  remove,
  getRemoteObject,
  getLocalPath: key => path.join(localDirectory, validateKey(key)),
  createSignedDownloadUrl: key => remote ? presignedGetUrl(key, 60) : null
};
