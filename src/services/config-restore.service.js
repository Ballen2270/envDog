/**
 * 配置还原/保护服务模块
 * 负责将 ${VAR_NAME} 占位符与明文值之间的互相转换
 */
const fs = require('fs');
const path = require('path');
const manifestService = require('./manifest.service');
const backupService = require('./backup.service');

/**
 * 还原配置值：将 ${VAR_NAME} 替换为原始明文值
 * @param {string|null} env - 指定环境，null 表示全部
 * @param {string} resourcesDir - 资源目录
 * @param {object} options - 选项 { dryRun: boolean }
 * @returns {object} 操作结果
 */
function restoreConfigValues(env, resourcesDir, options = {}) {
  const manifest = manifestService.loadManifest();
  if (!manifest) {
    throw new Error('manifest.json 不存在，请先运行 "envdog generate --replace"');
  }

  const mappings = manifestService.getMappingsByEnv(env);
  if (mappings.length === 0) {
    return { success: true, message: '没有需要还原的配置' };
  }

  const results = { restored: [], skipped: [], errors: [] };

  // 按文件分组处理
  const fileMappings = {};
  for (const m of mappings) {
    if (!fileMappings[m.file]) fileMappings[m.file] = [];
    fileMappings[m.file].push(m);
  }

  for (const [file, fileMappingsList] of Object.entries(fileMappings)) {
    const filePath = path.join(resourcesDir, file);
    if (!fs.existsSync(filePath)) {
      results.errors.push(`文件不存在: ${file}`);
      continue;
    }

    const ext = path.extname(file).toLowerCase();

    if (options.dryRun) {
      // 预览模式
      console.log(`\n[预览] ${file}:`);
      for (const m of fileMappingsList) {
        console.log(`  ${m.placeholderPattern} → ${m.originalValue}`);
      }
      const willModify = fileMappingsList.some(m => m.originalValue !== m.placeholderPattern);
      if (willModify) {
        results.restored.push(file);
      } else {
        results.skipped.push(file);
      }
      continue;
    }

    try {
      // 备份当前文件
      backupService.backupSingleFile(file, resourcesDir);

      let modified = false;
      if (ext === '.yml' || ext === '.yaml') {
        modified = restoreYamlValues(filePath, fileMappingsList);
      } else if (ext === '.properties') {
        modified = restorePropertiesValues(filePath, fileMappingsList);
      }

      if (modified) {
        console.log(`已还原: ${file}`);
        results.restored.push(file);
      } else {
        console.log(`已跳过: ${file} (无可还原明文)`);
        results.skipped.push(file);
      }
    } catch (e) {
      results.errors.push(`处理 ${file} 失败: ${e.message}`);
    }
  }

  // 更新 manifest 状态
  if (!options.dryRun && results.errors.length === 0) {
    manifestService.updateStatus('restored');
  }

  return results;
}

/**
 * 保护配置值：将明文值替换为 ${VAR_NAME} 占位符
 * @param {string|null} env - 指定环境，null 表示全部
 * @param {string} resourcesDir - 资源目录
 * @param {object} options - 选项 { dryRun: boolean }
 * @returns {object} 操作结果
 */
function protectConfigValues(env, resourcesDir, options = {}) {
  const manifest = manifestService.loadManifest();
  if (!manifest) {
    throw new Error('manifest.json 不存在，请先运行 "envdog generate --replace"');
  }

  const mappings = manifestService.getMappingsByEnv(env);
  if (mappings.length === 0) {
    return { success: true, message: '没有需要保护的配置' };
  }

  const results = { protected: [], skipped: [], errors: [] };

  // 按文件分组处理
  const fileMappings = {};
  for (const m of mappings) {
    if (!fileMappings[m.file]) fileMappings[m.file] = [];
    fileMappings[m.file].push(m);
  }

  for (const [file, fileMappingsList] of Object.entries(fileMappings)) {
    const filePath = path.join(resourcesDir, file);
    if (!fs.existsSync(filePath)) {
      results.errors.push(`文件不存在: ${file}`);
      continue;
    }

    const ext = path.extname(file).toLowerCase();

    if (options.dryRun) {
      // 预览模式
      console.log(`\n[预览] ${file}:`);
      for (const m of fileMappingsList) {
        console.log(`  ${m.originalValue} → ${m.placeholderPattern}`);
      }
      results.protected.push(file);
      continue;
    }

    try {
      if (ext === '.yml' || ext === '.yaml') {
        protectYamlValues(filePath, fileMappingsList);
      } else if (ext === '.properties') {
        protectPropertiesValues(filePath, fileMappingsList);
      }

      console.log(`已保护: ${file}`);
      results.protected.push(file);
    } catch (e) {
      results.errors.push(`处理 ${file} 失败: ${e.message}`);
    }
  }

  // 更新 manifest 状态
  if (!options.dryRun && results.errors.length === 0) {
    manifestService.updateStatus('protected');
  }

  return results;
}

/**
 * 还原 YAML 文件中的值
 */
function restoreYamlValues(filePath, mappings) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const m of mappings) {
    const replaced = replaceYamlPathValue(content, m.keyPath, m.originalValue, {
      shouldReplace: (currentValue) => currentValue !== m.originalValue
    });
    if (replaced.modified) {
      content = replaced.content;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return modified;
}

/**
 * 保护 YAML 文件中的值
 */
function protectYamlValues(filePath, mappings) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const m of mappings) {
    const replaced = replaceYamlPathValue(content, m.keyPath, m.placeholderPattern, {
      shouldReplace: (currentValue) => currentValue !== m.placeholderPattern
    });
    if (replaced.modified) {
      content = replaced.content;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return modified;
}

/**
 * 在 YAML 文本中按 keyPath 精确替换值，尽量保留空行/注释/原始格式
 * @param {string} content
 * @param {string} keyPath
 * @param {string} newValue
 * @param {object} options
 * @param {(currentValue: string) => boolean} options.shouldReplace
 * @returns {{content: string, modified: boolean}}
 */
function replaceYamlPathValue(content, keyPath, newValue, options = {}) {
  const lines = content.split('\n');
  const entries = buildYamlPathIndex(lines);
  const target = entries.find(e => e.path === keyPath);
  if (!target) return { content, modified: false };

  const line = lines[target.lineIndex];
  const match = line.match(/^(\s*(?:-\s*)?[^:#]+:\s*)(.*)$/);
  if (!match) return { content, modified: false };

  const prefix = match[1];
  const tail = match[2];
  const { valuePart, commentPart } = splitYamlValueAndComment(tail);
  const leadingSpaces = (valuePart.match(/^\s*/) || [''])[0];
  const trailingSpaces = (valuePart.match(/\s*$/) || [''])[0];
  const currentToken = valuePart.trim();
  const currentValue = normalizeYamlScalar(currentToken);

  const shouldReplace = options.shouldReplace || (() => true);
  if (!shouldReplace(currentValue)) {
    return { content, modified: false };
  }

  const rendered = renderYamlScalarLike(currentToken, newValue);
  lines[target.lineIndex] = `${prefix}${leadingSpaces}${rendered}${trailingSpaces}${commentPart}`;
  return { content: lines.join('\n'), modified: true };
}

/**
 * 为 YAML 行建立 path 索引（基于缩进层级）
 */
function buildYamlPathIndex(lines) {
  const stack = [];
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseYamlKeyLine(lines[i]);
    if (!parsed) continue;

    while (stack.length > 0 && parsed.indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    stack.push({ key: parsed.key, indent: parsed.indent });
    entries.push({ path: stack.map(s => s.key).join('.'), lineIndex: i });
  }

  return entries;
}

function parseYamlKeyLine(line) {
  const match = line.match(/^(\s*)(?:-\s*)?([^:#][^:]*?)\s*:\s*(.*)$/);
  if (!match) return null;

  const key = stripOuterQuotes(match[2].trim());
  if (!key) return null;

  return {
    indent: match[1].length,
    key: key
  };
}

function splitYamlValueAndComment(valueAndComment) {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < valueAndComment.length; i++) {
    const ch = valueAndComment[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === '#' && !inSingle && !inDouble) {
      return {
        valuePart: valueAndComment.slice(0, i),
        commentPart: valueAndComment.slice(i)
      };
    }
  }

  return { valuePart: valueAndComment, commentPart: '' };
}

function normalizeYamlScalar(token) {
  const t = token.trim();
  if (!t) return '';
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return stripOuterQuotes(t);
  }
  return t;
}

function renderYamlScalarLike(currentToken, rawValue) {
  const t = currentToken.trim();
  if (t.startsWith("'") && t.endsWith("'")) {
    return `'${String(rawValue).replace(/'/g, "''")}'`;
  }
  if (t.startsWith('"') && t.endsWith('"')) {
    return `"${String(rawValue).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return String(rawValue);
}

function stripOuterQuotes(value) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

/**
 * 还原 Properties 文件中的值
 */
function restorePropertiesValues(filePath, mappings) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const m of mappings) {
    // 匹配 key = ${VAR_NAME} 或 key: ${VAR_NAME}
    const regex = new RegExp(`^(${escapeRegExp(m.keyPath.replace(/\\./g, '\\.'))})\\s*[:=]\\s*${escapeRegExp(m.placeholderPattern)}\\s*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `$1=${m.originalValue}`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return modified;
}

/**
 * 保护 Properties 文件中的值
 */
function protectPropertiesValues(filePath, mappings) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  for (const m of mappings) {
    // 匹配 key = value
    const regex = new RegExp(`^(${escapeRegExp(m.keyPath.replace(/\\./g, '\\.'))})\\s*[:=]\\s*(.+?)\\s*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `$1=${m.placeholderPattern}`);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }
  return modified;
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  restoreConfigValues,
  protectConfigValues
};
