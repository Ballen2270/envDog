/**
 * 命名模块 - 环境变量名生成
 */

/**
 * 生成环境变量名
 * @param {string} configKey - 配置键 (如 spring.datasource.url)
 * @param {string} profile - 环境标识 (如 dev, test, pro)
 * @param {string} mode - 模式: single 或 multi
 * @param {string} prefix - 前缀
 * @returns {string} 环境变量名
 */
function generateVarName(configKey, profile, mode, prefix = '') {
  // 简化 key: spring.datasource.url -> DATASOURCE_URL
  const shortKey = configKey.split('.').slice(-2).join('_').toUpperCase();

  if (mode === 'single') {
    return prefix ? `${prefix}_${shortKey}` : shortKey;
  }

  const profilePrefix = profile.toUpperCase();
  return `${profilePrefix}_${shortKey}`;
}

module.exports = {
  generateVarName
};
