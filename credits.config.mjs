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
      summary: 'What the packages need in your app.',
      credits: [
        { role: 'UI library', name: 'React', note: 'Hooks and components in save-kit and xray', href: 'https://react.dev', packages: ['react', 'react-dom'], where: 'packages/save-kit · packages/xray' },
        { role: 'Icons', name: 'Lucide', note: 'The icons in the X-ray dock (ISC licence)', href: 'https://lucide.dev', packages: ['lucide-react'], where: 'packages/xray' },
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
  },
  check: { include: ['dependencies', 'devDependencies', 'peerDependencies'] },
};
