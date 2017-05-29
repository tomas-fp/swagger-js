'use strict';

var log = require('../helpers').log;
var _ = {
  isPlainObject: require('lodash-compat/lang/isPlainObject'),
  isString: require('lodash-compat/lang/isString'),
};

var SchemaMarkup = require('../schema-markup.js');
var jsyaml = require('js-yaml');

var Model = module.exports = function (name, definition, models, modelPropertyMacro) {
  this.definition = definition || {};
  this.isArray = definition.type === 'array';
  this.models = models || {};
  this.name = name || definition.title || 'Inline Model';
  this.modelPropertyMacro = modelPropertyMacro || function (property) {
    return property.default;
  };

  return this;
};

var schemaToHTML = function (name, schema, models, modelPropertyMacro) {
  var references = {};
  var seenModels = [];
  var inlineModels = 0;
  var addReference = function (schema, name, skipRef) {
    var modelName = name;
    var model;
    if (schema.$ref) {
      modelName = schema.title || helpers.simpleRef(schema.$ref);
      model = models[modelName];

      if (model !== null && model.definition.title !== null && typeof model.definition.title !== 'undefined') {
        modelName = model.definition.title;
      }
    } else if (_.isUndefined(name)) {
      modelName = schema.title || 'Inline Model ' + (++inlineModels);
      model = new Model(modelName, schema, models, modelPropertyMacro);
    }

    if (skipRef !== true) {
      references[modelName] = _.isUndefined(model) ? {} : model.definition;
    }
    return modelName;
  };

  var primitiveToHTML = function (schema) {
    var html = '<span class="propType"';
    var type = schema.type || 'object';
    var ref;

    if (schema.$ref) {
      ref = addReference(schema, helpers.simpleRef(schema.$ref));
      html += ' title=' + ref + '>' + ref;
    } else if (type === 'object') {
      if (!_.isUndefined(schema.properties)) {
        ref = addReference(schema);
        html += ' title=' + ref + '>' + ref;
      } else {
        html += ' title="object">object';
      }
    } else if (type === 'array') {
      if (_.isArray(schema.items)) {
        ref = _.map(schema.items, addReference).join(',');
      } else if (_.isPlainObject(schema.items)) {
        if (_.isUndefined(schema.items.$ref)) {
          if (!_.isUndefined(schema.items.type) && _.indexOf(['array', 'object'], schema.items.type) === -1) {
            ref = schema.items.type;
          } else {
            ref = addReference(schema.items);
          }
        } else {
          ref = addReference(schema.items, helpers.simpleRef(schema.items.$ref));
        }
      } else {
        helpers.log('Array type\'s \'items\' schema is not an array or an object, cannot process');
        ref = 'object';
      }
      html += ' title=array[' + ref + ']>array[' + ref + ']';
    } else {
      html += ' title=' + schema.type + '>' + schema.type ;
    }

    html += '</span>';

    return html;
  };
  var primitiveToOptionsHTML = function (schema, html) {
    var options = '';
    var type = schema.type || 'object';
    var isArray = type === 'array';

    if (isArray) {
      if (_.isPlainObject(schema.items) && !_.isUndefined(schema.items.type)) {
        type = schema.items.type;
      } else {
        type = 'object';
      }
    }

    if (!_.isUndefined(schema.default)) {
      options += helpers.optionHtml('Default', schema.default);
    }

    switch (type) {
      case 'string':
        if (schema.minLength) {
          options += helpers.optionHtml('Min. Length', schema.minLength);
        }

        if (schema.maxLength) {
          options += helpers.optionHtml('Max. Length', schema.maxLength);
        }

        if (schema.pattern) {
          options += helpers.optionHtml('Reg. Exp.', schema.pattern);
        }
        break;
      case 'integer':
      case 'number':
        if (schema.minimum) {
          options += helpers.optionHtml('Min. Value', schema.minimum);
        }

        if (schema.exclusiveMinimum) {
          options += helpers.optionHtml('Exclusive Min.', 'true');
        }

        if (schema.maximum) {
          options += helpers.optionHtml('Max. Value', schema.maximum);
        }

        if (schema.exclusiveMaximum) {
          options += helpers.optionHtml('Exclusive Max.', 'true');
        }

        if (schema.multipleOf) {
          options += helpers.optionHtml('Multiple Of', schema.multipleOf);
        }

        break;
    }

    if (isArray) {
      if (schema.minItems) {
        options += helpers.optionHtml('Min. Items', schema.minItems);
      }

      if (schema.maxItems) {
        options += helpers.optionHtml('Max. Items', schema.maxItems);
      }

      if (schema.uniqueItems) {
        options += helpers.optionHtml('Unique Items', 'true');
      }

      if (schema.collectionFormat) {
        options += helpers.optionHtml('Coll. Format', schema.collectionFormat);
      }
    }

    if (_.isUndefined(schema.items)) {
      if (_.isArray(schema.enum)) {
        var enumString;

        if (type === 'number' || type === 'integer') {
          enumString = schema.enum.join(', ');
        } else {
          enumString = '"' + schema.enum.join('", "') + '"';
        }

        options += helpers.optionHtml('Enum', enumString);
      }
    }

    return html;
  };
  var processModel = function (schema, name) {
    var type = schema.type || 'object';
    var isArray = schema.type === 'array';
    var strongOpen = '<span class="strong objectName"><span class="bracketsIcon">' + (isArray ? '[]' : '{}') + '</span> <span class="objectNameText">';
    var strongClose = '</span></span>';
    var html = '';

    if (name !== 'Inline Model') {
      if (!_.isUndefined(schema.title)) {
        html = strongOpen + schema.title +  strongClose;
      } else  {
        html = strongOpen + name +  strongClose;
      }
    }

    if (name) {
      seenModels.push(name);
    }

    if (isArray) {
      if (_.isArray(schema.items)) {
        html += '<div>' + _.map(schema.items, function (item) {
            var type = item.type || 'object';

            if (_.isUndefined(item.$ref)) {
              if (_.indexOf(['array', 'object'], type) > -1) {
                if (type === 'object' && _.isUndefined(item.properties)) {
                  return 'object';
                } else {
                  return addReference(item);
                }
              } else {
                return primitiveToOptionsHTML(item, type);
              }
            } else {
              return addReference(item, helpers.simpleRef(item.$ref));
            }
          }).join('</div><div>');
      } else if (_.isPlainObject(schema.items)) {
        var ref = '';
        if (_.isUndefined(schema.items.$ref)) {
          if (_.indexOf(['array', 'object'], schema.items.type || 'object') > -1) {
            if ((_.isUndefined(schema.items.type) || schema.items.type === 'object') && _.isUndefined(schema.items.properties)) {
              ref = 'object';
            } else {
              ref = addReference(schema.items);
            }
          } else {
            ref = primitiveToOptionsHTML(schema.items, schema.items.type);
          }
        } else {
          ref  = addReference(schema.items, helpers.simpleRef(schema.items.$ref));
        }
        if (name !== 'Inline Model') {
          html += '<div>' + ref + '</div>';
        }
      } else {
        helpers.log('Array type\'s \'items\' property is not an array or an object, cannot process');
        html += '<div>object</div>';
      }
    } else {
      if (schema.$ref) {
        html += '<div>' + addReference(schema, name) + '</div>';

      } else if (type === 'object') {
        html += '<div>';

        if (_.isPlainObject(schema.properties)) {
          html += _.map(schema.properties, function (property, name) {
            var propertyIsRequired = (_.indexOf(schema.required, name) >= 0),
                cProperty = _.cloneDeep(property),
                html = '<span class="propLabels">',
                model;
            html += '<span class="propName propOpt">' + name + '</span>';

            // Allow macro to set the default value
            cProperty.default = modelPropertyMacro(cProperty);

            // Resolve the schema (Handle nested schemas)
            cProperty = helpers.resolveSchema(cProperty);

            // We need to handle property references to primitives (Issue 339)
            if (!_.isUndefined(cProperty.$ref)) {
              model = models[helpers.simpleRef(cProperty.$ref)];

              if (!_.isUndefined(model) && _.indexOf([undefined, 'array', 'object'], model.definition.type) === -1) {
                // Use referenced schema
                cProperty = helpers.resolveSchema(model.definition);
              }
            }

            html += primitiveToHTML(cProperty);

            if(!propertyIsRequired) {
              html += '<span class="propOptKey">(optional)</span>';
            }

            html += '</span>';

            html += '<span class="propDesc">';

            if (!_.isUndefined(property.description)) {
              html += property.description;
            }

            if (cProperty.enum) {
              html += '<div class="propVals">Can be ';
              _.forEach(cProperty.enum, function (value, key) {
                html += '<code>' + value + '</code>';
                if (key === cProperty.enum.length - 2) {
                  html += ' or ';
                }
                else if (key < cProperty.enum.length - 1) {
                  html += ', ';
                }
              });
              html += '</div>';
            }

            html += '</span>';

            return primitiveToOptionsHTML(cProperty, html);
          }).join('</div><div>');
        }

        html += '</div>';
      } else {
        html = '<div>' + primitiveToOptionsHTML(schema, type) + '</div>';
      }
    }

    return html;
  };

  // Resolve the schema (Handle nested schemas)
  schema = helpers.resolveSchema(schema);

  // Generate current HTML
  var  html = processModel(schema, name);

  // Generate references HTML
  while (_.keys(references).length > 0) {
    /* jshint ignore:start */
    _.forEach(references, function (schema, name) {
      var seenModel = _.indexOf(seenModels, name) > -1;

      delete references[name];

      if (!seenModel) {
        seenModels.push(name);

        html += processModel(schema, name);
      }
    });
    /* jshint ignore:end */
  }

  return html;
};

var schemaToJSON = function (schema, models, modelsToIgnore, modelPropertyMacro) {
  // Resolve the schema (Handle nested schemas)
  schema = helpers.resolveSchema(schema);

  var type = schema.type || 'object';
  var format = schema.format;
  var model;
  var output;

  if (schema.example) {
    output = schema.example;
  } else if (_.isUndefined(schema.items) && _.isArray(schema.enum)) {
    output = schema.enum[0];
  }

  if (_.isUndefined(output)) {
    if (schema.$ref) {
      model = models[helpers.simpleRef(schema.$ref)];

      if (!_.isUndefined(model)) {
        if (_.isUndefined(modelsToIgnore[model.name])) {
          modelsToIgnore[model.name] = model;
          output = schemaToJSON(model.definition, models, modelsToIgnore, modelPropertyMacro);
          delete modelsToIgnore[model.name];
        } else {
          if (model.type === 'array') {
            output = [];
          } else {
            output = {};
          }
        }
      }
    } else if (!_.isUndefined(schema.default)) {
      output = schema.default;
    } else if (type === 'string') {
      if (format === 'date-time') {
        output = new Date().toISOString();
      } else if (format === 'date') {
        output = new Date().toISOString().split('T')[0];
      } else {
        output = 'string';
      }
    } else if (type === 'integer') {
      output = 0;
    } else if (type === 'number') {
      output = 0.0;
    } else if (type === 'boolean') {
      output = true;
    } else if (type === 'object') {
      output = {};

      _.forEach(schema.properties, function (property, name) {
        var cProperty = _.cloneDeep(property);

        // Allow macro to set the default value
        cProperty.default = modelPropertyMacro(property);

        output[name] = schemaToJSON(cProperty, models, modelsToIgnore, modelPropertyMacro);
      });
    } else if (type === 'array') {
      output = [];

      if (_.isArray(schema.items)) {
        _.forEach(schema.items, function (item) {
          output.push(schemaToJSON(item, models, modelsToIgnore, modelPropertyMacro));
        });
      } else if (_.isPlainObject(schema.items)) {
        output.push(schemaToJSON(schema.items, models, modelsToIgnore, modelPropertyMacro));
      } else if (_.isUndefined(schema.items)) {
        output.push({});
      } else {
        helpers.log('Array type\'s \'items\' property is not an array or an object, cannot process');
      }
    }
  }

  return output;
};

Model.prototype.createJSONSample = Model.prototype.getSampleValue = function (modelsToIgnore) {
  modelsToIgnore = modelsToIgnore || {};

  modelsToIgnore[this.name] = this;

  // Response support
  if (this.examples && _.isPlainObject(this.examples) && this.examples['application/json']) {
    this.definition.example = this.examples['application/json'];

    if (_.isString(this.definition.example)) {
      this.definition.example = jsyaml.safeLoad(this.definition.example);
    }
  } else if (!this.definition.example) {
    this.definition.example = this.examples;
  }

  return SchemaMarkup.schemaToJSON(this.definition, this.models, modelsToIgnore, this.modelPropertyMacro);
};

Model.prototype.getMockSignature = function () {
  return SchemaMarkup.schemaToHTML(this.name, this.definition, this.models, this.modelPropertyMacro);
};
