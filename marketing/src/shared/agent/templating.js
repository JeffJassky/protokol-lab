// Tiny mustache-ish substitution: {{path.to.value}} is replaced by the
// matching property from `context`. Missing paths render as empty string
// to keep prompts robust to optional fields. Whitespace around the path
// is allowed.

export function renderTemplate(template, context) {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.[\]]+)\s*\}\}/g, (_, path) => {
    const value = readPath(context, path);
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  });
}

function readPath(obj, path) {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
