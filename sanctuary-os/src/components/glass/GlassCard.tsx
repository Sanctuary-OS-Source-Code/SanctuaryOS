import React from 'react';
import { UniversalCard } from '../universal/UniversalCard';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  isActive?: boolean;
  statusColor?: string;
}

export function GlassCard({ title, subtitle, image, icon, badges, actions, isActive = false, statusColor, className = '', ...props }: GlassCardProps) {
  return (
    <UniversalCard
      layout="compact"
      isActive={isActive}
      statusColor={statusColor}
      title={title}
      subtitle={subtitle}
      image={image}
      icon={icon}
      badges={badges}
      actions={actions}
      className={className}
      {...(props as any)}
    />
  );
}
