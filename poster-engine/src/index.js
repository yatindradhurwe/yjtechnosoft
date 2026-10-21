'use strict';

const { renderTemplate, renderCacheKey } = require('./render/composer');
const { createAssetLoader } = require('./render/assets');
const { validateTemplate, TemplateValidationError } = require('./template/validate');
const { resolveString } = require('./template/bindings');

module.exports = { renderTemplate, renderCacheKey, createAssetLoader, validateTemplate, TemplateValidationError, resolveString };
