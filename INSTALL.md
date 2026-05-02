# 安装指南

PilotFlow 是 Hermes Agent 的插件，使用 lark_oapi SDK 直连飞书 API。

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

`--extra feishu` 会安装 `lark-oapi` SDK，PilotFlow 用它调用飞书 API。

## 第二步：安装 PilotFlow 插件

```bash
git clone https://github.com/DeliciousBuding/PilotFlow.git
cp -r PilotFlow/plugins/pilotflow hermes-agent/plugins/
```

## 第三步：配置环境变量

```bash
cp PilotFlow/.env.example hermes-agent/.env
```

编辑 `hermes-agent/.env`：

```env
# LLM 配置
OPENAI_BASE_URL=https://api.vectorcontrol.tech/v1
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=mimo-v2.5-pro

# 飞书应用凭证
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=your-app-secret

# PilotFlow 配置
PILOTFLOW_TEST_CHAT_ID=oc_xxxxxxxxxxxxxxxx
PILOTFLOW_BASE_TOKEN=your-bitable-token
PILOTFLOW_BASE_TABLE_ID=your-table-id
```

### 获取配置值

| 变量 | 获取方式 |
| --- | --- |
| `FEISHU_APP_ID` | 飞书开放平台 → 应用 → 凭证与基础信息 |
| `FEISHU_APP_SECRET` | 同上，点击查看 |
| `PILOTFLOW_TEST_CHAT_ID` | 飞书群设置 → 群号 → 以 `oc_` 开头 |
| `PILOTFLOW_BASE_TOKEN` | 飞书多维表格 URL 中的 token 部分 |
| `PILOTFLOW_BASE_TABLE_ID` | 飞书多维表格 URL 中的 table 部分 |

## 第四步：启动

```bash
cd hermes-agent
uv run hermes
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

### 飞书 API 权限不足

在飞书开放平台确认应用已开启以下权限：
- `im:message:send_as_bot` — 机器人发消息
- `docx:document:create` — 创建文档
- `bitable:record:create` — 写入多维表格
- `task:task:create` — 创建任务
- `im:chat.members:read` — 读取群成员（用于 @mention）

### LLM 连接失败

确认 `OPENAI_BASE_URL` 和 `OPENAI_API_KEY` 正确：

```bash
curl $OPENAI_BASE_URL/models -H "Authorization: Bearer $OPENAI_API_KEY"
```
