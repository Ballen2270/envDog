/**
 * 执行命令服务模块
 * 安全地将 .env 变量加载到 shell 环境并执行指定命令
 */
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * 解析 .env 文件
 * @param {string} filePath - .env 文件路径
 * @returns {object} 键值对对象
 */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`.env 文件不存在: ${filePath}\n请先运行 "envdog generate" 生成环境变量文件`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const result = {};
  let hasValidVar = false;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // 跳过注释和空行
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // 匹配 KEY=VALUE 格式
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2];

      // 跳过空值
      if (!value || value.trim() === '') {
        continue;
      }

      // 移除值周围的引号（如果有）
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      result[key] = value;
      hasValidVar = true;
    }
  }

  if (!hasValidVar) {
    throw new Error(`.env 文件为空，没有任何有效变量\n请先运行 "envdog generate" 生成环境变量文件`);
  }

  return result;
}

/**
 * 执行命令，临时加载 .env 变量
 * @param {string} command - 要执行的命令
 * @param {string} envFilePath - .env 文件路径
 * @param {object} options - 选项
 * @param {boolean} options.verbose - 是否输出变量列表（脱敏）
 * @returns {Promise<number>} 退出码
 */
async function execWithEnv(command, envFilePath = '.env', options = {}) {
  validateCommandSafety(command);
  console.log(`\n[exec] 加载环境变量文件: ${envFilePath}`);

  // 解析 .env 文件
  const envVars = parseEnvFile(envFilePath);

  if (Object.keys(envVars).length === 0) {
    throw new Error(`未找到环境变量: ${envFilePath}`);
  }

  const keys = Object.keys(envVars);
  console.log(`[exec] 已加载 ${keys.length} 个环境变量`);
  if (options.verbose) {
    for (const key of keys) {
      const value = envVars[key];
      // 脱敏显示：保留前后各2个字符，中间用***替代（如果值长度大于4）
      const displayValue = value.length > 4 ? value.slice(0, 2) + '***' + value.slice(-2) : '***';
      console.log(`[exec]   ${key}=${displayValue}`);
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...envVars }
    });

    child.on('close', (code) => {
      console.log(`\n[exec] 命令执行完成，退出码: ${code}`);
      resolve(code);
    });

    child.on('error', (err) => {
      console.log(`\n[exec] 命令执行出错: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * 预览模式：打印将要执行的命令（不实际执行）
 * @param {string} command - 要执行的命令
 * @param {string} envFilePath - .env 文件路径
 * @param {object} options - 选项
 * @param {boolean} options.verbose - 是否输出变量列表（脱敏）
 */
function execWithEnvDryRun(command, envFilePath = '.env', options = {}) {
  validateCommandSafety(command);
  const envVars = parseEnvFile(envFilePath);

  if (Object.keys(envVars).length === 0) {
    console.log(`未找到环境变量: ${envFilePath}`);
    return;
  }

  console.log('\n=== 预览 ===\n');
  const keys = Object.keys(envVars);
  console.log(`将注入环境变量数量: ${keys.length}`);
  if (options.verbose) {
    console.log('变量列表（脱敏）:');
    for (const key of keys) {
      const value = envVars[key];
      const displayValue = value.length > 4 ? value.slice(0, 2) + '***' + value.slice(-2) : '***';
      console.log(`  ${key}=${displayValue}`);
    }
  }
  console.log(`将执行命令: ${command}`);
  console.log('');
}

module.exports = {
  parseEnvFile,
  execWithEnv,
  execWithEnvDryRun
};

function validateCommandSafety(command) {
  const cmd = (command || '').trim();
  if (!cmd) {
    throw new Error('命令为空，无法执行');
  }

  const blocked = [
    /\brm\b/i,
    /\brmdir\b/i,
    /\bchmod\b/i,
    /\bchown\b/i,
    /\bsudo\b/i,
    /\bmkfs\b/i,
    /\bdd\b/i,
    /\bkill\b/i,
    /\bpkill\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i
  ];

  if (blocked.some((re) => re.test(cmd))) {
    throw new Error('命令包含潜在危险操作，已阻止执行');
  }

  const dangerousChars = /[;&|]/;
  if (dangerousChars.test(cmd)) {
    throw new Error('命令包含潜在危险的链式符号，已阻止执行');
  }
}
