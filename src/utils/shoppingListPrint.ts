import { shoppingItemPresentation } from "./shoppingListPresentation";
import { Share } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import {
  groupShoppingListItemsByCategory,
  type ShoppingList,
  type ShoppingListItem,
} from "../services/shoppingList";
import { formatLocalDate } from "./date";

type ExpoPrintModule = {
  print: (options: { html?: string; uri?: string }) => Promise<void>;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderItem = (item: ShoppingListItem): string => {
  const presentation = shoppingItemPresentation(item);
  const details = [
    presentation.reference,
    presentation.note,
    presentation.suggestion,
  ]
    .filter(Boolean)
    .map((value) => `<div class="detail">${escapeHtml(value!)}</div>`)
    .join("");
  return `<li class="item"><span class="checkbox">&#9744;</span><span class="name"><strong>${escapeHtml(presentation.name)}</strong>${presentation.quantity ? `<span class="quantity"> &middot; ${escapeHtml(presentation.quantity)}</span>` : ""}</span>${details}${item.note?.trim() ? `<div class="note">${escapeHtml(item.note)}</div>` : ""}</li>`;
};

const renderPlainTextItem = (item: ShoppingListItem): string => {
  const presentation = shoppingItemPresentation(item);
  const details = [
    presentation.quantity,
    presentation.reference,
    presentation.note,
    presentation.suggestion,
  ]
    .filter(Boolean)
    .join(" | ");
  return `- [ ] ${presentation.name}${details ? ` - ${details}` : ""}${item.note?.trim() ? ` (${item.note.trim()})` : ""}`;
};

export const buildShoppingListHtml = (list: ShoppingList): string => {
  const grouped = groupShoppingListItemsByCategory(list.items);
  const start = escapeHtml(
    formatLocalDate(list.start_date, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
  const end = escapeHtml(
    formatLocalDate(list.end_date, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
  const sections = grouped
    .map(
      (section) => `
        <section class="category">
          <h2>${escapeHtml(section.category)}</h2>
          <ul>${section.items.map(renderItem).join("")}</ul>
        </section>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Lista del súper</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #182f50;
        margin: 0;
        padding: 32px 28px;
        line-height: 1.45;
      }
      h1 {
        margin: 0;
        font-size: 26px;
        letter-spacing: -0.4px;
      }
      .range {
        margin: 4px 0 24px;
        color: #6b7280;
        font-size: 13px;
      }
      .category {
        margin-bottom: 18px;
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
      }
      .category h2 {
        break-after: avoid;
        page-break-after: avoid;
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 11px;
        color: #6b7280;
        font-weight: 700;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li.item {
        break-inside: avoid;
        page-break-inside: avoid;
        overflow-wrap: anywhere;
        display: block;
        position: relative;
        padding: 6px 0;
        border-bottom: 1px dashed #f1f5f9;
        font-size: 13px;
      }
      .checkbox {
        position: absolute;
        left: 0;
        top: 8px;
        font-size: 18px;
        line-height: 1;
        margin-right: 10px;
        color: #94a3b8;
        flex-shrink: 0;
      }
      .name {
        display: block;
        margin-left: 28px;
        flex: 1;
        min-width: 0;
      }
      .quantity {
        color: #6b7280;
        font-weight: 400;
      }
      .detail {
        width: 100%;
        margin-top: 2px;
        margin-left: 28px;
        color: #475569;
        font-size: 12px;
        font-weight: 600;
      }
      .note {
        width: 100%;
        margin-top: 2px;
        margin-left: 28px;
        font-style: italic;
        color: #94a3b8;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <h1>Lista del súper</h1>
    <div class="range">${start} &mdash; ${end}</div>
    ${sections || "<p>Tu lista no tiene ítems todavía.</p>"}
  </body>
  </html>`;
};

export const buildShoppingListPlainText = (list: ShoppingList): string => {
  const grouped = groupShoppingListItemsByCategory(list.items);
  const start = formatLocalDate(list.start_date, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const end = formatLocalDate(list.end_date, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const sections = grouped
    .map((section) =>
      [
        section.category.toUpperCase(),
        ...section.items.map(renderPlainTextItem),
      ].join("\n"),
    )
    .join("\n\n");

  return [
    "Lista del súper",
    `${start} - ${end}`,
    "",
    sections || "Tu lista no tiene ítems todavía.",
  ].join("\n");
};

export const printShoppingList = async (list: ShoppingList): Promise<void> => {
  const html = buildShoppingListHtml(list);
  const ExpoPrint = requireOptionalNativeModule<ExpoPrintModule>("ExpoPrint");

  if (ExpoPrint?.print) {
    await ExpoPrint.print({ html });
    return;
  }

  await Share.share({
    title: "Lista del súper",
    message: buildShoppingListPlainText(list),
  });
};
