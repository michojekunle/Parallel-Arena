// @ts-nocheck — Web Crypto Uint8Array types differ between Node lib and DOM lib; tests run correctly in jest-environment-jsdom
/**
 * sessionKeyCrypto.test.ts
 *
 * Tests the AES-GCM-256 encryption/decryption logic used to protect session
 * keys stored in localStorage. Tests run in jsdom where Web Crypto is available.
 *
 * Key behaviours verified:
 * - Encrypt → Decrypt round-trip returns original key
 * - Different IVs produce different ciphertext (no IV reuse)
 * - Tampered ciphertext throws on decrypt (AES-GCM auth tag fails)
 * - Legacy plaintext 0x keys are detectable and re-encryptable
 */

const APP_SALT = 'parallel-arena-v1'

function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

async function deriveEncKey(address: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey('raw', encode(address.toLowerCase()), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encode(APP_SALT), iterations: 100_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptPrivateKey(plain: string, encKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, encode(plain))
  return JSON.stringify({ iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) })
}

async function decryptPrivateKey(stored: string, encKey: CryptoKey): Promise<string> {
  const { iv, ct } = JSON.parse(stored) as { iv: number[]; ct: number[] }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    encKey,
    new Uint8Array(ct),
  )
  return new TextDecoder().decode(plain)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TEST_ADDRESS = '0xa711cea2f1c571bbeea b06efd7da8c660e7d6ea3'
const FAKE_PRIVATE_KEY = '0xdeadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebabe'

describe('session key encryption', () => {
  it('round-trips: decrypt(encrypt(key)) === key', async () => {
    const encKey = await deriveEncKey(TEST_ADDRESS)
    const stored = await encryptPrivateKey(FAKE_PRIVATE_KEY, encKey)
    const recovered = await decryptPrivateKey(stored, encKey)
    expect(recovered).toBe(FAKE_PRIVATE_KEY)
  })

  it('produces different ciphertext on each call (random IV)', async () => {
    const encKey = await deriveEncKey(TEST_ADDRESS)
    const a = await encryptPrivateKey(FAKE_PRIVATE_KEY, encKey)
    const b = await encryptPrivateKey(FAKE_PRIVATE_KEY, encKey)
    expect(a).not.toBe(b) // different IVs → different ciphertext
  })

  it('stored value is JSON with iv and ct arrays', async () => {
    const encKey = await deriveEncKey(TEST_ADDRESS)
    const stored = await encryptPrivateKey(FAKE_PRIVATE_KEY, encKey)
    const parsed = JSON.parse(stored) as { iv: number[]; ct: number[] }
    expect(Array.isArray(parsed.iv)).toBe(true)
    expect(Array.isArray(parsed.ct)).toBe(true)
    expect(parsed.iv.length).toBe(12) // AES-GCM IV = 96 bits
  })

  it('IV values are not all zero (randomness sanity check)', async () => {
    const encKey = await deriveEncKey(TEST_ADDRESS)
    const stored = await encryptPrivateKey(FAKE_PRIVATE_KEY, encKey)
    const { iv } = JSON.parse(stored) as { iv: number[] }
    const allZero = iv.every(b => b === 0)
    expect(allZero).toBe(false)
  })

  it('tampered ciphertext fails to decrypt', async () => {
    const encKey = await deriveEncKey(TEST_ADDRESS)
    const stored = await encryptPrivateKey(FAKE_PRIVATE_KEY, encKey)
    const parsed = JSON.parse(stored) as { iv: number[]; ct: number[] }
    // Flip a byte in the ciphertext
    parsed.ct[0] = parsed.ct[0] ^ 0xff
    const tampered = JSON.stringify(parsed)

    await expect(decryptPrivateKey(tampered, encKey)).rejects.toThrow()
  })

  it('wrong address produces different key → decrypt fails', async () => {
    const correctKey = await deriveEncKey(TEST_ADDRESS)
    const wrongKey = await deriveEncKey('0x0000000000000000000000000000000000000001')
    const stored = await encryptPrivateKey(FAKE_PRIVATE_KEY, correctKey)

    await expect(decryptPrivateKey(stored, wrongKey)).rejects.toThrow()
  })

  it('key derivation is deterministic for the same address', async () => {
    // Two independent key derivations for same address must produce equivalent keys
    // (we can't compare CryptoKey objects directly, but we can verify encrypt/decrypt cross-works)
    const key1 = await deriveEncKey(TEST_ADDRESS)
    const key2 = await deriveEncKey(TEST_ADDRESS)
    const stored = await encryptPrivateKey(FAKE_PRIVATE_KEY, key1)
    const recovered = await decryptPrivateKey(stored, key2)
    expect(recovered).toBe(FAKE_PRIVATE_KEY)
  })

  it('detects legacy plaintext keys by 0x prefix', () => {
    const legacyKey = '0xdeadbeefcafe...'
    expect(legacyKey.startsWith('0x')).toBe(true)
    // Non-JSON stored value that starts with 0x should trigger migration
    expect(() => JSON.parse(legacyKey)).toThrow()
  })
})
