import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";

export const createStorage = cache(async () => {
  const { env } = await getCloudflareContext({ async: true });

  if (!env.NEXT_INC_CACHE_R2_BUCKET) {
    // R2 未启用（如 Cloudflare 账户未绑定支付方式）时降级为 null，
    // 由调用方判断并返回友好错误，避免构建/启动阶段直接崩溃。
    return null;
  }

  return env.NEXT_INC_CACHE_R2_BUCKET;
});
