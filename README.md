# envdog - Spring 配置敏感信息管理工具

从 Spring 配置文件中提取敏感信息并生成环境变量文件的 CLI 工具。

## 功能特性

- 支持 YAML (.yml/.yaml) 和 Properties 配置文件
- 两种生成模式：single（单文件）/ multi（多文件）
- 自动发现配置文件，扫描 resources 目录识别敏感字段
- 模板管理，保存和复用配置模板
- 自动备份原配置文件（带时间戳）
- 配置还原/保护，提交代码时临时还原明文值，提交后重新保护
- **AES-256-GCM 加密** - manifest 中的敏感值自动加密存储，密钥本地管理
- 自动维护 `.gitignore`，防止敏感文件被提交
- 安全加载环境变量执行命令（`envdog exec`），解决 `source .env` 特殊字符报错
- 交互式 TUI 面板
- 密钥导入/导出，支持跨机器迁移

---

## 快速开始

### 1. 安装

```bash
npm install
```

### 2. 链接命令（可选）

```bash
npm link
```

之后可以全局使用 `envdog` 命令。

### 3. 基本使用

```bash
# 方式一：使用 envdog 命令（需先运行 npm link）
envdog generate

# 方式二：直接运行
node envdog.js generate
```

---

## 命令详解

### envdog generate

生成环境变量文件。

```bash
envdog generate [options]
```

**选项：**

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--mode <mode>` | `-m` | 生成模式：single 或 multi | single |
| `--replace` | `-r` | 替换原配置文件中的敏感值为占位符 | false |
| `--name <name>` | `-n` | 模板名称 | default |
| `--use` | `-u` | 使用已保存的模板（不重新扫描） | false |
| `--dir <path>` | `-d` | 资源目录路径 | ./src/main/resources |

**示例：**

```bash
# 生成模式 single（默认）- 统一文件
envdog generate

# 生成模式 multi - 每个环境独立文件
envdog generate --mode multi

# 生成并替换配置文件（自动备份 + 生成加密 manifest）
envdog generate --replace

# 使用已保存的模板
envdog generate --use

# 指定资源目录
envdog generate --dir ./resources
```

---

### envdog tui

打开交互式 TUI 面板，无需记忆命令参数。

```bash
envdog tui
```

提供 generate、restore、protect、status、clear-backups、template 管理、退出共 8 个操作选项。

---

### envdog restore

根据 `manifest.json` 中记录的映射，将占位符还原为明文值。

```bash
envdog restore [options]
```

**选项：**

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--env <env>` | `-e` | 指定环境（dev/test/prod） | 全部环境 |
| `--file <file>` | `-f` | 指定文件（如 application-dev.yml） | - |
| `--dir <path>` | `-d` | 资源目录路径 | ./src/main/resources |
| `--dry-run` | - | 预览模式，不实际修改 | false |

> `--env` 和 `--file` 不能同时使用。

**示例：**

```bash
# 还原所有环境
envdog restore

# 仅还原 dev 环境
envdog restore --env dev

# 指定文件还原（自动从文件名解析 profile）
envdog restore --file application-dev.yml

# 预览还原效果
envdog restore --dry-run
```

---

### envdog protect

将配置文件中的明文值重新替换为环境变量占位符。

```bash
envdog protect [options]
```

选项与 `restore` 相同。

**示例：**

```bash
envdog protect --env dev
envdog protect --file application-prod.yml
envdog protect --dry-run
```

---

### envdog status

查看当前状态：模板信息、已生成的 .env 文件、备份文件数量、manifest 状态、密钥状态。

```bash
envdog status
```

---

### envdog clear-backups

清除 `.envdog/env-bak` 目录下的所有备份文件。

```bash
envdog clear-backups
```

---

### envdog exec

安全加载 `.env` 变量并执行命令。解决 `source .env` 时特殊字符（如 `&`）报错的问题。

```bash
envdog exec [options] -- <command>
```

**选项：**

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--env <env>` | `-e` | 指定环境 | - |
| `--dir <path>` | `-d` | 资源目录路径 | ./src/main/resources |

**工作原理：**

1. 读取 `.env` 文件
2. 将变量注入子进程环境（不生成临时脚本）
3. 执行用户命令
4. 内置安全过滤：拦截常见危险命令及 `; & |` 链式符号

**示例：**

```bash
# 替代 source .env（避免特殊字符报错）
envdog exec -- mvn mybatis-generator:generate

# 指定环境
envdog exec -e .env-dev -- mvn spring-boot:run
```

---

### envdog crypto-key

管理加解密密钥，支持跨机器迁移。

```bash
envdog crypto-key [options]
```

**选项：**

| 选项 | 说明 |
|------|------|
| `--export` | 导出当前密钥（64 位十六进制字符串） |
| `--import <key>` | 导入密钥 |
| `--status` | 查看密钥状态 |

**示例：**

```bash
# 查看密钥状态
envdog crypto-key --status

# 导出密钥（用于跨机器迁移）
envdog crypto-key --export

# 在新机器上导入密钥
envdog crypto-key --import <64位hex字符串>
```

> 密钥文件存储在 `.envdog/.master-key`，权限 600。首次使用加密功能时自动生成。

---

## 加密机制

envdog 使用 **AES-256-GCM** 对 `manifest.json` 中的敏感值进行加密：

| 项目 | 说明 |
|------|------|
| 算法 | AES-256-GCM（认证加密） |
| 密钥 | 256-bit，自动生成，存储在 `.envdog/.master-key` |
| 格式 | `envdog:v1:<iv_hex>:<authTag_hex>:<ciphertext_base64>` |
| 特性 | 每次加密使用随机 IV，相同明文产生不同密文 |
| 防篡改 | GCM 模式自带认证标签，篡改密文会解密失败 |

**数据流：**

```
明文值 → encrypt() → envdog:v1:xx:xx:xx（写入 manifest.json）
manifest.json → loadManifest() → decrypt() → 还原明文值
```

---

## 配置还原与保护工作流

### 典型工作流

```bash
# 1. 首次使用：生成环境变量并替换配置文件
envdog generate --replace
# → 自动备份、生成加密 manifest、替换为占位符

# 2. 提交代码前：还原明文值
envdog restore --env dev

# 3. 运行测试/启动应用
./mvnw spring-boot:run

# 4. 提交代码
git add . && git commit -m "feat: add new feature"

# 5. 提交完成后：重新保护
envdog protect --env dev

# 6. 查看状态
envdog status
```

### Manifest 机制

`manifest.json` 记录替换映射关系，确保还原和保护的精确性与可逆性：

- **自动生成**：`generate --replace` 时自动创建
- **自动加密**：保存时 `originalValue` 自动加密，加载时自动解密
- **状态跟踪**：记录当前是 "protected" 还是 "restored"
- **精确替换**：基于 keyPath 而非值匹配，避免误替换

---

## 配置模板

模板保存在 `.envdog/template/` 目录下（v2.0 格式）：

```json
{
  "name": "default",
  "version": "2.0",
  "sensitiveKeys": ["password", "pwd", "secret", "key", "token", "credential", "username", "user", "url", "host"],
  "generatedAt": "2026-03-09T10:00:00.000Z",
  "files": {
    "application.yml": {
      "profile": "default",
      "keys": ["spring.datasource.url", "spring.datasource.username", "spring.datasource.password"]
    },
    "application-dev.yml": {
      "profile": "dev",
      "keys": ["spring.datasource.url", "spring.datasource.username", "spring.datasource.password"]
    }
  },
  "varMappings": {
    "spring.datasource.url": {
      "default": "DATASOURCE_URL",
      "dev": "DEV_DATASOURCE_URL"
    }
  }
}
```

### 模板字段说明

| 字段 | 说明 |
|------|------|
| `name` | 模板名称 |
| `version` | 模板版本号 (2.0) |
| `sensitiveKeys` | 敏感键关键词列表 |
| `generatedAt` | 生成时间 |
| `files` | 配置文件及其敏感键 |
| `files[].profile` | 环境标识 |
| `files[].keys` | 该文件需要提取的敏感键列表 |
| `varMappings` | 配置键到环境变量名的映射（按环境） |

---

## 两种生成模式

### 模式 single（默认）

所有环境生成到同一个 `.env` 文件，使用环境前缀区分。

```bash
envdog generate
```

输出文件 `.env`：

```bash
# default 环境
DATASOURCE_URL=jdbc:mysql://localhost:3306/mydb
DATASOURCE_USERNAME=admin
DATASOURCE_PASSWORD=secret

# dev 环境（DEV_ 前缀）
DEV_DATASOURCE_URL=jdbc:mysql://dev-server:3306/mydb
DEV_DATASOURCE_USERNAME=dev_admin
DEV_DATASOURCE_PASSWORD=dev_secret
```

### 模式 multi

每个环境生成独立的 `.env-{env}` 文件。

```bash
envdog generate --mode multi
```

输出文件：

```
.env          # default 共享配置
.env-dev      # 开发环境（包含共享 + dev 特有）
.env-prod     # 生产环境（包含共享 + prod 特有）
```

---

## 配置文件替换

使用 `--replace` 选项：

1. 自动维护 `.gitignore`（添加 `.envdog/`、`.env`、`.env-*`）
2. 备份原配置文件到 `.envdog/env-bak`（带时间戳）
3. 生成加密的 `manifest.json`
4. 将敏感值替换为环境变量占位符

**原始配置** `application-dev.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://dev-server:3306/mydb
    password: dev_secret_123
```

**执行 `envdog generate --replace` 后：**

```yaml
spring:
  datasource:
    url: ${DEV_DATASOURCE_URL}
    password: ${DEV_DATASOURCE_PASSWORD}
```

---

## 在 Spring Boot 中使用

### 方式 1：配置 application.yml

```yaml
spring:
  config:
    import: optional:file:./.env[.properties]
  datasource:
    url: ${DEV_DATASOURCE_URL}
    password: ${DEV_DATASOURCE_PASSWORD}
```

### 方式 2：使用 @Value 注解

```java
@Value("${spring.datasource.url}")
private String datasourceUrl;
```

### 方式 3：使用 @ConfigurationProperties

```java
@Configuration
@ConfigurationProperties(prefix = "spring.datasource")
public class DataSourceConfig {
    private String url;
    private String password;
}
```

---

## 项目结构

```
.
├── envdog.js                          # CLI 入口
├── __tests__/                         # 测试文件
│   ├── crypto.service.test.js         # 加解密服务单元测试
│   └── manifest-crypto.integration.test.js  # Manifest 加解密集成测试
├── src/
│   ├── constants.js                   # 常量定义
│   ├── core/
│   │   ├── config-parser.js           # 配置文件解析（YAML/Properties）
│   │   ├── env-file.js                # .env 文件写入
│   │   ├── file-discovery.js          # 配置文件扫描与敏感字段发现
│   │   ├── naming.js                  # 环境变量名生成
│   │   ├── prompt.js                  # 交互式提示（支持 ESC 取消）
│   │   └── yaml-doc.js               # YAML 保真读写（保留格式/注释）
│   └── services/
│       ├── backup.service.js          # 文件备份管理
│       ├── config-replacer.service.js # 配置文件敏感值替换
│       ├── config-restore.service.js  # 配置还原与保护
│       ├── crypto.service.js          # AES-256-GCM 加解密
│       ├── env-generator.service.js   # 环境变量文件生成
│       ├── exec.service.js            # 安全环境变量加载与命令执行
│       ├── gitignore.service.js       # .gitignore 自动维护
│       ├── manifest.service.js        # Manifest 管理（自动加解密）
│       └── template.service.js        # 模板管理
├── .envdog/                           # envdog 数据目录（gitignore）
│   ├── .master-key                    # 加密主密钥（权限 600）
│   ├── env-bak/                       # 备份文件
│   ├── template/                      # 模板配置
│   │   └── default.json
│   └── manifest.json                  # 替换映射清单（加密存储）
└── package.json
```

---

## 最佳实践

1. **不要提交敏感文件**：`.envdog/` 和 `.env*` 已自动加入 `.gitignore`
2. **密钥备份**：使用 `envdog crypto-key --export` 备份密钥，换机器后用 `--import` 导入
3. **定期清理备份**：使用 `envdog clear-backups`
4. **先预览再操作**：不确定效果时先用 `--dry-run` 预览
5. **使用还原/保护工作流**：提交代码前 `restore`，提交后 `protect`
6. **使用模板**：首次运行自动发现并保存模板，后续用 `--use` 复用

---

## 运行测试

```bash
npm test
```

测试覆盖：

- `crypto.service` - 加解密单元测试（30 cases）
- `manifest + crypto` - 加解密集成测试（34 cases）

---

## 依赖

| 包 | 用途 |
|----|------|
| `commander` | CLI 参数解析 |
| `inquirer` | 交互式 prompts |
| `yaml` | YAML 解析与保真编辑 |
| `dotenv` | 环境变量加载 |
| `properties-reader` | Properties 文件解析 |
| `jest` | 测试框架（dev） |

---

## 更新记录

### 2026-04-11

- manifest 中的 `originalValue` 使用 AES-256-GCM 自动加密存储
- 新增 `crypto-key` 命令，支持密钥导出/导入/状态查看
- 新增 `.gitignore` 自动维护，防止敏感文件被提交
- 新增完整的测试用例（64 tests）

### 2026-03-11

- `restore` 和 `protect` 命令新增 `--file` 参数
- `envdog exec` 改为直接注入子进程环境执行
- 新增基础安全过滤
