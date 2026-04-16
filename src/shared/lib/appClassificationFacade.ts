import { ProcessMapper, type AppInfo, type AppOverride, type MappingHints } from "../../features/classification/services/ProcessMapper.ts";
import type { AppCategory } from "../../features/classification/config/categoryTokens.ts";

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
}
