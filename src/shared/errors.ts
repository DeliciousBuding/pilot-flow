export class PilotFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PilotFlowError";
  }
}

export class ConfigurationError extends PilotFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFIGURATION_ERROR", details);
    this.name = "ConfigurationError";
  }
}

export class CommandFailedError extends PilotFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "COMMAND_FAILED", details);
    this.name = "CommandFailedError";
  }
}

export class CommandTimeoutError extends PilotFlowError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "COMMAND_TIMEOUT", details);
    this.name = "CommandTimeoutError";
  }
}
