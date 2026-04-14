/**
 * Canonical ADF (Atlassian Document Format) type definitions.
 *
 * These are project-owned types that do not depend on library internals.
 * Both conversion modules (markdown-to-adf, adf-to-markdown) operate through these types.
 */

export interface AdfMark {
  readonly type:
    | 'strong'
    | 'em'
    | 'strike'
    | 'code'
    | 'underline'
    | 'link'
    | 'subsup'
    | 'textColor';
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export interface AdfNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly AdfNode[];
  readonly marks?: readonly AdfMark[];
  readonly text?: string;
}

export interface AdfDocument {
  readonly version: 1;
  readonly type: 'doc';
  readonly content: readonly AdfNode[];
}
