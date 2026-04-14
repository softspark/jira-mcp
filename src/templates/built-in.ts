/**
 * Built-in comment templates shipped with the Jira MCP server.
 *
 * These templates cover common Jira workflows: status updates,
 * blocker notifications, task handoffs, reviews, sprints, bugs,
 * deployments, and time logging.
 */

import type { CommentTemplate } from './types.js';

export const BUILT_IN_TEMPLATES: readonly CommentTemplate[] = [
  {
    id: 'status-update',
    name: 'Status Update',
    description:
      'Standard status update with completed work, next steps, and blockers',
    category: 'workflow',
    variables: [
      {
        name: 'completed',
        description: 'Work completed since last update',
        required: true,
        example: 'Implemented user authentication flow',
      },
      {
        name: 'next_steps',
        description: 'Planned next steps',
        required: true,
        example: 'Add unit tests for auth module',
      },
      {
        name: 'blockers',
        description: 'Current blockers or impediments',
        required: false,
        defaultValue: 'None',
        example: 'Waiting for API credentials',
      },
    ],
    body: '## Status Update\n\n### Completed\n{{completed}}\n\n### Next Steps\n{{next_steps}}\n\n{{#blockers}}### Blockers\n{{blockers}}{{/blockers}}',
  },
  {
    id: 'blocker-notification',
    name: 'Blocker Notification',
    description:
      'Notify about a blocking issue with impact and needed action',
    category: 'communication',
    variables: [
      {
        name: 'blocked_by',
        description: 'What is causing the blockage',
        required: true,
        example: 'Missing database credentials for staging',
      },
      {
        name: 'impact',
        description: 'Impact if blocker is not resolved',
        required: true,
        example: 'Cannot proceed with integration testing',
      },
      {
        name: 'needed_action',
        description: 'What action is needed to unblock',
        required: true,
        example: 'DevOps to provision staging DB credentials',
      },
      {
        name: 'deadline',
        description: 'When this needs to be resolved',
        required: false,
        defaultValue: 'ASAP',
        example: '2026-04-15',
      },
    ],
    body: '## Blocker\n\n**Blocked by:** {{blocked_by}}\n\n### Impact\n{{impact}}\n\n### Action Needed\n{{needed_action}}\n\n**Deadline:** {{deadline}}',
  },
  {
    id: 'handoff-transition',
    name: 'Task Handoff',
    description:
      'Provide context when handing off a task to another person',
    category: 'workflow',
    variables: [
      {
        name: 'from_person',
        description: 'Person handing off',
        required: true,
        example: 'John',
      },
      {
        name: 'to_person',
        description: 'Person receiving',
        required: true,
        example: 'Jane',
      },
      {
        name: 'context',
        description: 'Current state and context',
        required: true,
        example: 'Auth module is 80% complete, all tests passing',
      },
      {
        name: 'remaining_work',
        description: 'What still needs to be done',
        required: true,
        example: 'Add OAuth2 provider support',
      },
      {
        name: 'decisions',
        description: 'Key decisions already made',
        required: false,
        example: 'Using JWT for session management',
      },
    ],
    body: '## Task Handoff\n\n**From:** {{from_person}} **To:** {{to_person}}\n\n### Context\n{{context}}\n\n### Remaining Work\n{{remaining_work}}\n\n{{#decisions}}### Key Decisions Made\n{{decisions}}{{/decisions}}',
  },
  {
    id: 'review-request',
    name: 'Review Request',
    description: 'Request a code review with context and focus areas',
    category: 'communication',
    variables: [
      {
        name: 'reviewer',
        description: 'Who should review',
        required: true,
        example: 'Jane',
      },
      {
        name: 'summary',
        description: 'Summary of changes',
        required: true,
        example: 'Added user authentication with JWT',
      },
      {
        name: 'link',
        description: 'PR or branch link',
        required: true,
        example: 'https://github.com/org/repo/pull/123',
      },
      {
        name: 'focus_areas',
        description: 'What to focus the review on',
        required: false,
        example: 'Security of token generation',
      },
    ],
    body: '## Review Request\n\n**Reviewer:** {{reviewer}}\n\n### Changes\n{{summary}}\n\n**Link:** {{link}}\n\n{{#focus_areas}}### Focus Areas\n{{focus_areas}}{{/focus_areas}}',
  },
  {
    id: 'sprint-update',
    name: 'Sprint Update',
    description:
      'Sprint progress report with risks and decisions needed',
    category: 'reporting',
    variables: [
      {
        name: 'progress',
        description: 'Sprint progress summary',
        required: true,
        example: '7 of 10 stories completed',
      },
      {
        name: 'risks',
        description: 'Current risks to sprint goal',
        required: true,
        example: 'Auth integration may slip to next sprint',
      },
      {
        name: 'decisions_needed',
        description: 'Decisions that need to be made',
        required: false,
        example: 'Should we de-scope OAuth2 support?',
      },
    ],
    body: '## Sprint Update\n\n### Progress\n{{progress}}\n\n### Risks\n{{risks}}\n\n{{#decisions_needed}}### Decisions Needed\n{{decisions_needed}}{{/decisions_needed}}',
  },
  {
    id: 'bug-report',
    name: 'Bug Report',
    description: 'Structured bug report with reproduction steps',
    category: 'development',
    variables: [
      {
        name: 'steps',
        description: 'Steps to reproduce',
        required: true,
        example:
          '1. Login as admin\n2. Navigate to /settings\n3. Click "Save"',
      },
      {
        name: 'expected',
        description: 'Expected behavior',
        required: true,
        example: 'Settings should be saved',
      },
      {
        name: 'actual',
        description: 'Actual behavior',
        required: true,
        example: 'Error 500 returned',
      },
      {
        name: 'environment',
        description: 'Environment details',
        required: false,
        example: 'Chrome 120, macOS 14.2',
      },
    ],
    body: '## Bug Report\n\n### Steps to Reproduce\n{{steps}}\n\n### Expected\n{{expected}}\n\n### Actual\n{{actual}}\n\n{{#environment}}### Environment\n{{environment}}{{/environment}}',
  },
  {
    id: 'deployment-note',
    name: 'Deployment Note',
    description:
      'Document a deployment with changes and rollback plan',
    category: 'development',
    variables: [
      {
        name: 'changes',
        description: 'What was deployed',
        required: true,
        example: 'User auth module v2.1',
      },
      {
        name: 'rollback_plan',
        description: 'How to rollback if needed',
        required: true,
        example: 'Revert to tag v2.0.3',
      },
      {
        name: 'monitoring',
        description: 'What to monitor after deploy',
        required: false,
        example: 'Watch error rate on /api/auth/*',
      },
    ],
    body: '## Deployment Note\n\n### Changes\n{{changes}}\n\n### Rollback Plan\n{{rollback_plan}}\n\n{{#monitoring}}### Monitoring\n{{monitoring}}{{/monitoring}}',
  },
  {
    id: 'time-log-summary',
    name: 'Time Log Summary',
    description: 'Summary of work performed with time spent',
    category: 'reporting',
    variables: [
      {
        name: 'duration',
        description: 'Time spent',
        required: true,
        example: '2h 30m',
      },
      {
        name: 'work_description',
        description: 'What was done',
        required: true,
        example: 'Refactored authentication middleware',
      },
    ],
    body: '## Time Logged\n\n**Duration:** {{duration}}\n\n### Work Performed\n{{work_description}}',
  },
];
