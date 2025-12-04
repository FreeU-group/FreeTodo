'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/common/Card';
import { Project } from '@/lib/types';
import { Calendar, Target, Trash2, Edit2, Archive, RotateCcw } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface ProjectCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (projectId: number) => void;
  onArchive?: (projectId: number) => void;
  onRestore?: (projectId: number) => void;
}

export default function ProjectCard({ project, onEdit, onDelete, onArchive, onRestore }: ProjectCardProps) {
  const router = useRouter();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const isArchived = project.status === 'archived';

  const formatDate = (dateString: string) => {
    try {
      // 根据语言设置 dayjs locale
      dayjs.locale(locale === 'zh' ? 'zh-cn' : 'en');
      return dayjs(dateString).format(t.project.dateFormat);
    } catch {
      return dateString;
    }
  };

  const handleCardClick = () => {
    router.push(`/project-management/${project.id}`);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(project);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(project.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive?.(project.id);
  };

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRestore?.(project.id);
  };

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={handleCardClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{project.name}</CardTitle>
            {(project.description || project.definition_of_done) && (
              <CardDescription className="mt-2 flex items-start gap-2">
                <Target className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{project.description || project.definition_of_done}</span>
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{t.project.createdAt} {formatDate(project.created_at)}</span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        {onEdit && (
          <button
            onClick={handleEdit}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            <Edit2 className="h-4 w-4" />
            {t.project.editButton}
          </button>
        )}
        {!isArchived && onArchive && (
          <button
            onClick={handleArchive}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            <Archive className="h-4 w-4" />
            {t.project.archiveButton}
          </button>
        )}
        {isArchived && onRestore && (
          <button
            onClick={handleRestore}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            {t.project.restoreButton}
          </button>
        )}
        {isArchived && onDelete && (
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {t.project.deleteButton}
          </button>
        )}
      </CardFooter>
    </Card>
  );
}
