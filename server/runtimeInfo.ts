export type RuntimeInfo = {
  gitSha: string;
  buildTime: string | null;
  env: string;
};

export function getRuntimeInfo(): RuntimeInfo {
  return {
    gitSha:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "unknown",
    buildTime: process.env.BUILD_TIME || null,
    env: process.env.NODE_ENV || "development",
  };
}
