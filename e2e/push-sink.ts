import { createECDH, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

/**
 * A stand-in push service for the end-to-end tests: the app sends to it (its origin is accepted
 * through PUSH_TEST_ENDPOINT_ORIGIN) and the tests read what it received. Started by the global
 * setup on the host; the app container reaches it at E2E_PUSH_ORIGIN.
 */

export const SINK_PORT = Number(process.env.E2E_PUSH_SINK_PORT ?? 4567);
/** The sink as the app (in its container) sees it. */
export const PUSH_ORIGIN =
  process.env.E2E_PUSH_ORIGIN ?? `http://host.docker.internal:${SINK_PORT}`;
/** The sink as the tests see it. */
const LOCAL = `http://localhost:${SINK_PORT}`;

export type Received = { headers: Record<string, string>; body: string; receivedAt: number };

export function startPushSink(): Promise<Server> {
  const received = new Map<string, Received[]>();
  const server = createServer((req, res) => {
    const [, kind, id = ''] = (req.url ?? '').split('/');
    if (req.method === 'POST' && kind === 'push') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const list = received.get(id) ?? [];
        list.push({
          headers: {
            ttl: String(req.headers.ttl ?? ''),
            urgency: String(req.headers.urgency ?? ''),
            encoding: String(req.headers['content-encoding'] ?? ''),
            authorization: String(req.headers.authorization ?? ''),
          },
          body: Buffer.concat(chunks).toString('base64'),
          receivedAt: Date.now(),
        });
        received.set(id, list);
        // A subscription whose id starts with "gone" no longer exists.
        res.writeHead(id.startsWith('gone') ? 410 : 201).end();
      });
      return;
    }
    if (req.method === 'GET' && kind === 'received') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(received.get(id) ?? []));
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(SINK_PORT, '0.0.0.0', () => resolve(server));
  });
}

/** A browser-like subscription to the sink, with the keys to read its messages. */
export function sinkSubscription(prefix = 'sub') {
  const id = `${prefix}-${randomUUID()}`;
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    id,
    json: {
      endpoint: `${PUSH_ORIGIN}/push/${id}`,
      expirationTime: null,
      keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    },
    /** Messages received so far, decrypted (RFC 8291, aes128gcm). */
    async messages(): Promise<
      { headers: Received['headers']; receivedAt: number; payload: unknown }[]
    > {
      const res = await fetch(`${LOCAL}/received/${id}`);
      const list = (await res.json()) as Received[];
      return list.map((message) => ({
        headers: message.headers,
        receivedAt: message.receivedAt,
        payload: JSON.parse(decrypt(Buffer.from(message.body, 'base64'), ecdh, auth)),
      }));
    },
  };
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

function decrypt(body: Buffer, ecdh: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idLength = body[20]!;
  const senderKey = body.subarray(21, 21 + idLength);
  const content = body.subarray(21 + idLength);
  const secret = ecdh.computeSecret(senderKey);
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    ecdh.getPublicKey(),
    senderKey,
    Buffer.from([1]),
  ]);
  const ikm = hmac(hmac(auth, secret), info);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(content.subarray(content.length - 16));
  const plain = Buffer.concat([
    decipher.update(content.subarray(0, content.length - 16)),
    decipher.final(),
  ]);
  // Padding: the data, a 0x02 delimiter (last record), then zeros.
  const end = plain.lastIndexOf(2);
  return plain.subarray(0, end).toString('utf8');
}
