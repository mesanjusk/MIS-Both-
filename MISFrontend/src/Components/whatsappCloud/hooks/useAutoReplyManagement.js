import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '../../../Components/Toast';
import { whatsappCloudService } from '../../../services/whatsappCloudService';
import { parseApiError } from '../../../utils/parseApiError';

export const initialFormState = {
  ruleType: 'keyword',
  keyword: '',
  matchType: 'contains',
  replyMode: 'text',
  replyText: '',
  templateName: '',
  templateLanguage: 'en_US',
  active: true,
  delaySeconds: '',
  menuTitle: 'Product Price Finder',
  menuIntro: 'Choose product options to get the latest price.',
  audienceScope: 'all',
  catalogRows: [],
  catalogHeaders: [],
  selectionFields: [],
  resultFields: [],
  skippedEmptyFields: [],
  catalogSummary: '',
};

export const matchesRule = (rule, input) => {
  const text = String(input || '').trim().toLowerCase();
  const keyword = String(rule?.keyword || '').trim().toLowerCase();
  if (!text || !keyword || !rule?.active) return false;
  if (rule.matchType === 'exact') return text === keyword;
  if (rule.matchType === 'starts_with') return text.startsWith(keyword);
  return text.includes(keyword);
};

export const normalizeRules = (list) =>
  (Array.isArray(list) ? list : []).map((rule) => {
    const replyType = String(rule?.replyType || rule?.replyMode || 'text').toLowerCase();
    const active = typeof rule?.active === 'boolean' ? rule.active : Boolean(rule?.isActive);
    return {
      ...rule,
      id: rule?.id || rule?._id || `${rule?.keyword || 'rule'}-${Math.random()}`,
      ruleType: String(rule?.ruleType || 'keyword').toLowerCase(),
      active,
      isActive: active,
      replyMode: replyType,
      replyText: replyType === 'text' ? String(rule?.reply || rule?.replyText || '') : '',
      templateName: replyType === 'template' ? String(rule?.reply || rule?.templateName || '') : '',
      templateLanguage: String(rule?.templateLanguage || rule?.language || 'en_US'),
      menuTitle: String(rule?.catalogConfig?.menuTitle || 'Product Price Finder'),
      menuIntro: String(rule?.catalogConfig?.menuIntro || 'Choose product options to get the latest price.'),
      audienceScope: String(rule?.audienceScope || 'all'),
      catalogRows: Array.isArray(rule?.catalogRows) ? rule.catalogRows : [],
      selectionFields: Array.isArray(rule?.catalogConfig?.selectionFields) ? rule.catalogConfig.selectionFields : [],
      resultFields: Array.isArray(rule?.catalogConfig?.resultFields) ? rule.catalogConfig.resultFields : [],
      skippedEmptyFields: Array.isArray(rule?.catalogConfig?.skippedEmptyFields) ? rule.catalogConfig.skippedEmptyFields : [],
      catalogHeaders: Array.isArray(rule?.catalogConfig?.headers) ? rule.catalogConfig.headers : [],
    };
  });

export function useAutoReplyManagement() {
  const [rules, setRules] = useState([]);
  const [fallbackReply, setFallbackReply] = useState('Thanks for your message. Our team will reply shortly.');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState('');
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadAutoReplyRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await whatsappCloudService.getAutoReplyRules();
      const list = response?.data?.data?.rules || response?.data?.rules || response?.data?.data || response?.data || [];
      const normalized = normalizeRules(list);
      setRules(normalized);
      return normalized;
    } catch (error) {
      toast.error(parseApiError(error, 'Failed to load auto-reply rules.'));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAutoReplyRules(); }, [loadAutoReplyRules]);

  const editingRule = useMemo(() => rules.find((rule) => rule.id === editingRuleId) || null, [editingRuleId, rules]);

  const openAddModal = () => {
    setEditingRuleId(null);
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const openEditModal = (rule) => {
    setEditingRuleId(rule.id);
    setFormData({
      ...initialFormState,
      ruleType: rule.ruleType || 'keyword',
      keyword: rule.keyword || '',
      matchType: rule.matchType || 'contains',
      replyMode: rule.replyMode || 'text',
      replyText: rule.replyText || '',
      templateName: rule.templateName || '',
      templateLanguage: rule.templateLanguage || 'en_US',
      active: rule.active,
      delaySeconds: rule.delaySeconds ?? '',
      menuTitle: rule.menuTitle || initialFormState.menuTitle,
      menuIntro: rule.menuIntro || initialFormState.menuIntro,
      audienceScope: rule.audienceScope || 'all',
      catalogRows: Array.isArray(rule.catalogRows) ? rule.catalogRows : [],
      catalogHeaders: Array.isArray(rule.catalogHeaders) ? rule.catalogHeaders : [],
      selectionFields: Array.isArray(rule.selectionFields) ? rule.selectionFields : [],
      resultFields: Array.isArray(rule.resultFields) ? rule.resultFields : [],
      skippedEmptyFields: Array.isArray(rule.skippedEmptyFields) ? rule.skippedEmptyFields : [],
      catalogSummary: Array.isArray(rule.catalogRows)
        ? `${rule.catalogRows.length} rows loaded · ${(rule.catalogHeaders || []).length} active columns`
        : '',
    });
    setIsModalOpen(true);
  };

  const buildRulePayload = () => ({
    ruleType: formData.ruleType,
    keyword: formData.keyword.trim(),
    matchType: formData.matchType,
    replyType: formData.replyMode,
    reply: formData.replyMode === 'text' ? formData.replyText.trim() : formData.templateName.trim(),
    templateLanguage: formData.replyMode === 'template' ? String(formData.templateLanguage || 'en_US').trim() || 'en_US' : undefined,
    isActive: Boolean(formData.active),
    audienceScope: formData.audienceScope === 'registered_only' ? 'registered_only' : 'all',
    delaySeconds: formData.delaySeconds === '' ? null : Number(formData.delaySeconds),
    catalogRows: formData.ruleType === 'product_catalog' ? formData.catalogRows : [],
    catalogConfig: formData.ruleType === 'product_catalog'
      ? {
          menuTitle: formData.menuTitle,
          menuIntro: formData.menuIntro,
          headers: formData.catalogHeaders,
          skippedEmptyFields: formData.skippedEmptyFields,
          selectionFields: formData.selectionFields,
          resultFields: formData.resultFields,
        }
      : undefined,
  });

  const handleSaveRule = async (event) => {
    event.preventDefault();
    const payload = buildRulePayload();
    if (!payload.keyword) return toast.error('Keyword is required.');
    if (payload.ruleType === 'product_catalog' && !payload.catalogRows.length) return toast.error('Please upload the price list first.');
    if (payload.ruleType === 'keyword' && payload.replyType === 'text' && !payload.reply) return toast.error('Reply text is required for text mode.');
    if (payload.ruleType === 'keyword' && payload.replyType === 'template' && !payload.reply) return toast.error('Template name is required for template mode.');

    setIsSavingRule(true);
    try {
      if (editingRuleId) {
        await whatsappCloudService.updateAutoReplyRule(editingRuleId, payload);
        toast.success('Rule updated.');
      } else {
        await whatsappCloudService.createAutoReplyRule(payload);
        toast.success('Rule added.');
      }
      setIsModalOpen(false);
      setFormData(initialFormState);
      setEditingRuleId(null);
      await loadAutoReplyRules();
    } catch (error) {
      toast.error(parseApiError(error, 'Failed to save rule.'));
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleDelete = async (ruleId) => {
    try {
      await whatsappCloudService.deleteAutoReplyRule(ruleId);
      await loadAutoReplyRules();
      toast.success('Rule deleted.');
    } catch (error) {
      toast.error(parseApiError(error, 'Failed to delete rule.'));
    }
  };

  const handleToggle = async (ruleId) => {
    try {
      const response = await whatsappCloudService.toggleAutoReplyRule(ruleId);
      const updatedRule = normalizeRules([response?.data?.data || response?.data])[0];
      setRules((prev) => prev.map((item) => (item.id === ruleId ? updatedRule : item)));
      toast.success('Rule updated.');
    } catch (error) {
      toast.error(parseApiError(error, 'Failed to toggle rule.'));
    }
  };

  const handleTest = () => {
    const matchedRule = rules.find((rule) => matchesRule(rule, testInput));
    if (matchedRule) {
      if (matchedRule.ruleType === 'product_catalog') {
        setTestResult(`Catalog flow will start for ${matchedRule.catalogRows.length} products.`);
        return;
      }
      setTestResult(matchedRule.replyMode === 'template' ? `Template: ${matchedRule.templateName} (${matchedRule.templateLanguage || 'en_US'})` : matchedRule.replyText);
      return;
    }
    setTestResult(fallbackReply.trim() || 'No reply would be sent.');
  };

  return {
    rules,
    fallbackReply,
    isModalOpen,
    editingRule,
    formData,
    testInput,
    testResult,
    isSavingRule,
    isLoading,
    setFallbackReply,
    setIsModalOpen,
    setFormData,
    setTestInput,
    loadAutoReplyRules,
    openAddModal,
    openEditModal,
    handleSaveRule,
    handleDelete,
    handleToggle,
    handleTest,
  };
}
