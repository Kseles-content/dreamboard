const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com').replace(/\/$/, '');

function randomId() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function parseSentryDsn(dsn) {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    return {
      protocol: u.protocol,
      host: u.host,
      publicKey: u.username,
      projectId,
    };
  } catch {
    return null;
  }
}

export async function captureError(error, context = {}) {
  const message = error instanceof Error ? error.message : String(error || 'unknown_error');

  if (!SENTRY_DSN) {
    console.error('[sentry-disabled]', message, context);
    return;
  }

  const parsed = parseSentryDsn(SENTRY_DSN);
  if (!parsed) return;

  const url = `${parsed.protocol}//${parsed.host}/api/${parsed.projectId}/store/?sentry_version=7&sentry_key=${parsed.publicKey}`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: randomId().slice(0, 32),
        platform: 'javascript',
        level: 'error',
        message,
        extra: context,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });
  } catch (e) {
    console.error('[sentry-send-failed]', e);
  }
}

export async function trackEvent(event, properties = {}) {
  if (!POSTHOG_KEY) {
    console.log('[posthog-disabled]', event, properties);
    return;
  }

  try {
    await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: properties.distinct_id || 'dreamboard-web',
        properties,
      }),
    });
  } catch (e) {
    console.error('[posthog-send-failed]', e);
  }
}
