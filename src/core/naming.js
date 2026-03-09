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

/**
 * 统一解析变量名，优先使用模板映射，缺失时按模式兜底
 * @param {string} configKey
 * @param {object} envVarByProfile - 形如 { default: 'DATASOURCE_URL', dev: 'DEV_DATASOURCE_URL' }
 * @param {string} profile
 * @param {string} mode - single 或 multi
 * @returns {string}
 */
function resolveVarName(configKey, envVarByProfile, profile, mode) {
  const mapped = envVarByProfile?.[profile];
  if (mapped) return mapped;

  // default 环境兜底保持无前缀，避免出现 DEFAULT_*
  if (profile === 'default') {
    return generateVarName(configKey, profile, 'single');
  }

  // single 模式下非 default 需要显式 profile 前缀（与 replace 占位符保持一致）
  if (mode === 'single') {
    return generateVarName(configKey, profile, 'single', profile.toUpperCase());
  }

  return generateVarName(configKey, profile, 'multi');
}

module.exports = {
  generateVarName,
  resolveVarName
};
