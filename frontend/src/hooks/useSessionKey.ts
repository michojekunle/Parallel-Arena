'use client'

import { useState, useEffect } from 'react'
import { createWalletClient, http, fallback, type Hex } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { monadTestnet, RPC_URLS } from '@/lib/constants'

const STORAGE_PREFIX = 'session_key_enc_'
const LEGACY_PREFIX = 'session_key_'
const APP_SALT = 'parallel-arena-v1'
const PBKDF2_ITERATIONS = 100_000

function encode(str: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(str) as Uint8Array<ArrayBuffer>
}

async function deriveEncKey(address: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey('raw', encode(address.toLowerCase()), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encode(APP_SALT), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

interface EncryptedPayload {
  iv: number[]
  ct: number[]
}

async function encryptPrivateKey(plain: Hex, encKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, encode(plain))
  const payload: EncryptedPayload = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) }
  return JSON.stringify(payload)
}

async function decryptPrivateKey(stored: string, encKey: CryptoKey): Promise<Hex> {
  const { iv, ct } = JSON.parse(stored) as EncryptedPayload
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) as Uint8Array<ArrayBuffer> },
    encKey,
    new Uint8Array(ct) as Uint8Array<ArrayBuffer>,
  )
  return new TextDecoder().decode(plain) as Hex
}

async function loadOrCreateSessionKey(address: string): Promise<Hex> {
  const encKey = await deriveEncKey(address)
  const encStorageKey = `${STORAGE_PREFIX}${address.toLowerCase()}`
  const legacyStorageKey = `${LEGACY_PREFIX}${address.toLowerCase()}`

  // Check for existing encrypted key
  const encStored = localStorage.getItem(encStorageKey)
  if (encStored) {
    try {
      return await decryptPrivateKey(encStored, encKey)
    } catch {
      // Corrupted — regenerate
      localStorage.removeItem(encStorageKey)
    }
  }

  // Migrate plaintext legacy key if present
  const legacyStored = localStorage.getItem(legacyStorageKey)
  if (legacyStored?.startsWith('0x')) {
    const encrypted = await encryptPrivateKey(legacyStored as Hex, encKey)
    localStorage.setItem(encStorageKey, encrypted)
    localStorage.removeItem(legacyStorageKey)
    return legacyStored as Hex
  }

  // Generate fresh key
  const newKey = generatePrivateKey()
  const encrypted = await encryptPrivateKey(newKey, encKey)
  localStorage.setItem(encStorageKey, encrypted)
  return newKey
}

export function useSessionKey(userAddress: `0x${string}` | undefined): {
  sessionKey: Hex | null
  sessionAddress: `0x${string}` | undefined
  walletClient: ReturnType<typeof createWalletClient> | null
  isAuthorized: boolean
  setIsAuthorized: (v: boolean) => void
} {
  const [sessionKey, setSessionKey] = useState<Hex | null>(null)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    if (!userAddress) return
    let cancelled = false
    loadOrCreateSessionKey(userAddress)
      .then(key => {
        if (!cancelled) {
          setSessionKey(key)
          // Session key loaded from storage → automatically authorize it.
          // On-chain expiry check happens in useArena.submitAction().
          // This enables immediate silent execution on page load without
          // requiring user to re-authorize every session.
          setIsAuthorized(true)
        }
      })
      .catch(() => {
        // Web Crypto unavailable (non-HTTPS env) — use ephemeral key, don't persist
        if (!cancelled) {
          setSessionKey(generatePrivateKey())
          // Ephemeral key also auto-authorized for this session only
          setIsAuthorized(true)
        }
      })
    return () => { cancelled = true }
  }, [userAddress])

  const account = sessionKey ? privateKeyToAccount(sessionKey) : null

  const walletClient = account
    ? createWalletClient({
        account,
        chain: monadTestnet,
        transport: fallback(RPC_URLS.map(url => http(url, { timeout: 8_000 }))),
      })
    : null

  return {
    sessionKey,
    sessionAddress: account?.address,
    walletClient,
    isAuthorized,
    setIsAuthorized,
  }
}
