import * as Print from 'expo-print';
import {
  groupShoppingListItemsByCategory,
  type ShoppingList,
  type ShoppingListItem,
} from '../services/shoppingList';
import { formatLocalDate } from './date';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderItem = (item: ShoppingListItem): string => {
  const name = escapeHtml(item.name);
  const quantity = item.quantity_label?.trim()
    ? `<span class="quantity"> &middot; ${escapeHtml(item.quantity_label)}</span>`
    : '';
  const note = item.note?.trim()
    ? `<div class="note">${escapeHtml(item.note)}</div>`
    : '';
  return `
    <li class="item">
      <span class="checkbox">&#9744;</span>
      <span class="name"><strong>${name}</strong>${quantity}</span>
      ${note}
    </li>
  `;
};

export const buildShoppingListHtml = (list: ShoppingList): string => {
  const grouped = groupShoppingListItemsByCategory(list.items);
  const start = escapeHtml(
    formatLocalDate(list.start_date, { day: 'numeric', month: 'long', year: 'numeric' }),
  );
  const end = escapeHtml(
    formatLocalDate(list.end_date, { day: 'numeric', month: 'long', year: 'numeric' }),
  );
  const sections = grouped
    .map(
      (section) => `
        <section class="category">
          <h2>${escapeHtml(section.category)}</h2>
          <ul>${section.items.map(renderItem).join('')}</ul>
        </section>
      `,
    )
    .join('');

  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Lista del super</title>
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
        page-break-inside: avoid;
        margin-bottom: 18px;
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
      }
      .category h2 {
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
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        padding: 6px 0;
        border-bottom: 1px dashed #f1f5f9;
        font-size: 13px;
      }
      .checkbox {
        font-size: 18px;
        line-height: 1;
        margin-right: 10px;
        color: #94a3b8;
        flex-shrink: 0;
      }
      .name {
        flex: 1;
        min-width: 0;
      }
      .quantity {
        color: #6b7280;
        font-weight: 400;
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
    <h1>Lista del super</h1>
    <div class="range">${start} &mdash; ${end}</div>
    ${sections || '<p>Tu lista no tiene items todavia.</p>'}
  </body>
  </html>`;
};

export const printShoppingList = async (list: ShoppingList): Promise<void> => {
  const html = buildShoppingListHtml(list);
  await Print.printAsync({ html });
};
