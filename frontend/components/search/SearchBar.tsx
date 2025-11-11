'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { SearchType } from '@/lib/types';
import Button from '../common/Button';
import { FormField } from '../common/Input';

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
    { value: 'traditional', label: '传统搜索' },
    { value: 'semantic', label: '语义搜索' },
    { value: 'multimodal', label: '多模态搜索' },
    { value: 'event', label: '事件搜索' },
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
            label="搜索关键词"
            placeholder="输入要搜索的内容..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchType === 'event' && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              事件搜索以"事件"为粒度（同一前台应用连续使用的一组截图）
            </p>
          )}
        </div>

        <div>
          <FormField
            label="开始日期"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <FormField
            label="结束日期"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div>
          <FormField
            label="应用名称"
            placeholder="过滤应用..."
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
          />
        </div>

        <div className="flex items-end md:col-span-5 md:justify-end">
          <Button type="submit" className="w-full md:w-auto">
            <Search className="mr-2 h-4 w-4" />
            搜索
          </Button>
        </div>
      </form>
    </div>
  );
}
