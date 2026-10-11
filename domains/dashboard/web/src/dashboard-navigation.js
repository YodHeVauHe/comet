import { useEffect, useState } from 'react';

const EVENT = 'comet-dashboard-navigation';
const id = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  !/[\u0000-\u001f]/u.test(value)
    ? value
    : null;

function normalize(value) {
  const projectId = id(value?.projectId);
  if (value?.view === 'eval')
    return {
      view: 'eval',
      projectId,
      runId: id(value.runId),
      mode: value.mode === 'new' ? 'new' : 'list',
    };
  if (value?.view === 'plugin' && id(value.pluginId))
    return {
      view: 'plugin',
      projectId,
      pluginId: value.pluginId,
    };
  return {
    view: 'workflow',
    projectId,
    workflow: ['native', 'classic'].includes(value?.workflow) ? value.workflow : null,
  };
}

export function readDashboardNavigation(browser = window) {
  const query = new URLSearchParams(browser.location.search);
  if (query.get('view') === 'eval')
    return normalize({ view: 'eval', projectId: query.get('project'), runId: query.get('run') });
  return normalize(browser.history.state?.cometDashboard);
}

/** Store page identity in this history entry, leaving the visible Dashboard URL clean. */
export function navigateDashboard(value, { replace = false } = {}, browser = window) {
  const route = normalize(value);
  const url = new URL(browser.location.href);
  for (const key of ['view', 'project', 'run']) url.searchParams.delete(key);
  const state = { ...browser.history.state, cometDashboard: route };
  const current = browser.history.state?.cometDashboard;
  const same = current && JSON.stringify(normalize(current)) === JSON.stringify(route);
  browser.history[replace || same ? 'replaceState' : 'pushState'](state, '', url);
  browser.dispatchEvent(new Event(EVENT));
}

export function useDashboardNavigation({ embedded = false } = {}) {
  const [route, setRoute] = useState(readDashboardNavigation);
  useEffect(() => {
    if (embedded) return undefined;
    const update = () => setRoute(readDashboardNavigation());
    window.addEventListener('popstate', update);
    window.addEventListener(EVENT, update);
    // Keep bookmarked Eval links working, then move their identity into history state.
    if (new URLSearchParams(window.location.search).get('view') === 'eval') {
      navigateDashboard(readDashboardNavigation(), { replace: true });
    } else if (!window.history.state?.cometDashboard) {
      navigateDashboard(readDashboardNavigation(), { replace: true });
    }
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(EVENT, update);
    };
  }, [embedded]);
  return route;
}
