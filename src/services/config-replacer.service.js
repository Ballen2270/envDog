/**
 * 配置替换服务模块
 */
const fs = require('fs');
const path = require('path');
const { parseYamlDocument, getScalarSnapshot, setScalarValue, stringifyDocument } = require('../core/yaml-doc');
const { resolveVarName } = require('../core/naming');

/**
 * 替换配置文件中的敏感值
 */
function replaceConfigValuesV2(template, resourcesDir, varMappings, mode) {
  for (const file of Object.keys(template.files)) {
    const filePath = path.join(resourcesDir, file);
    if (!fs.existsSync(filePath)) continue;

    const ext = path.extname(file).toLowerCase();
    const profile = template.files?.[file]?.profile || 'default';

    if (ext === '.yml' || ext === '.yaml') {
      replaceYamlValues(filePath, varMappings, profile, mode);
    } else if (ext === '.properties') {
      replacePropertiesValues(filePath, varMappings, profile, mode);
    }
  }
}

/**
 * 替换 YAML 文件中的敏感值
 */
function replaceYamlValues(filePath, varMappings, profile, mode) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = parseYamlDocument(content);

  let modified = false;
  for (const [configKey, envVar] of Object.entries(varMappings)) {
    const varName = resolveVarName(configKey, envVar, profile, mode);
    const placeholder = `\${${varName}}`;
    const snapshot = getScalarSnapshot(doc, configKey);
    if (snapshot && snapshot.value !== placeholder) {
      setScalarValue(doc, configKey, placeholder);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, stringifyDocument(doc), 'utf-8');
    console.log(`已替换: ${path.basename(filePath)}`);
  }
}

/**
 * 替换 Properties 文件中的敏感值
 */
function replacePropertiesValues(filePath, varMappings, profile, mode) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const [configKey, envVar] of Object.entries(varMappings)) {
    const regex = new RegExp(`^(${configKey.replace(/\./g, '\\.')})\\s*=\\s*(.+)$`, 'm');
    if (regex.test(content)) {
      const varName = resolveVarName(configKey, envVar, profile, mode);
      content = content.replace(regex, `$1=\${${varName}}`);
      console.log(`已替换: ${path.basename(filePath)} 中的 ${configKey}`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

module.exports = {
  replaceConfigValuesV2
};
