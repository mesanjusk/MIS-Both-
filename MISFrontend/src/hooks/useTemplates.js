import { useCallback, useEffect, useState } from 'react';
import { whatsappCloudService } from '../services/whatsappCloudService';
import { parseApiError } from '../utils/parseApiError';

const normalizeTemplates = (response) => {
  const candidates = [
    response,
    response?.templates,
    response?.items,
    response?.data,
    response?.data?.templates,
    response?.data?.items,
    response?.data?.data,
    response?.data?.data?.templates,
    response?.data?.data?.items,
  ];

  const list = candidates.find(Array.isArray) || [];

  return (list || [])
    .filter(Boolean)
    .map((template) => {
      const components = Array.isArray(template?.components) ? template.components : [];
      const bodyComponent = components.find((component) =>
        String(component?.type || '').toUpperCase() === 'BODY'
      );

      return {
        ...template,
        name: template?.name || template?.templateName || 'unnamed_template',
        language:
          (typeof template?.language === 'string' ? template.language : template?.language?.code) ||
          template?.lang ||
          template?.languageCode ||
          'en',
        category: String(template?.category || 'utility').toLowerCase(),
        body:
          template?.body ||
          template?.content ||
          bodyComponent?.text ||
          'Template preview unavailable.',
      };
    });
};

let templatesCache = null;
let inFlightPromise = null;

export function useTemplates() {
  const [templates, setTemplates] = useState(Array.isArray(templatesCache) ? templatesCache : []);
  const [isLoading, setIsLoading] = useState(!Array.isArray(templatesCache));
  const [error, setError] = useState('');

  const fetchTemplates = useCallback(async ({ force = false } = {}) => {
    if (!force && Array.isArray(templatesCache)) {
      setTemplates(templatesCache);
      setError('');
      setIsLoading(false);
      return templatesCache;
    }

    if (inFlightPromise) {
      setIsLoading(true);
      const pendingTemplates = await inFlightPromise;
      setTemplates(pendingTemplates);
      setIsLoading(false);
      return pendingTemplates;
    }

    setIsLoading(true);
    setError('');

    inFlightPromise = (async () => {
      try {
        const response = await whatsappCloudService.getTemplates();
        const normalized = normalizeTemplates(response);
        templatesCache = normalized;
        return normalized;
      } catch (fetchError) {
        setError(parseApiError(fetchError, 'Failed to load templates.'));
        templatesCache = [];
        return [];
      } finally {
        inFlightPromise = null;
      }
    })();

    const nextTemplates = await inFlightPromise;
    setTemplates(nextTemplates);
    setIsLoading(false);
    return nextTemplates;
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    isLoading,
    error,
    isEmpty: !isLoading && templates.length === 0,
    refetchTemplates: () => fetchTemplates({ force: true }),
  };
}
