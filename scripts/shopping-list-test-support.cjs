// Loads the actual TypeScript renderers without launching React Native or making HTTP requests.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(relative) {
  const file = path.isAbsolute(relative)
    ? relative
    : path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = (request) => {
    if (request === "react-native")
      return { Share: { share: async () => ({}) } };
    if (request === "expo-modules-core")
      return { requireOptionalNativeModule: () => null };
    if (request === "./api") return { nutritionClient: {} };
    if (request.startsWith("."))
      return load(path.resolve(path.dirname(file), request + ".ts"));
    throw new Error("Unexpected dependency in renderer test: " + request);
  };
  vm.runInThisContext("(function(require,module,exports){" + output + "\n})", {
    filename: file,
  })(localRequire, module, module.exports);
  return module.exports;
}
const item = (name, extra = {}) => ({
  id: 1,
  name,
  source_type: "generated",
  category: "Alimentos",
  sort_order: 0,
  quantity_label: "300 g",
  checked: false,
  note: null,
  ...extra,
});
const fixture = {
  start_date: "2026-10-05",
  end_date: "2026-10-11",
  items: [
    item("Pollo asado", {
      purchase_name: "Pechuga de pollo sin piel, cruda",
      conversion_status: "converted",
      plan_quantity: { value: 300, unit: "g", label: "300 g", state: "cooked" },
      purchase_quantity: {
        value: 400,
        unit: "g",
        label: "400 g",
        state: "raw",
      },
      conversion_note:
        "Compra estimada según la presentación y preparación indicadas.",
    }),
    item("Chía", {
      quantity_label: "108 g",
      conversion_status: "direct",
      purchase_quantity: {
        value: 108,
        unit: "g",
        label: "108 g",
        state: "ready_to_eat",
      },
      plan_quantity: {
        value: 108,
        unit: "g",
        label: "108 g",
        state: "ready_to_eat",
      },
    }),
    item(
      "Verdura (mezcla) congelada, cocida sin sal con una descripción extensa de su presentación",
      {
        quantity_label: "552 g",
        conversion_status: "needs_review",
        plan_quantity: {
          value: 552,
          unit: "g",
          label: "552 g",
          state: "cooked",
        },
        note: "Confirmar presentación con el profesional.",
      },
    ),
    item("Atún en agua drenado", {
      conversion_status: "converted",
      purchase_name: "Atún en agua, envasado",
      purchase_quantity: {
        value: 251.25,
        unit: "g",
        label: "251.25 g",
        state: "ready_to_eat",
      },
      plan_quantity: {
        value: 201,
        unit: "g",
        label: "201 g",
        state: "drained",
      },
      purchase_suggestion: "Compra sugerida: 2 latas",
    }),
    item("Bolsa de hielo", {
      source_type: "manual",
      quantity_label: "1 bolsa",
      note: "Para el fin de semana",
    }),
  ],
};
module.exports = { load, fixture, item };
