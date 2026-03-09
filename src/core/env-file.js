/**
 * 环境变量文件模块 - 统一文件写出
 */
const fs = require('fs');

/**
 * 写出环境变量文件
 * @param {string} fileName - 文件名 (如 .env, .env-dev)
 * @param {object} data - 键值对对象
 * @param {object} options - 选项
 * @param {string} options.comment - 顶部注释
 */
function writeEnvFile(fileName, data, options = {}) {
  if (Object.keys(data).length === 0) return;

  let content = '';

  // 添加顶部注释
  if (options.comment) {
    content = `# ${options.comment}\n\n`;
  }

  content += Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  fs.writeFileSync(fileName, content, 'utf-8');
}

module.exports = {
  writeEnvFile
};
