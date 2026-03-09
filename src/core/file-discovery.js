/**
 * 文件发现模块 - 扫描配置文件
 */
const fs = require('fs');
const path = require('path');

/**
 * 扫描配置文件目录
 */
function scanConfigFiles(resourcesDir) {
  if (!fs.existsSync(resourcesDir)) {
    return [];
  }

  const files = fs.readdirSync(resourcesDir);
  const configFiles = files.filter(f => {
    const name = f.toLowerCase();
    return name.endsWith('.yml') || name.endsWith('.yaml') || name.endsWith('.properties');
  });

  return configFiles.sort();
}

/**
 * 从文件名提取环境标识
 */
function extractProfileFromFileName(fileName) {
  const baseName = fileName.replace(/\.(yml|yaml|properties)$/i, '');
  if (baseName === 'application') {
    return 'default';
  }
  // 匹配 application-dev, application-prod 等
  const match = baseName.match(/^application-(.+)$/);
  if (match) {
    return match[1];
  }

  // 非 application 系列文件，使用文件名作为 profile，避免与 default 环境键冲突
  return baseName.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
}

/**
 * 从配置文件中提取敏感键
 */
function extractSensitiveKeysFromFile(filePath, sensitiveKeys, configParser) {
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();

  let config = null;
  if (ext === '.yml' || ext === '.yaml') {
    config = configParser.parseYamlFile(filePath);
  } else if (ext === '.properties') {
    config = configParser.parsePropertiesFile(filePath);
  }

  if (!config) return [];

  const allKeys = configParser.extractAllKeys(config);
  return allKeys.filter(key => {
    const lowerKey = key.toLowerCase();
    return sensitiveKeys.some(s => lowerKey.includes(s));
  });
}

module.exports = {
  scanConfigFiles,
  extractProfileFromFileName,
  extractSensitiveKeysFromFile
};
