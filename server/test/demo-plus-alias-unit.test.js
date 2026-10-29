import { test } from "node:test";
import assert from "node:assert/strict";
import { gmailDemoAliases } from "../../shared/demo-email-aliases.js";
import { User } from "../src/models.js";
import { email } from "../src/domain.js";

test("twenty normalized Gmail plus aliases remain distinct in application email handling", () => {
  const aliases = gmailDemoAliases("Example.Owner@gmail.com");
  assert.equal(aliases.length, 20);
  assert.equal(new Set(aliases.map(email)).size, 20);
  assert.equal(aliases[0], "example.owner+gharseva01@gmail.com");
  assert.equal(aliases[19], "example.owner+gharseva20@gmail.com");
  assert.equal(User.schema.path("email").options.unique, true);
  assert.equal(new User({ email: aliases[0] }).email, aliases[0]);
  assert.equal(new User({ email: aliases[1] }).email, aliases[1]);
});
test("alias generator rejects pre-tagged and non-Gmail inputs and invalid counts", () => {
  for (const value of [
    "user+tag@gmail.com",
    "a@example.com",
    "a..bc@gmail.com",
    "owner@gmail.com,else@gmail.com",
  ])
    assert.throws(() => gmailDemoAliases(value));
  assert.throws(() => gmailDemoAliases("owner@gmail.com", 21));
});
