// Tagged Pino events for the demo funnel. We emit a stable shape so log
// pipelines can query `event="demo_xxx"` without parsing free-form
// messages. Events are dual-written: the Pino log line is the primary
// record (cheap, durable, indexed by the log shipper), and a row is
// inserted into FunnelEvent so the in-app /admin funnel UI can run
// step-conversion math without depending on an external sink.
//
//   demo_start            anon: visitor clicked Try the demo
//   demo_enter            authed: user toggled into demo (legacy)
//   demo_exit             authed: user toggled back out (legacy)
//   demo_reset            authed: user nuked + recloned (legacy)
//   demo_signup_convert   anon-with-demo-cookie completed registration
//   demo_feature_click    client beacon — wow-feature interaction
//   demo_session_end      cleanup job reaped a sandbox
//
// `props` is merged into the log object — keep keys flat & low-cardinality.

import { childLogger } from './logger.js';
import { insertFunnelEvent } from './funnelEvents.js';

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

  // Persist to the in-app analytics store. Best-effort; insertFunnelEvent
  // swallows its own errors so a Mongo blip can never break the funnel
  // event emit.
  insertFunnelEvent({
    name,
    anonId: req?.anonId || null,
    userId: req?.authUserId || (props.newUserId || null),
    sandboxId: props.sandboxId || null,
    props,
    utmSource: req?.query?.utm_source || null,
    utmMedium: req?.query?.utm_medium || null,
    utmCampaign: req?.query?.utm_campaign || null,
    ua: req?.headers?.['user-agent'] || null,
    ip: req?.ip || null,
  });
}
