# 15 - Feishu Integration Reference

> Hermes reference: `D:\Code\Projects\hermes-agent\gateway\platforms\feishu.py`
> Snapshot: `21e695fcb6e379018687db7445a578aba981f67d`
> Local line count: 4126

## Hermes 飞书适配器概览

| 维度 | 数据 |
|------|------|
| 文件 | `gateway/platforms/feishu.py` |
| 行数 | 4126 in local snapshot |
| SDK | `lark-oapi>=1.5.3,<2` |
| 传输模式 | WebSocket（默认）+ Webhook |
| 认证 | tenant access token（SDK 自动管理） |
| 事件类型 | 9 种 |
| 消息类型 | 7 种（入站） + 6 种（出站） |

## PilotFlow 可以学习的关键模式

### 1. 双模式事件接收

**WebSocket 模式**（hermes 默认）：
```python
# lark_oapi SDK 内置
ws_client = lark.ws.Client(app_id, app_secret, event_handler=handler, ...)
ws_client.start()  # 非阻塞，在后台线程运行
```

**Webhook 模式**：
```python
# aiohttp web server
app = web.Application()
app.router.add_post("/webhook/event", handle_event)

# 安全措施：
# 1. URL verification challenge 自动响应
# 2. SHA-256 签名验证（timestamp + nonce + encrypt_key + body）
# 3. verification token 验证（第二层认证）
#    注：飞书事件订阅验证使用 SHA-256(timestamp + nonce + encrypt_key + body)，非 HMAC。
#    实际实现前请再次对照飞书官方事件订阅安全校验文档。
#    除签名外还应校验 verification_token（飞书后台配置页面的 token），两者独立。
# 4. per-IP 滑动窗口限流（120 req/min）
# 5. body size limit（1 MB）
```

**PilotFlow 实现建议**：用 Node.js 内置 `http` 模块（零运行时依赖）。

```typescript
// src/gateway/feishu/webhook-server.ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

// --- 签名验证（飞书 v2 事件签名：SHA-256(timestamp + nonce + encrypt_key + body)）---
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000; // 5 分钟窗口防重放
const seenNonces = new Map<string, number>(); // nonce → timestamp

function verifySignature(req: IncomingMessage, bodyStr: string): boolean {
  const timestamp = req.headers["x-lark-request-timestamp"] as string;
  const nonce = req.headers["x-lark-request-nonce"] as string;
  const signature = req.headers["x-lark-signature"] as string;
  const encryptKey = process.env.PILOTFLOW_ENCRYPT_KEY;
  if (!timestamp || !nonce || !signature || !encryptKey) return false;

  // 1. 时间戳新鲜度检查
  const tsMs = parseInt(timestamp, 10) * 1000;
  if (Math.abs(Date.now() - tsMs) > SIGNATURE_MAX_AGE_MS) return false;

  // 2. 清理过期 nonces（在重复检查前 — 过期条目不应阻止有效请求）
  if (seenNonces.size > 0) {
    const cutoff = Date.now() - SIGNATURE_MAX_AGE_MS;
    for (const [k, v] of seenNonces) { if (v < cutoff) seenNonces.delete(k); }
  }

  // 3. Nonce 重复检查（清理后，过期的同名 nonce 已被移除）
  if (seenNonces.has(nonce)) return false;

  // 4. 签名验证
  const raw = `${timestamp}${nonce}${encryptKey}${bodyStr}`;
  const expected = createHash("sha256").update(raw).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) return false;

  // 5. 容量管理 + 记录 nonce（仅在签名验证通过后）
  // 容量满时淘汰最旧条目（而非拒绝有效请求）
  if (seenNonces.size >= 1000) {
    let oldestKey = nonce; let oldestTime = Date.now();
    for (const [k, v] of seenNonces) { if (v < oldestTime) { oldestKey = k; oldestTime = v; } }
    seenNonces.delete(oldestKey);
  }
  seenNonces.set(nonce, Date.now());
  return true;
}

// --- 限流（per-IP 滑动窗口，120 req/min）---
const rateMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string, limit = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) { rateMap.set(ip, { count: 1, resetAt: now + windowMs }); return true; }
  entry.count++;
  return entry.count <= limit;
}

// --- Body 解析（含 1MB 大小限制）---
function parseBody(req: IncomingMessage, maxBytes = 1_048_576): Promise<{ raw: string; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on("data", (c: Buffer) => {
      totalBytes += c.length;
      if (totalBytes > maxBytes) { req.destroy(); reject(new Error("Body too large")); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      try { resolve({ raw, json: JSON.parse(raw) }); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function verifyToken(body: Record<string, unknown>): boolean {
  const expected = process.env.PILOTFLOW_VERIFICATION_TOKEN;
  if (!expected) return true;
  const token =
    typeof body.token === "string"
      ? body.token
      : typeof (body.header as { token?: unknown } | undefined)?.token === "string"
        ? (body.header as { token: string }).token
        : "";
  return token === expected;
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/webhook/event")) {
    return json(res, 404, { error: "Not found" });
  }

  // 限流
  const ip = req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) return json(res, 429, { error: "Rate limit exceeded" });

  const { raw, json: body } = await parseBody(req);

  // 1. URL verification challenge
  if (body.type === "url_verification") {
    if (!verifyToken(body)) return json(res, 403, { error: "Invalid verification token" });
    return json(res, 200, { challenge: body.challenge });
  }

  // 2. 签名验证 + verification token
  if (!verifySignature(req, raw)) {
    return json(res, 403, { error: "Invalid signature" });
  }
  if (!verifyToken(body)) return json(res, 403, { error: "Invalid verification token" });

  // 3. 事件路由
  const event = body.event;
  switch (body.header?.event_type) {
    case "im.message.receive_v1":
      await handleMessage(event);
      break;
    case "card.action.trigger":
      await handleCardAction(event);
      break;
  }

  json(res, 200, { code: 0 });
});

server.listen(3000, () => console.log("Webhook server listening on :3000"));
```

### 2. @mention 过滤

```typescript
// hermes 的逻辑：
// 1. 获取 bot 身份（启动时调用 /bot/v3/info）
// 2. 检查消息 mentions[] 中是否有 bot_open_id
// 3. @_all 也视为 @bot
// 4. 从消息文本中去除开头/结尾的 @BotName

interface BotIdentity {
  openId: string;
  userId: string;
  name: string;
}

function shouldAcceptMessage(message: any, bot: BotIdentity): boolean {
  // DM 总是接受
  if (message.chat_type === "p2p") return true;

  // 群聊需要 @mention
  const mentions = message.mentions || [];
  return mentions.some((m: any) =>
    m.id?.open_id === bot.openId ||
    m.id?.user_id === bot.userId ||
    m.name === bot.name ||
    m.key === "@_all"
  );
}

function stripSelfMention(text: string, botName: string): string {
  return text
    .replace(new RegExp(`^@${botName}\\s*`, ""), "")
    .replace(new RegExp(`\\s*@${botName}$`, ""), "")
    .trim();
}
```

### 3. 卡片交互

hermes 的卡片交互分两类：

**审批卡片**（同步响应）：
```typescript
// 按钮点击 → 同步返回更新后的卡片
function handleApprovalCard(action: CardAction): CardResponse {
  const { hermes_action, approval_id } = action.value;
  // 解析审批结果
  // 返回 CallBackCard 更新按钮状态为 "已批准"/"已拒绝"
  return { type: "raw", data: updatedCard };
}
```

**通用卡片**（异步处理）：
```typescript
// 按钮点击 → 转为 COMMAND 事件进入消息 pipeline
function handleGenericCard(action: CardAction): void {
  const command = `/card ${action.value.tag} ${JSON.stringify(action.value)}`;
  // 注入为一条合成消息
  emitSyntheticMessage(command, action.context);
}
```

**PilotFlow 当前的卡片回调**：只处理审批按钮（确认起飞/取消），且平台配置未验证。重建时应：
1. 用 `card.action.trigger` 事件接收按钮点击
2. 同步返回更新卡片（显示处理中状态）
3. 异步执行工具序列

### 4. 文本/媒体批处理

```typescript
// hermes 的文本批处理逻辑：
// 1. 收到消息后等待 0.6s（去抖）
// 2. 如果接近 4096 字符分割点，等待 2.0s
// 3. 合并最多 8 条消息或 4000 字符
// 4. 一次性发送给 agent

class MessageBatcher {
  private pending: Message[] = [];
  private timer: NodeJS.Timeout | null = null;

  onMessage(msg: Message): void {
    this.pending.push(msg);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = this.nearSplitPoint() ? 2000 : 600;
    this.timer = setTimeout(() => this.flush(), delay);
  }

  private flush(): void {
    const merged = this.pending.map(m => m.text).join("\n");
    this.pending = [];
    processMerged(merged);
  }
}
```

**PilotFlow 是否需要**：初版不需要。IM 触发时处理单条消息即可。后续如果需要处理连续多条消息（"帮我们建一个项目，目标是... 成员有... 交付物是..." 分多条发），再加批处理。

### 5. 去重

```typescript
// hermes 用 LRU 缓存 message_id，24h TTL，跨重启持久化
// PilotFlow 可以用更简单的方式：

const seenMessages = new Map<string, number>(); // message_id → timestamp

function isDuplicate(messageId: string): boolean {
  if (seenMessages.has(messageId)) return true;
  seenMessages.set(messageId, Date.now());
  cleanupOld();
  return false;
}

function cleanupOld(): void {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, ts] of seenMessages) {
    if (ts < cutoff) seenMessages.delete(id);
  }
}
```

### 6. 处理状态反馈

```typescript
// hermes：
// 开始处理 → 添加 "Typing" 表情
// 处理成功 → 移除 "Typing" 表情（回复本身就是信号）
// 处理失败 → 移除 "Typing"，添加 "CrossMark" 表情

async function withProcessingStatus(messageId: string, fn: () => Promise<void>): Promise<void> {
  const reactionId = await addReaction(messageId, "TYPING");
  try {
    await fn();
  } catch {
    await addReaction(messageId, "CROSS_MARK");
  } finally {
    if (reactionId) await removeReaction(messageId, reactionId);
  }
}
```

### 7. 群访问控制

```typescript
// hermes 支持 5 种策略：
// open — 所有人可用
// allowlist — 仅白名单用户
// blacklist — 除黑名单外所有人
// admin_only — 仅管理员
// disabled — 禁用

// PilotFlow 初版可以用简单的 allowlist：
const ALLOWED_USERS = process.env.PILOTFLOW_ALLOWED_USERS?.split(",") || [];

function isUserAllowed(userId: string): boolean {
  return ALLOWED_USERS.length === 0 || ALLOWED_USERS.includes(userId);
}
```

## PilotFlow 飞书集成路线图

| 阶段 | 功能 | 复杂度 |
|------|------|--------|
| Phase 1 | Webhook 接收 + @mention 过滤 + 单条消息处理 | 低 |
| Phase 2 | 卡片按钮回调（同步响应 + 异步执行） | 中 |
| Phase 3 | 处理状态反馈（Typing/CrossMark 表情） | 低 |
| Phase 4 | 文本批处理（连续消息合并） | 中 |
| Phase 5 | 群访问控制（allowlist） | 低 |

## Hermes 使用的飞书 API 端点汇总

### IM（消息）
- `POST /open-apis/im/v1/messages` — 发送消息
- `POST /open-apis/im/v1/messages/:id/reply` — 回复消息
- `PATCH /open-apis/im/v1/messages/:id` — 编辑消息
- `GET /open-apis/im/v1/messages/:id` — 获取消息内容
- `GET /open-apis/im/v1/messages/:id/resources/:key` — 下载图片/文件/音频
- `POST /open-apis/im/v1/images` — 上传图片
- `POST /open-apis/im/v1/files` — 上传文件
- `GET /open-apis/im/v1/chats/:id` — 获取群信息
- `POST /open-apis/im/v1/messages/:id/reactions` — 添加表情
- `DELETE /open-apis/im/v1/messages/:id/reactions/:rid` — 删除表情

### Bot
- `GET /open-apis/bot/v3/info` — bot 身份

### Contact
- `GET /open-apis/contact/v3/users/:id` — 解析发送者名称（10 分钟缓存）

### Drive（文档评论）
- `GET /open-apis/docx/v1/documents/:id/raw_content` — 读取文档内容
- `GET /open-apis/drive/v1/files/:token/comments` — 列表评论
- `POST /open-apis/drive/v1/files/:token/comments/:cid/replies` — 回复评论
- `POST /open-apis/drive/v1/files/:token/new_comments` — 添加全文评论
- `POST /open-apis/drive/v1/metas/batch_query` — 文档元数据

### Wiki
- `GET /open-apis/wiki/v2/spaces/get_node` — 反查 wiki token

**PilotFlow 现有工具已覆盖的**：doc.create, base.write, task.create, im.send, card.send, announcement.update
**PilotFlow 尚未使用的**：消息回复、消息编辑、表情管理、文档评论、文件上传/下载
