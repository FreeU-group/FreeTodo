'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { SearchType } from '@/lib/types';
import Button from '../common/Button';
import { FormField } from '../common/Input';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface SearchBarProps {
  onSearch: (params: {
    query: string;
    startDate: string;
    endDate: string;
    appName: string;
    searchType: SearchType;
  }) => void;
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const [searchType, setSearchType] = useState<SearchType>('event');
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appName, setAppName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ query, startDate, endDate, appName, searchType });
  };

  const searchTypes: { value: SearchType; label: string }[] = [
    { value: 'traditional', label: t.search.traditional },
    { value: 'semantic', label: t.search.semantic },
    { value: 'multimodal', label: t.search.multimodal },
    { value: 'event', label: t.search.event },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      {/* 搜索类型切换 */}
      <div className="mb-4 flex gap-2">
        {searchTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setSearchType(type.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              searchType === type.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-background text-foreground hover:bg-muted/50'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* 搜索表单 */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="md:col-span-2">
          <FormField
            label={t.search.keyword}
            placeholder={t.search.keywordPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchType === 'event' && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {t.search.eventSearchHint}
            </p>
          )}
        </div>

        <div>
          <FormField
            label={t.search.startDate}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <FormField
            label={t.search.endDate}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div>
          <FormField
            label={t.search.appName}
            placeholder={t.search.filterApp}
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
          />
        </div>

        <div className="flex items-end md:col-span-5 md:justify-end">
          <Button type="submit" className="w-full md:w-auto">
            <Search className="mr-2 h-4 w-4" />
            {t.common.search}
          </Button>
        </div>
      </form>
    </div>
  );
}
