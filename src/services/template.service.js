/**
 * 模板服务模块
 */
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const { TEMPLATE_DIR, DEFAULT_TEMPLATE_NAME, DEFAULT_SENSITIVE_KEYS } = require('../constants');
const { scanConfigFiles, extractProfileFromFileName, extractSensitiveKeysFromFile } = require('../core/file-discovery');
const configParser = require('../core/config-parser');
const { generateVarName } = require('../core/naming');

/**
 * 保存模板
 */
function saveTemplate(name, templateData) {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  }

  const templatePath = path.join(TEMPLATE_DIR, `${name}.json`);
  fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2), 'utf-8');
  console.log(`模板已保存: ${templatePath}`);
  return templatePath;
}

/**
 * 加载模板
 */
function loadNamedTemplate(name) {
  const templatePath = path.join(TEMPLATE_DIR, `${name}.json`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`模板不存在: ${name}`);
  }
  return JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
}

/**
 * 列出所有模板
 */
function listTemplates() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    return [];
  }
  return fs.readdirSync(TEMPLATE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * 交互式选择配置文件
 */
async function promptUserSelectFiles(files) {
  const choices = files.map(f => ({
    name: f,
    value: f,
    checked: true
  }));

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFiles',
      message: '选择要处理的配置文件:',
      choices: choices
    }
  ]);

  return answers.selectedFiles;
}

/**
 * 交互式确认敏感字段
 */
async function promptUserConfirmKeys(fileKeysMap, sensitiveKeys) {
  const allKeys = [...new Set(
    Object.values(fileKeysMap).flat()
  )].sort();

  const choices = allKeys.map(key => ({
    name: key,
    value: key,
    checked: true
  }));

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedKeys',
      message: '确认要提取的敏感字段:',
      choices: choices
    }
  ]);

  return answers.selectedKeys;
}

/**
 * 自动发现并生成模板
 */
async function autoDiscoverAndGenerate(resourcesDir, sensitiveKeys = DEFAULT_SENSITIVE_KEYS, templateName = DEFAULT_TEMPLATE_NAME) {
  console.log('\n=== 自动发现配置文件 ===\n');

  // 扫描配置文件
  const allFiles = scanConfigFiles(resourcesDir);
  if (allFiles.length === 0) {
    console.log('未找到任何配置文件');
    return null;
  }

  console.log(`找到 ${allFiles.length} 个配置文件:`);
  allFiles.forEach(f => console.log(`  - ${f}`));

  // 用户选择
  const selectedFiles = await promptUserSelectFiles(allFiles);
  if (selectedFiles.length === 0) {
    console.log('未选择任何文件');
    return null;
  }

  console.log(`\n已选择 ${selectedFiles.length} 个文件`);

  // 提取敏感字段
  const fileKeysMap = {};
  for (const file of selectedFiles) {
    const filePath = path.join(resourcesDir, file);
    const keys = extractSensitiveKeysFromFile(filePath, sensitiveKeys, configParser);
    if (keys.length > 0) {
      fileKeysMap[file] = keys;
    }
  }

  if (Object.keys(fileKeysMap).length === 0) {
    console.log('未找到任何敏感字段');
    return null;
  }

  console.log('\n发现以下敏感字段:');
  for (const [file, keys] of Object.entries(fileKeysMap)) {
    console.log(`  ${file}: ${keys.join(', ')}`);
  }

  // 用户确认敏感字段
  const confirmedKeys = await promptUserConfirmKeys(fileKeysMap, sensitiveKeys);
  if (confirmedKeys.length === 0) {
    console.log('未确认任何敏感字段');
    return null;
  }

  // 生成模板数据
  const profiles = [...new Set(selectedFiles.map(f => extractProfileFromFileName(f) || 'default'))];

  const templateData = {
    name: templateName,
    version: '2.0',
    sensitiveKeys: sensitiveKeys,
    generatedAt: new Date().toISOString(),
    files: {},
    varMappings: {}
  };

  // 按文件设置
  for (const file of selectedFiles) {
    const profile = extractProfileFromFileName(file) || 'default';
    const fileKeys = fileKeysMap[file] || [];

    templateData.files[file] = {
      profile: profile,
      keys: fileKeys.filter(k => confirmedKeys.includes(k))
    };
  }

  // 生成变量映射
  for (const key of confirmedKeys) {
    templateData.varMappings[key] = {};
    for (const profile of profiles) {
      templateData.varMappings[key][profile] = generateVarName(key, profile, 'multi');
    }
  }

  return templateData;
}

module.exports = {
  saveTemplate,
  loadNamedTemplate,
  listTemplates,
  autoDiscoverAndGenerate
};
