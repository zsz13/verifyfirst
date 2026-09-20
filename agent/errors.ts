/**
 * A configuration or startup problem the operator can fix by changing configuration.
 * Its message is written to be safe to print: it names the setting, never the value.
 * Anything not of this type is reported generically, because third-party errors can
 * echo credentials back in their messages.
 */
export class ConfigurationError extends Error {}
