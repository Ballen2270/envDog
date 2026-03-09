# envdog - Spring 配置敏感信息管理工具

从 Spring 配置文件中提取敏感信息并生成环境变量文件的 CLI 工具。

## 功能特性

- 支持 YAML (.yml/.yaml) 和 Properties 配置文件
- 两种生成模式：独立环境文件 / 统一文件
- **自动发现配置文件** - 扫描 resources 目录自动识别敏感字段
- **模板管理** - 保存和复用配置模板
- 自动备份原配置文件到 `.envdog/env-bak` 目录（带时间戳）
- **配置还原/保护** - 提交代码时临时还原明文值，提交后重新保护
- 交互式 TUI 面板
- 一键清除备份历史

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
| `--mode <mode>` | `-m` | 生成模式：single (单文件) 或 multi (多文件) | single |
| `--replace` | `-r` | 替换原配置文件中的敏感值 | false |
| `--name <name>` | `-n` | 模板名称 | default |
| `--use` | `-u` | 使用已保存的模板（不重新扫描） | false |
| `--dir <path>` | `-d` | 资源目录路径 | ./src/main/resources |

**示例：**

```bash
# 生成模式 single（默认）- 统一文件
envdog generate
# 输出: .env

# 生成模式 multi - 每个环境独立文件
envdog generate --mode multi
# 输出: .env, .env-dev, .env-test, .env-prod（按实际 profile 名）

# 生成并替换配置文件（会创建 .bak 备份）
envdog generate --replace

# 使用已保存的模板（不重新扫描）
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

**功能：**

1. 选择操作类型（生成/替换/清除备份）
2. 选择生成模式（single/multi）
3. 选择要处理的环境（可多选）
4. 自动执行

---

### envdog status

查看当前状态，包括：

- 模板版本
- 已生成的环境变量文件
- 备份文件数量

```bash
envdog status
```

**输出示例：**

```
=== envdog 当前状态 ===

模板版本: v2.0
环境列表: default, dev, test, prod

已生成的文件:
  - .env
  - .env-dev
  - .env-test
  - .env-prod

备份文件: 4 个 (位于 .envdog/env-bak/)
  - src/main/resources/application-dev.yml.2026-03-09 10:00:00.bak
  ...

配置文件状态: protected
```

---

### envdog clear-backups

清除 `.envdog/env-bak` 目录下的所有备份文件。

```bash
envdog clear-backups
```

**示例：**

```bash
# 清除所有备份文件
envdog clear-backups
```

---

### envdog template

模板管理命令。

```bash
envdog template list              # 列出所有模板
envdog template delete <name>     # 删除指定模板
```

**示例：**

```bash
# 列出所有模板
envdog template list

# 删除模板
envdog template delete my-template
```

---

### envdog restore

根据 `manifest.json` 中记录的映射，还原明文值到配置文件。用于提交代码前临时恢复明文值以便本地运行测试。

```bash
envdog restore [options]
```

**选项：**

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--env <env>` | `-e` | 指定环境（与 profile 一致，例如 dev/test/prod） | 全部环境 |
| `--dir <path>` | `-d` | 资源目录路径 | ./src/main/resources |
| `--dry-run` | - | 预览模式，不实际修改 | false |

**示例：**

```bash
# 还原所有环境的配置
envdog restore

# 仅还原 dev 环境
envdog restore --env dev

# 预览还原效果（不实际修改）
envdog restore --dry-run
```

---

### envdog protect

根据 `manifest.json` 中记录的映射，将配置文件中的明文值重新替换为环境变量占位符。用于提交完成后重新保护敏感值。

```bash
envdog protect [options]
```

**选项：**

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--env <env>` | `-e` | 指定环境（与 profile 一致，例如 dev/test/prod） | 全部环境 |
| `--dir <path>` | `-d` | 资源目录路径 | ./src/main/resources |
| `--dry-run` | - | 预览模式，不实际修改 | false |

**示例：**

```bash
# 保护所有环境的配置
envdog protect

# 仅保护 dev 环境
envdog protect --env dev

# 预览保护效果（不实际修改）
envdog protect --dry-run
```

---

## 配置文件还原与保护工作流

在团队协作中，你可能需要在提交代码时临时使用明文值，运行测试后再重新保护。envdog 提供了完整的解决方案：

### 典型工作流

```bash
# 1. 首次使用：生成环境变量并替换配置文件
envdog generate --replace

# 2. 提交代码前：还原明文值以便本地运行测试
envdog restore --env dev
# 输出: application-dev.yml 已还原为明文值

# 3. 运行测试/启动应用
./mvnw spring-boot:run

# 4. 提交代码
git add . && git commit -m "feat: add new feature"

# 5. 提交完成后：重新保护敏感值
envdog protect --env dev
# 输出: application-dev.yml 已恢复为占位符

# 6. 查看状态
envdog status
```

### 预览模式

使用 `--dry-run` 选项可以预览操作效果，不会实际修改文件：

```bash
# 预览还原效果
envdog restore --env dev --dry-run

# 预览保护效果
envdog protect --env dev --dry-run
```

### Manifest 机制

envdog 使用 `manifest.json` 记录替换映射关系，确保还原和保护操作的精确性和可逆性：

- **自动生成**：`generate --replace` 时自动创建
- **状态跟踪**：记录当前是 "protected" 还是 "restored" 状态
- **精确替换**：基于 keyPath 而非值，避免误替换

---

## 配置模板

模板自动保存在 `.envdog/template/` 目录下（v2.0 格式）：

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
    },
    "spring.datasource.username": {
      "default": "DATASOURCE_USERNAME",
      "dev": "DEV_DATASOURCE_USERNAME"
    },
    "spring.datasource.password": {
      "default": "DATASOURCE_PASSWORD",
      "dev": "DEV_DATASOURCE_PASSWORD"
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

### 模式 multi：多文件

每个环境生成独立的 `.env-{env}` 文件。

```bash
envdog generate --mode multi
```

**输出文件：**

```
.env          # 共享配置
.env-dev      # 开发环境
.env-test     # 测试环境
.env-prod     # 生产环境
```

**文件内容示例：**

`.env-dev`:
```bash
DATASOURCE_URL=jdbc:mysql://localhost:3306/mydb
DATASOURCE_USERNAME=admin
DATASOURCE_PASSWORD=secret
DEV_DATASOURCE_URL=jdbc:mysql://dev-server:3306/mydb
DEV_DATASOURCE_USERNAME=dev_admin
DEV_DATASOURCE_PASSWORD=dev_secret
```

`.env-prod`:
```bash
DATASOURCE_URL=jdbc:mysql://localhost:3306/mydb
DATASOURCE_USERNAME=admin
DATASOURCE_PASSWORD=secret
PROD_DATASOURCE_URL=jdbc:mysql://prod-server:3306/mydb
PROD_DATASOURCE_USERNAME=prod_admin
PROD_DATASOURCE_PASSWORD=prod_secret
```

---

### 模式 single：单文件（默认）

所有环境生成到同一个 `.env` 文件，使用环境前缀区分。

```bash
# 默认就是 single 模式
envdog generate
# 或
envdog generate --mode single
```

**输出文件：**

```
.env  # 统一文件
```

**文件内容示例：**

```bash
# 共享配置
DATASOURCE_URL=jdbc:mysql://localhost:3306/mydb
DATASOURCE_USERNAME=admin
DATASOURCE_PASSWORD=secret

# 开发环境（DEV_ 前缀）
DEV_DATASOURCE_URL=jdbc:mysql://dev-server:3306/mydb
DEV_DATASOURCE_USERNAME=dev_admin
DEV_DATASOURCE_PASSWORD=dev_secret

# 测试环境（TEST_ 前缀）
TEST_DATASOURCE_URL=jdbc:mysql://test-server:3306/mydb
TEST_DATASOURCE_USERNAME=test_admin
TEST_DATASOURCE_PASSWORD=test_secret

# 生产环境（PROD_ 前缀）
PROD_DATASOURCE_URL=jdbc:mysql://prod-server:3306/mydb
PROD_DATASOURCE_USERNAME=prod_admin
PROD_DATASOURCE_PASSWORD=prod_secret
```

---

## 配置文件替换

使用 `--replace` 选项会：

1. 自动备份原配置文件到 `.envdog/env-bak` 目录（`.bak` 文件）
2. 将敏感值替换为环境变量占位符

### 示例

**原始配置** `application-dev.yml`:

```yaml
spring:
  datasource:
    url: jdbc:mysql://dev-server:3306/mydb
    username: dev_admin
    password: dev_secret_123
```

**执行命令：**

```bash
envdog generate --replace
```

**替换后** `application-dev.yml`:

```yaml
spring:
  datasource:
    url: ${DEV_DATASOURCE_URL}
    username: ${DEV_DATASOURCE_USERNAME}
    password: ${DEV_DATASOURCE_PASSWORD}
```

**备份文件：**

```
.envdog/env-bak/src/main/resources/application-dev.yml.2026-03-09 10:00:00.bak
```

---

## 在 Spring Boot 中使用

### 方式 1：使用 @Value 注解

```java
@Value("${spring.datasource.url}")
private String datasourceUrl;

@Value("${spring.datasource.username}")
private String datasourceUsername;

@Value("${spring.datasource.password}")
private String datasourcePassword;
```

### 方式 2：使用 @ConfigurationProperties

```java
@Configuration
@ConfigurationProperties(prefix = "spring.datasource")
public class DataSourceConfig {
    private String url;
    private String username;
    private String password;
    // getters and setters
}
```

### 方式 3：配置 application.yml

```yaml
spring:
  config:
    import: optional:file:./.env[.properties]
  datasource:
    url: ${DEV_DATASOURCE_URL}
    username: ${DEV_DATASOURCE_USERNAME}
    password: ${DEV_DATASOURCE_PASSWORD}
```

---

## 最佳实践

1. **不要提交 .env 文件**：将 `.env*` 和 `.envdog/` 添加到 `.gitignore`

2. **定期清理备份**：使用 `envdog clear-backups` 清理历史

3. **使用模板**：首次运行会自动发现敏感字段并保存模板，后续可用 `--use` 直接使用

4. **区分环境**：dev/test/prod 使用不同配置（实际取值来自文件名中的 profile）

5. **先测试再替换**：首次使用建议不加 `--replace`，确认生成的环境变量正确后再替换

6. **使用还原/保护工作流**：提交代码前使用 `restore`，提交后使用 `protect`

7. **使用预览模式**：不确定效果时，先用 `--dry-run` 预览

---

## 项目结构

```
.
├── envdog.js                     # CLI 入口
├── .envdog/                      # envdog 数据目录
│   ├── env-bak/                  # 备份文件目录
│   ├── template/                 # 模板配置目录
│   │   └── default.json          # 默认模板
│   └── manifest.json             # 替换映射清单
├── src/main/resources/
│   ├── application.yml            # 共享配置
│   ├── application-dev.yml      # 开发环境
│   ├── application-test.yml      # 测试环境
│   └── application-prod.yml      # 生产环境
├── package.json
└── README.md
```

---

## 依赖

- `commander` - CLI 参数解析
- `inquirer` - 交互式 prompts
- `yaml` - YAML 解析与保真编辑
