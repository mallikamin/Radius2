export const LOOKUP_KEYS = {
  CUSTOMER_SOURCE: 'customer_source',
  CUSTOMER_OCCUPATION: 'customer_occupation'
};

export const LOOKUP_DEFAULTS = {
  [LOOKUP_KEYS.CUSTOMER_SOURCE]: [
    'Personal',
    'Walk-in',
    'Social Media',
    'Event',
    'Other'
  ],
  [LOOKUP_KEYS.CUSTOMER_OCCUPATION]: [
    'Businessman',
    'Private Job',
    'Public Job',
    'Professional',
    'Other'
  ]
};

function normalizeLookupResponse(payload) {
  if (!payload) return {};
  if (Array.isArray(payload)) {
    // Supports [{ id, category, label }] and legacy [{ lookup_key, value }] styles.
    const grouped = {};
    for (const row of payload) {
      const key = row.category || row.lookup_key || row.key;
      const value = row.label || row.value;
      if (!key || !value) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(value);
    }
    return grouped;
  }
  // Supports { key: ['a', 'b'] } style APIs.
  return payload;
}

export async function fetchLookupValues(apiClient, keys = Object.values(LOOKUP_KEYS)) {
  try {
    const responses = await Promise.all(
      keys.map(async (category) => {
        const res = await apiClient.get('/lookup-values', { params: { category } });
        return { category, data: res.data };
      })
    );
    const combinedRows = responses.flatMap((entry) => {
      if (Array.isArray(entry.data)) return entry.data;
      if (Array.isArray(entry.data?.items)) return entry.data.items;
      return [];
    });
    const parsed = normalizeLookupResponse(combinedRows);
    const merged = {};
    for (const key of keys) merged[key] = parsed[key] || LOOKUP_DEFAULTS[key] || [];
    return merged;
  } catch {
    const fallback = {};
    for (const key of keys) fallback[key] = LOOKUP_DEFAULTS[key] || [];
    return fallback;
  }
}
