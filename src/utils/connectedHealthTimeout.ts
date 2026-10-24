export class ConnectedHealthTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectedHealthTimeoutError';
  }
}

export const withConnectedHealthTimeout = async <T>(
  operation: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ConnectedHealthTimeoutError(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
