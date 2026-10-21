export type ShoppingQuantity = {
  value: number | null;
  unit: string;
  label: string;
  state: "raw" | "dry" | "cooked" | "ready_to_eat" | "drained" | "unknown";
};

export interface ShoppingPurchaseFields {
  plan_quantity?: ShoppingQuantity | null;
  purchase_quantity?: ShoppingQuantity | null;
  purchase_name?: string | null;
  conversion_status?: "direct" | "converted" | "needs_review";
  conversion_note?: string | null;
  purchase_suggestion?: string | null;
}

const stateLabels: Record<string, string> = {
  raw: "crudo",
  dry: "seco",
  cooked: "cocido",
  drained: "drenado",
};
const describe = (quantity: ShoppingQuantity) =>
  `${quantity.label}${stateLabels[quantity.state] ? ` (${stateLabels[quantity.state]})` : ""}`;

// Presentation only: all quantities and conversions come from the server.
export function shoppingItemPresentation(
  item: ShoppingPurchaseFields & {
    name: string;
    source_type: string;
    quantity_label: string | null;
  },
) {
  const plan = item.plan_quantity;
  const purchase = item.purchase_quantity;
  if (item.source_type === "manual" || !item.conversion_status) {
    return {
      name: item.name,
      quantity: item.quantity_label ?? "",
      reference: null,
      note: null,
      suggestion: null,
    };
  }
  const differs =
    plan &&
    purchase &&
    (item.conversion_status === "converted" ||
      plan.state !== purchase.state ||
      plan.value !== purchase.value ||
      plan.unit !== purchase.unit ||
      (item.purchase_name && item.purchase_name !== item.name));
  return {
    name: purchase ? item.purchase_name || item.name : item.name,
    quantity: purchase
      ? `Comprar: ${describe(purchase)}`
      : `Plan: ${plan ? describe(plan) : (item.quantity_label ?? "Sin cantidad")}`,
    reference: differs ? `En tu plan: ${item.name} · ${describe(plan)}` : null,
    note:
      item.conversion_note ??
      (item.conversion_status === "needs_review"
        ? "Cantidad de compra por confirmar"
        : null),
    suggestion: item.purchase_suggestion ?? null,
  };
}
