import { storage } from "./_qoder/storage.mjs";
import { handleFeedback } from "./handler.mjs";

// storage SDK 由平台在部署时注入（_qoder 不打包）；本地校验把假实现直接传给 handleFeedback。
Deno.serve((request) => handleFeedback({ request, storage }));
