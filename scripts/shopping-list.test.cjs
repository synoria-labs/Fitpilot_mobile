const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, fixture, item } = require("./shopping-list-test-support.cjs");
const { shoppingItemPresentation } = load(
  "src/utils/shoppingListPresentation.ts",
);
const { buildShoppingListHtml, buildShoppingListPlainText } = load(
  "src/utils/shoppingListPrint.ts",
);
test("screen, PDF and shared text contain identical purchase and plan quantities", () => {
  const html = buildShoppingListHtml(fixture);
  const text = buildShoppingListPlainText(fixture);
  for (const entry of fixture.items) {
    const view = shoppingItemPresentation(entry);
    for (const value of [
      view.name,
      view.quantity,
      view.reference,
      view.note,
      view.suggestion,
    ].filter(Boolean)) {
      assert.ok(html.includes(value), `PDF missing ${value}`);
      assert.ok(text.includes(value), `shared text missing ${value}`);
    }
  }
  assert.ok(!html.includes("Crudo:"));
  assert.ok(!text.includes("Crudo:"));
});
test("nuts and seeds have one quantity and no redundant cooked reference", () => {
  const view = shoppingItemPresentation(fixture.items[1]);
  assert.equal(view.quantity, "Comprar: 108 g");
  assert.equal(view.reference, null);
});
test("older responses and manual entries remain readable and ignore obsolete raw weights", () => {
  const entry = item("Chía", {
    quantity_label: "108 g",
    raw_quantity_label: "432 g",
  });
  assert.equal(shoppingItemPresentation(entry).quantity, "108 g");
  assert.ok(
    !buildShoppingListHtml({ ...fixture, items: [entry] }).includes("432 g"),
  );
});
test("escapes notes and names in HTML while preserving plain text", () => {
  const list = {
    ...fixture,
    items: [item("<script>alert(1)</script>", { note: "A & B" })],
  };
  assert.ok(!buildShoppingListHtml(list).includes("<script>"));
  assert.ok(buildShoppingListHtml(list).includes("A &amp; B"));
  assert.ok(buildShoppingListPlainText(list).includes("A & B"));
});
test("renders empty lists and keeps printable rows together", () => {
  const html = buildShoppingListHtml({ ...fixture, items: [] });
  assert.ok(html.includes("Tu lista no tiene ítems todavía."));
  assert.ok(html.includes("break-inside: avoid"));
});
