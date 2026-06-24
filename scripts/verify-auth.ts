// End-to-end auth verification against the real DB via supertest.
// Run: npx tsx scripts/verify-auth.ts
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const app = createApp();
  const email = `verify-auth-${Date.now()}@test.local`;
  const password = "supersecret123";
  const checks: Array<[string, boolean]> = [];
  const check = (name: string, ok: boolean) => checks.push([name, ok]);

  // --- register -----------------------------------------------------------
  const reg = await request(app).post("/api/auth/register").send({ email, password, name: "Verifier" });
  check("register -> 201", reg.status === 201);
  check("register role MEMBER", reg.body?.user?.role === "MEMBER");
  check("register returns tokens", !!reg.body?.tokens?.accessToken && !!reg.body?.tokens?.refreshToken);
  check("register hides password", reg.body?.user?.password === undefined);

  const dup = await request(app).post("/api/auth/register").send({ email, password, name: "Dupe" });
  check("duplicate register -> 409", dup.status === 409);

  const weak = await request(app).post("/api/auth/register").send({ email: "x@y.com", password: "short", name: "X" });
  check("weak password -> 400", weak.status === 400);

  // --- login --------------------------------------------------------------
  const badLogin = await request(app).post("/api/auth/login").send({ email, password: "wrong" });
  check("wrong password -> 401", badLogin.status === 401);

  const login = await request(app).post("/api/auth/login").send({ email, password });
  check("login -> 200", login.status === 200);
  const accessToken: string = login.body.tokens.accessToken;
  const refreshToken: string = login.body.tokens.refreshToken;

  // --- /me ----------------------------------------------------------------
  const meNoToken = await request(app).get("/api/auth/me");
  check("/me without token -> 401", meNoToken.status === 401);

  const meBadToken = await request(app).get("/api/auth/me").set("Authorization", "Bearer nonsense");
  check("/me with bad token -> 401", meBadToken.status === 401);

  const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}`);
  check("/me -> 200", me.status === 200);
  check("/me returns correct email", me.body?.email === email);

  // --- refresh rotation ---------------------------------------------------
  const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken });
  check("refresh -> 200", refreshed.status === 200);
  const newAccess: string = refreshed.body.tokens.accessToken;
  const newRefresh: string = refreshed.body.tokens.refreshToken;
  check("refresh issues a different refresh token", newRefresh !== refreshToken);

  const meNew = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${newAccess}`);
  check("new access token works on /me", meNew.status === 200);

  // Reusing the OLD (now-rotated) refresh token must be rejected.
  const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken });
  check("reuse of old refresh token -> 401", reuse.status === 401);

  // Reuse detection should have revoked ALL sessions, so the rotated one dies too.
  const afterReuse = await request(app).post("/api/auth/refresh").send({ refreshToken: newRefresh });
  check("reuse detection revokes all sessions -> 401", afterReuse.status === 401);

  // --- logout -------------------------------------------------------------
  const fresh = await request(app).post("/api/auth/login").send({ email, password });
  const logoutToken: string = fresh.body.tokens.refreshToken;
  const logout = await request(app).post("/api/auth/logout").send({ refreshToken: logoutToken });
  check("logout -> 204", logout.status === 204);
  const afterLogout = await request(app).post("/api/auth/refresh").send({ refreshToken: logoutToken });
  check("refresh after logout -> 401", afterLogout.status === 401);

  // --- report -------------------------------------------------------------
  console.log();
  let pass = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
    if (!ok) pass = false;
  }
  console.log(`\nRESULT: ${pass ? "PASS ✅" : "FAIL ❌"}`);

  // --- cleanup (cascade removes refresh tokens) ---------------------------
  await prisma.user.deleteMany({ where: { email } });
  process.exitCode = pass ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
