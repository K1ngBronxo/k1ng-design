export class DesignError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "DesignError";
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what, id) =>
  new DesignError("not_found", `${what} not found: ${id}`, { what, id });

export const invalid = (message, details = undefined) =>
  new DesignError("invalid_input", message, details);
