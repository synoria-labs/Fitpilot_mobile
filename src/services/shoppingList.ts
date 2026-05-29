import { nutritionClient } from './api';

export type ShoppingListItemSourceType = 'generated' | 'manual';

export interface ShoppingListItem {
  id: number;
  source_type: ShoppingListItemSourceType;
  item_key: string | null;
  food_id: number | null;
  name: string;
  category: string | null;
  quantity_label: string | null;
  grams: number | null;
  checked: boolean;
  checked_at: string | null;
  note: string | null;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ShoppingListDay {
  id: number;
  date: string;
  menu_id: number;
  menu_title: string | null;
}

export interface ShoppingList {
  id: number;
  client_id: number;
  professional_id: number | null;
  start_date: string;
  end_date: string;
  status: string;
  source_signature: string;
  current_signature: string;
  needs_regeneration: boolean;
  created_at: string | null;
  updated_at: string | null;
  days: ShoppingListDay[];
  items: ShoppingListItem[];
}

export interface GenerateShoppingListInput {
  client_id: number;
  start_date: string;
  days: { date: string; menu_id: number }[];
}

export interface CreateShoppingListItemInput {
  name: string;
  category?: string | null;
  quantity_label?: string | null;
  grams?: number | null;
  note?: string | null;
}

export interface UpdateShoppingListItemInput {
  name?: string;
  category?: string | null;
  quantity_label?: string | null;
  grams?: number | null;
  note?: string | null;
  checked?: boolean;
}

export interface GetCurrentShoppingListParams {
  client_id?: number;
  start_date?: string;
  end_date?: string;
}

export const generateShoppingList = async (
  input: GenerateShoppingListInput,
): Promise<ShoppingList> =>
  nutritionClient.post<ShoppingList>('/shopping-lists/generate', input);

export const getCurrentShoppingList = async (
  params: GetCurrentShoppingListParams = {},
): Promise<ShoppingList | null> => {
  const query = new URLSearchParams();
  if (params.client_id != null) {
    query.set('client_id', String(params.client_id));
  }
  if (params.start_date) {
    query.set('start_date', params.start_date);
  }
  if (params.end_date) {
    query.set('end_date', params.end_date);
  }
  const suffix = query.toString();
  const url = suffix ? `/shopping-lists/current?${suffix}` : '/shopping-lists/current';
  return nutritionClient.get<ShoppingList | null>(url, { skipErrorLogging: true });
};

export const getShoppingListById = async (id: number): Promise<ShoppingList> =>
  nutritionClient.get<ShoppingList>(`/shopping-lists/${id}`);

export const addShoppingListItem = async (
  listId: number,
  input: CreateShoppingListItemInput,
): Promise<ShoppingListItem> =>
  nutritionClient.post<ShoppingListItem>(`/shopping-lists/${listId}/items`, input);

export const updateShoppingListItem = async (
  listId: number,
  itemId: number,
  patch: UpdateShoppingListItemInput,
): Promise<ShoppingListItem> =>
  nutritionClient.patch<ShoppingListItem>(
    `/shopping-lists/${listId}/items/${itemId}`,
    patch,
  );

export const deleteShoppingListItem = async (
  listId: number,
  itemId: number,
): Promise<void> => {
  await nutritionClient.delete(`/shopping-lists/${listId}/items/${itemId}`);
};

const OTHER_CATEGORY_LABEL = 'Otros';

export const groupShoppingListItemsByCategory = (
  items: ShoppingListItem[],
): { category: string; items: ShoppingListItem[] }[] => {
  const buckets = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const key = item.category?.trim() ? item.category.trim() : OTHER_CATEGORY_LABEL;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => {
      if (a === OTHER_CATEGORY_LABEL) return 1;
      if (b === OTHER_CATEGORY_LABEL) return -1;
      return a.localeCompare(b, 'es', { sensitivity: 'base' });
    })
    .map(([category, bucketItems]) => ({
      category,
      items: bucketItems.slice().sort((x, y) => {
        if (x.sort_order !== y.sort_order) {
          return x.sort_order - y.sort_order;
        }
        return x.name.localeCompare(y.name, 'es', { sensitivity: 'base' });
      }),
    }));
};
