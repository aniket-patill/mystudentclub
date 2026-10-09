const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const root = path.resolve(__dirname, '..');
const coreSource = fs.readFileSync(path.join(root, 'mentorship/assets/mentorship-core.js'), 'utf8');
const mockSource = fs.readFileSync(path.join(root, 'mentorship/assets/mock-data.js'), 'utf8');
const statusSource = fs.readFileSync(path.join(root, 'mentorship/mentor/mock-status.js'), 'utf8');

const localResourceInterceptor = requestInterceptor(async (request) => {
  const parsed = new URL(request.url);
  if (parsed.hostname !== 'localhost') return new Response('');
  const filePath = path.join(root, decodeURIComponent(parsed.pathname).replace(/^\//, ''));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return new Response('Not found', { status: 404 });
  const extension = path.extname(filePath);
  const contentType = extension === '.js' ? 'application/javascript'
    : extension === '.css' ? 'text/css'
      : 'application/octet-stream';
  return new Response(fs.readFileSync(filePath), { headers: { 'content-type': contentType } });
});

async function loadHtmlWithExpiredSession(route) {
  const htmlPath = path.join(root, route.replace(/^\//, ''), 'index.html');
  const fetches = [];
  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), {
    url: `http://localhost${route}/?mock=1`,
    runScripts: 'dangerously',
    resources: { interceptors: [localResourceInterceptor] },
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      const expired = JSON.stringify({
        access_token: 'expired-access-token',
        refresh_token: 'expired-refresh-token',
        expires_at: 1,
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: '00000000-0000-4000-8000-000000000101', email: 'stored@example.com' },
      });
      window.localStorage.setItem('sb-izsggdtdiacxdsjjncdq-auth-token', expired);
      window.localStorage.setItem('sb-auth-auth-token', expired);
      window.fetch = async (url) => {
        fetches.push(String(url));
        return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } });
      };
    },
  });
  await new Promise((resolve) => dom.window.addEventListener('load', resolve, { once: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { dom, fetches };
}

async function loadMock(url, { statusHelper = false } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-mentorship-mock-'));
  const corePath = path.join(tempDir, 'mentorship-core.mjs');
  const mockPath = path.join(tempDir, 'mock-data.mjs');
  const statusPath = path.join(tempDir, 'mock-status.mjs');

  fs.writeFileSync(
    corePath,
    coreSource.replace("import('/mentorship/assets/mock-data.js?v=1')", "import('./mock-data.mjs')"),
  );
  fs.writeFileSync(
    mockPath,
    mockSource.replace("from '/mentorship/assets/mentorship-core.js?v=1'", "from './mentorship-core.mjs'"),
  );
  fs.writeFileSync(
    statusPath,
    statusSource.replace("from '/mentorship/assets/mentorship-core.js?v=1'", "from './mentorship-core.mjs'"),
  );

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url,
    runScripts: 'outside-only',
  });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    localStorage: dom.window.localStorage,
    navigator: dom.window.navigator,
    CustomEvent: dom.window.CustomEvent,
    HTMLElement: dom.window.HTMLElement,
  })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }

  try {
    const core = await import(pathToFileURL(corePath).href);
    if (statusHelper) await import(pathToFileURL(statusPath).href);
    return { core, dom, tempDir, previous };
  } catch (error) {
    restoreGlobals(previous);
    dom.window.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function restoreGlobals(previous) {
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

function unloadMock({ dom, tempDir, previous }) {
  restoreGlobals(previous);
  dom.window.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

test('all mentorship routes skip live Supabase initialization in mock mode even with an expired stored session', async () => {
  const routes = [
    '/mentorship',
    '/mentorship/apply',
    '/mentorship/training',
    '/mentorship/mentor',
    '/mentorship/find',
    '/mentorship/my-mentor',
    '/mentorship/admin',
  ];

  for (const route of routes) {
    const { dom, fetches } = await loadHtmlWithExpiredSession(route);
    try {
      assert.deepEqual(
        fetches.filter((url) => new URL(url).hostname === 'auth.mystudentclub.com'),
        [],
        route,
      );
    } finally {
      dom.window.close();
    }
  }
});

test('mentorship core and mock data load in JSDOM and expose every documented persona', async () => {
  const expected = {
    student: { email: 'riya.sharma@example.com', student: true, mentorStatus: null, staffRole: null },
    unmatched: { email: 'aman.gupta@example.com', student: true, mentorStatus: null, staffRole: null },
    guest: { email: 'visitor@example.com', student: false, mentorStatus: null, staffRole: null },
    applicant: { email: 'vikram.applicant@example.com', student: false, mentorStatus: 'draft', staffRole: null },
    trainee: { email: 'meera.trainee@example.com', student: false, mentorStatus: 'submitted', staffRole: null },
    mentor: { email: 'ananya.iyer@example.com', student: false, mentorStatus: 'approved', staffRole: null },
    admin: { email: 'team.admin@example.com', student: false, mentorStatus: null, staffRole: 'admin' },
  };

  for (const [persona, want] of Object.entries(expected)) {
    const loaded = await loadMock(`http://localhost/mentorship/?mock=1&as=${persona}`);
    try {
      assert.equal(loaded.core.isMockMode(), true, persona);
      const session = await loaded.core.getSession();
      const who = await loaded.core.rpc('mentorship_whoami');
      assert.equal(session.user.email, want.email, `${persona} session`);
      assert.equal(Boolean(who.student), want.student, `${persona} student state`);
      assert.equal(who.mentor?.status || null, want.mentorStatus, `${persona} mentor state`);
      assert.equal(who.staff_role, want.staffRole, `${persona} staff state`);
    } finally {
      unloadMock(loaded);
    }
  }
});

test('mentor mock-status variants resolve complete state objects', async () => {
  const variants = ['draft', 'submitted', 'training_passed', 'approved', 'rejected', 'rejected_open', 'paused'];

  for (const variant of variants) {
    const loaded = await loadMock(
      `http://localhost/mentorship/mentor/?mock=1&as=mentor&mockstatus=${variant}`,
      { statusHelper: true },
    );
    try {
      const who = await loaded.core.rpc('mentorship_whoami');
      const dashboard = await loaded.core.rpc('mentorship_my_mentor');
      const expectedStatus = variant === 'rejected_open' ? 'rejected' : variant;
      assert.equal(who.mentor.status, expectedStatus, `${variant} identity state`);
      assert.equal(dashboard.mentor.status, expectedStatus, `${variant} dashboard state`);
      assert.equal(typeof dashboard.mentor.full_name, 'string', `${variant} mentor name`);
      assert.ok(dashboard.quiz && Number.isInteger(dashboard.quiz.attempts), `${variant} quiz state`);
      assert.ok(dashboard.earnings && Array.isArray(dashboard.earnings.rows), `${variant} earnings state`);
      if (variant === 'rejected_open') {
        assert.ok(Date.parse(dashboard.mentor.reapply_after) < Date.now(), 'rejected_open permits reapplication');
      }
    } finally {
      unloadMock(loaded);
    }
  }
});

test('my-mentor mock cases resolve valid no-contact and closed-match states', async () => {
  for (const mockCase of ['no_whatsapp', 'completed', 'ended']) {
    const loaded = await loadMock(
      `http://localhost/mentorship/my-mentor/?mock=1&as=student&mock_case=${mockCase}`,
    );
    try {
      const who = await loaded.core.rpc('mentorship_whoami');
      const result = await loaded.core.rpc('mentorship_my_match', { p_program: 'industrial-training' });
      assert.equal(result.matches.length, 1, mockCase);
      const match = result.matches[0];

      if (mockCase === 'no_whatsapp') {
        assert.equal(result.student.whatsapp, null);
        assert.equal(match.status, 'active');
        assert.equal(who.active_matches.length, 1);
      } else {
        assert.equal(match.status, mockCase);
        assert.ok(Date.parse(match.ended_at), `${mockCase} ended_at`);
        assert.equal(who.active_matches.length, 0);
        assert.equal(who.closed_matches[0].status, mockCase);
      }
    } finally {
      unloadMock(loaded);
    }
  }
});
