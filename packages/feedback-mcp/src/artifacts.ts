import fs from 'node:fs';
import path from 'node:path';
import type { UiFeedbackBatch } from 'debug-bridge-types';

export type FeedbackBatchSummary = {
  id: string;
  status: UiFeedbackBatch['status'];
  itemCount: number;
  routes: string[];
  createdAt: string;
  updatedAt: string;
  artifactRoot: string;
  batchPath: string;
  summaryPath: string;
};

export class FeedbackArtifacts {
  readonly rootDir: string;

  constructor(rootDir = '.debug-bridge/feedback') {
    this.rootDir = path.resolve(process.cwd(), rootDir);
  }

  listBatches(limit = 20): FeedbackBatchSummary[] {
    if (!fs.existsSync(this.rootDir)) return [];
    return fs
      .readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readBatch(entry.name))
      .filter((batch): batch is UiFeedbackBatch => Boolean(batch))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, limit)
      .map((batch) => this.toSummary(batch));
  }

  latestBatch(): UiFeedbackBatch | null {
    const [latest] = this.listBatches(1);
    return latest ? this.readBatch(latest.id) : null;
  }

  readBatch(batchId: string): UiFeedbackBatch | null {
    const resolvedId = batchId === 'latest' ? this.listBatches(1)[0]?.id : batchId;
    if (!resolvedId) return null;
    const batchPath = this.batchPath(resolvedId);
    if (!fs.existsSync(batchPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(batchPath, 'utf8')) as UiFeedbackBatch;
    } catch {
      return null;
    }
  }

  readSummary(batchId: string): string | null {
    const resolvedId = batchId === 'latest' ? this.listBatches(1)[0]?.id : batchId;
    if (!resolvedId) return null;
    const summaryPath = this.summaryPath(resolvedId);
    if (!fs.existsSync(summaryPath)) return null;
    return fs.readFileSync(summaryPath, 'utf8');
  }

  batchPath(batchId: string): string {
    return path.join(this.rootDir, batchId, 'batch.json');
  }

  summaryPath(batchId: string): string {
    return path.join(this.rootDir, batchId, 'summary.md');
  }

  private toSummary(batch: UiFeedbackBatch): FeedbackBatchSummary {
    const artifactRoot = path.join(this.rootDir, batch.id);
    return {
      id: batch.id,
      status: batch.status,
      itemCount: batch.items.length,
      routes: batch.routes,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      artifactRoot: path.relative(process.cwd(), artifactRoot),
      batchPath: path.relative(process.cwd(), this.batchPath(batch.id)),
      summaryPath: path.relative(process.cwd(), this.summaryPath(batch.id)),
    };
  }
}
