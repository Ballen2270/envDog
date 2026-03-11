/**
 * Manifest 服务模块
 * 负责管理替换映射清单，确保 restore/protect 的可逆性
 */
const fs = require('fs');
const path = require('path');
const { ENV_DOG_DIR } = require('../constants');
const { resolveVarName } = require('../core/naming');
const { parseYamlDocument, getScalarSnapshot } = require('../core/yaml-doc');

const MANIFEST_FILE = '.envdog/manifest.json';

/**
 * 创建 manifest 数据
 * @param {object} template - 模板数据
 * @param {string} resourcesDir - 资源目录
 * @param {object} options - 可选参数
 * @param {object|null} options.existingManifest - 已存在的 manifest（用于保留原始明文）
 * @returns {object} manifest 对象
 */
function createManifest(template, resourcesDir, options = {}) {
  const mappings = [];
  const seenMappingKeys = new Set();
  const existingManifest = options.existingManifest || loadManifest();
  const mode = options.mode || 'single';
  const existingMappingMap = buildExistingMappingMap(existingManifest);

  // 遍历模板中的文件配置
  for (const [file, fileConfig] of Object.entries(template.files || {})) {
    const profile = fileConfig.profile || 'default';
    const filePath = path.join(resourcesDir, file);
    const ext = path.extname(file).toLowerCase();

    // 读取原始配置文件获取实际值
    if (!fs.existsSync(filePath)) continue;

    let config = null;
    let yamlDoc = null;
    if (ext === '.yml' || ext === '.yaml') {
      const yamlContent = fs.readFileSync(filePath, 'utf-8');
      yamlDoc = parseYamlDocument(yamlContent);
    } else {
      config = loadConfigByExt(filePath);
      if (!config) continue;
    }

    // 遍历该文件的敏感键
    for (const key of fileConfig.keys || []) {
      let value;
      let originalStyle;
      if (yamlDoc !== null) {
        const scalar = getScalarSnapshot(yamlDoc, key);
        if (!scalar) continue;
        value = scalar.value;
        originalStyle = scalar.style;
      } else {
        value = getNestedValue(config, key);
        if (value === null || value === undefined) continue;
      }

      const varMappings = template.varMappings || {};
      const envVar = varMappings[key];
      const varName = resolveVarName(key, envVar, profile, mode);

      if (varName) {
        const mappingKey = `${file}::${profile}::${key}`;
        if (seenMappingKeys.has(mappingKey)) continue;
        seenMappingKeys.add(mappingKey);

        const placeholderPattern = `\${${varName}}`;
        let originalValue = String(value);
        const existingMapping = existingMappingMap.get(mappingKey);

        // 已被替换为占位符时，优先保留旧 manifest 里的明文，避免重复 replace 导致明文丢失
        if (isPlaceholderValue(value) && existingMapping && !isPlaceholderValue(existingMapping.originalValue)) {
          originalValue = existingMapping.originalValue;
          if (existingMapping.originalStyle !== undefined) {
            originalStyle = existingMapping.originalStyle;
          }
        }

        mappings.push({
          file: file,
          keyPath: key,
          varName: varName,
          placeholderPattern: placeholderPattern,
          originalValue: originalValue,
          originalStyle: originalStyle,
          profile: profile
        });
      }
    }
  }

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    status: 'protected',
    mappings: mappings
  };
}

/**
 * 加载 manifest
 * @returns {object|null}
 */
function loadManifest() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
  } catch (e) {
    console.error('Manifest 文件解析失败:', e.message);
    return null;
  }
}

/**
 * 保存 manifest
 * @param {object} manifest
 */
function saveManifest(manifest) {
  const dir = path.dirname(MANIFEST_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
}


/**
 * 更新 manifest 状态
 * @param {string} status - 'protected' | 'restored'
 */
function updateStatus(status) {
  const manifest = loadManifest();
  if (manifest) {
    manifest.status = status;
    saveManifest(manifest);
  }
}

/**
 * 根据环境过滤 mappings
 * @param {string|null} env - 环境名，null 表示全部
 * @returns {array}
 */
function getMappingsByEnv(env) {
  const manifest = loadManifest();
  if (!manifest) return [];

  if (!env) return manifest.mappings;

  return manifest.mappings.filter(m => m.profile === env);
}

/**
 * 根据文件过滤 mappings
 * 自动从文件名解析对应的 profile (如 application-dev.yml → dev)
 * @param {string} file - 文件名
 * @returns {array}
 */
function getMappingsByFile(file) {
  const manifest = loadManifest();
  if (!manifest) return [];

  // 从文件名解析 profile
  const profile = extractProfileFromFileName(file);

  let mappings = manifest.mappings.filter(m => m.file === file);

  // 如果指定了 profile，进一步过滤
  if (profile) {
    mappings = mappings.filter(m => m.profile === profile);
  }

  return mappings;
}

/**
 * 根据环境和文件过滤 mappings
 * @param {string|null} env - 环境名
 * @param {string|null} file - 文件名
 * @returns {array}
 */
function getMappingsByEnvAndFile(env, file) {
  const manifest = loadManifest();
  if (!manifest) return [];

  let mappings = manifest.mappings;

  // 按环境过滤
  if (env) {
    mappings = mappings.filter(m => m.profile === env);
  }

  // 按文件过滤
  if (file) {
    mappings = mappings.filter(m => m.file === file);
  }

  return mappings;
}

/**
 * 从文件名解析 profile
 * application-dev.yml → dev
 * application-prod.yml → prod
 * application.yml → null (无 profile)
 */
function extractProfileFromFileName(fileName) {
  const match = fileName.match(/^application-(.+)\.ya?ml$/);
  return match ? match[1] : null;
}

// 复用 config-parser 的工具函数
function loadConfigByExt(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.yml' || ext === '.yaml') {
    return require('../core/config-parser').parseYamlFile(filePath);
  } else if (ext === '.properties') {
    return require('../core/config-parser').parsePropertiesFile(filePath);
  }
  return null;
}

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

function isPlaceholderValue(value) {
  if (typeof value !== 'string') return false;
  return /^\$\{[^}]+\}$/.test(value);
}

function buildExistingMappingMap(manifest) {
  const mappingMap = new Map();
  if (!manifest || !Array.isArray(manifest.mappings)) return mappingMap;

  for (const m of manifest.mappings) {
    const key = `${m.file}::${m.profile}::${m.keyPath}`;
    if (!mappingMap.has(key)) {
      mappingMap.set(key, m);
    }
  }

  return mappingMap;
}

module.exports = {
  MANIFEST_FILE,
  createManifest,
  loadManifest,
  saveManifest,
  updateStatus,
  getMappingsByEnv,
  getMappingsByFile,
  getMappingsByEnvAndFile,
  extractProfileFromFileName
};
