const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cryptoService = require('../src/services/crypto.service');

const {
  encrypt,
  decrypt,
  isEncrypted,
  ensureKey,
  exportKey,
  importKey,
  hasKey,
  KEY_FILE
} = cryptoService;

const CRYPTO_PREFIX = 'envdog:v1:';

describe('crypto.service', () => {
  let testKey;
  let originalKeyFile;

  beforeAll(() => {
    testKey = crypto.randomBytes(32).toString('hex');
  });

  describe('encrypt', () => {
    it('should encrypt plaintext and return prefixed string', () => {
      const result = encrypt('hello world', testKey);

      expect(result).toMatch(/^envdog:v1:[0-9a-f]{32}:[0-9a-f]{32}:.+$/);
      expect(result.startsWith(CRYPTO_PREFIX)).toBe(true);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const result1 = encrypt('same input', testKey);
      const result2 = encrypt('same input', testKey);

      expect(result1).not.toBe(result2);
    });

    it('should handle empty string', () => {
      const result = encrypt('', testKey);

      expect(result.startsWith(CRYPTO_PREFIX)).toBe(true);

      const decrypted = decrypt(result, testKey);
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', () => {
      const plaintext = '你好世界 🌍 日本語テスト';
      const result = encrypt(plaintext, testKey);
      const decrypted = decrypt(result, testKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const result = encrypt(plaintext, testKey);
      const decrypted = decrypt(result, testKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = 'password=abc123!@#$%^&*()_+-=[]{}|;:",.<>?/~`';
      const result = encrypt(plaintext, testKey);
      const decrypted = decrypt(result, testKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle newlines and tabs', () => {
      const plaintext = 'line1\nline2\ttab\r\nwindows';
      const result = encrypt(plaintext, testKey);
      const decrypted = decrypt(result, testKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle JSON-like values', () => {
      const plaintext = '{"key": "value", "nested": {"a": 1}}';
      const result = encrypt(plaintext, testKey);
      const decrypted = decrypt(result, testKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should use ensureKey() when no key provided', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdog-test-'));
      const tmpKeyFile = path.join(tmpDir, '.master-key');

      const origKeyFile = KEY_FILE;
      jest.resetModules();

      const mockedConstants = { ENV_DOG_DIR: tmpDir };
      jest.doMock('../src/constants', () => mockedConstants);

      const cryptoMod = require('../src/services/crypto.service');
      try {
        const result = cryptoMod.encrypt('test value');
        expect(result.startsWith(CRYPTO_PREFIX)).toBe(true);

        const decrypted = cryptoMod.decrypt(result);
        expect(decrypted).toBe('test value');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        jest.dontMock('../src/constants');
        jest.resetModules();
      }
    });
  });

  describe('decrypt', () => {
    it('should correctly decrypt an encrypted value', () => {
      const plaintext = 'my-secret-password';
      const encrypted = encrypt(plaintext, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should return plaintext unchanged if not encrypted', () => {
      const plaintext = 'not-encrypted-value';

      expect(decrypt(plaintext, testKey)).toBe(plaintext);
    });

    it('should return plaintext without prefix unchanged', () => {
      const plain = 'just a regular string';

      expect(decrypt(plain, testKey)).toBe(plain);
    });

    it('should throw on tampered authTag', () => {
      const encrypted = encrypt('secret', testKey);
      const parts = encrypted.slice(CRYPTO_PREFIX.length).split(':');
      const iv = parts[0];
      const authTag = parts[1];
      const ciphertext = parts[2];

      const tamperedAuthTag = authTag.replace(/0/g, 'f');
      const tampered = CRYPTO_PREFIX + iv + ':' + tamperedAuthTag + ':' + ciphertext;

      expect(() => decrypt(tampered, testKey)).toThrow();
    });

    it('should throw or produce garbage on tampered ciphertext body', () => {
      const encrypted = encrypt('secret', testKey);
      const parts = encrypted.slice(CRYPTO_PREFIX.length).split(':');
      const iv = parts[0];
      const authTag = parts[1];
      const ciphertext = parts[2];

      const tamperedCipher = ciphertext.slice(0, -2) + 'XX';
      const tampered = CRYPTO_PREFIX + iv + ':' + authTag + ':' + tamperedCipher;

      expect(() => decrypt(tampered, testKey)).toThrow();
    });

    it('should throw on invalid format (wrong number of parts)', () => {
      const invalid = CRYPTO_PREFIX + 'part1:part2';

      expect(() => decrypt(invalid, testKey)).toThrow('Invalid encrypted format');
    });

    it('should throw with wrong key', () => {
      const encrypted = encrypt('secret', testKey);
      const wrongKey = crypto.randomBytes(32).toString('hex');

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('should handle numeric-like values as strings', () => {
      const plaintext = '12345';
      const encrypted = encrypt(plaintext, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encrypt/decrypt round-trip', () => {
    const testValues = [
      ['simple text', 'hello'],
      ['password', 'P@ssw0rd!123'],
      ['connection string', 'mysql://user:pass@localhost:3306/db'],
      ['API key', 'sk-abc123def456ghi789'],
      ['empty string', ''],
      ['multiline', 'line1\nline2\nline3'],
      ['JSON', '{"db":{"host":"localhost","port":5432}}'],
      ['Chinese', '数据库密码'],
      ['emoji', '🔐🔒🗝️'],
      ['base64 value', Buffer.from('raw-bytes-here').toString('base64')],
    ];

    test.each(testValues)('should round-trip %s', (_label, value) => {
      const encrypted = encrypt(value, testKey);
      const decrypted = decrypt(encrypted, testKey);

      expect(decrypted).toBe(value);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted values', () => {
      const encrypted = encrypt('test', testKey);

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain strings', () => {
      expect(isEncrypted('plain text')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('should return true for prefix-only string (startswith match)', () => {
      expect(isEncrypted('envdog:v1:')).toBe(true);
      expect(isEncrypted('envdog:')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
      expect(isEncrypted(123)).toBe(false);
      expect(isEncrypted({})).toBe(false);
    });

    it('should return true for values starting with exact prefix', () => {
      expect(isEncrypted('envdog:v1:something')).toBe(true);
    });
  });

  describe('ensureKey', () => {
    it('should return a valid 64-char hex key', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdog-test-'));
      const tmpKeyFile = path.join(tmpDir, '.master-key');

      if (fs.existsSync(tmpKeyFile)) {
        fs.unlinkSync(tmpKeyFile);
      }

      const mockedConstants = { ENV_DOG_DIR: tmpDir };
      jest.resetModules();
      jest.doMock('../src/constants', () => mockedConstants);

      try {
        const cryptoMod = require('../src/services/crypto.service');
        const key = cryptoMod.ensureKey();

        expect(key).toMatch(/^[0-9a-f]{64}$/);
        expect(fs.existsSync(tmpKeyFile)).toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        jest.dontMock('../src/constants');
        jest.resetModules();
      }
    });
  });

  describe('exportKey / importKey / hasKey', () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envdog-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      jest.dontMock('../src/constants');
      jest.resetModules();
    });

    function getCryptoMod() {
      jest.resetModules();
      jest.doMock('../src/constants', () => ({ ENV_DOG_DIR: tmpDir }));
      return require('../src/services/crypto.service');
    }

    it('hasKey should return false when no key file exists', () => {
      const mod = getCryptoMod();
      expect(mod.hasKey()).toBe(false);
    });

    it('hasKey should return true after ensureKey', () => {
      const mod = getCryptoMod();
      mod.ensureKey();
      expect(mod.hasKey()).toBe(true);
    });

    it('exportKey should return null when no key file exists', () => {
      const mod = getCryptoMod();
      expect(mod.exportKey()).toBe(null);
    });

    it('exportKey should return key after ensureKey', () => {
      const mod = getCryptoMod();
      const key = mod.ensureKey();
      expect(mod.exportKey()).toBe(key);
    });

    it('importKey should accept valid 64-hex-char key', () => {
      const mod = getCryptoMod();
      const key = crypto.randomBytes(32).toString('hex');

      mod.importKey(key);
      expect(mod.hasKey()).toBe(true);
      expect(mod.exportKey()).toBe(key);
    });

    it('importKey should reject invalid key format', () => {
      const mod = getCryptoMod();

      expect(() => mod.importKey('short')).toThrow('Invalid key format');
      expect(() => mod.importKey('GG'.repeat(32))).toThrow('Invalid key format');
      expect(() => mod.importKey('ab'.repeat(32) + '00')).toThrow('Invalid key format');
    });

    it('should encrypt/decrypt across import/export cycle', () => {
      const mod1 = getCryptoMod();
      const key = mod1.ensureKey();
      const exportedKey = mod1.exportKey();

      const encrypted = mod1.encrypt('cross-machine-secret', key);

      const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'envdog-test2-'));
      try {
        jest.resetModules();
        jest.doMock('../src/constants', () => ({ ENV_DOG_DIR: tmpDir2 }));
        const mod2 = require('../src/services/crypto.service');

        mod2.importKey(exportedKey);
        const decrypted = mod2.decrypt(encrypted, exportedKey);

        expect(decrypted).toBe('cross-machine-secret');
      } finally {
        fs.rmSync(tmpDir2, { recursive: true, force: true });
        jest.dontMock('../src/constants');
        jest.resetModules();
      }
    });
  });
});
