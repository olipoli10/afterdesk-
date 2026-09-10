import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Download only. This script never executes the downloaded runtime.
const root = 'C:/dev/endvera-astra-r03/.scratch/postgres-native-17.11-3';
const url = 'https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip';
const expectedBytes = 341325378;
const archive = `${root}/postgresql-17.11-3-windows-x64-binaries.zip`;
for (let current = resolve(root); ; current = dirname(current)) {
  if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('REPARSE_PATH_REFUSED');
  if (dirname(current) === current) break;
}
mkdirSync(root, { recursive: true });
if (existsSync(archive)) throw new Error('ARCHIVE_ALREADY_EXISTS_NO_OVERWRITE');
const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(600000) });
if (response.status !== 200 || response.url !== url || response.headers.get('content-length') !== String(expectedBytes)
  || !response.headers.get('content-type')?.startsWith('application/zip') || !response.body) throw new Error('DOWNLOAD_PROVENANCE_OR_SIZE_REFUSED');
let bytes = 0, milestone = 0;
const hash = createHash('sha256');
await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) {
  bytes += chunk.length;
  if (bytes > expectedBytes) return callback(new Error('DOWNLOAD_OVERSIZE'));
  hash.update(chunk);
  if (bytes >= milestone + 64 * 1024 * 1024) { milestone = bytes; process.stdout.write(`Downloaded ${Math.round(bytes / 1048576)} MiB\n`); }
  callback(null, chunk);
} }), createWriteStream(archive, { flags: 'wx' }));
if (bytes !== expectedBytes) throw new Error('DOWNLOAD_TRUNCATED');
const receipt = { artifact: 'postgresql-17.11-3-windows-x64-binaries.zip', version: '17.11-3',
  officialProvenance: ['https://www.postgresql.org/download/windows/', 'https://www.enterprisedb.com/download-postgresql-binaries', 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260491'],
  finalUrl: response.url, bytes, sha256: hash.digest('hex'), hashProvenance: 'LOCALLY_COMPUTED_IDENTITY_NOT_PUBLISHER_CHECKSUM',
  publisherChecksumAvailable: false, lastModified: response.headers.get('last-modified'), etag: response.headers.get('etag'),
  downloadedAt: new Date().toISOString(), archivePath: archive, executableRun: false, providerCalls: 0 };
writeFileSync('specs/210-personal-live-activation/evidence/native-postgres-download-provenance.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
