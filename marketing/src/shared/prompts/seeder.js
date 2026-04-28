// On startup, ensures every registered prompt has a v1 record in Mongo.
// If a record already exists for a key, leaves it alone (user has
// customized). Updates the `defaultBody` field on existing records so the
// "Restore default" button always reflects the latest shipped default.

export async function seedPrompts({ registry, models, logger }) {
  const decls = registry.listDeclarations();
  for (const decl of decls) {
    const existing = await models.Prompt.findOne({ key: decl.key, isActive: true });
    if (!existing) {
      await models.Prompt.create({
        key: decl.key,
        module: decl.module,
        title: decl.title,
        description: decl.description,
        body: decl.defaultBody,
        defaultBody: decl.defaultBody,
        variables: decl.variables || [],
        outputSchema: decl.outputSchema,
        modelSlot: decl.modelSlot,
        version: 1,
        isActive: true,
      });
      logger.info?.({ key: decl.key }, '[marketing-admin] seeded prompt default');
    } else if (existing.defaultBody !== decl.defaultBody) {
      // Refresh shipped default (used for "Restore default") without
      // disturbing the user's customized active body.
      existing.defaultBody = decl.defaultBody;
      await existing.save();
    }
  }
}
