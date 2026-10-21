'use strict';

const Ajv2020 = require('ajv/dist/2020');
const schema = require('../../schemas/template.schema.json');

const ajv = new Ajv2020({ allErrors: true, discriminator: true, strict: false });
const validateFn = ajv.compile(schema);

class TemplateValidationError extends Error {
  constructor(errors) {
    super(`Invalid template: ${errors.slice(0, 5).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
    this.name = 'TemplateValidationError';
    this.errors = errors;
  }
}

/** Schema validation plus checks JSON Schema cannot express (unique layer ids). */
function validateTemplate(template) {
  if (!validateFn(template)) throw new TemplateValidationError(validateFn.errors);
  const seen = new Set();
  const walk = (layers, prefix) => {
    for (const layer of layers) {
      const id = prefix + layer.id;
      if (seen.has(id)) throw new TemplateValidationError([{ instancePath: `/layers`, message: `duplicate layer id "${id}"` }]);
      seen.add(id);
      if (layer.type === 'group') walk(layer.layers, `${id}/`);
    }
  };
  walk(template.layers, '');
  return template;
}

module.exports = { validateTemplate, TemplateValidationError };
