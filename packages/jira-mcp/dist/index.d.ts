import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * MCP server for Jira integration.
 *
 * Loads configuration, creates the instance pool, cache manager,
 * template registry, and task syncer, then registers MCP tool
 * handlers with the SDK's low-level handler API.
 *
 * Tool definitions live in {@link ./tools/definitions.ts}.
 * Argument helpers live in {@link ./tools/args.ts}.
 *
 * @module
 */

declare function createServer(): Server;
/**
 * Boot the MCP server: load config, create all dependencies, register
 * tool handlers, and connect via stdio transport.
 */
declare function startServer(): Promise<void>;

export { createServer, startServer };
