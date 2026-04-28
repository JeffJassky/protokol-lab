// Tool registry. Modules and the package contribute callable tools that
// agent loops can invoke. Each tool has a name, description, input_schema,
// and execute(input, ctx) function.

export function buildToolRegistry({ logger }) {
  const tools = new Map();

  function register(tool) {
    if (!tool?.name) throw new Error('[marketing-admin] tool registration requires a `name`');
    tools.set(tool.name, tool);
  }

  function get(name) {
    return tools.get(name);
  }

  function list() {
    return Array.from(tools.keys());
  }

  function listForAgent(allowedNames = null) {
    const all = Array.from(tools.values());
    if (!allowedNames) return all;
    const allow = new Set(allowedNames);
    return all.filter((t) => allow.has(t.name));
  }

  return { register, get, list, listForAgent };
}
