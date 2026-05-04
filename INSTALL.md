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

WSL 注意：如果 Hermes 仓库位于 `/mnt/c` 或 `/mnt/d`，默认 `.venv` 写在 Windows 挂载盘上可能非常慢，甚至卡在复制依赖。推荐把虚拟环境放在 WSL ext4 用户目录：

```bash
cd /mnt/d/Code/LarkProject/hermes-agent
UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu \
UV_LINK_MODE=copy \
uv sync --extra feishu
```

之后启动 gateway 或做运行态验证时也使用同一个环境变量：

```bash
UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu uv run hermes gateway
```

## 第二步：安装 PilotFlow 插件

```bash
git clone https://github.com/DeliciousBuding/PilotFlow.git
cd PilotFlow
python setup.py --hermes-dir <hermes-agent-path>
```

一行命令完成安装，无需手动复制文件。脚本会自动：
- 复制插件到 `hermes-agent/plugins/pilotflow/`
- 复制技能到 `hermes-agent/skills/pilotflow/`
- 检查环境变量配置
- 验证安装完整性

## 第三步：配置环境变量

Linux / macOS:

```bash
mkdir -p ~/.hermes
cp .env.example ~/.hermes/.env
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.hermes"
Copy-Item .\.env.example "$HOME\.hermes\.env"
```

编辑 `~/.hermes/.env`：

```env
# LLM 配置
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4.1

# 飞书应用凭证
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=your-app-secret
FEISHU_GROUP_POLICY=open

# PilotFlow 配置
PILOTFLOW_TEST_CHAT_ID=oc_xxxxxxxxxxxxxxxx
PILOTFLOW_MEMORY_ENABLED=true
PILOTFLOW_MEMORY_INCLUDE_MEMBERS=false
```

同时配置 Hermes 模型（`~/.hermes/config.yaml`）：

```yaml
model:
  default: gpt-4.1
  provider: openai

providers:
  openai:
    base_url: https://api.openai.com/v1
    key_env: OPENAI_API_KEY
    model: gpt-4.1

gateway:
  default_platform: feishu
  platforms:
    feishu:
      connection_mode: websocket
      group_policy: open

# PilotFlow 建议：飞书群聊不要展示 Hermes 内部工具进度。
# setup.py 会在没有 display 配置时自动追加这一段。
display:
  platforms:
    feishu:
      tool_progress: off
```

### 获取配置值

| 变量 | 获取方式 |
| --- | --- |
| `FEISHU_APP_ID` | 飞书开放平台 → 应用 → 凭证与基础信息 |
| `FEISHU_APP_SECRET` | 同上，点击查看 |
| `FEISHU_GROUP_POLICY` | 设为 `open` 允许所有群消息，或 `allowlist` 配合白名单 |
| `PILOTFLOW_TEST_CHAT_ID` | 飞书群设置 → 群号 → 以 `oc_` 开头 |
| `PILOTFLOW_MEMORY_ENABLED` | 默认 `true`，项目创建后写入 Hermes memory |
| `PILOTFLOW_MEMORY_INCLUDE_MEMBERS` | 默认 `false`，共享环境不要持久化成员姓名 |

### 显示降噪

Hermes 默认可能把工具进度发到飞书群里，例如显示内部工具名。PilotFlow 是面向群成员的项目运行官，安装脚本会尽量在 `~/.hermes/config.yaml` 中追加：

```yaml
display:
  platforms:
    feishu:
      tool_progress: off
```

如果你的 Hermes 配置已有 `display:` 段，安装脚本不会覆盖它，只会提示手动加入以上设置。

## 第四步：飞书应用配置

在飞书开放平台确认：

1. **事件订阅**：添加 `im.message.receive_v1` 事件
2. **连接方式**：选择 WebSocket
3. **应用权限**：至少开启以下权限
   - `im:message:send_as_bot` — 机器人发消息
   - `docx:document:create` — 创建文档
   - `task:task:create` — 创建任务
   - `im:chat.members:read` — 读取群成员（@mention）
   - `bitable:app:create` — 创建多维表格
   - `drive:permission:member:create` — 添加文档协作者
   - `drive:permission:public:patch` — 设置文档链接分享权限
   - `calendar:calendar:event:create` — 创建日历事件（可选）

## 第五步：启动

```bash
cd hermes-agent
uv run hermes gateway
```

在飞书群里 @PilotFlow 发一条消息即可测试。

WSL 环境同样使用相同的用户级 Hermes 配置目录：`~/.hermes/.env` 和 `~/.hermes/config.yaml`。不要把本机绝对路径写入插件源码或公开文档。

## 验证安装

```bash
cd hermes-agent
uv run python -c "
import sys; sys.path.insert(0, '.')
from plugins.pilotflow import register
print('PilotFlow loaded OK')
"
```

WSL Feishu runtime 验证（默认不发消息）：

```bash
cd /mnt/d/Code/LarkProject/hermes-agent
UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu \
uv run python /mnt/d/Code/LarkProject/PilotFlow/scripts/verify_wsl_feishu_runtime.py \
  --hermes-dir /mnt/d/Code/LarkProject/hermes-agent \
  --env-file /home/$USER/.hermes/.env \
  --config-file /home/$USER/.hermes/config.yaml
```

如果要在上场前提前排除模型侧 `401 auth_unavailable` / API key / base_url 漂移问题，加 `--probe-llm`。输出只包含状态码和 provider，不会打印 API key、base_url 或响应正文：

```bash
UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu \
uv run python /mnt/d/Code/LarkProject/PilotFlow/scripts/verify_wsl_feishu_runtime.py \
  --hermes-dir /mnt/d/Code/LarkProject/hermes-agent \
  --env-file /home/$USER/.hermes/.env \
  --config-file /home/$USER/.hermes/config.yaml \
  --probe-llm
```

确认要向测试群发送真实计划卡片时再加 `--send-card`：

```bash
UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu \
uv run python /mnt/d/Code/LarkProject/PilotFlow/scripts/verify_wsl_feishu_runtime.py \
  --hermes-dir /mnt/d/Code/LarkProject/hermes-agent \
  --env-file /home/$USER/.hermes/.env \
  --config-file /home/$USER/.hermes/config.yaml \
  --send-card
```

## 常见问题

### 群里出现英文工具名

确认 `~/.hermes/config.yaml` 已包含：

```yaml
display:
  platforms:
    feishu:
      tool_progress: off
```

这是 Hermes 运行时显示配置，不需要修改 Hermes 源码。

### 卡片按钮点击后没有续跑

重新运行安装脚本，确保插件副本已同步到 Hermes runtime：

```bash
python setup.py --hermes-dir <hermes-agent-path>
```

PilotFlow 会注册插件级 `/card` 桥接命令处理 Feishu 按钮回调，不需要修改 Hermes 源码。

### lark_oapi 未安装

```
ModuleNotFoundError: No module named 'lark_oapi'
```

运行 `uv sync --extra feishu`

如果在 WSL 的 `/mnt/*` 仓库中长时间无输出，使用前置条件里的 `UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu` 方案重新同步，避免跨文件系统 `.venv` 写入卡住。

### 群消息收不到

确认 `FEISHU_GROUP_POLICY=open` 已设置。默认的 `allowlist` 策略会拒绝所有群消息。

### 飞书 API 权限不足

在飞书开放平台确认应用已开启所需权限，见第四步。

### LLM 连接失败

确认 `OPENAI_BASE_URL` 和 `OPENAI_API_KEY` 正确：

优先用 runtime verifier 检查 Hermes 实际加载的 provider/model/base_url/key_env 是否可用：

```bash
UV_PROJECT_ENVIRONMENT=/home/$USER/.venvs/hermes-agent-feishu \
uv run python /mnt/d/Code/LarkProject/PilotFlow/scripts/verify_wsl_feishu_runtime.py \
  --hermes-dir /mnt/d/Code/LarkProject/hermes-agent \
  --env-file /home/$USER/.hermes/.env \
  --config-file /home/$USER/.hermes/config.yaml \
  --probe-llm
```

如果输出 `llm_probe_ok=false` 且 `llm_probe_status=401`，说明当前 WSL Hermes profile 的模型 key/base_url/provider 不可用；先修 `~/.hermes/.env` 和 `~/.hermes/config.yaml`，不要只改 Windows 侧配置。

Linux / macOS:

```bash
curl $OPENAI_BASE_URL/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

Windows PowerShell:

```powershell
Invoke-RestMethod "$env:OPENAI_BASE_URL/models" -Headers @{ Authorization = "Bearer $env:OPENAI_API_KEY" }
```
