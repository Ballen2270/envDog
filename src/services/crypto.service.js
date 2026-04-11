/**
 * 加密服务模块
 * 使用 AES-256-GCM 对 manifest 中的敏感值进行加解密
 * 密钥自动生成并存储在本地机器上
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ENV_DOG_DIR } = require('../constants');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_FILE = path.join(ENV_DOG_DIR, '.master-key');

const CRYPTO_PREFIX = 'envdog:v1:';

/**
 * 确保密钥文件存在，不存在则自动生成
 */
function ensureKey() {
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE, 'utf-8').trim();
  }

  const key = crypto.randomBytes(KEY_LENGTH).toString('hex');
  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(KEY_FILE, key, 'utf-8');
  fs.chmodSync(KEY_FILE, 0o600);
  return key;
}

/**
 * 加密明文，返回带前缀的加密字符串
 * 格式: envdog:v1:<iv_hex>:<authTag_hex>:<ciphertext_base64>
 */
function encrypt(plaintext, key) {
  if (!key) key = ensureKey();

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);

  let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return CRYPTO_PREFIX + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * 解密密文，返回原始明文
 */
function decrypt(ciphertext, key) {
  if (!key) key = ensureKey();

  if (!ciphertext.startsWith(CRYPTO_PREFIX)) {
    return ciphertext;
  }

  const parts = ciphertext.slice(CRYPTO_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

/**
 * 检查字符串是否为已加密格式
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(CRYPTO_PREFIX);
}

/**
 * 导出密钥内容（用于跨机器迁移）
 */
function exportKey() {
  if (!fs.existsSync(KEY_FILE)) {
    return null;
  }
  return fs.readFileSync(KEY_FILE, 'utf-8').trim();
}

/**
 * 导入密钥内容（从其他机器迁移）
 */
function importKey(keyHex) {
  if (!/^[0-9a-f]{64}$/.test(keyHex)) {
    throw new Error('Invalid key format: expected 64 hex characters');
  }

  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(KEY_FILE, keyHex, 'utf-8');
  fs.chmodSync(KEY_FILE, 0o600);
}

/**
 * 检查密钥文件是否存在
 */
function hasKey() {
  return fs.existsSync(KEY_FILE);
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  ensureKey,
  exportKey,
  importKey,
  hasKey,
  KEY_FILE
};
