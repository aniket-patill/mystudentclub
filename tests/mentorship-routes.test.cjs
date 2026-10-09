const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readRedirectRules() {
  return fs.readFileSync(path.join(root, '_redirects'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [source, destination, status] = line.split(/\s+/);
      return { source, destination, status: Number(status) };
    });
}

function readServeConfig() {
  return JSON.parse(fs.readFileSync(path.join(root, 'serve.json'), 'utf8'));
}

test('sensitive mentorship source paths redirect to the public mentorship hub', () => {
  const rules = readRedirectRules();
  const expected = [
    '/mentorship/SPEC.md',
    '/supabase/mentorship/*',
    '/MENTORSHIP-SUMMARY.md',
  ];

  for (const source of expected) {
    assert.deepEqual(
      rules.find((rule) => rule.source === source),
      { source, destination: '/mentorship/', status: 302 },
    );
  }
});

test('Pages redirects preserve the legacy events route', () => {
  const rules = readRedirectRules();

  for (const source of ['/events', '/events/']) {
    assert.deepEqual(
      rules.find((rule) => rule.source === source),
      { source, destination: '/sessions/', status: 301 },
    );
  }
});

test('local serving resolves all mentorship routes with and without trailing slashes', () => {
  const { rewrites } = readServeConfig();
  const rewriteMap = new Map(rewrites.map(({ source, destination }) => [source, destination]));
  const routes = new Map([
    ['/mentorship', '/mentorship/index.html'],
    ['/mentorship/apply', '/mentorship/apply/index.html'],
    ['/mentorship/training', '/mentorship/training/index.html'],
    ['/mentorship/mentor', '/mentorship/mentor/index.html'],
    ['/mentorship/find', '/mentorship/find/index.html'],
    ['/mentorship/my-mentor', '/mentorship/my-mentor/index.html'],
    ['/mentorship/admin', '/mentorship/admin/index.html'],
  ]);

  for (const [source, destination] of routes) {
    assert.equal(rewriteMap.get(source), destination, source);
    assert.equal(rewriteMap.get(`${source}/`), destination, `${source}/`);
  }
});

test('local serving preserves sessions rewrites and events redirects', () => {
  const config = readServeConfig();
  const rewrites = new Map(config.rewrites.map(({ source, destination }) => [source, destination]));
  const redirects = new Map(config.redirects.map(({ source, destination }) => [source, destination]));

  assert.equal(rewrites.get('/sessions'), '/sessions/index.html');
  assert.equal(rewrites.get('/sessions/'), '/sessions/index.html');
  assert.equal(redirects.get('/events'), '/sessions/');
  assert.equal(redirects.get('/events/'), '/sessions/');
});
