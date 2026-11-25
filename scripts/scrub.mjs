#!/usr/bin/env node
/*
 * The scrub check. It runs before anything else in CI and fails closed: any
 * error, an empty file list, or a single hit stops the build.
 *
 * It refuses:
 *  1. paths that must never be in this repo (private media, fonts, database
 *     dumps, env files, agent and process files, hosting config);
 *  2. binary and media files, and any file over 512 KB, unless allowed below;
 *  3. secrets: private keys and common token shapes;
 *  4. infrastructure names: hosting env variables and storage hostnames;
 *  5. names that must not appear: matched by hash against
 *     scripts/scrub-denylist.json, so the list itself names nothing. Extra
 *     plaintext terms can go in a local, git-ignored .scrub-local.txt.
 *
 * A known-safe hit is allowed by adding "path:line" or "path" to
 * scripts/scrub-allow.txt, with a comment saying why.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(fileURLToPath(new URL('.', import.meta.url)), '..');
const hits = [];
const hit = (file, line, rule, detail) => hits.push({ file, line, rule, detail });

function fail(message) {
  console.error(`✗ scrub check could not run: ${message}`);
  process.exit(1);
}

// Every file git would commit: tracked plus untracked-but-not-ignored.
let files;
try {
  files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => existsSync(join(root, file)));
} catch (error) {
  fail(`git ls-files failed (${error.message})`);
}
if (!files.length) fail('no files to check');

const allowPath = join(root, 'scripts/scrub-allow.txt');
const allow = new Set(
  existsSync(allowPath)
    ? readFileSync(allowPath, 'utf8').split('\n').map((line) => line.replace(/#.*/, '').trim()).filter(Boolean)
    : [],
);
const allowed = (file, line) => allow.has(file) || allow.has(`${file}:${line}`);

// 1. Paths.
const BANNED_PATHS = [
  [/(^|\/)private\//, 'private folder'],
  [/(^|\/)public\/(fonts|media)\//, 'site fonts or media'],
  [/(^|\/)data\/(snapshots|.*staging)/, 'database dump'],
  [/(^|\/)\.env(\.|$)/, 'env file'],
  [/(^|\/)\.(komo|vercel|claude)\//, 'hosting or agent config'],
  [/(^|\/)(vercel\.json|wrangler\.(json|toml))$/, 'hosting config'],
  [/(^|\/)(CLAUDE|GEMINI|AGENTS|DESIGN_MEMORY|DESIGN_PLAN)\.md$/i, 'agent or process file'],
  [/(^|\/)[A-Z0-9_]*(MIGRATION|SETUP|UPLOAD_GUIDE)[A-Z0-9_]*\.md$/, 'infrastructure notes'],
  [/(^|\/)stories\/.*\.(ts|json)$/, 'story content'],
  [/\.(woff2?|ttf|otf|eot)$/i, 'font file'],
  [/(^|\/)LICENSE\.pdf$/i, 'third-party licence document'],
];
// 2. Binary and media.
const MEDIA = /\.(png|jpe?g|gif|webp|avif|heic|mp4|mov|webm|mp3|wav|pdf|psd|fig|sketch|zip|gz|tgz|sqlite|db)$/i;
const MAX_BYTES = 512 * 1024;

// 3 and 4. Content patterns.
const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}/, 'GitHub token'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}|\bsk-(proj-)?[A-Za-z0-9]{32,}\b|\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/, 'API key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s'"]*:[^\s'"]*@/, 'database URL with a password'],
  [/[a-z0-9]+\.(public\.)?blob\.vercel-storage\.com|r2\.cloudflarestorage\.com|\.r2\.dev\b/i, 'storage hostname'],
  [/\b(ADMIN|VAULT|SHOWREEL)_PASSCODE\b|\bAUTH_SECRET\b|\bPOSTGRES_URL\b|\bBLOB_READ_WRITE_TOKEN\b|\bR2_(ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET)\b/, 'hosting env variable'],
  [/\b(UMAMI|ELEVENLABS)_[A-Z_]+\b|\bNEXT_PUBLIC_(UMAMI|KOMO)_[A-Z_]+\b|\bCASE_STUDY_[A-Z_]+\b/, 'service env variable'],
  [/\/Users\/[A-Za-z0-9._-]+\/|\/home\/(?!user\b)[a-z][a-z0-9_-]*\/|[A-Z]:\\Users\\/, 'local machine path'],
];

// 5. Hashed names.
let deny;
try {
  deny = JSON.parse(readFileSync(join(root, 'scripts/scrub-denylist.json'), 'utf8'));
} catch (error) {
  fail(`scripts/scrub-denylist.json is missing or unreadable (${error.message})`);
}
if (!Array.isArray(deny.hashes) || !deny.hashes.length || typeof deny.salt !== 'string') fail('the denylist has no hashes');
const hashes = new Set(deny.hashes);
const localPath = join(root, '.scrub-local.txt');
const localTerms = existsSync(localPath) ? readFileSync(localPath, 'utf8').split('\n').map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
const sha = (term) => createHash('sha256').update(deny.salt + term).digest('hex');
const denied = (term) => hashes.has(sha(term)) || localTerms.includes(term);

function namesIn(line) {
  const words = line.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const found = new Set();
  for (let i = 0; i < words.length; i += 1) {
    for (let n = 1; n <= 5 && i + n <= words.length; n += 1) {
      const term = words.slice(i, i + n).join('-');
      if (denied(term)) found.add(`term #${sha(term).slice(0, 8)}`);
    }
  }
  return [...found];
}

for (const file of files) {
  for (const [pattern, rule] of BANNED_PATHS) if (pattern.test(file) && !allowed(file, 0)) hit(file, 0, 'banned path', rule);
  for (const term of namesIn(file)) if (!allowed(file, 0)) hit(file, 0, 'denied name in path', term);
  let size;
  try { size = statSync(join(root, file)).size; } catch (error) { fail(`can't stat ${file} (${error.message})`); }
  if (MEDIA.test(file) && !allowed(file, 0)) { hit(file, 0, 'media or binary file', 'not allowed in this repo'); continue; }
  if (size > MAX_BYTES && !allowed(file, 0)) { hit(file, 0, 'large file', `${Math.round(size / 1024)} KB`); continue; }
  let text;
  try { text = readFileSync(join(root, file), 'utf8'); } catch (error) { fail(`can't read ${file} (${error.message})`); }
  if (text.includes('\0') && !allowed(file, 0)) { hit(file, 0, 'binary file', 'contains NUL bytes'); continue; }
  if (file === 'scripts/scrub.mjs') continue; // the rules themselves
  text.split('\n').forEach((line, index) => {
    const n = index + 1;
    if (allowed(file, n)) return;
    for (const [pattern, rule] of PATTERNS) if (pattern.test(line)) hit(file, n, rule, line.trim().slice(0, 120));
    for (const term of namesIn(line)) hit(file, n, 'denied name', term);
  });
}

if (hits.length) {
  console.error(`✗ scrub check: ${hits.length} hit${hits.length === 1 ? '' : 's'} in ${files.length} files`);
  for (const h of hits) console.error(`  ${h.file}${h.line ? `:${h.line}` : ''}  ${h.rule}: ${h.detail}`);
  process.exit(1);
}
console.log(`✓ scrub check: ${files.length} files clean (${hashes.size} hashed names, ${PATTERNS.length} secret and infrastructure patterns, ${BANNED_PATHS.length} path rules)`);
