import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type ProfileStoreOptions = {
  rootDir?: string;
};

export class ProfileStore {
  private readonly rootDir: string;

  constructor(options: ProfileStoreOptions = {}) {
    this.rootDir = options.rootDir ?? path.join(os.homedir(), '.agent-bridge', 'profiles');
  }

  resolve(profile: string): string {
    const profilePath = path.isAbsolute(profile) ? profile : path.join(this.rootDir, sanitizeProfileName(profile));
    fs.mkdirSync(profilePath, { recursive: true });
    return profilePath;
  }
}

function sanitizeProfileName(profile: string): string {
  return profile.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'default';
}
