import { test, expect } from '@playwright/test';
import { readApplicationDemo } from '../../../domains/dashboard/web/src/application-demo.js';

test('Any preserves pinned runs, child navigation and historical selection through refresh failures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  let revision = 24,
    fail = false,
    writes = 0;
  const list = readApplicationDemo('application-runs', {});
  const parent = list.items.find((r: any) => r.runId === 'run-128')!;
  await page.route('**/api/dashboard/**', async (route) => {
    if (route.request().method() === 'POST') writes++;
    const url = new URL(route.request().url()),
      pathname = url.pathname;
    if (pathname === '/api/dashboard/projects')
      return route.fulfill({
        json: {
          currentProjectId: 'fixture',
          projects: [
            {
              id: 'fixture',
              name: 'Fixture',
              path: '/fixture',
              availability: 'available',
              isCurrent: true,
            },
          ],
        },
      });
    if (pathname.endsWith('/overview'))
      return route.fulfill({
        json: {
          project: { name: 'Fixture', path: '/fixture' },
          summary: { activeChanges: 0, archivedChanges: 0 },
          initialChanges: { items: [], total: 0 },
          git: {},
          native: null,
        },
      });
    if (pathname.endsWith('/plugins')) return route.fulfill({ json: { pages: [] } });
    if (pathname.endsWith('/application-runs'))
      return route.fulfill({ json: { ...list, fingerprint: String(revision) } });
    if (pathname.endsWith('/application-run')) {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { code: 'APPLICATION_SOURCE_UNAVAILABLE', error: 'fixture source unavailable' },
        });
      const detail = readApplicationDemo('application-run', {
        locator: url.searchParams.get('locator'),
      });
      detail.revision = revision;
      if (revision > 24 && detail.runId === 'run-128') {
        const regression = detail.records.find((r: any) => r.id === 'regression')!;
        regression.status = 'succeeded';
        regression.active = false;
        detail.currentIds = detail.currentIds.filter((id: string) => id !== 'regression');
      }
      return route.fulfill({ json: detail });
    }
    if (pathname.endsWith('/application-run-artifact'))
      return route.fulfill({
        json: readApplicationDemo('application-run-artifact', {
          locator: url.searchParams.get('locator'),
        }),
      });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Comet Any' }).click();
  await expect(page.getByRole('region', { name: 'Comet Any 工作区' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Comet Any', exact: true })).toHaveCount(0);
  await page.getByText('应用运行', { exact: true }).last().click();
  await expect(page.locator('.any-version')).toHaveText('v1.1.0');
  await expect(page.locator('.any-current-counts')).toContainText('2 项执行中');
  await page
    .locator('.any-active-list')
    .getByRole('button', { name: /独立审查子流程/ })
    .click();
  await page.getByRole('button', { name: '进入子流程' }).click();
  await expect(page.locator('.any-current')).toContainText('1 项等待证据');
  await page.getByRole('button', { name: '返回父运行' }).click();
  await expect(page.locator('.any-inspector h3')).toHaveText('独立审查子流程');
  await page.getByRole('tab', { name: '执行记录', exact: true }).click();
  await page
    .locator('.any-history')
    .getByRole('button', { name: /追问与记录决定/ })
    .click();
  await expect(page.locator('.any-inspector h3')).toHaveText('追问与记录决定');
  revision = 25;
  await page.getByRole('button', { name: '立即刷新', exact: true }).click();
  await expect(page.locator('.any-follow-bar')).toContainText('有新进展');
  await expect(page.getByRole('tab', { name: '执行记录', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.any-inspector h3')).toHaveText('追问与记录决定');
  fail = true;
  await page.getByRole('button', { name: '立即刷新', exact: true }).click();
  await expect(page.locator('.any-sync-line')).toContainText('刷新失败');
  await expect(page.locator('.any-inspector h3')).toHaveText('追问与记录决定');
  fail = false;
  await page.getByRole('button', { name: '重试读取', exact: true }).click();
  await expect(page.locator('.any-sync-line')).not.toContainText('刷新失败');
  await page.locator('.comet-language-switch').getByText('EN', { exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Execution records', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(writes).toBe(0);
  expect(parent.application.version).toBe('1.1.0');
});

test('Any early creation and the mobile inspector remain usable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo');
  await page.getByRole('button', { name: '打开导航' }).click();
  await page.getByRole('menuitem', { name: 'Comet Any' }).click();
  await page.locator('.any-app-row').filter({ hasText: '让发布说明自动附带证据' }).click();
  await expect(page.locator('.any-version-line')).toContainText('尚未生成');
  await page.locator('.any-active-list').getByRole('button').click();
  await expect(page.getByRole('dialog', { name: '步骤与验证详情' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('理解目标与调查 Skills');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('Any transitions preserve the reading surface on refresh and respect reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    (window as any).dashboardMotionCalls = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<typeof animate>) {
      if (this.hasAttribute('data-dashboard-motion'))
        (window as any).dashboardMotionCalls.push(this.getAttribute('data-dashboard-motion'));
      return animate.apply(this, args);
    };
  });
  await page.goto('/?demo');
  await page.getByRole('menuitem', { name: 'Comet Any' }).click();
  await expect(page.locator('.any-tabs')).toBeVisible();
  await page.getByRole('tab', { name: '执行记录', exact: true }).click();
  await expect(page.locator('.any-history')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).dashboardMotionCalls.filter((kind: string) => kind === 'tab').length,
      ),
    )
    .toBeGreaterThan(1);
  await expect
    .poll(() =>
      page.locator('.any-tab-content').evaluate((element) => element.getAnimations().length),
    )
    .toBe(0);
  const count = await page.evaluate(() => (window as any).dashboardMotionCalls.length);
  const history = page.locator('.any-history');
  await history.evaluate((element) => {
    (window as any).readingSurface = element;
  });
  await page.getByRole('button', { name: '立即刷新', exact: true }).click();
  await expect(history).toBeVisible();
  expect(await history.evaluate((element) => element === (window as any).readingSurface)).toBe(
    true,
  );
  expect(await page.evaluate(() => (window as any).dashboardMotionCalls.length)).toBe(count);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: '步骤', exact: true }).click();
  await expect(page.getByRole('tab', { name: '步骤', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await page.evaluate(() => (window as any).dashboardMotionCalls.length)).toBe(count);
  expect(
    await page.locator('.any-tab-content').evaluate((element) => element.getAnimations().length),
  ).toBe(0);
});
