import * as fs from 'node:fs';
import type { BrowserContext, Page } from 'playwright';

type StorageStateOrigin = {
  origin: string;
  localStorage?: { name: string; value: string }[];
};

type StorageStateFile = {
  cookies?: Awaited<ReturnType<BrowserContext['cookies']>>;
  origins?: StorageStateOrigin[];
};

export async function importStorageState(context: BrowserContext, page: Page, storageStatePath?: string): Promise<void> {
  if (!storageStatePath || !fs.existsSync(storageStatePath)) return;

  const parsed = JSON.parse(fs.readFileSync(storageStatePath, 'utf8')) as StorageStateFile;
  if (parsed.cookies?.length) {
    await context.addCookies(parsed.cookies);
  }

  for (const origin of parsed.origins ?? []) {
    await page.goto(origin.origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate((entries) => {
      for (const entry of entries) localStorage.setItem(entry.name, entry.value);
    }, origin.localStorage ?? []);
  }
}

export async function exportStorageState(context: BrowserContext, storageStatePath?: string): Promise<void> {
  if (!storageStatePath) return;
  await context.storageState({ path: storageStatePath });
}
