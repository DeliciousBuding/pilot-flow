# 安装指南

PilotFlow 是 Hermes Agent 的即插即用插件，使用 lark_oapi SDK 直连飞书 API。

## 前置条件

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Python | 3.12+ | Hermes 运行时要求 |
| uv | 最新版 | Python 包管理器 |

## 第一步：安装 Hermes Agent

```bash
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
uv sync --extra feishu
```

`--extra feishu` 会安装 `lark-oapi` SDK。

## 第二步：安装 PilotFlow 插件

```bash
git clone https://github.com/DeliciousBuding/PilotFlow.git
cp -r PilotFlow/plugins/pilotflow hermes-agent/plugins/
cp -r PilotFlow/skills/pilotflow hermes-agent/skills/
```

两行 `cp` 即完成安装，无需修改 Hermes 任何代码。

## 第三步：配置环境变量

```bash
mkdir -p ~/.hermes
cp PilotFlow/.env.example ~/.hermes/.env
```

编辑 `~/.hermes/.env`：

```env
# LLM 配置
OPENAI_BASE_URL=https://api.vectorcontrol.tech/v1
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=mimo-v2.5-pro

# 飞书应用凭证
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=your-app-secret
FEISHU_GROUP_POLICY=open

# PilotFlow 配置
PILOTFLOW_TEST_CHAT_ID=oc_xxxxxxxxxxxxxxxx
PILOTFLOW_BASE_TOKEN=your-bitable-token
PILOTFLOW_BASE_TABLE_ID=your-table-id
```

同时配置 Hermes 模型（`~/.hermes/config.yaml`）：

```yaml
model:
  default: gpt-5.5
  provider: vectorcontrol

providers:
  vectorcontrol:
    base_url: https://api.vectorcontrol.tech/v1
    key_env: OPENAI_API_KEY
    model: gpt-5.5

gateway:
  default_platform: feishu
  platforms:
    feishu:
      connection_mode: websocket
      group_policy: open
```

### 获取配置值

| 变量 | 获取方式 |
| --- | --- |
| `FEISHU_APP_ID` | 飞书开放平台 → 应用 → 凭证与基础信息 |
| `FEISHU_APP_SECRET` | 同上，点击查看 |
| `FEISHU_GROUP_POLICY` | 设为 `open` 允许所有群消息，或 `allowlist` 配合白名单 |
| `PILOTFLOW_TEST_CHAT_ID` | 飞书群设置 → 群号 → 以 `oc_` 开头 |
| `PILOTFLOW_BASE_TOKEN` | 飞书多维表格 URL 中的 token 部分 |
| `PILOTFLOW_BASE_TABLE_ID` | 飞书多维表格 URL 中的 table 部分 |

## 第四步：飞书应用配置

在飞书开放平台确认：

1. **事件订阅**：添加 `im.message.receive_v1` 事件
2. **连接方式**：选择 WebSocket
3. **应用权限**：至少开启以下权限
   - `im:message:send_as_bot` — 机器人发消息
   - `docx:document:create` — 创建文档
   - `task:task:create` — 创建任务
   - `im:chat.members:read` — 读取群成员（@mention）

## 第五步：启动

```bash
cd hermes-agent
uv run hermes gateway
```

在飞书群里 @PilotFlow 发一条消息即可测试。

## 验证安装

```bash
cd hermes-agent
uv run python -c "from plugins.pilotflow import register; print('PilotFlow loaded OK')"
```

## 常见问题

### lark_oapi 未安装

```
ModuleNotFoundError: No module named 'lark_oapi'
```

运行 `uv sync --extra feishu`

### 群消息收不到

确认 `FEISHU_GROUP_POLICY=open` 已设置。默认的 `allowlist` 策略会拒绝所有群消息。

### 飞书 API 权限不足

在飞书开放平台确认应用已开启所需权限，见第四步。

### LLM 连接失败

确认 `OPENAI_BASE_URL` 和 `OPENAI_API_KEY` 正确：

```bash
curl $OPENAI_BASE_URL/models -H "Authorization: Bearer $OPENAI_API_KEY"
```
