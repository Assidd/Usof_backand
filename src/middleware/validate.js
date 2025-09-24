// src/middleware/validate.js
'use strict';

function checkField(val, rules, key, where) {
  // required
  if (rules.required && (val === undefined || val === null || val === '')) {
    throw new Error(`${where}.${key} is required`);
  }
  if (val === undefined || val === null || val === '') return;

  const t = rules.type;

  // ---------- ARRAY ----------
  if (t === 'array') {
    // допускаем CSV-строку, если allowCsv=true
    let arr = val;
    if (typeof val === 'string' && rules.allowCsv) {
      arr = val.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(arr)) {
      throw new Error(`${where}.${key} must be array`);
    }

    // количество элементов (если задали)
    if (Number.isFinite(rules.minItems) && arr.length < rules.minItems) {
      throw new Error(`${where}.${key} must have at least ${rules.minItems} items`);
    }
    if (Number.isFinite(rules.maxItems) && arr.length > rules.maxItems) {
      throw new Error(`${where}.${key} must have at most ${rules.maxItems} items`);
    }

    // тип элементов
    if (rules.items === 'number') {
      for (const v of arr) {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          throw new Error(`${where}.${key} must be array<number>`);
        }
      }
    } else if (rules.items === 'string') {
      for (const v of arr) {
        if (typeof v !== 'string') {
          throw new Error(`${where}.${key} must be array<string>`);
        }
      }
    }

    // enum для элементов массива
    if (rules.enum) {
      for (const v of arr) {
        if (!rules.enum.includes(v)) {
          throw new Error(`${where}.${key} items must be one of: ${rules.enum.join(', ')}`);
        }
      }
    }
    return; // массив прошёл валидацию
  }

  // ---------- SCALARS ----------
  if (t === 'string' && typeof val !== 'string') {
    throw new Error(`${where}.${key} must be string`);
  }
  if (t === 'number' && Number.isNaN(Number(val))) {
    throw new Error(`${where}.${key} must be number`);
  }
  if (t === 'boolean' && typeof val !== 'boolean') {
    throw new Error(`${where}.${key} must be boolean`);
  }
  if (t === 'email' && typeof val === 'string' && !/^\S+@\S+\.\S+$/.test(val)) {
    throw new Error(`${where}.${key} must be a valid email`);
  }

  if (rules.min && typeof val === 'string' && val.length < rules.min) {
    throw new Error(`${where}.${key} must be at least ${rules.min} chars`);
  }
  if (rules.max && typeof val === 'string' && val.length > rules.max) {
    throw new Error(`${where}.${key} must be at most ${rules.max} chars`);
  }

  if (rules.enum && !rules.enum.includes(val)) {
    throw new Error(`${where}.${key} must be one of: ${rules.enum.join(', ')}`);
  }
}


module.exports = function validate(schema = {}) {
  return (req, _res, next) => {
    try {
      for (const where of ['params', 'query', 'body']) {
        const rulesObj = schema[where] || {};
        for (const [key, rules] of Object.entries(rulesObj)) {
          const val = req[where]?.[key];
          checkField(val, rules, key, where);
        }
      }
      next();
    } catch (e) {
      e.status = 400; e.name = 'BadRequestError';
      next(e);
    }
  };
};
