// index.js — Cloudflare Worker girişi. İstek işleme api.js'te; testler onu doğrudan çağırır.
import { handle } from './api.js';

export default {
  fetch: (request, env) => handle(request, env),
};
