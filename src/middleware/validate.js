const { validationResult } = require("express-validator");

/**
 * Run after express-validator chains.
 * Returns 422 with field-level errors if validation fails.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error:  "Validation failed",
      fields: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

module.exports = { validate };
