// This repo's own credits, checked by its own credits test (`pnpm credits`).
// A new dependency anywhere in the workspace fails CI until it has a line here.

/** @type {import('@rcweston/credits').CreditsConfig} */
export default {
  fields: [
    {
      id: 'authorship',
      title: 'Direction & design',
      summary: 'Who made these packages.',
      credits: [
        { role: 'Design & engineering', name: 'Charlie Weston', note: 'The interaction design, the words and the code' },
        { role: 'Pair programmer', name: 'Claude Code', note: 'Extraction, tests and docs, held to the same checks', href: 'https://claude.com/claude-code' },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      summary: 'What the packages and the demo need in your app.',
      credits: [
        { role: 'UI library', name: 'React', note: 'Hooks and components in save-kit, xray, the reader and the editor', href: 'https://react.dev', packages: ['react', 'react-dom'] },
        { role: 'Icons', name: 'Lucide', note: 'The icons in the X-ray dock, the reader and the editor (ISC licence)', href: 'https://lucide.dev', packages: ['lucide-react'] },
        { role: 'Rich-text editing', name: 'Tiptap and ProseMirror', note: 'The prose and continuous-writing surfaces in the editor; the toolbar adapts Tiptap UI Components (MIT)', href: 'https://tiptap.dev', packages: ['@tiptap/core', '@tiptap/pm', '@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/extension-image'], where: 'packages/story-editor' },
        { role: 'Menus and dialogs', name: 'Radix UI', note: 'Accessible primitives behind the editor’s menus, popovers and dialogs', href: 'https://www.radix-ui.com', packages: ['radix-ui'], where: 'packages/story-editor' },
        { role: 'Positioning', name: 'Floating UI', note: 'Places the selection toolbar and slash menu', href: 'https://floating-ui.com', packages: ['@floating-ui/dom'], where: 'packages/story-editor' },
        { role: 'Postgres client', name: 'node-postgres', note: 'The optional Postgres document store (a peer dependency)', href: 'https://node-postgres.com', packages: ['pg'], where: 'packages/story-server · apps/demo' },
        { role: 'S3 signing', name: 'aws4fetch', note: 'Signs requests for the optional S3-compatible media store (a peer dependency)', href: 'https://github.com/mhart/aws4fetch', packages: ['aws4fetch'], where: 'packages/story-server' },
        { role: 'Demo framework', name: 'Next.js', note: 'Runs the local demo app; the packages themselves import no framework', href: 'https://nextjs.org', packages: ['next'], where: 'apps/demo' },
      ],
    },
    {
      id: 'tooling',
      title: 'Tooling & quality',
      summary: 'How the packages are built and tested.',
      credits: [
        { role: 'Language', name: 'TypeScript', note: 'Types, and the build to ESM', href: 'https://www.typescriptlang.org', packages: ['typescript'] },
        { role: 'Test runner', name: 'tsx with node:test', note: 'Runs the TypeScript tests on Node’s own runner', href: 'https://tsx.is', packages: ['tsx'] },
        { role: 'Browser in tests', name: 'jsdom', note: 'A DOM for the component tests', href: 'https://github.com/jsdom/jsdom', packages: ['jsdom'] },
        { role: 'Postgres in tests', name: 'PGlite', note: 'Real Postgres in memory, so the store and migrations are tested without a server', href: 'https://pglite.dev', packages: ['@electric-sql/pglite'], where: 'packages/story-server' },
        { role: 'Package manager', name: 'pnpm', note: 'Workspaces', href: 'https://pnpm.io' },
        { role: 'Scrub check', name: 'This repo', note: 'Fails CI on private paths, secrets and names that must not ship', where: 'scripts/scrub.mjs' },
      ],
    },
  ],
  uncredited: {
    '@types/node': 'Type definitions only; nothing ships.',
    '@types/react': 'Type definitions only; nothing ships.',
    '@types/react-dom': 'Type definitions only; nothing ships.',
    '@types/jsdom': 'Type definitions only; nothing ships.',
    '@types/pg': 'Type definitions only; nothing ships.',
  },
  check: { include: ['dependencies', 'devDependencies', 'peerDependencies'] },
};
