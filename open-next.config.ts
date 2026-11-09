import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 注：R2 增量缓存已临时关闭，因为部署账户尚未在 Cloudflare 控制台启用 R2（需绑定支付方式）。
// 待启用 R2 后，可恢复 r2IncrementalCache 覆盖并重新加回 wrangler.jsonc 的 r2_buckets 绑定。
export default defineCloudflareConfig({});
