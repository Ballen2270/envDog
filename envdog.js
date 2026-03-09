#!/usr/bin/env node

/**
 * envdog - 配置敏感信息管理工具 CLI
 * 重构版本 - 模块化架构
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const { promptWithEscCancel, isEscCancelError } = require('./src/core/prompt');

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

async function runGenerateWorkflow(options) {
  console.log('\n=== 环境变量生成 ===\n');

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
      const answers = await promptWithEscCancel([
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
}

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
    try {
      await runGenerateWorkflow(options);
    } catch (error) {
      if (isEscCancelError(error)) {
        console.log('\n操作已取消\n');
        return;
      }
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
    try {
      console.log('\n=== envdog TUI 面板 ===\n');

      const answers = await promptWithEscCancel([
        {
          type: 'list',
          name: 'action',
          message: '请选择操作:',
          choices: [
            { name: '1. generate', value: 'generate' },
            { name: '2. restore', value: 'restore' },
            { name: '3. protect', value: 'protect' },
            { name: '4. status', value: 'status' },
            { name: '5. clear-backups', value: 'clear_backups' },
            { name: '6. template list', value: 'template_list' },
            { name: '7. template delete', value: 'template_delete' },
            { name: '8. 退出', value: 'exit' }
          ]
        }
      ]);

      if (answers.action === 'exit') {
        console.log('\n已退出\n');
        return;
      }

      if (answers.action === 'generate') {
        const generateAnswers = await promptWithEscCancel([
          {
            type: 'list',
            name: 'mode',
            message: '选择生成模式:',
            choices: [
              { name: 'single (单文件)', value: 'single' },
              { name: 'multi (多文件)', value: 'multi' }
            ],
            default: 'single'
          },
          {
            type: 'confirm',
            name: 'replace',
            message: '是否替换原配置文件中的敏感值 (--replace)？',
            default: false
          },
          {
            type: 'confirm',
            name: 'use',
            message: '是否使用已保存模板 (--use)？',
            default: false
          },
          {
            type: 'input',
            name: 'name',
            message: '模板名称 (--name):',
            default: DEFAULT_TEMPLATE_NAME
          },
          {
            type: 'input',
            name: 'dir',
            message: '资源目录 (--dir):',
            default: DEFAULT_RESOURCES_DIR
          }
        ]);

        await runGenerateWorkflow({
          mode: generateAnswers.mode,
          replace: generateAnswers.replace,
          use: generateAnswers.use,
          name: (generateAnswers.name || DEFAULT_TEMPLATE_NAME).trim() || DEFAULT_TEMPLATE_NAME,
          dir: (generateAnswers.dir || DEFAULT_RESOURCES_DIR).trim() || DEFAULT_RESOURCES_DIR
        });
        return;
      }

      if (answers.action === 'restore') {
        const restoreAnswers = await promptWithEscCancel([
          {
            type: 'input',
            name: 'env',
            message: '环境 (--env，留空表示全部):',
            default: ''
          },
          {
            type: 'input',
            name: 'dir',
            message: '资源目录 (--dir):',
            default: DEFAULT_RESOURCES_DIR
          },
          {
            type: 'confirm',
            name: 'dryRun',
            message: '是否预览模式 (--dry-run)？',
            default: false
          }
        ]);

        console.log('\n=== 还原配置文件 ===\n');
        const results = configRestore.restoreConfigValues(
          (restoreAnswers.env || '').trim() || null,
          (restoreAnswers.dir || DEFAULT_RESOURCES_DIR).trim() || DEFAULT_RESOURCES_DIR,
          { dryRun: restoreAnswers.dryRun }
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
        return;
      }

      if (answers.action === 'protect') {
        const protectAnswers = await promptWithEscCancel([
          {
            type: 'input',
            name: 'env',
            message: '环境 (--env，留空表示全部):',
            default: ''
          },
          {
            type: 'input',
            name: 'dir',
            message: '资源目录 (--dir):',
            default: DEFAULT_RESOURCES_DIR
          },
          {
            type: 'confirm',
            name: 'dryRun',
            message: '是否预览模式 (--dry-run)？',
            default: false
          }
        ]);

        console.log('\n=== 保护配置文件 ===\n');
        const results = configRestore.protectConfigValues(
          (protectAnswers.env || '').trim() || null,
          (protectAnswers.dir || DEFAULT_RESOURCES_DIR).trim() || DEFAULT_RESOURCES_DIR,
          { dryRun: protectAnswers.dryRun }
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
        return;
      }

      if (answers.action === 'status') {
        console.log('\n=== envdog 当前状态 ===\n');
        const templates = templateService.listTemplates();
        if (templates.length > 0) {
          try {
            const template = templateService.loadNamedTemplate(templates[0]);
            console.log(`模板版本: v${template.version}`);
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

        console.log('\n已生成的文件:');
        const envFiles = fs.readdirSync('.').filter(f => f.match(/^\.env(-.*)?$/) && f !== BACKUP_DIR);
        if (envFiles.length > 0) {
          envFiles.forEach(f => console.log(`  - ${f}`));
        } else {
          console.log('  (无)');
        }

        const backupFiles = backupService.listBackupFiles();
        console.log(`\n备份文件: ${backupFiles.length} 个 (位于 ${BACKUP_DIR}/)`);
        if (backupFiles.length > 0) {
          backupFiles.slice(0, 5).forEach(f => console.log(`  - ${path.relative(BACKUP_DIR, f)}`));
          if (backupFiles.length > 5) {
            console.log(`  ... 还有 ${backupFiles.length - 5} 个`);
          }
        }

        const manifest = manifestService.loadManifest();
        if (manifest) {
          console.log(`\n配置文件状态: ${manifest.status}`);
        }
        console.log('');
        return;
      }

      if (answers.action === 'clear_backups') {
        console.log('\n=== 清除备份文件 ===\n');
        await backupService.clearBackupsSync();
        return;
      }

      if (answers.action === 'template_list') {
        const templates = templateService.listTemplates();
        console.log('\n=== 可用模板 ===\n');
        if (templates.length === 0) {
          console.log('(无)');
        } else {
          templates.forEach(t => console.log(`  - ${t}`));
        }
        console.log('');
        return;
      }

      if (answers.action === 'template_delete') {
        const templates = templateService.listTemplates();
        if (templates.length === 0) {
          console.log('\n=== 可用模板 ===\n');
          console.log('(无)\n');
          return;
        }

        const deleteAnswers = await promptWithEscCancel([
          {
            type: 'list',
            name: 'name',
            message: '选择要删除的模板:',
            choices: templates
          },
          {
            type: 'input',
            name: 'confirmed',
            message: '输入 "yes" 确认删除:',
            default: 'no'
          }
        ]);

        if ((deleteAnswers.confirmed || '').trim().toLowerCase() === 'yes') {
          const templatePath = path.join(TEMPLATE_DIR, `${deleteAnswers.name}.json`);
          if (!fs.existsSync(templatePath)) {
            console.error(`错误: 模板不存在: ${deleteAnswers.name}`);
            return;
          }
          fs.unlinkSync(templatePath);
          console.log(`已删除模板: ${deleteAnswers.name}\n`);
        } else {
          console.log('已取消删除操作\n');
        }
        return;
      }

      console.log('未知操作');
    } catch (error) {
      if (isEscCancelError(error)) {
        console.log('\n操作已取消\n');
        return;
      }
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
    try {
      const templatePath = path.join(TEMPLATE_DIR, `${name}.json`);
      if (!fs.existsSync(templatePath)) {
        console.error(`错误: 模板不存在: ${name}`);
        process.exit(1);
      }

      const { confirmed } = await promptWithEscCancel([
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
    } catch (error) {
      if (isEscCancelError(error)) {
        console.log('\n操作已取消\n');
        return;
      }
      console.error('错误:', error.message);
      process.exit(1);
    }
  });

program.parse();
