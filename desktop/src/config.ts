import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface AppConfig {
  apiUrl: string;
}

const DEFAULT_CONFIG: AppConfig = {
  apiUrl: 'http://localhost:8888',
};

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(configFilePath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: Partial<AppConfig>): void {
  const current = readConfig();
  fs.writeFileSync(configFilePath(), JSON.stringify({ ...current, ...config }, null, 2));
}
