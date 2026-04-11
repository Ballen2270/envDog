/**
 * .gitignore 服务模块
 * 检测项目 .gitignore 文件，自动追加 envdog 相关的敏感条目
 */
const fs = require('fs');

const ENVDOG_IGNORE_ENTRIES = [
  { comment: '# envdog - 敏感数据目录（包含密钥、备份、manifest）', pattern: '.envdog/' },
  { comment: '# envdog - 生成的环境变量文件', pattern: '.env' },
  { pattern: '.env-*' },
];

/**
 * 确保 .gitignore 中包含 envdog 相关的敏感条目
 * @returns {{ added: string[], existed: string[] }}
 */
function ensureGitignoreEntries() {
  const result = { added: [], existed: [] };

  if (!fs.existsSync('.gitignore')) {
    const lines = ENVDOG_IGNORE_ENTRIES.flatMap(e => {
      const parts = [e.pattern];
      if (e.comment) parts.unshift(e.comment);
      return parts;
    });
    fs.writeFileSync('.gitignore', lines.join('\n') + '\n', 'utf-8');
    result.added = ENVDOG_IGNORE_ENTRIES.map(e => e.pattern);
    return result;
  }

  const content = fs.readFileSync('.gitignore', 'utf-8');
  const existingSet = new Set();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      existingSet.add(trimmed);
    }
  }

  const toAppend = [];
  for (const entry of ENVDOG_IGNORE_ENTRIES) {
    if (!existingSet.has(entry.pattern)) {
      if (entry.comment && !content.includes(entry.comment)) {
        toAppend.push(entry.comment);
      }
      toAppend.push(entry.pattern);
      result.added.push(entry.pattern);
    } else {
      result.existed.push(entry.pattern);
    }
  }

  if (toAppend.length > 0) {
    fs.appendFileSync('.gitignore', '\n' + toAppend.join('\n') + '\n', 'utf-8');
  }

  return result;
}

/**
 * 检查 .gitignore 是否已包含指定条目
 * @param {string} pattern
 * @returns {boolean}
 */
function hasEntry(pattern) {
  if (!fs.existsSync('.gitignore')) return false;

  for (const line of fs.readFileSync('.gitignore', 'utf-8').split('\n')) {
    if (line.trim() === pattern) return true;
  }
  return false;
}

module.exports = {
  ensureGitignoreEntries,
  hasEntry
};
