import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import Cloudflare from "cloudflare";
import JSONC from "tiny-jsonc";

import { WranglerConfig } from "../types";

const DATABASE_NAME = "qr-manager-db";
const BUCKET_NAME = "qr-manager-storage";
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN;

const client = new Cloudflare({
  apiToken: CLOUDFLARE_API_TOKEN,
});

const validateEnvironment = () => {
  const requiredEnvVars = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`缺少必要的环境变量: ${missing.join(", ")}`);
  }
};

const setupDatabase = async () => {
  console.log("🔄 开始设置数据库...");
  console.log(`🔍 检查数据库 "${DATABASE_NAME}" 是否存在...`);

  // 检查数据库是否存在
  let database = await client.d1.database.get(DATABASE_NAME, {
    account_id: CLOUDFLARE_ACCOUNT_ID,
  });

  if (!database || !database.uuid) {
    console.log("❌ 数据库不存在，开始创建...");
    database = await client.d1.database.create({
      account_id: CLOUDFLARE_ACCOUNT_ID,
      name: DATABASE_NAME,
    });

    console.log(`✅ 数据库 "${DATABASE_NAME}" 创建成功`);
  } else {
    console.log(`✅ 数据库 "${DATABASE_NAME}" 已存在`);
  }

  return database;
};

const setupBucket = async () => {
  console.log("🔄 开始设置 R2 存储桶...");
  console.log(`🔍 检查存储桶 "${BUCKET_NAME}" 是否存在...`);

  try {
    // 使用 Cloudflare SDK 检查存储桶是否存在
    const bucket = await client.r2.buckets.get(BUCKET_NAME, {
      account_id: CLOUDFLARE_ACCOUNT_ID,
    });

    if (!bucket || !bucket.name) {
      console.log("❌ 存储桶不存在，开始创建...");

      // 创建存储桶
      await client.r2.buckets.create({
        account_id: CLOUDFLARE_ACCOUNT_ID,
        name: BUCKET_NAME,
      });

      console.log(`✅ 存储桶 "${BUCKET_NAME}" 创建成功`);
    } else {
      console.log(`✅ 存储桶 "${BUCKET_NAME}" 已存在`);
    }
  } catch (error) {
    throw new Error(`设置 R2 存储桶失败: ${error}`);
  }
};

const cleanDomain = (url: string): string => {
  let domain = url;

  // 移除协议部分 (http:// 或 https://)
  domain = domain.replace(/^https?:\/\//, "");

  // 移除路径部分（从第一个 / 开始的所有内容）
  domain = domain.split("/")[0];

  // 移除端口号（如果有的话）
  domain = domain.split(":")[0];

  return domain;
};

const setupNextConfig = () => {
  const bucketAddress = process.env.NEXT_PUBLIC_BUCKET_ADDRESS;
  if (!bucketAddress) return;

  const domain = cleanDomain(bucketAddress);

  const nextConfigPath = resolve("next.config.ts");
  let nextConfigContent = readFileSync(nextConfigPath, "utf-8");

  // 检查是否已经包含该域名
  if (!nextConfigContent.includes(`hostname: "${domain}"`)) {
    // 找到 remotePatterns 数组的位置
    const remotePatternsMatch = nextConfigContent.match(
      /remotePatterns:\s*\[([\s\S]*?)\]/
    );

    if (remotePatternsMatch) {
      const existingPatterns = remotePatternsMatch[1];
      const newPattern = `      {
        protocol: "https",
        hostname: "${domain}",
      },`;

      // 在最后一个模式后添加新的模式
      const updatedPatterns = existingPatterns + newPattern;
      nextConfigContent = nextConfigContent.replace(
        /remotePatterns:\s*\[([\s\S]*?)\]/,
        `remotePatterns: [${updatedPatterns}]`
      );

      writeFileSync(nextConfigPath, nextConfigContent);
      console.log(`✅ 已添加 "${domain}" 到 next.config.ts`);
    } else {
      console.log("⚠️ 未找到 remotePatterns 配置，跳过 next.config.ts 更新");
    }
  }
};

const setupEnvFileAndWranglerConfig = (uuid: string) => {
  console.log("📄 开始设置环境变量文件和 wrangler 配置...");

  // 设置 .env 文件
  const envFilePath = resolve(".env");
  const envExamplePath = resolve(".env.example");

  // 如果.env文件不存在，则从.env.example复制创建
  if (!existsSync(envFilePath) && existsSync(envExamplePath)) {
    console.log("⚠️ .env 文件不存在，从 .env.example 复制创建...");

    // 从示例文件复制
    let envContent = readFileSync(envExamplePath, "utf-8");

    // 填充当前的环境变量
    const envVarMatches = envContent.match(/^([A-Z_]+)\s*=\s*".*?"/gm);
    if (envVarMatches) {
      for (const match of envVarMatches) {
        const varName = match.split("=")[0].trim();
        if (process.env[varName]) {
          const regex = new RegExp(`${varName}\\s*=\\s*".*?"`, "g");
          envContent = envContent.replace(
            regex,
            `${varName} = "${process.env[varName]}"`
          );
        }
      }
    }

    writeFileSync(envFilePath, envContent);
    console.log("✅ .env 文件创建成功");
  } else if (existsSync(envFilePath)) {
    console.log("✨ .env 文件已存在");
  } else {
    throw new Error(".env.example 文件不存在");
  }

  // 设置 wrangler.jsonc
  console.log("🔄 开始设置 wrangler.jsonc...");

  const wranglerConfigPath = resolve("wrangler.jsonc");
  const wranglerConfig = readFileSync(wranglerConfigPath, "utf-8");

  const config = JSONC.parse(wranglerConfig) as WranglerConfig;

  console.log("🔄 写入数据库 ID");
  config.d1_databases[0].database_id = uuid;

  // 设置环境变量（只写入 GitHub Action 中定义的环境变量，排除 CLOUDFLARE 相关变量）
  config.vars = {};
  const githubActionVars = [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "BETTER_AUTH_GITHUB_CLIENT_ID",
    "BETTER_AUTH_GITHUB_CLIENT_SECRET",
    "RESEND_API_KEY",
    "RESEND_SENDER_ADDRESS",
    "NEXT_PUBLIC_MAX_FILE_MB",
    "NEXT_PUBLIC_BUCKET_ADDRESS",
  ];

  console.log("🔄 写入环境变量");
  for (const varName of githubActionVars) {
    if (process.env[varName]) {
      config.vars[varName] = process.env[varName];
    }
  }

  console.log("🔄 写入自定义域名");
  if (CUSTOM_DOMAIN) {
    config.routes.push({
      pattern: CUSTOM_DOMAIN,
      custom_domain: true,
    });
  }

  writeFileSync(wranglerConfigPath, JSON.stringify(config, null, 2));
  console.log("✅ wrangler.jsonc 设置完成");
};

const migrateDatabase = () => {
  console.log("🔄 开始迁移数据库...");
  try {
    execSync("pnpm run db:migrate-remote", { stdio: "inherit" });
    console.log("✅ 数据库迁移成功");
  } catch (error) {
    throw new Error(`迁移数据库失败: ${error}`);
  }
};

const setupWorker = async () => {
  console.log("🔄 部署 Worker 到 Cloudflare...");
  try {
    execSync("pnpm run deploy", { stdio: "inherit" });
    console.log("✅ 部署 Worker 到 Cloudflare 成功");
  } catch (error) {
    throw new Error(`部署 Worker 到 Cloudflare 失败: ${error}`);
  }
};

const main = async () => {
  console.log("🚀 开始部署...");
  try {
    // 验证必要的环境变量
    validateEnvironment();
    // 检查数据库是否存在，不存在则创建
    const database = await setupDatabase();
    // 检查 R2 存储桶是否存在，不存在则创建
    await setupBucket();
    // 设置 next.config.ts
    setupNextConfig();
    // 创建环境变量文件和修改 wrangler.jsonc
    setupEnvFileAndWranglerConfig(database.uuid!);
    // 迁移数据库
    migrateDatabase();
    // 开始上传到 Cloudflare
    setupWorker();
    console.log("✅ 部署完成!");
  } catch (error) {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  }
};

main();
