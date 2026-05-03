const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const isOutside24hWindow = (lastUserMessageAt) => {
  if (!lastUserMessageAt) return true;

  const timestamp = new Date(lastUserMessageAt).getTime();
  if (Number.isNaN(timestamp)) return true;

  return Date.now() - timestamp > DAY_IN_MS;
};

export default isOutside24hWindow;
