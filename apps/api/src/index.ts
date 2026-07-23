import { createApp } from "./app";

// Long-lived process (ARCHITECTURE.md AD-1). This server also hosts the in-process
// 60s alert poller once F-203 (issue #8) lands, which is why the api must stay on an
// always-on host and cannot go serverless.
const PORT = Number(process.env.PORT ?? 3001);

createApp().listen(PORT, () => {
  console.log(`pop-engine-api listening on :${PORT}`);
});
