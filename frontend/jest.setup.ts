// Polyfills for jsdom environment — Node provides these, jsdom does not by default.
import { TextEncoder, TextDecoder } from 'node:util'
import { webcrypto } from 'node:crypto'

Object.defineProperty(global, 'TextEncoder', { value: TextEncoder })
Object.defineProperty(global, 'TextDecoder', { value: TextDecoder })

// Provide Web Crypto API (needed by useSessionKey crypto tests)
Object.defineProperty(global, 'crypto', { value: webcrypto })
