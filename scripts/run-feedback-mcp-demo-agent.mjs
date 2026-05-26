#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const sessionId = process.env.DEBUG_BRIDGE_SESSION ?? 'demo';
const port = Number(process.env.DEBUG_BRIDGE_PORT ?? 4000);
const feedbackDir = process.env.DEBUG_BRIDGE_FEEDBACK_DIR ?? '.debug-bridge/feedback';

function structured(result) {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((item) => item.type === 'text')?.text;
  return text ? JSON.parse(text) : {};
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'packages/feedback-mcp/dist/bin/feedback-mcp.js',
      '--bridge-port',
      String(port),
      '--session',
      sessionId,
      '--feedback-dir',
      feedbackDir,
    ],
  });
  const client = new Client({ name: 'debug-bridge-feedback-demo-agent', version: '0.1.0' });
  await client.connect(transport);

  const status = structured(await client.callTool({ name: 'feedback_status', arguments: {} }));
  console.log(`[feedback-mcp-demo-agent] connected=${status.connected} bridge=${status.wsUrl}`);
  await client.callTool({ name: 'set_feedback_overlay', arguments: { enabled: true } });

  while (true) {
    try {
      console.log('[feedback-mcp-demo-agent] waiting for feedback submission...');
      const watched = structured(
        await client.callTool({
          name: 'wait_for_feedback_batch',
          arguments: { timeoutMs: 300000 },
        }),
      );
      const batch = watched.batch;
      const item = batch?.items?.[0];
      if (!batch || !item) {
        console.log('[feedback-mcp-demo-agent] feedback event had no readable batch/item');
        continue;
      }

      const comment = item.comment ? `I saw your note: "${item.comment}".` : 'I saw this feedback item.';
      const source = item.sourceHints?.component ?? item.target?.sourceHints?.component ?? 'the selected area';
      const suggestion = structured(
        await client.callTool({
          name: 'send_visual_suggestion',
          arguments: {
            batchId: batch.id,
            itemId: item.id,
            comment: `Demo MCP agent suggestion for ${source}. ${comment}`,
            patchHint: 'Use Accept to let the coding agent apply this kind of change, or Reject/Comment to steer it.',
          },
        }),
      );
      console.log(
        `[feedback-mcp-demo-agent] sent suggestion ${suggestion.suggestion?.id} for ${batch.id}/${item.id}`,
      );
    } catch (error) {
      console.error('[feedback-mcp-demo-agent] loop error', error instanceof Error ? error.message : String(error));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
