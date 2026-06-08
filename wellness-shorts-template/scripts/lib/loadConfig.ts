import { readFileSync } from 'fs';
import { ProjectConfig } from './types';

export function loadConfig(configPath: string): ProjectConfig {
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as ProjectConfig;
}
