'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/common/Card';
import { Project } from '@/lib/types';
import { Calendar, Target, Trash2, Edit2 } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

dayjs.locale('zh-cn');

interface ProjectCardProps {
  project: Project;
  onEdit?: (project: Project) => void;
  onDelete?: (projectId: number) => void;
}

export default function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const formatDate = (dateString: string) => {
    try {
      return dayjs(dateString).format('YYYY年MM月DD日 HH:mm');
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{project.name}</CardTitle>
            {project.goal && (
              <CardDescription className="mt-2 flex items-start gap-2">
                <Target className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{project.goal}</span>
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>创建于 {formatDate(project.created_at)}</span>
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        {onEdit && (
          <button
            onClick={() => onEdit(project)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
          >
            <Edit2 className="h-4 w-4" />
            编辑
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(project.id)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            删除
          </button>
        )}
      </CardFooter>
    </Card>
  );
}

