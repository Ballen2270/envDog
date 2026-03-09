#!/usr/bin/env node

/**
 * envdog - 配置敏感信息管理工具 CLI
 * 重构版本 - 模块化架构
 */

const { Command } = require('commander');
const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');

// 导入常量
const {
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_RESOURCES_DIR,
  BACKUP_DIR,
  TEMPLATE_DIR
} = require('./src/constants');

// 导入核心模块
const { extractSensitiveDataV2 } = require('./src/services/env-generator.service');

// 导入服务
const templateService = require('./src/services/template.service');
const envGenerator = require('./src/services/env-generator.service');
const backupService = require('./src/services/backup.service');
const configReplacer = require('./src/services/config-replacer.service');
const manifestService = require('./src/services/manifest.service');
const configRestore = require('./src/services/config-restore.service');

const program = new Command();

program
  .name('envdog')
  .description('ENV DOG 配置敏感信息管理工具')
  .version('1.0.0');

// ============================================================
// 命令: generate
// ============================================================
program
  .command('generate')
  .description('生成环境变量文件')
  .option('-m, --mode <mode>', '生成模式: single (单文件) 或 multi (多文件)', 'single')
  .option('-r, --replace', '替换原配置文件中的敏感值')
  .option('-n, --name <name>', '模板名称', DEFAULT_TEMPLATE_NAME)
  .option('-u, --use', '使用已保存的模板（不重新扫描）', false)
  .option('-d, --dir <path>', '资源目录路径', DEFAULT_RESOURCES_DIR)
  .action(async (options) => {
    console.log('\n=== 环境变量生成 ===\n');

    try {
      const resourcesDir = options.dir;
      const templateName = options.name;
      const useExisting = options.use;

      let template;

      // 尝试加载已保存的模板
      if (useExisting) {
        console.log(`使用已保存的模板: ${templateName}`);
        template = templateService.loadNamedTemplate(templateName);
      } else {
        // 检查是否有已保存的模板
        const templates = templateService.listTemplates();
        if (templates.includes(templateName)) {
          const answers = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useExisting',
              message: `模板 "${templateName}" 已存在，是否使用现有模板？`,
              default: true
            }
          ]);
          if (answers.useExisting) {
            template = templateService.loadNamedTemplate(templateName);
          } else {
            // 重新自动发现
            template = await templateService.autoDiscoverAndGenerate(resourcesDir, undefined, templateName);
            if (template) {
              templateService.saveTemplate(templateName, template);
            }
          }
        } else {
          // 自动发现
          template = await templateService.autoDiscoverAndGenerate(resourcesDir, undefined, templateName);
          if (template) {
            templateService.saveTemplate(templateName, template);
          }
        }
      }

      if (!template) {
        console.log('\n操作已取消\n');
        return;
      }

      console.log(`\n使用模板: ${template.name} (v${template.version})`);

      // 备份原始文件（如果启用替换）
      if (options.replace) {
        const allFiles = Object.keys(template.files);
        backupService.backupOriginalFiles(allFiles, resourcesDir);
      }

      // 根据模式生成环境变量文件
      const varMappings = template.varMappings || {};

      if (options.mode === 'single') {
        envGenerator.generateEnvModeSingle(template, resourcesDir, varMappings);
      } else {
        envGenerator.generateEnvModeMulti(template, resourcesDir, varMappings);
      }

      // 替换原配置文件中的敏感值
      if (options.replace) {
        // 先生成明文快照 manifest，再执行 replace，避免原始值被占位符覆盖
        console.log('\n=== 生成 manifest ===\n');
        const manifest = manifestService.createManifest(template, resourcesDir, { mode: options.mode });
        manifestService.saveManifest(manifest);
        console.log('manifest.json 已生成');

        console.log('\n=== 替换配置文件中的敏感值 ===\n');
        configReplacer.replaceConfigValuesV2(template, resourcesDir, varMappings, options.mode);
        console.log('\n配置文件已更新，备份文件已创建');
      }

      console.log('\n=== 完成 ===\n');
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

// ============================================================
// 命令: tui - 交互式 TUI 面板
// ============================================================
program
  .command('tui')
  .description('打开交互式 TUI 面板')
  .action(async () => {
    console.log('\n=== envdog TUI 面板 ===\n');

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作:',
        choices: [
          { name: '1. 生成环境变量文件 (multi - 多文件)', value: 'generate_multi' },
          { name: '2. 生成环境变量文件 (single - 单文件)', value: 'generate_single' },
          { name: '3. 生成并替换配置文件 (multi)', value: 'replace_multi' },
          { name: '4. 生成并替换配置文件 (single)', value: 'replace_single' },
          { name: '5. 清除备份文件', value: 'clear_backups' },
          { name: '6. 退出', value: 'exit' }
        ]
      }
    ]);

    if (answers.action === 'exit') {
      console.log('\n已退出\n');
      return;
    }

    // 加载模板信息
    try {
      const templates = templateService.listTemplates();
      if (templates.length === 0) {
        console.log('请先运行 "envdog generate" 创建模板');
        return;
      }
      const template = templateService.loadNamedTemplate(templates[0]);
      const resourcesDir = DEFAULT_RESOURCES_DIR;

      if (answers.action.startsWith('generate') || answers.action.startsWith('replace')) {
        // 获取可用环境
        const envSet = new Set();
        for (const fileConfig of Object.values(template.files)) {
          envSet.add(fileConfig.profile || 'default');
        }
        const availableEnvs = [...envSet];

        const envAnswers = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'envs',
            message: '选择要处理的环境:',
            choices: [
              { name: '所有环境', value: 'all', checked: true },
              ...availableEnvs.map(e => ({ name: e, value: e }))
            ]
          }
        ]);

        let targetEnvs = envAnswers.envs;
        if (targetEnvs.includes('all')) {
          targetEnvs = availableEnvs;
        }

        const mode = answers.action.includes('single') ? 'single' : 'multi';
        const shouldReplace = answers.action.includes('replace');

        console.log(`\n处理环境: ${targetEnvs.join(', ')}\n`);

        const varMappings = template.varMappings || {};

        // 备份原始文件（如果需要替换）
        if (shouldReplace) {
          const allFiles = Object.keys(template.files);
          backupService.backupOriginalFiles(allFiles, resourcesDir);
        }

        // 处理每个环境
        for (const profile of targetEnvs) {
          // 为当前环境构建模板子集
          const envTemplate = {
            ...template,
            files: {}
          };

          for (const [file, fileConfig] of Object.entries(template.files)) {
            if ((fileConfig.profile || 'default') === profile) {
              envTemplate.files[file] = fileConfig;
            }
          }

          if (mode === 'single') {
            envGenerator.generateEnvModeSingle(envTemplate, resourcesDir, varMappings);
          } else {
            envGenerator.generateEnvModeMulti(envTemplate, resourcesDir, varMappings);
          }

          // 替换配置（如果需要）
          if (shouldReplace) {
            configReplacer.replaceConfigValuesV2(envTemplate, resourcesDir, varMappings, mode);
          }
        }

        console.log('\n=== 完成 ===\n');
      } else if (answers.action === 'clear_backups') {
        backupService.clearBackupsSync();
      }
    } catch (error) {
      if (error.message.includes('不存在')) {
        console.log('请先运行 "envdog generate" 创建模板');
      } else {
        console.error('错误:', error.message);
      }
    }
  });

// ============================================================
// 命令: clear-backups
// ============================================================
program
  .command('clear-backups')
  .description('清除所有备份文件')
  .action(async () => {
    console.log('\n=== 清除备份文件 ===\n');
    await backupService.clearBackupsSync();
  });

// ============================================================
// 命令: restore - 还原明文值
// ============================================================
program
  .command('restore')
  .description('从 .env 文件还原明文值到配置文件')
  .option('-e, --env <env>', '指定环境 (dev, test, pro)')
  .option('-d, --dir <path>', '资源目录路径', DEFAULT_RESOURCES_DIR)
  .option('--dry-run', '预览模式，不实际修改', false)
  .action((options) => {
    console.log('\n=== 还原配置文件 ===\n');

    try {
      const results = configRestore.restoreConfigValues(
        options.env || null,
        options.dir,
        { dryRun: options.dryRun }
      );

      if (results.restored && results.restored.length > 0) {
        console.log(`\n已还原 ${results.restored.length} 个文件`);
      }
      if (results.skipped && results.skipped.length > 0) {
        console.log(`\n跳过 ${results.skipped.length} 个文件（无变更）`);
      }
      if (results.errors && results.errors.length > 0) {
        console.log(`\n错误:`);
        results.errors.forEach(e => console.log(`  - ${e}`));
      }

      console.log('\n=== 完成 ===\n');
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

// ============================================================
// 命令: protect - 重新保护
// ============================================================
program
  .command('protect')
  .description('将配置文件中的明文值重新替换为环境变量占位符')
  .option('-e, --env <env>', '指定环境 (dev, test, pro)')
  .option('-d, --dir <path>', '资源目录路径', DEFAULT_RESOURCES_DIR)
  .option('--dry-run', '预览模式，不实际修改', false)
  .action((options) => {
    console.log('\n=== 保护配置文件 ===\n');

    try {
      const results = configRestore.protectConfigValues(
        options.env || null,
        options.dir,
        { dryRun: options.dryRun }
      );

      if (results.protected && results.protected.length > 0) {
        console.log(`\n已保护 ${results.protected.length} 个文件`);
      }
      if (results.skipped && results.skipped.length > 0) {
        console.log(`\n跳过 ${results.skipped.length} 个文件（无变更）`);
      }
      if (results.errors && results.errors.length > 0) {
        console.log(`\n错误:`);
        results.errors.forEach(e => console.log(`  - ${e}`));
      }

      console.log('\n=== 完成 ===\n');
    } catch (error) {
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

// ============================================================
// 命令: status
// ============================================================
program
  .command('status')
  .description('查看当前状态')
  .action(() => {
    console.log('\n=== envdog 当前状态 ===\n');

    // 模板信息
    const templates = templateService.listTemplates();
    if (templates.length > 0) {
      try {
        const template = templateService.loadNamedTemplate(templates[0]);
        console.log(`模板版本: v${template.version}`);

        // 提取所有环境
        const envSet = new Set();
        for (const fileConfig of Object.values(template.files || {})) {
          envSet.add(fileConfig.profile || 'default');
        }
        console.log(`环境列表: ${[...envSet].join(', ')}`);
      } catch (e) {
        console.log('模板文件格式错误');
      }
    } else {
      console.log('模板文件不存在');
    }

    // 环境变量文件
    console.log('\n已生成的文件:');
    const envFiles = fs.readdirSync('.').filter(f => f.match(/^\.env(-.*)?$/) && f !== BACKUP_DIR);
    if (envFiles.length > 0) {
      envFiles.forEach(f => console.log(`  - ${f}`));
    } else {
      console.log('  (无)');
    }

    // 备份文件
    const backupFiles = backupService.listBackupFiles();
    console.log(`\n备份文件: ${backupFiles.length} 个 (位于 ${BACKUP_DIR}/)`);
    if (backupFiles.length > 0) {
      backupFiles.slice(0, 5).forEach(f => console.log(`  - ${path.relative(BACKUP_DIR, f)}`));
      if (backupFiles.length > 5) {
        console.log(`  ... 还有 ${backupFiles.length - 5} 个`);
      }
    }

    // Manifest 状态
    const manifest = manifestService.loadManifest();
    if (manifest) {
      console.log(`\n配置文件状态: ${manifest.status}`);
    }

    console.log('');
  });

// ============================================================
// 命令: template
// ============================================================
const templateCmd = program
  .command('template')
  .description('模板管理');

// template list
templateCmd
  .command('list')
  .description('列出所有模板')
  .action(() => {
    const templates = templateService.listTemplates();
    console.log('\n=== 可用模板 ===\n');
    if (templates.length === 0) {
      console.log('(无)');
    } else {
      templates.forEach(t => console.log(`  - ${t}`));
    }
    console.log('');
  });

// template delete
templateCmd
  .command('delete <name>')
  .description('删除模板')
  .action(async (name) => {
    const templatePath = path.join(TEMPLATE_DIR, `${name}.json`);
    if (!fs.existsSync(templatePath)) {
      console.error(`错误: 模板不存在: ${name}`);
      process.exit(1);
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'input',
        name: 'confirmed',
        message: `确定要删除模板 "${name}" 吗？(输入 "yes" 确认): `,
        default: 'no'
      }
    ]);

    if (confirmed.trim().toLowerCase() === 'yes') {
      fs.unlinkSync(templatePath);
      console.log(`已删除模板: ${name}`);
    } else {
      console.log('已取消删除操作');
    }
    console.log('');
  });

program.parse();
