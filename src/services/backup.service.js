/**
 * 备份服务模块
 */
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const { BACKUP_DIR } = require('../constants');

function getTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * 递归获取所有备份文件
 */
function getAllBackupFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllBackupFiles(fullPath));
    } else if (/\.bak$/.test(item)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * 备份原始文件
 */
function backupOriginalFiles(files, resourcesDir) {
  const timestamp = getTimestamp();

  // 创建备份目录（如果不存在）
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  for (const file of files) {
    const filePath = path.join(resourcesDir, file);
    if (fs.existsSync(filePath)) {
      // 计算相对路径并创建对应的备份子目录
      const relativePath = path.dirname(file);
      const backupSubDir = path.join(BACKUP_DIR, relativePath);
      if (!fs.existsSync(backupSubDir)) {
        fs.mkdirSync(backupSubDir, { recursive: true });
      }

      const backupPath = path.join(backupSubDir, `${path.basename(file)}.${timestamp}.bak`);
      fs.copyFileSync(filePath, backupPath);
      console.log(`已备份: ${file} -> ${path.join(BACKUP_DIR, file)}.${timestamp}.bak`);
    }
  }
}

/**
 * 备份单个文件
 */
function backupSingleFile(file, resourcesDir) {
  const timestamp = getTimestamp();
  const filePath = path.join(resourcesDir, file);

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  if (fs.existsSync(filePath)) {
    const backupPath = path.join(BACKUP_DIR, `${file}.restore-${timestamp}.bak`);
    fs.copyFileSync(filePath, backupPath);
  }
}

/**
 * 清理备份目录（同步版本，用于 CLI 直接调用）
 */
function clearBackupsSync() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('没有找到备份文件');
    return;
  }

  const backupFiles = getAllBackupFiles(BACKUP_DIR);
  if (backupFiles.length === 0) {
    console.log('没有找到备份文件');
    return;
  }

  console.log(`\n找到 ${backupFiles.length} 个备份文件:\n`);
  backupFiles.forEach(f => console.log(`  - ${path.relative(BACKUP_DIR, f)}`));

  // 同步确认版本
  return new Promise(async (resolve) => {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'input',
        name: 'confirmed',
        message: '\n确定要删除所有备份文件吗？(输入 "yes" 确认): ',
        default: 'no'
      }
    ]);

    if (confirmed.trim().toLowerCase() === 'yes') {
      // 删除备份文件
      for (const f of backupFiles) {
        fs.unlinkSync(f);
      }
      // 删除空的子目录
      cleanEmptyDirs(BACKUP_DIR);
      console.log(`\n已删除 ${backupFiles.length} 个备份文件`);
      resolve(true);
    } else {
      console.log('\n已取消删除操作');
      resolve(false);
    }
  });
}

/**
 * 清理空目录
 */
function cleanEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanEmptyDirs(fullPath);
    }
  }
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

/**
 * 获取备份文件列表
 */
function listBackupFiles() {
  return getAllBackupFiles(BACKUP_DIR);
}

module.exports = {
  getAllBackupFiles,
  backupOriginalFiles,
  backupSingleFile,
  clearBackupsSync,
  listBackupFiles
};
