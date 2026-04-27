// Tagged Pino events for the demo funnel. We emit a stable shape so log
// pipelines (later: a sink, dashboard, or analytics warehouse) can query
// `event="demo_xxx"` without parsing free-form messages. Events:
//
//   demo_start            anon: visitor clicked Try the demo
//   demo_enter            authed: user toggled into demo
//   demo_exit             authed: user toggled back out
//   demo_reset            authed: user nuked + recloned their sandbox
//   demo_signup_convert   anon-with-demo-cookie completed registration
//   demo_feature_click    client beacon — wow-feature interaction
//   demo_session_end      cleanup job reaped a sandbox
//
// `props` is merged into the log object — keep keys flat & low-cardinality.

import { childLogger } from './logger.js';

const log = childLogger('demo-event');

export function emitDemoEvent(req, name, props = {}) {
  const base = {
    event: name,
    sandboxId: props.sandboxId ? String(props.sandboxId) : null,
    authUserId: req?.authUserId ? String(req.authUserId) : null,
    utmSource: req?.query?.utm_source || null,
    utmMedium: req?.query?.utm_medium || null,
    utmCampaign: req?.query?.utm_campaign || null,
    ip: req?.ip || null,
    ...props,
  };
  (req?.log || log).info(base, name);
}
