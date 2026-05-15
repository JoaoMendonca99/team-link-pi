/**
 * Importa chave RSA de GitHub App (PEM) usando apenas Web Crypto (Deno/Edge).
 * Suporta PKCS#1 (BEGIN RSA PRIVATE KEY) envolvendo em PKCS#8, e PKCS#8 (BEGIN PRIVATE KEY).
 * Evita jose.importPKCS1/importPKCS8, que podem faltar ou falhar no bundle esm.sh.
 */

function derEncodeLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length])
  const bytes: number[] = []
  let n = length
  while (n > 0) {
    bytes.unshift(n & 0xff)
    n >>= 8
  }
  if (bytes.length > 126) {
    throw new TypeError('DER content length too large')
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function derSequence(...elements: Uint8Array[]): Uint8Array {
  const content = concatBytes(...elements)
  return concatBytes(new Uint8Array([0x30]), derEncodeLength(content.length), content)
}

function derOctetString(data: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([0x04]), derEncodeLength(data.length), data)
}

/** OID rsaEncryption 1.2.840.113549.1.1.1 */
const RSA_ENCRYPTION_OID = new Uint8Array([
  0x06,
  0x09,
  0x2a,
  0x86,
  0x48,
  0x86,
  0xf7,
  0x0d,
  0x01,
  0x01,
  0x01,
])
const ASN1_NULL = new Uint8Array([0x05, 0x00])

function wrapPkcs1RsaPrivateKeyInPkcs8(pkcs1Der: Uint8Array): Uint8Array {
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const algorithmIdentifier = derSequence(RSA_ENCRYPTION_OID, ASN1_NULL)
  const privateKey = derOctetString(pkcs1Der)
  return derSequence(version, algorithmIdentifier, privateKey)
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function toPkcs8Buffer(pkcs8Der: Uint8Array): ArrayBuffer {
  return pkcs8Der.buffer.slice(
    pkcs8Der.byteOffset,
    pkcs8Der.byteOffset + pkcs8Der.byteLength,
  ) as ArrayBuffer
}

async function importPkcs8RsaPrivateKeyForRs256(pkcs8Der: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    toPkcs8Buffer(pkcs8Der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/**
 * PEM no formato GitHub App (RSA PKCS#1 ou PKCS#8).
 */
export async function importGithubAppSigningKeyFromPem(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()

  if (normalized.includes('BEGIN RSA PRIVATE KEY')) {
    const pkcs1Der = pemToDer(normalized)
    if (pkcs1Der.length < 32) {
      throw new TypeError('Decoded PKCS#1 key too short')
    }
    const pkcs8Der = wrapPkcs1RsaPrivateKeyInPkcs8(pkcs1Der)
    return importPkcs8RsaPrivateKeyForRs256(pkcs8Der)
  }

  if (normalized.includes('BEGIN PRIVATE KEY')) {
    const pkcs8Der = pemToDer(normalized)
    if (pkcs8Der.length < 32) {
      throw new TypeError('Decoded PKCS#8 key too short')
    }
    return importPkcs8RsaPrivateKeyForRs256(pkcs8Der)
  }

  throw new TypeError('Unsupported PEM: expected RSA PRIVATE KEY or PRIVATE KEY')
}
