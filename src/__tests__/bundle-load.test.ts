/**
 * Smoke test for the bundled dist/index.js — proves the CJS/ESM dual export
 * in src/index.ts (`export default mod; module.exports = mod;`) against
 * actual esbuild output, exactly what silently breaks on an esbuild upgrade.
 *
 * Three layers, in order:
 *  1. The SDK's `bundleLoadSmoke` — builds, require()s, and checks the
 *     contributed source ids. The host it activates against is local, because
 *     this extension's activate() reads `query` as well as `net`
 *     (HostFor<'net' | 'query'>) and the kit's default host carries `net`
 *     only.
 *  2. The descriptor check the smoke used to carry — `bundleLoadSmoke` never
 *     returns the activate() result, so `descriptor.auth` is re-asserted here
 *     (it is asserted nowhere else in the repo).
 *  3. The bare-process load probe — see the comment on it below.
 *     `bundleLoadSmoke` loads the bundle INSIDE jest, so only this layer can
 *     catch a bundle that loads purely because jest's module registry or the
 *     repo's node_modules happened to be on the resolution path.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HostFor, Query, Source } from '@kiagent/connector-sdk';
import { bundleLoadSmoke } from '@kiagent/connector-sdk/testing';

/** Runs inside the bare `node` child, next to a lone copy of the bundle. Any
 *  throw — a missing dependency, a broken interop shape, a rejected activate
 *  — exits non-zero and fails the test with the child's own output. */
const PROBE_JS = `
const m = require('./index.js');
const e = m.default ?? m;
if (typeof e.activate !== 'function') throw new Error('bundle exports no activate()');
const unused = () => {
  throw new Error('unused in the bare-process probe');
};
e.activate({
  self: { id: 'kia.google-calendar', dataDir: '/tmp' },
  log: () => {},
  net: { fetch: unused },
  query: {
    document: unused,
    children: unused,
    byExternalId: unused,
    search: unused,
    count: unused,
    accounts: unused,
  },
})
  .then((r) => {
    const ids = (r.sources || []).map((s) => s.descriptor.id).join(',');
    console.log('activate:' + typeof e.activate + ' sources:' + ids);
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
`;

describe('dist bundle loads standalone', () => {
  it('require()s dist/index.js and activate() returns the google-calendar source', async () => {
    const root = join(__dirname, '..', '..');
    const unused = () => {
      throw new Error('unused in this smoke test');
    };
    const host: HostFor<'net' | 'query'> = {
      self: { id: 'kia.google-calendar', dataDir: '/tmp' },
      log: () => {},
      net: { fetch: unused },
      query: {
        document: unused,
        children: unused,
        byExternalId: unused,
        search: unused,
        count: unused,
        accounts: unused,
      } as unknown as Query,
    };

    await bundleLoadSmoke({
      root,
      selfId: 'kia.google-calendar',
      sourceIds: ['google-calendar'],
      host,
    });

    // The bundle is already built and require-cached by the call above, and
    // activate() only closes over the host, so re-activating costs nothing.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(join(root, 'dist', 'index.js'));
    const entry = mod.default ?? mod;
    const result = (await entry.activate(host)) as { sources?: Source[] };
    expect(result.sources?.[0]?.descriptor.auth).toBe('oauth');
    expect(result.sources?.[0]?.descriptor.folderScope).toBe(true);

    // ── Bare-process load probe ───────────────────────────────────────────
    // dist/index.js ALONE, copied into an EMPTY temp dir: no package.json, no
    // node_modules anywhere up the tree, and a real `node` child rather than
    // jest's registry — the way the extension host child loads it. A bundle
    // that quietly depends on an undeclared runtime require (an esbuild
    // `external`, or a `@kiagent/connector-sdk` import that escaped
    // type-only erasure now that the contracts are a devDependency) loads
    // fine under jest and dies here.
    const sandbox = mkdtempSync(join(tmpdir(), 'gcal-bundle-'));
    try {
      copyFileSync(join(root, 'dist', 'index.js'), join(sandbox, 'index.js'));
      writeFileSync(join(sandbox, 'probe.js'), PROBE_JS);
      let out: string;
      try {
        out = execFileSync(process.execPath, ['probe.js'], {
          cwd: sandbox,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        // execFileSync's own message is a bare "Command failed"; the child's
        // stack sits on the error object.
        const err = e as { stdout?: string; stderr?: string };
        throw new Error(
          `bare-process bundle probe failed in ${sandbox}\n${err.stdout ?? ''}${err.stderr ?? ''}`,
        );
      }
      expect(out.trim()).toBe('activate:function sources:google-calendar');
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 30_000);
});

/** A 401 inside the BUNDLED pull must leave it as an error with
 *  `code: 'auth'` — the code is what core reads to move the account to
 *  needsReauth (the fork relays it; core's own tests cover the relay). */
const AUTH_PROBE_JS = `
const m = require('./index.js');
const e = m.default ?? m;
const res401 = { status: 401, statusText: '', headers: {}, body: new Uint8Array() };
e.activate({
  self: { id: 'kia.google-calendar', dataDir: '/tmp' },
  log: () => {},
  net: { fetch: async () => res401 },
  query: { search: async () => [] },
})
  .then(async (r) => {
    const src = r.sources[0];
    const session = {
      account: { id: 'acc1', config: { folderRoots: [{ id: 'a@example.com', name: 'a' }] } },
      credentials: async () => ({ accessToken: 't' }),
      log: () => {},
    };
    const cursor = { v: 1, since: new Date(0).toISOString(), calendars: {
      'a@example.com': { syncToken: 'tok', fullAt: new Date().toISOString() } } };
    try {
      for await (const _ of src.pull(session, cursor)) {}
      console.error('pull did not throw');
      process.exit(2);
    } catch (err) {
      process.exit(err && err.code === 'auth' ? 0 : 3);
    }
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
`;

describe('data only (2.0.0): the Calendar page lives in the app', () => {
  it('contributes no ui, needs engine ^2.6.0, and builds no dist/ui (runs after the build above)', () => {
    const root = join(__dirname, '..', '..');
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    expect(manifest.contributes.ui).toBeUndefined();
    expect(manifest.engine).toBe('^2.6.0');
    expect(existsSync(join(root, 'dist', 'ui'))).toBe(false);
  });
});

describe('bundled pull auth error', () => {
  it('a 401 leaves the bundled pull as an error whose code is auth', () => {
    const root = join(__dirname, '..', '..');
    execFileSync(process.execPath, [join(root, 'build.mjs')], { cwd: root });
    const sandbox = mkdtempSync(join(tmpdir(), 'gcal-auth-'));
    try {
      copyFileSync(join(root, 'dist', 'index.js'), join(sandbox, 'index.js'));
      writeFileSync(join(sandbox, 'probe.js'), AUTH_PROBE_JS);
      let status = 0;
      try {
        execFileSync(process.execPath, ['probe.js'], { cwd: sandbox, stdio: 'pipe' });
      } catch (e) {
        status = (e as { status?: number }).status ?? -1;
      }
      expect(status).toBe(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 30_000);
});
