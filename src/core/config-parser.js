/**
 * 配置文件解析器 - 核心模块
 */
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const YAML_DUMP_OPTIONS = {
  lineWidth: 0
};

/**
 * 根据文件扩展名加载配置文件
 * @param {string} filePath - 文件路径
 * @returns {object|null} 解析后的配置对象
 */
function loadConfigByExt(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yml' || ext === '.yaml') {
    return parseYamlFile(filePath);
  } else if (ext === '.properties') {
    return parsePropertiesFile(filePath);
  }
  return null;
}

/**
 * 解析 YAML 文件
 */
function parseYamlFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return YAML.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * 序列化 YAML 内容（统一输出选项，避免长 URL 折叠与字符串样式不一致）
 */
function dumpYamlContent(data) {
  return YAML.stringify(data, YAML_DUMP_OPTIONS);
}

/**
 * 解析 Properties 文件
 */
function parsePropertiesFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const match = trimmed.match(/^([^=:]+)[:=]\s*(.*)$/);
    if (match) result[match[1].trim()] = match[2].trim();
  }
  return result;
}

/**
 * 递归提取对象中的所有键路径
 */
function extractAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * 获取嵌套值
 */
function getNestedValue(obj, key) {
  if (obj.hasOwnProperty(key)) return obj[key];
  const keys = key.split('.');
  let current = obj;
  for (const k of keys) {
    if (current === null || current === undefined) return null;
    current = current[k];
  }
  return current;
}

/**
 * 设置嵌套值
 */
function setNestedValue(obj, key, value) {
  const keys = key.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current)) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

module.exports = {
  loadConfigByExt,
  parseYamlFile,
  dumpYamlContent,
  parsePropertiesFile,
  extractAllKeys,
  getNestedValue,
  setNestedValue
};
