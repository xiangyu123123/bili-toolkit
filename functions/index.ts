import { storage } from "./_qoder/storage.mjs";
import { handleFeedback } from "./handler.mjs";

// storage SDK 由平台在部署时注入（_qoder 不打包）；env 用来读应用 Secret FEEDBACK_KEY。
Deno.serve((request) => handleFeedback({
  request,
  storage,
  env: (name: string) => Deno.env.get(name),
}));
