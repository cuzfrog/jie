import { DefaultLogLevels, Logger, type TLogLevel } from "tslog";

const { level, enabled } = resolveLoggingLevel();
export const logger = new Logger({ minLevel: level, type: enabled ? "pretty" : "hidden" });

function resolveLoggingLevel(): { level: TLogLevel | undefined; enabled: boolean } {
  switch (process.env.JIE_LOG_LEVEL?.toLocaleUpperCase()) {
    case "SILLY":
      return { level: DefaultLogLevels.SILLY, enabled: true };
    case "TRACE":
      return { level: "TRACE", enabled: true };
    case "DEBUG":
      return { level: "DEBUG", enabled: true };
    case "INFO":
      return { level: "INFO", enabled: true };
    case "WARN":
      return { level: "WARN", enabled: true };
    case "ERROR":
      return { level: "ERROR", enabled: true };
    case "FATAL":
      return { level: "FATAL", enabled: true };
    default:
      return { level: undefined, enabled: false };
  }
}

export interface Console {
  print: (...args: ReadonlyArray<string>) => void;
  error: (...args: ReadonlyArray<string>) => void;
}

export const defaultConsole: Console = {
  print: (...args: ReadonlyArray<string>) => console.log(...(args as ReadonlyArray<unknown>)),
  error: (...args: ReadonlyArray<string>) => console.error(...(args as ReadonlyArray<unknown>)),
};
