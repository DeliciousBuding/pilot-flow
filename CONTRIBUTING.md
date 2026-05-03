# 贡献指南

感谢你对 PilotFlow 的关注！

## 项目简介

PilotFlow 是飞书群聊中的 AI 项目运行官。详见 [README.md](README.md)。

## 开发环境

1. 安装 Hermes Agent：[INSTALL.md](INSTALL.md)
2. 安装 PilotFlow 插件：`cp -r plugins/pilotflow hermes-agent/plugins/` + `cp -r skills/pilotflow hermes-agent/skills/`
3. 配置 `.env` 和 `config.yaml`：详见 [INSTALL.md](INSTALL.md)
4. 启动：`uv run hermes gateway`

## 代码结构

```
plugins/pilotflow/
├── tools.py          # 核心工具（6个飞书工具 + 辅助函数）
├── __init__.py       # 插件注册
└── plugin.yaml       # 插件元数据

skills/pilotflow/
├── SKILL.md          # LLM 工作流指南
└── DESCRIPTION.md    # 发现提示
```

## 提交 PR

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/xxx`
3. 提交更改：`git commit -m "描述"`
4. 推送：`git push origin feature/xxx`
5. 创建 Pull Request

## 代码规范

- Python 3.12+
- 所有用户面向文本使用中文
- 工具名使用英文（`^[a-zA-Z0-9_-]+$`）
- 通过 `registry.dispatch("send_message")` 发送消息
- 飞书 API 使用 lark_oapi SDK
- 每个新功能附带单元测试

## 架构文档

- [产品规格](docs/PRODUCT_SPEC.md)
- [架构设计](docs/ARCHITECTURE.md)
- [创新点](docs/INNOVATION.md)
- [开发进度](PERSONAL_PROGRESS.md)

## 问题反馈

通过 [GitHub Issues](https://github.com/DeliciousBuding/PilotFlow/issues) 提交。
