import { Archive, BarChart3, Brain, FileText, Inbox, MessageSquare, Settings, Tag, Target } from 'lucide-react';

/** 核心功能图标唯一来源；内容中的 emoji 不在这里注册。 */
export const iconMap = {
  documents: FileText,
  inbox: Inbox,
  ai: MessageSquare,
  training: Brain,
  goals: Target,
  stats: BarChart3,
  tags: Tag,
  settings: Settings,
  archive: Archive,
} as const;
