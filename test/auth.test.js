import { test } from "node:test";
import assert from "node:assert/strict";
import { signInitData, validateInitData } from "../worker/auth.js";

const TOKEN = "123456:TEST-token";
const user = { id: 42, first_name: "Рома", username: "roma" };

async function initData(fields, token = TOKEN) {
  const hash = await signInitData(fields, token);
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fresh = () => ({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAE", user: JSON.stringify(user) });

test("accepts initData signed with the bot token", async () => {
  assert.deepEqual(await validateInitData(await initData(fresh()), TOKEN), user);
});

test("rejects a tampered user", async () => {
  const params = new URLSearchParams(await initData(fresh()));
  params.set("user", JSON.stringify({ ...user, id: 1 }));
  assert.equal(await validateInitData(params.toString(), TOKEN), null);
});

test("rejects data signed with another token", async () => {
  assert.equal(await validateInitData(await initData(fresh(), "999:other"), TOKEN), null);
});

test("rejects data older than a day", async () => {
  const old = { ...fresh(), auth_date: String(Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60) };
  assert.equal(await validateInitData(await initData(old), TOKEN), null);
});

test("rejects missing hash and empty input", async () => {
  assert.equal(await validateInitData(new URLSearchParams(fresh()).toString(), TOKEN), null);
  assert.equal(await validateInitData("", TOKEN), null);
});
