/**
 * 环境变量生成服务模块
 */
const path = require('path');
const { loadConfigByExt, getNestedValue } = require('../core/config-parser');
const { resolveVarName } = require('../core/naming');
const { writeEnvFile } = require('../core/env-file');

/**
 * 从配置文件中提取敏感数据 (V2版本)
 */
function extractSensitiveDataV2(filePath, keys, varMappings, profile, singleMode = false) {
  const result = {};
  const config = loadConfigByExt(filePath);

  if (!config) return result;

  for (const key of keys) {
    const value = getNestedValue(config, key);
    if (value !== null && value !== undefined) {
      const mode = singleMode ? 'single' : 'multi';
      const envVar = resolveVarName(key, varMappings[key], profile, mode);
      result[envVar] = String(value);
    }
  }

  return result;
}

/**
 * 模式 multi: 生成每个环境的独立 .env 文件
 */
function generateEnvModeMulti(template, resourcesDir, varMappings) {
  console.log('\n=== 模式 multi: 生成每个环境的独立 .env 文件 ===\n');

  // 按环境分组文件
  const envFiles = {};
  for (const [file, config] of Object.entries(template.files)) {
    const profile = config.profile || 'default';
    if (!envFiles[profile]) envFiles[profile] = [];
    envFiles[profile].push({ file, keys: config.keys });
  }

  const generatedFiles = [];

  const sharedData = {};
  const sharedFiles = [];

  // 生成共享配置（default profile）
  if (envFiles.default) {
    for (const { file, keys } of envFiles.default) {
      const filePath = path.join(resourcesDir, file);
      const data = extractSensitiveDataV2(filePath, keys, varMappings, 'default');
      Object.assign(sharedData, data);
      sharedFiles.push({ file, keys });
    }
  }

  if (Object.keys(sharedData).length > 0) {
    const keys = Object.keys(sharedData);
    writeEnvFile('.env', sharedData);
    generatedFiles.push({ file: '.env', env: 'default', keys: keys.length, sources: sharedFiles.map(f => f.file) });
  }

  // 按环境生成
  for (const [profile, files] of Object.entries(envFiles)) {
    if (profile === 'default') continue;

    const envData = { ...sharedData };
    const envSources = [];

    for (const { file, keys } of files) {
      const filePath = path.join(resourcesDir, file);
      const data = extractSensitiveDataV2(filePath, keys, varMappings, profile);
      Object.assign(envData, data);
      envSources.push({ file, keys });
    }

    if (Object.keys(envData).length > 0) {
      const envFileName = `.env-${profile}`;
      const keys = Object.keys(envData).filter(k => !Object.keys(sharedData).includes(k));
      const allKeys = Object.keys(envData);
      writeEnvFile(envFileName, envData);
      generatedFiles.push({ file: envFileName, env: profile, keys: allKeys.length, newKeys: keys.length, sources: envSources.map(f => f.file) });
    }
  }

  // 输出详细日志
  console.log('\n--- 生成结果 ---');
  for (const info of generatedFiles) {
    console.log(`  ${info.file}: ${info.keys} 个变量 (环境: ${info.env}, 来源: ${info.sources.join(', ')})${info.newKeys !== undefined ? `, 新增: ${info.newKeys}` : ''}`);
  }
  console.log('');
}

/**
 * 模式 single: 生成统一的 .env 文件
 */
function generateEnvModeSingle(template, resourcesDir, varMappings) {
  console.log('\n=== 模式 single: 生成统一的 .env 文件 ===\n');

  const allData = {};
  const envInfo = {}; // 记录每个环境的键

  for (const [file, config] of Object.entries(template.files)) {
    const filePath = path.join(resourcesDir, file);
    const profile = config.profile || 'default';
    const data = extractSensitiveDataV2(filePath, config.keys, varMappings, profile, true);

    Object.assign(allData, data);
    envInfo[profile] = Object.keys(data);
  }

  if (Object.keys(allData).length > 0) {
    writeEnvFile('.env', allData);
  }

  // 输出详细日志
  console.log('\n--- 生成结果 ---');
  console.log(`  .env: ${Object.keys(allData).length} 个变量`);
  for (const [env, keys] of Object.entries(envInfo)) {
    const sourceFiles = Object.entries(template.files)
      .filter(([, c]) => (c.profile || 'default') === env)
      .map(([f]) => f);
    console.log(`    - ${env}: ${keys.length} 个变量 (来源: ${sourceFiles.join(', ')})`);
  }
  console.log('');
}

module.exports = {
  generateEnvModeMulti,
  generateEnvModeSingle
};
