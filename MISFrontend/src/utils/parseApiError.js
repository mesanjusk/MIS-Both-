export function parseApiError(error, fallback = 'Something went wrong. Please try again.') {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string') return responseData;
  if (responseData?.message) return responseData.message;
  if (responseData?.error?.message) return responseData.error.message;
  if (Array.isArray(responseData?.errors) && responseData.errors.length > 0) {
    return responseData.errors[0]?.message || fallback;
  }

  return error?.message || fallback;
}
