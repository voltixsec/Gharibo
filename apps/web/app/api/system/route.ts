/**
 * GET /api/system — system diagnostics.
 * Returns provider status, storage info, environment info.
 */
import { providersRepository, settingsRepository } from "@/lib/db/repositories";
import { toApiResponse } from "@gharibo/shared";
import { resolveKeyRef } from "@/lib/secrets";
import { config } from "@/lib/config";
import path from "path";
import fs from "fs";

interface ProviderStatus {
  id: string;
  provider: string;
  modelId: string;
  displayName: string | undefined;
  isActive: boolean;
  hasApiKey: boolean;
}

interface StorageInfo {
  databasePath: string;
  databaseSizeBytes: number;
}

interface EnvInfo {
  nodeVersion: string;
  platform: string;
  trainerUrl: string;
  inferenceUrl: string;
  researchUrl: string;
}

interface SystemInfo {
  providers: ProviderStatus[];
  storage: StorageInfo;
  environment: EnvInfo;
  settings: Record<string, string>;
}

export async function GET() {
  return toApiResponse((): SystemInfo => {
    const providers = providersRepository.list();
    const providerStatuses: ProviderStatus[] = providers.map((p) => ({
      id: p.id,
      provider: p.provider,
      modelId: p.modelId,
      displayName: p.displayName,
      isActive: p.isActive,
      hasApiKey: resolveKeyRef(p.apiKeyRef) !== null,
    }));

    // Get database file size
    let dbSize = 0;
    try {
      const dbPath = path.resolve(process.cwd(), config.databasePath);
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        dbSize = stat.size;
      }
    } catch {
      // ignore
    }

    return {
      providers: providerStatuses,
      storage: {
        databasePath: config.databasePath,
        databaseSizeBytes: dbSize,
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        trainerUrl: config.trainerUrl,
        inferenceUrl: config.inferenceUrl,
        researchUrl: config.researchUrl,
      },
      settings: settingsRepository.list(),
    };
  });
}
