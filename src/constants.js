/**
 * 常量定义
 */
const ENV_DOG_DIR = '.envdog';
const BACKUP_DIR = '.envdog/env-bak';
const TEMPLATE_DIR = '.envdog/template';
const DEFAULT_TEMPLATE_NAME = 'default';
const DEFAULT_RESOURCES_DIR = './src/main/resources';

const DEFAULT_SENSITIVE_KEYS = [
  'password', 'pwd', 'secret', 'key', 'token',
  'credential', 'username', 'user', 'url'
];

module.exports = {
  ENV_DOG_DIR,
  BACKUP_DIR,
  TEMPLATE_DIR,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_RESOURCES_DIR,
  DEFAULT_SENSITIVE_KEYS
};
