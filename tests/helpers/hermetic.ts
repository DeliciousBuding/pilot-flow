const CREDENTIAL_PATTERNS = [/API_KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i, /AUTH/i, /OPENAI/i, /ANTHROPIC/i];

const SAVED_ENV: Record<string, string | undefined> = {};

export function hermeticSetup(): void {
  for (const key of Object.keys(SAVED_ENV)) delete SAVED_ENV[key];
  for (const key of Object.keys(process.env)) {
    if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(key))) {
      SAVED_ENV[key] = process.env[key];
      delete process.env[key];
    }
  }
  process.env.TZ = "UTC";
  process.env.LANG = "C";
}

export function hermeticTeardown(): void {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const key of Object.keys(SAVED_ENV)) delete SAVED_ENV[key];
}
