import { ProcessMapper, type AppInfo, type AppOverride, type MappingHints } from "../../features/classification/services/ProcessMapper.ts";
import type { AppCategory } from "../../features/classification/config/categoryTokens.ts";
import {
  normalizeExecutable,
  resolveCanonicalDisplayName,
  resolveCanonicalExecutable,
  shouldTrackProcess,
} from "../../features/classification/services/processNormalization.ts";

export class AppClassificationFacade {
  static mapApp(exeName: string, hints: MappingHints = {}): AppInfo {
    return ProcessMapper.map(exeName, hints);
  }

  static getCategoryLabel(category: AppCategory): string {
    return ProcessMapper.getCategoryLabel(category);
  }

  static getCategoryColor(category: AppCategory): string {
    return ProcessMapper.getCategoryColor(category);
  }

  static getUserOverride(exeName: string): AppOverride | null {
    return ProcessMapper.getUserOverride(exeName);
  }

  static shouldTrackApp(exeName: string): boolean {
    return ProcessMapper.shouldTrack(exeName);
  }

  static resolveCanonicalExecutable(exeName: string): string {
    return resolveCanonicalExecutable(exeName);
  }

  static resolveCanonicalDisplayName(exeName: string): string | undefined {
    return resolveCanonicalDisplayName(exeName);
  }

  static shouldTrackProcess(
    exeName: string,
    options: { appName?: string; windowTitle?: string } = {},
  ): boolean {
    return shouldTrackProcess(exeName, options);
  }

  static normalizeExecutable(exeName: string): string {
    return normalizeExecutable(exeName);
  }
}
