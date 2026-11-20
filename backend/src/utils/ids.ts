export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const cleanId = (id: string) => id.trim().toLowerCase();

export const isUuid = (id: string) => UUID_RE.test(cleanId(id));
