import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const {chromium} = createRequire(import.meta.url)('playwright');

async function waitForWebServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch('http://127.0.0.1:8080/')).ok) return;
    } catch {
      // nginx may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Explorer web server did not start on port 8080');
}

test('Explorer discovers resources and exchanges GET and PUT requests',
  {timeout: 60000}, async () => {
    await waitForWebServer();
    const browser = await chromium.launch({args: ['--no-sandbox']});
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:8080/');
      await page.waitForFunction(() =>
        document.querySelector('#status')?.textContent?.includes('resource(s) found'),
      null, {timeout: 20000});

      const resource = page.locator('.resource').filter({
        has: page.locator('.attribute-value', {hasText: /^\/example_data$/}),
      }).first();
      assert.equal(await resource.count(), 1);
      const input = resource.locator('input');
      await resource.locator('.resource-status').waitFor({state: 'visible'});

      const value = `browser-test-${Date.now()}`;
      await input.fill(value);
      await resource.getByRole('button', {name: 'Send (PUT)'}).click();
      await page.waitForFunction(() => {
        const row = [...document.querySelectorAll('.resource')].find(element =>
          [...element.querySelectorAll('.attribute-value')].some(attribute =>
            attribute.textContent === '/example_data'));
        return row?.querySelector('.resource-status')?.textContent?.startsWith('GET: 2.');
      }, null, {timeout: 10000});
      await input.fill('stale local value');
      await resource.getByRole('button', {name: 'Get', exact: true}).click();
      await page.waitForFunction(expected => {
        const row = [...document.querySelectorAll('.resource')].find(element =>
          [...element.querySelectorAll('.attribute-value')].some(attribute =>
            attribute.textContent === '/example_data'));
        return row?.querySelector('input')?.value === expected;
      }, value, {timeout: 10000});
      assert.match(await resource.locator('.resource-status').textContent(), /^GET: 2\./);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
