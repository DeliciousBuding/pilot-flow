# PilotFlow TypeScript 重建方案（已废弃）

> 本文件是早期草案，已废弃。
> 请使用 `docs/rebuild/README.md` 作为唯一入口。

当前有效方向不是单纯 TypeScript 迁移，而是 Hermes-style Agent kernel rebuild：

```text
Feishu Gateway -> Session / Queue -> Agent Loop -> Tool Registry -> Feishu Tools -> Recorder / Safety / Error Classifier
```

不要从本文件执行任何目录、命令或删除计划。
